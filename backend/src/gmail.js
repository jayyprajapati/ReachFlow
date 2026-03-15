const { google } = require('googleapis');
const { resolveSenderIdentity, resolveDisplayName } = require('./services/senderResolver');
const { encrypt, decrypt } = require('./utils/crypto');
require('dotenv').config();

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback';
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl({ state, forceConsent = false }) {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: forceConsent ? 'consent' : 'select_account',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    state,
  });
}

async function clearGmailAuthorization(user, reason) {
  if (!user) return;
  user.encryptedRefreshToken = undefined;
  user.gmailConnected = false;
  user.gmailState = undefined;
  user.gmailStateExpiresAt = undefined;
  await user.save();
  console.log('[oauth] Authorization cleared');
}

async function ensureFreshAccessToken(user, oAuth2Client) {
  try {
    const { token } = await oAuth2Client.getAccessToken();
    if (!token) {
      const err = new Error('Gmail authorization expired. Please reconnect.');
      err.code = 'AUTH_EXPIRED';
      throw err;
    }
    return token;
  } catch (err) {
    const errMsg = err?.response?.data?.error_description || err?.response?.data?.error || err.message || '';
    if (/invalid_grant|invalid_token|insufficient permission|expired|revoked/i.test(errMsg)) {
      await clearGmailAuthorization(user, errMsg);
      const authErr = new Error('Gmail authorization expired. Please reconnect.');
      authErr.code = 'AUTH_EXPIRED';
      console.warn('[oauth] Refresh failed: auth expired');
      throw authErr;
    }
    console.warn('[oauth] Refresh failed: unexpected');
    throw err;
  }
}

async function getProfileFromIdToken(oAuth2Client, tokens) {
  if (!tokens?.id_token) return null;
  const ticket = await oAuth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) return null;
  return {
    email: payload.email,
    name: payload.name || payload.given_name || payload.email,
    sub: payload.sub,
  };
}

async function getProfileFromUserInfo(oAuth2Client) {
  const res = await oAuth2Client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
  const data = res?.data || {};
  if (!data.email) return null;
  return {
    email: data.email,
    name: data.name || data.given_name || data.email,
    sub: data.id,
  };
}

async function exchangeCodeForUser(user, code) {
  const oAuth2Client = getOAuthClient();

  const { tokens } = await oAuth2Client.getToken(code);

  const incomingRefresh = tokens?.refresh_token;
  if (!incomingRefresh && !user.encryptedRefreshToken) {
    throw new Error('No refresh token returned. Please remove app access in Google and try again.');
  }
  oAuth2Client.setCredentials(tokens);

  let profile = null;
  try {
    profile = await getProfileFromIdToken(oAuth2Client, tokens);
  } catch (err) {
    console.warn('[oauth] ID token verification failed');
  }
  if (!profile) {
    profile = await getProfileFromUserInfo(oAuth2Client);
  }
  if (!profile?.email) {
    throw new Error('Failed to read Google profile');
  }

  const encryptedRefreshToken = incomingRefresh ? encrypt(incomingRefresh) : user.encryptedRefreshToken;

  user.googleId = profile.sub || profile.email;
  user.gmailEmail = profile.email.toLowerCase();
  user.email = user.email || profile.email.toLowerCase();
  user.displayName = user.displayName || profile.name || profile.email;
  user.encryptedRefreshToken = encryptedRefreshToken;
  user.gmailConnected = true;
  await user.save();

  return user;
}

async function getAuthorizedClient(user, { verifyAccess = true } = {}) {
  if (!user || !user.encryptedRefreshToken) {
    const err = new Error('Missing Gmail authorization. Please reconnect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const refreshToken = decrypt(user.encryptedRefreshToken);
  if (!refreshToken) {
    const err = new Error('Missing Gmail authorization. Please reconnect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  if (verifyAccess) {
    await ensureFreshAccessToken(user, oAuth2Client);
  }
  return oAuth2Client;
}

async function verifyAuth(user) {
  try {
    if (!user) return { valid: false };
    const auth = await getAuthorizedClient(user, { verifyAccess: true });
    const identity = await resolveSenderIdentity({
      auth,
      customSenderName: null,
      getCachedIdentity: null,
      saveIdentity: null,
    });
    const primaryEmail = identity?.sendAsEmail || user.email;
    return {
      valid: !!primaryEmail,
      email: primaryEmail,
      displayName: user.displayName,
    };
  } catch (err) {
    const errMsg = err?.response?.data?.error?.message || err.message || '';
    return { valid: false, error: errMsg };
  }
}

function toBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendMimeEmail({ user, to, subject, html, senderName }) {
  const auth = await getAuthorizedClient(user, { verifyAccess: true });
  const gmail = google.gmail({ version: 'v1', auth });

  const identity = await resolveSenderIdentity({
    auth,
    customSenderName: senderName,
    getCachedIdentity: null,
    saveIdentity: null,
  });

  if (!identity?.sendAsEmail) {
    const err = new Error('Sender identity could not be resolved');
    err.code = 'SENDER_UNAVAILABLE';
    throw err;
  }

  const displayName = resolveDisplayName(
    senderName,
    identity.gmailDisplayName,
    identity.sendAsEmail
  );

  const toHeader = Array.isArray(to) ? to.join(', ') : to;
  const messageParts = [
    `From: ${displayName} <${identity.sendAsEmail}>`,
    `To: ${toHeader}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
  ];

  const message = messageParts.join('\r\n');
  const encodedMessage = toBase64Url(message);

  try {
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });
    console.log('[gmail] Message sent', { messageId: result.data?.id });
  } catch (err) {
    const errMsg = err?.response?.data?.error?.message || err.message || '';
    if (/invalid_grant|Token has been expired|revoked|insufficient permission/i.test(errMsg)) {
      await clearGmailAuthorization(user, errMsg);
      const authErr = new Error('Gmail authorization expired. Please reconnect your account.');
      authErr.code = 'AUTH_EXPIRED';
      throw authErr;
    }
    throw err;
  }
}

module.exports = {
  getAuthUrl,
  exchangeCodeForUser,
  verifyAuth,
  getAuthorizedClient,
  sendMimeEmail,
  clearGmailAuthorization,
  ensureFreshAccessToken,
};
