const { google } = require('googleapis');
const { resolveSenderIdentity, resolveDisplayName } = require('./services/senderResolver');
const { encrypt, decrypt } = require('./utils/crypto');
const { encryptJson, decryptJson, isEncryptedEnvelope, normalizeEmail } = require('./utils/dataSecurity');
require('dotenv').config();

/* ── Logging helpers ── */

const LOG_PREFIX = {
  oauth: '[oauth]',
  gmail: '[gmail]',
  auth: '[auth]',
};

function logInfo(prefix, message, data) {
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function logWarn(prefix, message, data) {
  if (data !== undefined) {
    console.warn(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  } else {
    console.warn(`${prefix} ${message}`);
  }
}

function logError(prefix, message, data) {
  if (data !== undefined) {
    console.error(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

function safeErrorPayload(err) {
  return {
    message: err?.message || '(no message)',
    code: err?.code || '(no code)',
    status: err?.response?.status || '(no status)',
    statusText: err?.response?.statusText || '',
    googleError: err?.response?.data?.error || err?.response?.data || '(no google error body)',
    errorDescription: err?.response?.data?.error_description || '',
  };
}

/* ── OAuth scopes ── */

const REQUIRED_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
];

/* ── Encrypted field helpers ── */

function setEncryptedUserGmailEmail(user, email) {
  user.gmailEmailEnc = encryptJson({ value: normalizeEmail(email) });
  user.gmailEmail = undefined;
}

function getUserGmailEmail(user) {
  if (isEncryptedEnvelope(user.gmailEmailEnc)) {
    try {
      return normalizeEmail(decryptJson(user.gmailEmailEnc)?.value || '');
    } catch (_err) {
      return normalizeEmail(user.gmailEmail || user.email || '');
    }
  }
  return normalizeEmail(user.gmailEmail || user.email || '');
}

/* ── OAuth client ── */

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback';
  if (!clientId || !clientSecret) {
    logError(LOG_PREFIX.oauth, 'FATAL: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  logInfo(LOG_PREFIX.oauth, `OAuth client initialized — clientId: ${clientId.slice(0, 12)}…, redirectUri: ${redirectUri}`);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl({ state, forceConsent = false }) {
  const oAuth2Client = getOAuthClient();
  const prompt = forceConsent ? 'consent' : 'select_account';
  logInfo(LOG_PREFIX.oauth, `Generating auth URL — prompt: ${prompt}, scopes:`, REQUIRED_SCOPES);
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt,
    scope: REQUIRED_SCOPES,
    state,
  });
}

/* ── Token management ── */

async function clearGmailAuthorization(user, reason) {
  if (!user) return;
  logWarn(LOG_PREFIX.oauth, `Clearing Gmail authorization — reason: ${reason}, userId: ${user._id}`);
  user.encryptedRefreshToken = undefined;
  user.gmailConnected = false;
  user.gmailState = undefined;
  user.gmailStateExpiresAt = undefined;
  await user.save();
  logInfo(LOG_PREFIX.oauth, 'Authorization cleared successfully');
}

async function ensureFreshAccessToken(user, oAuth2Client) {
  logInfo(LOG_PREFIX.auth, `Refreshing access token for userId: ${user._id}`);
  try {
    const { token } = await oAuth2Client.getAccessToken();
    if (!token) {
      logWarn(LOG_PREFIX.auth, 'getAccessToken() returned null — authorization expired');
      const err = new Error('Gmail authorization expired. Please reconnect.');
      err.code = 'AUTH_EXPIRED';
      throw err;
    }
    logInfo(LOG_PREFIX.auth, `Access token refreshed successfully — token starts with: ${String(token).slice(0, 10)}…`);
    return token;
  } catch (err) {
    const errPayload = safeErrorPayload(err);
    const errMsg = err?.response?.data?.error_description || err?.response?.data?.error || err.message || '';
    logError(LOG_PREFIX.auth, 'Token refresh failed — full error:', errPayload);
    if (/invalid_grant|invalid_token|insufficient permission|expired|revoked/i.test(errMsg)) {
      await clearGmailAuthorization(user, `Token refresh failed: ${errMsg}`);
      const authErr = new Error('Gmail authorization expired. Please reconnect.');
      authErr.code = 'AUTH_EXPIRED';
      throw authErr;
    }
    throw err;
  }
}

/**
 * Introspect the current access token to get granted scopes.
 * Returns { scopes: string[], azp: string, email: string, expiresIn: number } or null on failure.
 */
async function introspectTokenScopes(oAuth2Client) {
  try {
    const accessToken = oAuth2Client.credentials?.access_token;
    if (!accessToken) {
      logWarn(LOG_PREFIX.auth, 'introspectTokenScopes: no access_token in credentials');
      return null;
    }
    const tokenInfo = await oAuth2Client.getTokenInfo(accessToken);
    const result = {
      scopes: tokenInfo.scopes || [],
      azp: tokenInfo.azp || '',
      email: tokenInfo.email || '',
      expiresIn: tokenInfo.expiry_date ? Math.round((tokenInfo.expiry_date - Date.now()) / 1000) : 0,
    };
    logInfo(LOG_PREFIX.auth, 'Token introspection result:', result);
    return result;
  } catch (err) {
    logWarn(LOG_PREFIX.auth, 'Token introspection failed:', safeErrorPayload(err));
    return null;
  }
}

/* ── Profile resolution ── */

async function getProfileFromIdToken(oAuth2Client, tokens) {
  if (!tokens?.id_token) {
    logInfo(LOG_PREFIX.oauth, 'No id_token in tokens — skipping ID token profile resolution');
    return null;
  }
  const ticket = await oAuth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email) {
    logWarn(LOG_PREFIX.oauth, 'ID token payload has no email');
    return null;
  }
  const profile = {
    email: payload.email,
    name: payload.name || payload.given_name || payload.email,
    sub: payload.sub,
  };
  logInfo(LOG_PREFIX.oauth, 'Profile from ID token:', { email: profile.email, name: profile.name });
  return profile;
}

async function getProfileFromUserInfo(oAuth2Client) {
  logInfo(LOG_PREFIX.oauth, 'Fetching profile from userinfo endpoint');
  const res = await oAuth2Client.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
  const data = res?.data || {};
  if (!data.email) {
    logWarn(LOG_PREFIX.oauth, 'Userinfo response has no email');
    return null;
  }
  const profile = {
    email: data.email,
    name: data.name || data.given_name || data.email,
    sub: data.id,
  };
  logInfo(LOG_PREFIX.oauth, 'Profile from userinfo:', { email: profile.email, name: profile.name });
  return profile;
}

/* ── Code exchange ── */

async function exchangeCodeForUser(user, code) {
  logInfo(LOG_PREFIX.oauth, `Exchanging authorization code for tokens — userId: ${user._id}`);
  const oAuth2Client = getOAuthClient();

  const { tokens } = await oAuth2Client.getToken(code);

  logInfo(LOG_PREFIX.oauth, 'Tokens received from Google:', {
    hasAccessToken: !!tokens?.access_token,
    hasRefreshToken: !!tokens?.refresh_token,
    hasIdToken: !!tokens?.id_token,
    tokenType: tokens?.token_type || '(none)',
    scope: tokens?.scope || '(none)',
    expiryDate: tokens?.expiry_date ? new Date(tokens.expiry_date).toISOString() : '(none)',
  });

  const incomingRefresh = tokens?.refresh_token;
  if (!incomingRefresh && !user.encryptedRefreshToken) {
    logError(LOG_PREFIX.oauth, 'No refresh token returned and no existing token stored. User must revoke app access in Google and try again.');
    throw new Error('No refresh token returned. Please remove app access in Google and try again.');
  }
  if (!incomingRefresh) {
    logWarn(LOG_PREFIX.oauth, 'No new refresh token — reusing existing stored refresh token');
  }

  oAuth2Client.setCredentials(tokens);

  // Introspect token to log granted scopes
  const tokenInfo = await introspectTokenScopes(oAuth2Client);
  if (tokenInfo) {
    logInfo(LOG_PREFIX.oauth, 'Granted scopes after exchange:', tokenInfo.scopes);
    // Warn if required scopes are missing
    const grantedSet = new Set(tokenInfo.scopes);
    const missing = REQUIRED_SCOPES.filter(s => !grantedSet.has(s) && s !== 'openid');
    if (missing.length) {
      logWarn(LOG_PREFIX.oauth, 'WARNING: These required scopes were NOT granted:', missing);
    }
  }

  let profile = null;
  try {
    profile = await getProfileFromIdToken(oAuth2Client, tokens);
  } catch (err) {
    logWarn(LOG_PREFIX.oauth, 'ID token verification failed:', safeErrorPayload(err));
  }
  if (!profile) {
    profile = await getProfileFromUserInfo(oAuth2Client);
  }
  if (!profile?.email) {
    logError(LOG_PREFIX.oauth, 'Failed to read Google profile — no email found');
    throw new Error('Failed to read Google profile');
  }

  const encryptedRefreshToken = incomingRefresh ? encrypt(incomingRefresh) : user.encryptedRefreshToken;

  user.googleId = profile.sub || profile.email;
  setEncryptedUserGmailEmail(user, profile.email);
  user.email = user.email || profile.email.toLowerCase();
  user.displayName = user.displayName || profile.name || profile.email;
  user.encryptedRefreshToken = encryptedRefreshToken;
  user.gmailConnected = true;
  await user.save();

  logInfo(LOG_PREFIX.oauth, `Token exchange complete — user: ${profile.email}, gmailConnected: true`);
  return user;
}

/* ── Authorized client ── */

async function getAuthorizedClient(user, { verifyAccess = true } = {}) {
  logInfo(LOG_PREFIX.auth, `Building authorized client — userId: ${user?._id}, verifyAccess: ${verifyAccess}`);

  if (!user || !user.encryptedRefreshToken) {
    logWarn(LOG_PREFIX.auth, 'No encrypted refresh token found — auth required');
    const err = new Error('Missing Gmail authorization. Please reconnect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const refreshToken = decrypt(user.encryptedRefreshToken);
  if (!refreshToken) {
    logWarn(LOG_PREFIX.auth, 'Decrypted refresh token is empty — auth required');
    const err = new Error('Missing Gmail authorization. Please reconnect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  logInfo(LOG_PREFIX.auth, `Refresh token decrypted successfully — token starts with: ${refreshToken.slice(0, 8)}…`);

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  if (verifyAccess) {
    await ensureFreshAccessToken(user, oAuth2Client);
  }
  return oAuth2Client;
}

/* ── Auth verification ── */

async function verifyAuth(user) {
  logInfo(LOG_PREFIX.auth, `Verifying auth for userId: ${user?._id}`);
  try {
    if (!user) {
      logWarn(LOG_PREFIX.auth, 'verifyAuth called with null user');
      return { valid: false };
    }
    const auth = await getAuthorizedClient(user, { verifyAccess: true });

    // Introspect scopes
    const tokenInfo = await introspectTokenScopes(auth);

    const identity = await resolveSenderIdentity({
      auth,
      customSenderName: null,
      getCachedIdentity: null,
      saveIdentity: null,
    });
    const primaryEmail = identity?.sendAsEmail || user.email;
    logInfo(LOG_PREFIX.auth, `Auth verified — email: ${primaryEmail}, displayName: ${user.displayName}`);
    return {
      valid: !!primaryEmail,
      email: primaryEmail || getUserGmailEmail(user),
      displayName: user.displayName,
      scopes: tokenInfo?.scopes || [],
    };
  } catch (err) {
    const errMsg = err?.response?.data?.error?.message || err.message || '';
    logError(LOG_PREFIX.auth, 'Auth verification failed:', safeErrorPayload(err));
    return { valid: false, error: errMsg };
  }
}

/* ── Gmail-safe HTML utilities ── */

const QUILL_FONT_MAP = {
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, serif',
  'times-new-roman': '"Times New Roman", Times, serif',
  tahoma: 'Tahoma, Geneva, sans-serif',
  'trebuchet-ms': '"Trebuchet MS", Helvetica, sans-serif',
};

const QUILL_SIZE_MAP = {
  small: '0.75em',
  large: '1.5em',
  huge: '2.5em',
};

function quillClassesToInlineStyles(html) {
  // Convert span Quill font/size classes to inline styles
  html = html.replace(/<span([^>]*)>/g, (match, attrs) => {
    const classMatch = attrs.match(/class="([^"]*)"/);
    if (!classMatch) return match;

    const classes = classMatch[1].split(/\s+/);
    const newStyles = [];

    for (const cls of classes) {
      const fontM = cls.match(/^ql-font-(.+)$/);
      if (fontM && QUILL_FONT_MAP[fontM[1]]) {
        newStyles.push(`font-family: ${QUILL_FONT_MAP[fontM[1]]}`);
      }
      const sizeM = cls.match(/^ql-size-(.+)$/);
      if (sizeM && QUILL_SIZE_MAP[sizeM[1]]) {
        newStyles.push(`font-size: ${QUILL_SIZE_MAP[sizeM[1]]}`);
      }
    }

    if (!newStyles.length) return match;

    const existingStyleM = attrs.match(/style="([^"]*)"/);
    let newAttrs;
    if (existingStyleM) {
      const combined = `${existingStyleM[1].replace(/;?\s*$/, '')}; ${newStyles.join('; ')}`;
      newAttrs = attrs.replace(/style="[^"]*"/, `style="${combined}"`);
    } else {
      newAttrs = attrs + ` style="${newStyles.join('; ')}"`;
    }
    return `<span${newAttrs}>`;
  });

  // Convert paragraph alignment classes to inline style
  html = html.replace(/<(p|h[1-6]|div)([^>]*)\bclass="([^"]*)"([^>]*)>/g, (match, tag, before, cls, after) => {
    const alignM = cls.match(/ql-align-(left|center|right|justify)/);
    if (!alignM) return match;
    const textAlign = alignM[1];
    const existingStyleM = (before + after).match(/style="([^"]*)"/);
    if (existingStyleM) {
      const combined = `${existingStyleM[1].replace(/;?\s*$/, '')}; text-align: ${textAlign}`;
      const newBefore = before.replace(/style="[^"]*"/, '');
      const newAfter = after.replace(/style="[^"]*"/, '');
      return `<${tag}${newBefore}class="${cls}"${newAfter} style="${combined}">`;
    }
    return `<${tag}${before}class="${cls}"${after} style="text-align: ${textAlign}">`;
  });

  return html;
}

function wrapForGmail(html) {
  const processed = quillClassesToInlineStyles(html);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#ffffff;"><div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#333333;">${processed}</div></body></html>`;
}

/* ── MIME email sender ── */

function toBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function foldBase64(value) {
  return String(value || '').replace(/\s+/g, '').match(/.{1,76}/g)?.join('\r\n') || '';
}

function encodeMimeBase64(value) {
  return foldBase64(Buffer.from(String(value || ''), 'utf8').toString('base64'));
}

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function quoteHeaderValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
}

function buildRawMimeMessage({ from, to, subject, html, attachments = [] }) {
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const wrappedHtml = wrapForGmail(html);
  const plainText = htmlToPlainText(wrappedHtml) || htmlToPlainText(html) || ' ';
  const altBoundary = `rf_alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const mixedBoundary = `rf_mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const commonHeaders = [
    `From: ${from}`,
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ];

  const alternativePart = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimeBase64(plainText),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimeBase64(wrappedHtml),
    '',
    `--${altBoundary}--`,
    '',
  ].join('\r\n');

  if (!safeAttachments.length) {
    return [
      ...commonHeaders,
      alternativePart,
    ].join('\r\n');
  }

  const message = [
    ...commonHeaders,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    alternativePart,
  ];

  for (const att of safeAttachments) {
    const name = quoteHeaderValue(att.name || 'attachment');
    message.push(
      `--${mixedBoundary}`,
      `Content-Type: ${att.mimeType}; name="${name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${name}"`,
      '',
      foldBase64(att.data),
      ''
    );
  }

  message.push(`--${mixedBoundary}--`);
  return message.join('\r\n');
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB

function validateAttachments(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return null;
  if (attachments.length > MAX_ATTACHMENTS) {
    return `Max ${MAX_ATTACHMENTS} attachments allowed`;
  }
  let totalSize = 0;
  for (const att of attachments) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(att.mimeType)) {
      return `File type not allowed: ${att.mimeType}`;
    }
    totalSize += att.size || 0;
  }
  if (totalSize > MAX_ATTACHMENT_TOTAL_BYTES) {
    return 'Total attachment size exceeds 20MB';
  }
  return null;
}

async function sendMimeEmail({ user, to, subject, html, senderName, attachments = [] }) {
  logInfo(LOG_PREFIX.gmail, `Preparing to send email — to: ${Array.isArray(to) ? to.join(', ') : to}, subject: "${subject}", userId: ${user._id}, attachments: ${attachments.length}`);

  const auth = await getAuthorizedClient(user, { verifyAccess: true });
  const gmail = google.gmail({ version: 'v1', auth });

  logInfo(LOG_PREFIX.gmail, 'Resolving sender identity…');
  const identity = await resolveSenderIdentity({
    auth,
    customSenderName: senderName,
    getCachedIdentity: null,
    saveIdentity: null,
  });

  if (!identity?.sendAsEmail) {
    logError(LOG_PREFIX.gmail, 'Sender identity could not be resolved — no sendAsEmail');
    const err = new Error('Sender identity could not be resolved');
    err.code = 'SENDER_UNAVAILABLE';
    throw err;
  }

  logInfo(LOG_PREFIX.gmail, `Sender identity resolved — sendAsEmail: ${identity.sendAsEmail}, displayName: ${identity.gmailDisplayName || '(none)'}`);

  const displayName = resolveDisplayName(
    senderName,
    identity.gmailDisplayName,
    identity.sendAsEmail
  );

  const toHeader = Array.isArray(to) ? to.join(', ') : to;
  const rawMessage = buildRawMimeMessage({
    from: `${displayName} <${identity.sendAsEmail}>`,
    to: toHeader,
    subject,
    html,
    attachments,
  });

  const encodedMessage = toBase64Url(rawMessage);

  logInfo(LOG_PREFIX.gmail, `Sending email via Gmail API — from: ${displayName} <${identity.sendAsEmail}>, to: ${toHeader}`);

  try {
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });
    logInfo(LOG_PREFIX.gmail, `Email sent successfully — messageId: ${result.data?.id}, threadId: ${result.data?.threadId}`);
  } catch (err) {
    const errPayload = safeErrorPayload(err);
    logError(LOG_PREFIX.gmail, 'Gmail API send FAILED — full error:', errPayload);

    const errMsg = err?.response?.data?.error?.message || err.message || '';
    if (/invalid_grant|Token has been expired|revoked|insufficient permission/i.test(errMsg)) {
      logWarn(LOG_PREFIX.gmail, 'Error indicates auth issue — clearing authorization');
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
  introspectTokenScopes,
  validateAttachments,
  REQUIRED_SCOPES,
  _private: {
    buildRawMimeMessage,
    htmlToPlainText,
    wrapForGmail,
  },
};
