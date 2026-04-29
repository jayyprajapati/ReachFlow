import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const LINKEDIN_EXTENSION_ID = import.meta.env.VITE_LINKEDIN_EXTENSION_ID || '';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

function postToLinkedinExtension(message) {
  if (!LINKEDIN_EXTENSION_ID) return Promise.resolve(false);
  if (typeof window === 'undefined' || !window.chrome?.runtime?.sendMessage) return Promise.resolve(false);
  return new Promise((resolve) => {
    window.chrome.runtime.sendMessage(LINKEDIN_EXTENSION_ID, message, () => {
      if (window.chrome.runtime.lastError) { resolve(false); return; }
      resolve(true);
    });
  });
}

function syncExtensionAuthToken(token) {
  return postToLinkedinExtension({ type: 'RF_SET_AUTH_TOKEN', token, apiBaseUrl: API_BASE });
}

function clearExtensionAuthToken() {
  return postToLinkedinExtension({ type: 'RF_CLEAR_AUTH_TOKEN' });
}

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }) {
  const [appUser, setAppUser] = useState(null);
  const [idToken, setIdToken] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailActionLoading, setGmailActionLoading] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [savedSenderName, setSavedSenderName] = useState('');
  const [savingSenderName, setSavingSenderName] = useState(false);
  const [grantedScopes, setGrantedScopes] = useState([]);
  const [requiredScopes, setRequiredScopes] = useState([]);
  const [notice, setNotice] = useState(null);
  const [warningDialog, setWarningDialog] = useState(null);
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [variables, setVariables] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [scheduled, setScheduled] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);

  const hdrs = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  // ── Auth token resolver ──
  async function resolveAuthToken(tokenOverride = '', forceRefresh = false) {
    if (tokenOverride) return tokenOverride;
    const user = firebaseAuth.currentUser;
    if (!user) {
      if (!idToken) throw new Error('Not authenticated');
      return idToken;
    }
    const token = await user.getIdToken(forceRefresh);
    if (token && token !== idToken) {
      setIdToken(token);
      syncExtensionAuthToken(token);
    }
    return token;
  }

  async function authedFetch(url, options = {}, tokenOverride = '') {
    const requestHeaders = { ...hdrs, ...(options.headers || {}) };
    const requestOptions = { ...options, headers: requestHeaders };
    let token = await resolveAuthToken(tokenOverride, false);
    requestHeaders.Authorization = `Bearer ${token}`;
    let response = await fetch(url, requestOptions);
    if (!tokenOverride && response.status === 401) {
      token = await resolveAuthToken('', true);
      requestHeaders.Authorization = `Bearer ${token}`;
      response = await fetch(url, requestOptions);
    }
    return response;
  }

  // ── Profile ──
  const hydrateProfile = async (tokenOverride) => {
    const tok = tokenOverride || idToken;
    if (!tok) return;
    try {
      const r = await authedFetch(`${API_BASE}/auth/me`, {}, tok);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to load profile');
      setGmailConnected(!!d.gmailConnected);
      setSenderName(d.user?.senderDisplayName || '');
      setSavedSenderName(d.user?.senderDisplayName || '');
      setGrantedScopes(Array.isArray(d.grantedScopes) ? d.grantedScopes : []);
      setRequiredScopes(Array.isArray(d.requiredScopes) ? d.requiredScopes : []);
      setAppUser(prev => ({
        email: d.user?.email || prev?.email || '',
        displayName: d.user?.displayName || prev?.displayName || '',
        firebaseUid: d.user?.firebaseUid || prev?.firebaseUid || '',
      }));
    } catch (err) {
      setGmailConnected(false);
      setNotice({ type: 'error', message: err.message });
    }
  };

  // ── Data loaders ──
  const loadHistory = async (tok) => {
    setHistoryLoading(true);
    try {
      const r = await authedFetch(`${API_BASE}/api/campaigns?view=history`, {}, tok);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setHistory(d);
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to load history' });
    } finally { setHistoryLoading(false); }
  };

  const loadDrafts = async (tok) => {
    setDraftsLoading(true);
    try {
      const r = await authedFetch(`${API_BASE}/api/campaigns?view=drafts`, {}, tok);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setDrafts(d);
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to load drafts' });
    } finally { setDraftsLoading(false); }
  };

  const loadScheduled = async (tok) => {
    setScheduledLoading(true);
    try {
      const r = await authedFetch(`${API_BASE}/api/campaigns?view=scheduled`, {}, tok);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setScheduled(d);
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to load scheduled campaigns' });
    } finally { setScheduledLoading(false); }
  };

  const loadGroups = async (tok) => {
    try {
      const r = await authedFetch(`${API_BASE}/api/groups`, {}, tok);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setGroups(d);
    } catch (e) { /* silent */ }
  };

  const loadTemplates = async (tok) => {
    setTemplatesLoading(true);
    try {
      const r = await authedFetch(`${API_BASE}/api/templates`, {}, tok);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setTemplates(d);
    } catch (e) {
      setNotice({ type: 'error', message: e.message });
    } finally { setTemplatesLoading(false); }
  };

  const loadVariables = async (tok) => {
    try {
      const r = await authedFetch(`${API_BASE}/api/variables`, {}, tok);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setVariables(d);
    } catch (e) {
      setNotice({ type: 'error', message: e.message });
    }
  };

  // ── Gmail ──
  async function connectGmail() {
    if (gmailActionLoading) return;
    setGmailActionLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/gmail/connect`, { method: 'POST' });
      const d = await res.json();
      if (d.alreadyConnected) {
        setGmailConnected(true);
        setNotice({ type: 'success', message: 'Gmail already connected.' });
        hydrateProfile();
        setGmailActionLoading(false);
        return;
      }
      if (!res.ok || !d.url) throw new Error(d.error || 'Failed to start Gmail connect');
      window.location.href = d.url;
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to start Gmail connect' });
      setGmailActionLoading(false);
    }
  }

  async function disconnectGmail() {
    if (gmailActionLoading) return;
    setGmailActionLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/gmail/disconnect`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to disconnect');
      setGmailConnected(false);
      setNotice({ type: 'info', message: 'Gmail disconnected' });
      hydrateProfile();
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to disconnect' });
    } finally { setGmailActionLoading(false); }
  }

  async function reconnectGmail() {
    if (gmailActionLoading) return;
    setGmailActionLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/gmail/reconnect`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d.error || 'Failed to restart Gmail connect');
      window.location.href = d.url;
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to restart Gmail connect' });
      setGmailActionLoading(false);
    }
  }

  // ── Auth actions ──
  async function login() {
    try { await signInWithPopup(firebaseAuth, provider); }
    catch (e) { setNotice({ type: 'error', message: e.message || 'Login failed' }); }
  }

  async function logout() {
    clearExtensionAuthToken();
    await signOut(firebaseAuth);
    setAppUser(null); setIdToken(''); setGmailConnected(false);
    setSenderName(''); setSavedSenderName('');
    setGroups([]); setHistory([]); setDrafts([]); setScheduled([]); setTemplates([]); setVariables([]);
  }

  async function saveSenderPreference() {
    if (!firebaseAuth.currentUser && !idToken) return;
    const nextName = (senderName || '').trim();
    if (nextName === savedSenderName) return;
    setSavingSenderName(true);
    try {
      const res = await authedFetch(`${API_BASE}/auth/me/preferences`, {
        method: 'PATCH', headers: hdrs, body: JSON.stringify({ senderDisplayName: nextName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save sender name');
      setSavedSenderName(d.senderDisplayName || nextName);
      setSenderName(d.senderDisplayName || nextName);
      setNotice({ type: 'success', message: 'Sender name saved' });
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to save sender name' });
    } finally { setSavingSenderName(false); }
  }

  async function deleteMyAccount() {
    setWarningDialog({
      title: 'Delete account?',
      message: 'This permanently deletes your ReachFlow account and all associated data. This action cannot be undone.',
      confirmText: 'Delete account', intent: 'danger',
      onConfirm: async () => {
        try {
          const res = await authedFetch(`${API_BASE}/auth/me`, { method: 'DELETE', headers: hdrs });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to delete account');
          await logout();
          setNotice({ type: 'success', message: 'Your account and app data were deleted.' });
        } catch (err) { setNotice({ type: 'error', message: err.message || 'Failed to delete account' }); }
      },
    });
  }

  // ── Confirm helpers ──
  function confirmDisconnectGmail() {
    setWarningDialog({
      title: 'Disconnect Gmail?',
      message: 'This will disconnect your Gmail account from ReachFlow. You can reconnect any time.',
      confirmText: 'Disconnect Gmail', intent: 'danger',
      onConfirm: disconnectGmail,
    });
  }

  function confirmReconnectGmail() {
    setWarningDialog({
      title: 'Reconnect Gmail OAuth?',
      message: 'You will be redirected to Google to re-authorize Gmail access with a fresh OAuth flow.',
      confirmText: 'Continue', intent: 'primary',
      onConfirm: reconnectGmail,
    });
  }

  function confirmLogout() {
    setWarningDialog({
      title: 'Log out?', message: 'You will be signed out of ReachFlow on this device.',
      confirmText: 'Log out', intent: 'danger', onConfirm: logout,
    });
  }

  // ── Auth effects ──
  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async user => {
      setAuthLoading(false);
      if (user) {
        const token = await user.getIdToken();
        setIdToken(token);
        syncExtensionAuthToken(token);
        setAppUser({ email: user.email, displayName: user.displayName, firebaseUid: user.uid });
        await hydrateProfile(token);
        loadVariables(token); loadHistory(token); loadDrafts(token); loadScheduled(token); loadGroups(token); loadTemplates(token);
      } else {
        clearExtensionAuthToken();
        setAppUser(null); setIdToken(''); setGmailConnected(false); setSenderName(''); setSavedSenderName('');
        setGroups([]); setHistory([]); setDrafts([]); setScheduled([]); setTemplates([]); setVariables([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onIdTokenChanged(firebaseAuth, async user => {
      if (!user) { clearExtensionAuthToken(); return; }
      const token = await user.getIdToken();
      setIdToken(token); syncExtensionAuthToken(token);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get('gmail');
    if (gmail === 'success') {
      setGmailActionLoading(false);
      setNotice({ type: 'success', message: 'Gmail connected!' });
      hydrateProfile();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gmail === 'error') {
      setGmailActionLoading(false);
      const reason = params.get('message') || params.get('reason') || 'Authorization failed';
      setNotice({ type: 'error', message: `Gmail auth failed: ${reason}` });
      hydrateProfile();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const value = useMemo(() => ({
    API_BASE, appUser, authLoading, idToken, authedFetch,
    gmailConnected, gmailActionLoading, connectGmail, disconnectGmail, reconnectGmail,
    confirmDisconnectGmail, confirmReconnectGmail,
    senderName, setSenderName, savedSenderName, savingSenderName, saveSenderPreference,
    grantedScopes, requiredScopes,
    login, logout, confirmLogout, deleteMyAccount,
    notice, setNotice, warningDialog, setWarningDialog,
    groups, setGroups, loadGroups,
    templates, templatesLoading, loadTemplates,
    variables, setVariables, loadVariables,
    history, historyLoading, loadHistory,
    drafts, draftsLoading, loadDrafts,
    scheduled, scheduledLoading, loadScheduled,
    hydrateProfile,
  }), [
    appUser, authLoading, idToken, gmailConnected, gmailActionLoading,
    senderName, savedSenderName, savingSenderName, grantedScopes, requiredScopes,
    notice, warningDialog, groups, templates, templatesLoading,
    variables, history, historyLoading, drafts, draftsLoading, scheduled, scheduledLoading,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
