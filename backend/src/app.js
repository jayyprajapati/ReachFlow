require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { getAuthUrl, exchangeCodeForUser, verifyAuth, clearGmailAuthorization, getAuthorizedClient } = require('./gmail');
const recipientRoutes = require('./routes/recipients');
const { router: campaignRoutes } = require('./routes/campaigns');
const groupRoutes = require('./routes/groups');
const templateRoutes = require('./routes/templates');
const variableRoutes = require('./routes/variables');
const { startScheduler } = require('./scheduler');
const { connectMongo, User, migrateGroupContactFields } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/jobhunt';
const isProd = process.env.NODE_ENV === 'production';

function initFirebase() {
  if (admin.apps.length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase service account env vars');
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

initFirebase();

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/auth/', authLimiter);
app.use('/api/', apiLimiter);

/* ── middleware ── */

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    const { uid, email, name } = decoded;
    if (!uid || !email) return res.status(401).json({ error: 'Invalid token' });

    const update = { email: email.toLowerCase(), displayName: name || email };
    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      {
        firebaseUid: uid,
        ...update,
        $setOnInsert: { gmailConnected: false },
      },
      { upsert: true, new: true }
    );

    req.user = user;
    req.firebaseToken = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Auth failed' });
  }
}

/* ── routes ── */

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = req.user;
  const connected = !!user.encryptedRefreshToken;
  if (user.gmailConnected !== connected) {
    user.gmailConnected = connected;
    await user.save();
  }
  res.json({
    user: {
      id: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
      senderDisplayName: user.senderDisplayName || '',
    },
    gmailConnected: !!user.gmailConnected,
    gmailEmail: user.gmailEmail || user.email,
  });
});

app.patch('/auth/me/preferences', requireAuth, async (req, res) => {
  try {
    const senderDisplayName = String(req.body?.senderDisplayName || '').trim().slice(0, 120);
    req.user.senderDisplayName = senderDisplayName;
    await req.user.save();
    res.json({ ok: true, senderDisplayName: req.user.senderDisplayName || '' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to save preferences' });
  }
});

app.post('/gmail/connect', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (user.encryptedRefreshToken) {
      try {
        await getAuthorizedClient(user, { verifyAccess: true });
        user.gmailConnected = true;
        user.gmailState = undefined;
        user.gmailStateExpiresAt = undefined;
        await user.save();
        return res.json({ alreadyConnected: true, gmailConnected: true });
      } catch (err) {
        const msg = err?.message || '';
        const isAuthExpired = err.code === 'AUTH_EXPIRED' || /invalid_grant|insufficient|expired|revoked/i.test(msg);
        if (!isAuthExpired) throw err;
        await clearGmailAuthorization(user, 'stale refresh on connect');
      }
    }

    const state = crypto.randomBytes(24).toString('hex');
    user.gmailState = state;
    user.gmailStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    console.log('[oauth] Generated state');
    const url = getAuthUrl({ state, forceConsent: true });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to start Gmail connect' });
  }
});

app.post('/gmail/disconnect', requireAuth, async (req, res) => {
  try {
    await clearGmailAuthorization(req.user, 'user disconnect');
    req.user.gmailEmail = undefined;
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to disconnect Gmail' });
  }
});

app.post('/gmail/reconnect', requireAuth, async (req, res) => {
  try {
    await clearGmailAuthorization(req.user, 'manual reconnect');
    const state = crypto.randomBytes(24).toString('hex');
    req.user.gmailState = state;
    req.user.gmailStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await req.user.save();
    console.log('[oauth] Generated state');
    const url = getAuthUrl({ state, forceConsent: true });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to restart Gmail connect' });
  }
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query || {};
  const frontendOrigin = FRONTEND_ORIGIN;
  const redirectError = (reason, message) => {
    const url = new URL(frontendOrigin);
    url.searchParams.set('gmail', 'error');
    url.searchParams.set('reason', reason);
    if (message) url.searchParams.set('message', message);
    return res.redirect(url.toString());
  };

  if (!code) return redirectError('missing_code', 'Missing authorization code');
  if (!state) return redirectError('missing_state', 'Missing OAuth state');
  try {
    const user = await User.findOne({ gmailState: state });
    if (!user) return redirectError('state_mismatch', 'OAuth state mismatch. Please restart Gmail connect.');
    if (!user.gmailStateExpiresAt || user.gmailStateExpiresAt < new Date()) {
      user.gmailState = undefined;
      user.gmailStateExpiresAt = undefined;
      await user.save();
      console.warn('[oauth] State expired');
      return redirectError('state_expired', 'OAuth state expired. Please try again.');
    }
    console.log('[oauth] State validated');
    await exchangeCodeForUser(user, code);
    console.log('[oauth] Token exchange success');
    user.gmailState = undefined;
    user.gmailStateExpiresAt = undefined;
    user.gmailConnected = true;
    await user.save();
    return res.redirect(`${frontendOrigin}?gmail=success`);
  } catch (err) {
    console.error('[oauth] Callback error:', err.message);
    console.error('[oauth] Callback error FULL:', err);
    if (err.response?.data) {
      console.error('[oauth] Google error response:', JSON.stringify(err.response.data));
    }
    return redirectError('token_exchange_failed', err.message);
  }
});

// Authenticated API routes
app.use('/api/recipients', requireAuth, recipientRoutes);
app.use('/api/campaigns', requireAuth, campaignRoutes);
app.use('/api/groups', requireAuth, groupRoutes);
app.use('/api/templates', requireAuth, templateRoutes);
app.use('/api/variables', requireAuth, variableRoutes);

connectMongo()
  .then(() => {
    console.log('Connected to MongoDB');
    return migrateGroupContactFields()
      .then(() => {
        console.log('Group contact fields migration complete');
      })
      .catch(err => {
        console.error('Group contact fields migration failed', err.message);
      });
  })
  .then(() => {
    startScheduler();
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB', err.message);
    process.exit(1);
  });
