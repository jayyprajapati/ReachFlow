const { google } = require('googleapis');

/**
 * Fetch the primary sendAs identity from Gmail settings.
 * Falls back to the authenticated user's profile email if sendAs.list()
 * fails (e.g. due to insufficient scopes).
 */
async function fetchPrimarySendAs(auth) {
  console.log('[sender] Fetching primary sendAs identity via gmail.users.settings.sendAs.list…');
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const res = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const sendAs = res?.data?.sendAs || [];
    console.log(`[sender] sendAs.list returned ${sendAs.length} identit${sendAs.length !== 1 ? 'ies' : 'y'}`);

    if (!sendAs.length) {
      console.warn('[sender] No send-as identities found — falling back to profile');
      return await fallbackToProfile(auth);
    }

    const primary = sendAs.find(sa => sa.isPrimary) || sendAs[0];
    if (!primary?.sendAsEmail) {
      console.warn('[sender] Primary sendAs identity has no email — falling back to profile');
      return await fallbackToProfile(auth);
    }

    const result = {
      sendAsEmail: primary.sendAsEmail,
      gmailDisplayName: primary.displayName || '',
    };
    console.log('[sender] Resolved via sendAs.list:', JSON.stringify(result));
    return result;
  } catch (err) {
    const errMessage = err?.response?.data?.error?.message || err.message || '';
    const errStatus = err?.response?.status || err?.code || '(unknown)';
    console.error(`[sender] sendAs.list FAILED — status: ${errStatus}, message: ${errMessage}`);
    console.error('[sender] Full error payload:', JSON.stringify({
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
      code: err?.code,
    }, null, 2));

    // Graceful fallback: if scopes are insufficient or API fails, use profile email
    console.warn('[sender] Falling back to profile-based sender identity');
    return await fallbackToProfile(auth);
  }
}

/**
 * Fallback: get the sender email from the Gmail user profile.
 * This only requires the gmail.send scope (or email scope).
 */
async function fallbackToProfile(auth) {
  console.log('[sender] Attempting fallback via gmail.users.getProfile…');
  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    const profileEmail = profileRes?.data?.emailAddress;
    if (profileEmail) {
      console.log(`[sender] Fallback success — email from profile: ${profileEmail}`);
      return {
        sendAsEmail: profileEmail,
        gmailDisplayName: '',
      };
    }
  } catch (profileErr) {
    console.error('[sender] Fallback via getProfile also FAILED:', JSON.stringify({
      status: profileErr?.response?.status,
      message: profileErr?.message,
      data: profileErr?.response?.data,
    }, null, 2));
  }

  // Last resort: try userinfo
  console.log('[sender] Attempting last-resort fallback via oauth2 userinfo…');
  try {
    const res = await auth.request({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });
    const email = res?.data?.email;
    if (email) {
      console.log(`[sender] Last-resort fallback success — email from userinfo: ${email}`);
      return {
        sendAsEmail: email,
        gmailDisplayName: res?.data?.name || '',
      };
    }
  } catch (userinfoErr) {
    console.error('[sender] Last-resort fallback via userinfo also FAILED:', userinfoErr.message);
  }

  throw new Error('Could not resolve sender email — all methods failed. Please reconnect Gmail.');
}

function resolveDisplayName(customSenderName, gmailDisplayName, sendAsEmail) {
  const custom = (customSenderName || '').trim();
  const gmailName = (gmailDisplayName || '').trim();
  const localPart = (sendAsEmail || '').split('@')[0] || 'Sender';
  const resolved = custom || gmailName || localPart;
  console.log(`[sender] resolveDisplayName — custom: "${custom}", gmail: "${gmailName}", resolved: "${resolved}"`);
  return resolved;
}

async function resolveSenderIdentity({ auth, customSenderName, getCachedIdentity, saveIdentity }) {
  if (!auth) {
    console.error('[sender] resolveSenderIdentity called without auth client');
    throw new Error('Missing Gmail auth client');
  }

  console.log('[sender] Resolving sender identity…');
  const cached = typeof getCachedIdentity === 'function' ? getCachedIdentity() : null;
  let identity = cached && cached.sendAsEmail ? cached : null;

  if (identity) {
    console.log(`[sender] Using cached identity — email: ${identity.sendAsEmail}`);
  }

  if (!identity) {
    console.log('[sender] No cached identity — fetching from Gmail');
    identity = await fetchPrimarySendAs(auth);
    if (typeof saveIdentity === 'function') {
      saveIdentity({ ...identity, fetchedAt: new Date().toISOString() });
      console.log('[sender] Identity cached for future use');
    }
  }

  const resolvedDisplayName = resolveDisplayName(customSenderName, identity.gmailDisplayName, identity.sendAsEmail);

  console.log('[sender] Sender identity resolved:', JSON.stringify({
    sendAsEmail: identity.sendAsEmail,
    gmailDisplayName: identity.gmailDisplayName,
    resolvedDisplayName,
  }));

  return {
    ...identity,
    resolvedDisplayName,
  };
}

module.exports = {
  resolveSenderIdentity,
  resolveDisplayName,
  fetchPrimarySendAs,
};
