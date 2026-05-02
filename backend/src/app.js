require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { getAuthUrl, exchangeCodeForUser, verifyAuth, clearGmailAuthorization, getAuthorizedClient, introspectTokenScopes, REQUIRED_SCOPES } = require('./gmail');
const recipientRoutes = require('./routes/recipients');
const { router: campaignRoutes, processScheduledCampaigns } = require('./routes/campaigns');
const groupRoutes = require('./routes/groups');
const applicationRoutes = require('./routes/applications');
const templateRoutes = require('./routes/templates');
const variableRoutes = require('./routes/variables');
const resumelabRoutes = require('./routes/resumelab');
const settingsRoutes = require('./routes/settings');
const roadmapRoutes = require('./routes/roadmaps');
const {
  connectMongo,
  User,
  Variable,
  Group,
  Template,
  Campaign,
  SendLog,
  Application,
  Resume,
  CanonicalProfile,
  ResumeAnalysis,
  GeneratedResume,
  AISettings,
} = require('./db');
const { assertDataSecurityConfig, encryptJson, decryptJson, isEncryptedEnvelope, normalizeEmail } = require('./utils/dataSecurity');

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
  console.log('[boot] Firebase initialized');
}

initFirebase();
assertDataSecurityConfig();
console.log('[boot] Data security config verified');
console.log('[boot] Required OAuth scopes:', REQUIRED_SCOPES);

function getDecryptedUserValue(encryptedValue, fallback = '') {
  if (isEncryptedEnvelope(encryptedValue)) {
    try {
      const payload = decryptJson(encryptedValue);
      return String(payload?.value || fallback);
    } catch (_err) {
      return String(fallback || '');
    }
  }
  return String(fallback || '');
}

async function deleteCurrentUserAppData(user) {
  const userId = user?._id;
  if (!userId) {
    throw new Error('Missing authenticated user id');
  }
  console.log(`[data] Deleting all app data for userId: ${userId}`);

  const runDeletion = async (session) => {
    const opts = session ? { session } : {};

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          gmailConnected: false,
        },
        $unset: {
          encryptedRefreshToken: 1,
          gmailState: 1,
          gmailStateExpiresAt: 1,
          gmailEmailEnc: 1,
          gmailEmail: 1,
          senderDisplayNameEnc: 1,
        },
      },
      opts
    );

    const [templates, campaigns, groups, variables, sendLogs, applications, resumes, canonicalProfiles, resumeAnalyses, generatedResumes, aiSettings] = await Promise.all([
      Template.deleteMany({ userId }, opts),
      Campaign.deleteMany({ userId }, opts),
      Group.deleteMany({ userId }, opts),
      Variable.deleteMany({ userId }, opts),
      SendLog.deleteMany({ userId }, opts),
      Application.deleteMany({ userId }, opts),
      Resume.deleteMany({ userId }, opts),
      CanonicalProfile.deleteMany({ userId }, opts),
      ResumeAnalysis.deleteMany({ userId }, opts),
      GeneratedResume.deleteMany({ userId }, opts),
      AISettings.deleteMany({ userId }, opts),
    ]);

    const userDeletion = await User.deleteOne({ _id: userId }, opts);

    const summary = {
      users: userDeletion.deletedCount || 0,
      templates: templates.deletedCount || 0,
      campaigns: campaigns.deletedCount || 0,
      groups: groups.deletedCount || 0,
      variables: variables.deletedCount || 0,
      sendLogs: sendLogs.deletedCount || 0,
      applications: applications.deletedCount || 0,
      resumes: resumes.deletedCount || 0,
      canonicalProfiles: canonicalProfiles.deletedCount || 0,
      resumeAnalyses: resumeAnalyses.deletedCount || 0,
      generatedResumes: generatedResumes.deletedCount || 0,
      aiSettings: aiSettings.deletedCount || 0,
    };
    console.log('[data] Deletion summary:', JSON.stringify(summary));
    return summary;
  };

  let session;
  try {
    session = await mongoose.startSession();
    let summary;
    await session.withTransaction(async () => {
      summary = await runDeletion(session);
    });
    return summary;
  } catch (err) {
    const txUnsupported = /Transaction numbers are only allowed|replica set|transactions are not supported/i.test(err?.message || '');
    if (!txUnsupported) throw err;
    console.warn('[data] Transactions not supported — running deletion without transaction');
    return runDeletion(null);
  } finally {
    if (session) await session.endSession();
  }
}

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '30mb' }));
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
  if (!token) {
    console.warn(`[auth] Missing auth token — ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    const { uid, email, name } = decoded;
    if (!uid || !email) {
      console.warn(`[auth] Invalid token (no uid or email) — ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Invalid token' });
    }

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

    console.log(`[auth] Authenticated — uid: ${uid}, email: ${email}, userId: ${user._id}, path: ${req.method} ${req.path}`);
    req.user = user;
    req.firebaseToken = token;
    next();
  } catch (err) {
    console.error(`[auth] Auth failed — ${req.method} ${req.path}:`, err.message);
    return res.status(401).json({ error: err.message || 'Auth failed' });
  }
}

/* ── routes ── */

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = req.user;
  console.log(`[profile] GET /auth/me — userId: ${user._id}, gmailConnected: ${user.gmailConnected}`);
  const connected = !!user.encryptedRefreshToken;
  if (user.gmailConnected !== connected) {
    user.gmailConnected = connected;
    await user.save();
    console.log(`[profile] Corrected gmailConnected state to ${connected}`);
  }

  // Fetch granted scopes if connected
  let grantedScopes = [];
  if (connected) {
    try {
      const auth = await getAuthorizedClient(user, { verifyAccess: true });
      const tokenInfo = await introspectTokenScopes(auth);
      grantedScopes = tokenInfo?.scopes || [];
      console.log(`[profile] Granted scopes for user:`, grantedScopes);
    } catch (err) {
      console.warn('[profile] Could not introspect scopes:', err.message);
    }
  }

  res.json({
    user: {
      id: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
      senderDisplayName: getDecryptedUserValue(user.senderDisplayNameEnc, user.senderDisplayName || ''),
    },
    gmailConnected: !!user.gmailConnected,
    gmailEmail: getDecryptedUserValue(user.gmailEmailEnc, user.gmailEmail || user.email),
    grantedScopes,
    requiredScopes: REQUIRED_SCOPES,
  });
});

app.patch('/auth/me/preferences', requireAuth, async (req, res) => {
  try {
    const senderDisplayName = String(req.body?.senderDisplayName || '').trim().slice(0, 120);
    console.log(`[profile] PATCH /auth/me/preferences — setting senderDisplayName: "${senderDisplayName}"`);
    req.user.senderDisplayNameEnc = encryptJson({ value: senderDisplayName });
    req.user.senderDisplayName = undefined;
    await req.user.save();
    res.json({ ok: true, senderDisplayName });
  } catch (err) {
    console.error('[profile] Failed to save preferences:', err.message);
    res.status(500).json({ error: err.message || 'Failed to save preferences' });
  }
});

app.delete('/auth/me', requireAuth, async (req, res) => {
  try {
    console.log(`[profile] DELETE /auth/me — userId: ${req.user._id}`);
    const deleted = await deleteCurrentUserAppData(req.user);
    res.json({
      ok: true,
      scope: 'app-data-only',
      firebaseIdentityDeleted: false,
      deleted,
    });
  } catch (err) {
    console.error('[profile] Failed to delete account:', err.message);
    res.status(500).json({ error: err.message || 'Failed to delete account data' });
  }
});

app.post('/gmail/connect', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    console.log(`[oauth] POST /gmail/connect — userId: ${user._id}, hasRefreshToken: ${!!user.encryptedRefreshToken}`);

    if (user.encryptedRefreshToken) {
      try {
        console.log('[oauth] Existing refresh token found — verifying access…');
        await getAuthorizedClient(user, { verifyAccess: true });
        user.gmailConnected = true;
        user.gmailState = undefined;
        user.gmailStateExpiresAt = undefined;
        await user.save();
        console.log('[oauth] Existing token is valid — already connected');
        return res.json({ alreadyConnected: true, gmailConnected: true });
      } catch (err) {
        const msg = err?.message || '';
        console.warn('[oauth] Existing token verification failed:', msg);
        const isAuthExpired = err.code === 'AUTH_EXPIRED' || /invalid_grant|insufficient|expired|revoked/i.test(msg);
        if (!isAuthExpired) throw err;
        console.log('[oauth] Token is expired/revoked — clearing and starting fresh');
        await clearGmailAuthorization(user, 'stale refresh on connect');
      }
    }

    const state = crypto.randomBytes(24).toString('hex');
    user.gmailState = state;
    user.gmailStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    console.log('[oauth] Generated OAuth state, redirecting to Google consent');
    const url = getAuthUrl({ state, forceConsent: true });
    res.json({ url });
  } catch (err) {
    console.error('[oauth] /gmail/connect failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to start Gmail connect' });
  }
});

app.post('/gmail/disconnect', requireAuth, async (req, res) => {
  try {
    console.log(`[oauth] POST /gmail/disconnect — userId: ${req.user._id}`);
    await clearGmailAuthorization(req.user, 'user disconnect');
    req.user.gmailEmailEnc = encryptJson({ value: normalizeEmail(req.user.email || '') });
    req.user.gmailEmail = undefined;
    await req.user.save();
    console.log('[oauth] Gmail disconnected successfully');
    res.json({ ok: true });
  } catch (err) {
    console.error('[oauth] /gmail/disconnect failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to disconnect Gmail' });
  }
});

app.post('/gmail/reconnect', requireAuth, async (req, res) => {
  try {
    console.log(`[oauth] POST /gmail/reconnect — userId: ${req.user._id}`);
    await clearGmailAuthorization(req.user, 'manual reconnect');
    const state = crypto.randomBytes(24).toString('hex');
    req.user.gmailState = state;
    req.user.gmailStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await req.user.save();
    console.log('[oauth] Cleared existing auth, generated new OAuth state for reconnect');
    const url = getAuthUrl({ state, forceConsent: true });
    res.json({ url });
  } catch (err) {
    console.error('[oauth] /gmail/reconnect failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to restart Gmail connect' });
  }
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query || {};
  const frontendOrigin = FRONTEND_ORIGIN;
  console.log(`[oauth] GET /auth/google/callback — hasCode: ${!!code}, hasState: ${!!state}`);

  const redirectError = (reason, message) => {
    console.error(`[oauth] Callback redirect error — reason: ${reason}, message: ${message}`);
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
    if (!user) {
      console.error('[oauth] No user found with matching gmailState');
      return redirectError('state_mismatch', 'OAuth state mismatch. Please restart Gmail connect.');
    }
    console.log(`[oauth] State matched — userId: ${user._id}, email: ${user.email}`);

    if (!user.gmailStateExpiresAt || user.gmailStateExpiresAt < new Date()) {
      user.gmailState = undefined;
      user.gmailStateExpiresAt = undefined;
      await user.save();
      console.warn('[oauth] OAuth state expired');
      return redirectError('state_expired', 'OAuth state expired. Please try again.');
    }
    console.log('[oauth] State validated (not expired)');

    await exchangeCodeForUser(user, code);
    console.log('[oauth] Token exchange completed successfully');

    user.gmailState = undefined;
    user.gmailStateExpiresAt = undefined;
    user.gmailConnected = true;
    await user.save();
    console.log('[oauth] User saved — gmailConnected: true, redirecting to frontend');
    return res.redirect(`${frontendOrigin}?gmail=success`);
  } catch (err) {
    console.error('[oauth] Callback error:', err.message);
    console.error('[oauth] Callback full error:', JSON.stringify({
      message: err.message,
      code: err.code,
      responseStatus: err?.response?.status,
      responseData: err?.response?.data,
    }, null, 2));
    return redirectError('token_exchange_failed', err.message);
  }
});

// Authenticated API routes
app.use('/api/recipients', requireAuth, recipientRoutes);
app.use('/api/campaigns', requireAuth, campaignRoutes);
app.use('/api/groups', requireAuth, groupRoutes);
app.use('/api/applications', requireAuth, applicationRoutes);
app.use('/api/templates', requireAuth, templateRoutes);
app.use('/api/variables', requireAuth, variableRoutes);
app.use('/api/resumelab', requireAuth, resumelabRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/roadmaps', requireAuth, roadmapRoutes);

connectMongo()
  .then(() => {
    console.log('[boot] Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`[boot] Server listening on port ${PORT}`);
      console.log(`[boot] Frontend origin: ${FRONTEND_ORIGIN}`);
      console.log(`[boot] Environment: ${isProd ? 'production' : 'development'}`);
    });

    // Scheduled campaign worker — checks every 60 seconds for due campaigns
    setInterval(() => processScheduledCampaigns(User), 60 * 1000);
    console.log('[boot] Scheduled campaign worker started (60s interval)');
  })
  .catch(err => {
    console.error('[boot] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
