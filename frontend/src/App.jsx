import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill, { Quill } from 'react-quill';
import RecipientList from './components/RecipientList.jsx';
import GroupManager from './components/GroupManager.jsx';
import ImportGroupModal from './components/ImportGroupModal.jsx';
import { Mail, Users, Send, Clock, Heart, ChevronDown, LayoutGrid } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ header: [2, 3, false] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
  ],
};

const VARIABLE_OPTIONS = ['name'];

const Embed = Quill.import('blots/embed');
class VariableBlot extends Embed {
  static create(value) {
    const node = super.create();
    node.setAttribute('data-key', value);
    node.setAttribute('contenteditable', 'false');
    node.classList.add('var-token');
    node.innerText = `{{${value}}}`;
    return node;
  }

  static value(node) {
    return node.getAttribute('data-key');
  }
}
VariableBlot.blotName = 'variable';
VariableBlot.tagName = 'span';
VariableBlot.className = 'var-token';
Quill.register(VariableBlot);

function uid() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24);
}

function Toast({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`toast toast--${notice.type}`}>
      <span>{notice.message}</span>
      <button onClick={onClose}>×</button>
    </div>
  );
}

function Drawer({ open, title, onClose, children, from = 'right', width = 480 }) {
  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} />}
      <aside className={`drawer drawer--${from} ${open ? 'drawer--open' : ''}`} style={{ width }}>
        <div className="drawer__head">
          <span className="drawer__title">{title}</span>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="drawer__body">{children}</div>
      </aside>
    </>
  );
}

export default function App() {
  /* ── state ── */
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendMode, setSendMode] = useState('individual');
  const [deliveryMode, setDeliveryMode] = useState('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewRecipientId, setPreviewRecipientId] = useState(null);
  const [previewRecipientMeta, setPreviewRecipientMeta] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [appUser, setAppUser] = useState(null);
  const [idToken, setIdToken] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [errors, setErrors] = useState({ recipients: {} });
  const [history, setHistory] = useState([]);
  const [utilityDrawerOpen, setUtilityDrawerOpen] = useState(false);
  const [utilityTab, setUtilityTab] = useState('history');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [savedSenderName, setSavedSenderName] = useState('');
  const [savingSenderName, setSavingSenderName] = useState(false);

  const quillRef = useRef(null);
  const userMenuRef = useRef(null);
  const [slashMenu, setSlashMenu] = useState({ open: false, top: 0, left: 0 });
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [slashTriggerIdx, setSlashTriggerIdx] = useState(null);

  const [variables, setVariables] = useState([]);
  const [varForm, setVarForm] = useState({ key: '', label: '', required: false, description: '' });

  const variableKeys = useMemo(() => ['name', ...variables.map(v => v.key)], [variables]);

  const [groups, setGroups] = useState([]);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [templateDrawer, setTemplateDrawer] = useState(null); // null | 'create' | tpl object
  const [templateTitle, setTemplateTitle] = useState('');

  /* ── effects ── */

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async user => {
      setAuthLoading(false);
      if (user) {
        const token = await user.getIdToken();
        setIdToken(token);
        setAppUser({ email: user.email, displayName: user.displayName, firebaseUid: user.uid });
        setUserMenuOpen(false);
        await hydrateProfile(token);
        loadVariables(token);
        loadHistory(token);
        loadGroups(token);
        loadTemplates(token);
      } else {
        setAppUser(null);
        setIdToken('');
        setGmailConnected(false);
        setSenderName('');
        setSavedSenderName('');
        setUtilityDrawerOpen(false);
        setUserMenuOpen(false);
        setRecipients([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get('gmail');
    if (gmail === 'success') {
      setNotice({ type: 'success', message: 'Gmail connected!' });
      hydrateProfile();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gmail === 'error') {
      const reason = params.get('message') || params.get('reason') || 'Authorization failed';
      setNotice({ type: 'error', message: `Gmail auth failed: ${reason}` });
      hydrateProfile();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(t); }, [notice]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = e => {
      if (!userMenuRef.current?.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!recipients.length) { setPreviewRecipientId(null); return; }
    if (!recipients.some(r => r._id === previewRecipientId)) setPreviewRecipientId(recipients[0]._id);
  }, [recipients, previewRecipientId]);


  const hdrs = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  /* ── slash menu ── */

  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const handleKeyDown = e => {
      if (slashMenu.open) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
          e.preventDefault();
        }
        if (e.key === 'ArrowDown') {
          setSlashHighlight(prev => (prev + 1) % Math.max(variableKeys.length, 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          setSlashHighlight(prev => (prev - 1 + Math.max(variableKeys.length, 1)) % Math.max(variableKeys.length, 1));
          return;
        }
        if (e.key === 'Enter') {
          insertVariable(variableKeys[slashHighlight] || 'name');
          return;
        }
        if (e.key === 'Escape') {
          closeSlashMenu();
          return;
        }
        closeSlashMenu();
        return;
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sel = quill.getSelection(true);
        if (!sel) return;
        const bounds = quill.getBounds(sel.index);
        const rect = quill.root.getBoundingClientRect();
        setSlashMenu({
          open: true,
          left: rect.left + bounds.left,
          top: rect.top + bounds.top + bounds.height + 4,
        });
        setSlashTriggerIdx(sel.index);
        setSlashHighlight(0);
      }
    };

    quill.root.addEventListener('keydown', handleKeyDown);
    return () => quill.root.removeEventListener('keydown', handleKeyDown);
  }, [slashMenu.open, slashHighlight, variableKeys]);

  function closeSlashMenu() {
    setSlashMenu({ open: false, top: 0, left: 0 });
    setSlashTriggerIdx(null);
  }

  function insertVariable(key) {
    const quill = quillRef.current?.getEditor();
    if (!quill || slashTriggerIdx === null) return;
    quill.deleteText(slashTriggerIdx, 1);
    quill.insertEmbed(slashTriggerIdx, 'variable', key);
    quill.insertText(slashTriggerIdx + 1, ' ');
    quill.setSelection(slashTriggerIdx + 2, 0);
    closeSlashMenu();
  }

  async function apiFetch(url, options = {}) {
    const headers = { ...hdrs, ...(options.headers || {}) };
    if (!idToken) throw new Error('Not authenticated');
    headers.Authorization = `Bearer ${idToken}`;
    return fetch(url, { ...options, headers });
  }

  /* ── api helpers ── */

  const hydrateProfile = async (tokenOverride) => {
    const tok = tokenOverride || idToken;
    if (!tok) return;
    try {
      const r = await fetch(`${API_BASE}/auth/me`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to load profile');
      setGmailConnected(!!d.gmailConnected);
      setSenderName(d.user?.senderDisplayName || '');
      setSavedSenderName(d.user?.senderDisplayName || '');
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

  async function disconnectGmail() {
    try {
      const res = await authedFetch(`${API_BASE}/gmail/disconnect`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to disconnect');
      setGmailConnected(false);
      setNotice({ type: 'info', message: 'Gmail disconnected' });
      hydrateProfile();
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to disconnect' });
    }
  }

  async function connectGmail() {
    try {
      const res = await authedFetch(`${API_BASE}/gmail/connect`, { method: 'POST' });
      const d = await res.json();
      if (d.alreadyConnected) {
        setGmailConnected(true);
        setNotice({ type: 'success', message: 'Gmail already connected.' });
        hydrateProfile();
        return;
      }
      if (!res.ok || !d.url) throw new Error(d.error || 'Failed to start Gmail connect');
      window.location.href = d.url;
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to start Gmail connect' });
    }
  }

  async function reconnectGmail() {
    try {
      const res = await authedFetch(`${API_BASE}/gmail/reconnect`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d.error || 'Failed to restart Gmail connect');
      window.location.href = d.url;
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to restart Gmail connect' });
    }
  }

  async function login() {
    try {
      await signInWithPopup(firebaseAuth, provider);
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Login failed' });
    }
  }

  async function saveSenderPreference() {
    if (!idToken) return;
    const nextName = (senderName || '').trim();
    if (nextName === savedSenderName) return;
    setSavingSenderName(true);
    try {
      const res = await authedFetch(`${API_BASE}/auth/me/preferences`, {
        method: 'PATCH',
        headers: hdrs,
        body: JSON.stringify({ senderDisplayName: nextName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save sender name');
      setSavedSenderName(d.senderDisplayName || nextName);
      setSenderName(d.senderDisplayName || nextName);
      setNotice({ type: 'success', message: 'Sender name saved' });
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to save sender name' });
    } finally {
      setSavingSenderName(false);
    }
  }

  async function logout() {
    await signOut(firebaseAuth);
    setAppUser(null);
    setIdToken('');
    setGmailConnected(false);
    setSenderName('');
    setSavedSenderName('');
    setRecipients([]);
    setHistory([]);
  }

  const authedFetch = async (url, options = {}, tokenOverride) => {
    const tok = tokenOverride || idToken;
    if (!tok) throw new Error('Not authenticated');
    return fetch(url, { ...options, headers: { ...hdrs, ...(options.headers || {}), Authorization: `Bearer ${tok}` } });
  };

  const loadHistory = async (tok) => { try { const r = await authedFetch(`${API_BASE}/api/campaigns`, {}, tok); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed'); setHistory(d); } catch (e) { setNotice({ type: 'error', message: e.message || 'Failed to load history' }); } };
  const loadGroups = async (tok) => { try { const r = await authedFetch(`${API_BASE}/api/groups`, {}, tok); const d = await r.json(); if (!r.ok) throw new Error(d.error); setGroups(d); } catch (e) { /* ignore silently — GroupManager handles its own loading */ } };
  const loadTemplates = async (tok) => { try { const r = await authedFetch(`${API_BASE}/api/templates`, {}, tok); const d = await r.json(); if (!r.ok) throw new Error(d.error); setTemplates(d); } catch (e) { setNotice({ type: 'error', message: e.message }); } };
  const loadVariables = async (tok) => { try { const r = await authedFetch(`${API_BASE}/api/variables`, {}, tok); const d = await r.json(); if (!r.ok) throw new Error(d.error); setVariables(d); } catch (e) { setNotice({ type: 'error', message: e.message }); } };

  /* ── helpers ── */

  const strip = h => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
  const nameFrom = e => { const p = (e || '').split('@')[0].replace(/[0-9]/g, '').split(/[._-]+/).filter(Boolean); return p.length ? p.map(cap).join(' ') : 'There'; };
  const san = r => ({ ...r, email: (r.email || '').toLowerCase().trim(), name: (r.name || '').trim(), variables: { ...(r.variables || {}) }, _id: r._id || uid(), status: r.status || 'pending' });

  const VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const findVars = html => {
    const normalized = (html || '').replace(VAR_REGEX, (_m, v) => `{{${String(v || '').toLowerCase()}}}`);
    const found = new Set();
    let m;
    while ((m = VAR_REGEX.exec(normalized)) !== null) {
      found.add(m[1].toLowerCase());
    }
    return Array.from(found);
  };
  const hasUnmatched = html => {
    const open = (html.match(/\{\{/g) || []).length;
    const close = (html.match(/\}\}/g) || []).length;
    return open !== close;
  };

  function parseBulk(raw) {
    if (!raw) return [];
    const seen = new Set(), list = [];
    for (const t of raw.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)) {
      if (!emailRegex.test(t)) continue;
      const e = t.toLowerCase();
      if (seen.has(e)) continue;
      seen.add(e);
      list.push({ email: e, name: nameFrom(e), variables: {}, _id: uid(), status: 'pending' });
    }
    return list;
  }

  /* ── recipient ops ── */

  function updateRecipient(idx, field, value) {
    setRecipients(prev => {
      const next = [...prev]; next[idx] = { ...next[idx], [field]: value };
      const id = next[idx]._id;
      if (errors.recipients?.[id]?.[field]) {
        const ok = field === 'email' ? emailRegex.test(value || '') : !!(value && value.trim());
        if (ok) setErrors(p => { const u = { ...p.recipients }; const x = { ...(u[id] || {}) }; delete x[field]; u[id] = x; return { ...p, recipients: u }; });
      }
      if (errors.recipientsGeneral && next.length) setErrors(p => ({ ...p, recipientsGeneral: undefined }));
      return next;
    });
  }

  function updateRecipientVariable(idx, key, value) {
    setRecipients(prev => {
      const next = [...prev];
      const target = next[idx];
      if (!target) return prev;
      const nextVars = { ...(target.variables || {}), [key]: value };
      next[idx] = { ...target, variables: nextVars };
      const id = next[idx]._id;
      if (errors.recipients?.[id]?.[key] && value) {
        setErrors(p => { const u = { ...p.recipients }; const x = { ...(u[id] || {}) }; delete x[key]; u[id] = x; return { ...p, recipients: u }; });
      }
      return next;
    });
  }

  function deleteRecipient(idx) {
    setRecipients(prev => {
      const rm = prev[idx];
      if (rm && errors.recipients?.[rm._id]) setErrors(p => { const u = { ...p.recipients }; delete u[rm._id]; return { ...p, recipients: u }; });
      return prev.filter((_, i) => i !== idx);
    });
  }

  function addRow() {
    setRecipients(p => [...p, { _id: uid(), email: '', name: '', variables: {}, status: 'pending' }]);
    if (errors.recipientsGeneral) setErrors(p => ({ ...p, recipientsGeneral: undefined }));
  }

  function onEmailBlur(idx) {
    setRecipients(prev => {
      const next = [...prev], r = next[idx];
      if (!r || !emailRegex.test(r.email || '')) return prev;
      next[idx] = { ...r, name: r.name?.trim() ? r.name : nameFrom(r.email) };
      return next;
    });
  }

  function doBulkPaste(text) {
    const parsed = parseBulk(text);
    if (!parsed.length) return;
    setRecipients(parsed);
    setPreviewRecipientId(parsed[0]?._id || null);
    setBulkMode(false); setBulkInput('');
    setErrors(p => ({ ...p, recipients: {}, recipientsGeneral: undefined }));
  }

  /* ── validation ── */

  function validate() {
    const e = { recipients: {} };
    if (!subject.trim()) e.subject = 'Required';
    if (!strip(body)) e.body = 'Required';
    if (!appUser) e.sender = 'Login required';
    else if (!gmailConnected) e.sender = 'Connect Gmail first';
    if (!recipients.length) e.recipientsGeneral = 'Add at least one recipient';
    if (recipients.length > 50) e.recipientsGeneral = 'Max 50 recipients per send';

    const usedVars = new Set([...findVars(subject), ...findVars(body)]);
    const allowedKeys = ['name', ...variables.map(v => v.key)];
    if (hasUnmatched(body)) {
      e.body = 'Invalid variable syntax detected.';
    }

    const requiredKeys = variables.filter(v => v.required && usedVars.has(v.key)).map(v => v.key);
    recipients.forEach(r => {
      const re = {};
      if (!emailRegex.test(r.email || '')) re.email = 'Invalid';
      if (!r.name?.trim()) re.name = 'Required';
      requiredKeys.forEach(k => {
        if (!r.variables?.[k]) re[k] = 'Required';
      });
      if (Object.keys(re).length) e.recipients[r._id] = re;
    });
    if (deliveryMode === 'schedule') {
      const d = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) e.scheduledAt = 'Must be in the future';
    }
    return e;
  }

  const hasErr = e => {
    const rr = Object.values(e.recipients || {}).some(o => Object.keys(o || {}).length);
    return !!(e.subject || e.body || e.sender || e.scheduledAt || e.recipientsGeneral || rr);
  };

  /* ── campaign actions ── */

  function buildPayload() {
    const when = deliveryMode === 'schedule' && scheduledAt ? new Date(scheduledAt) : null;
    return { subject, body_html: body, sender_name: senderName, send_mode: sendMode, recipients: recipients.map(san), scheduled_at: when && !Number.isNaN(when) ? when.toISOString() : null, status: deliveryMode === 'schedule' && when && when.getTime() > Date.now() ? 'scheduled' : 'draft' };
  }

  async function saveDraft(toast = false) {
    const p = buildPayload();
    if (!p.subject || !p.body_html || !p.recipients.length) { if (toast) setNotice({ type: 'error', message: 'Need subject, body & recipients' }); return; }
    setSaving(true);
    try {
      let res;
      if (draftId) { res = await apiFetch(`${API_BASE}/api/campaigns/${draftId}`, { method: 'PATCH', headers: hdrs, body: JSON.stringify(p) }); }
      else { res = await apiFetch(`${API_BASE}/api/campaigns`, { method: 'POST', headers: hdrs, body: JSON.stringify(p) }); }
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Save failed');
      if (!draftId && d.id) setDraftId(d.id);
      if (toast) setNotice({ type: 'info', message: 'Draft saved' });
      return d.id || draftId;
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setSaving(false); }
  }

  async function doPreview() {
    const unknownVars = [...findVars(subject), ...findVars(body)].filter(k => !variableKeys.includes(k));
    if (hasUnmatched(body) || hasUnmatched(subject)) { setNotice({ type: 'error', message: 'Invalid variable syntax detected.' }); return; }
    if (unknownVars.length) { setNotice({ type: 'info', message: `Unknown variable {{${unknownVars[0]}}} found.` }); }
    const ve = validate(); setErrors(ve); if (hasErr(ve)) return;
    setIsPreviewing(true);
    try {
      const id = (await saveDraft()) || draftId; if (!id) throw new Error('Save draft first');
      const tgt = recipients[Math.floor(Math.random() * recipients.length)];
      setPreviewRecipientId(tgt?._id);
      const res = await apiFetch(`${API_BASE}/api/campaigns/${id}/preview`, { method: 'POST', headers: hdrs, body: JSON.stringify({ recipient_id: tgt?._id }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Preview failed');
      if (d.warnings?.length) setNotice({ type: 'info', message: d.warnings[0] });
      setPreviewRecipientMeta(tgt); setPreviewHtml(d.html || ''); setPreviewOpen(true);
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setIsPreviewing(false); }
  }

  async function doSend() {
    if (hasUnmatched(body) || hasUnmatched(subject)) { setNotice({ type: 'error', message: 'Invalid variable syntax detected.' }); return; }
    const unknownVars = [...findVars(subject), ...findVars(body)].filter(k => !variableKeys.includes(k));
    if (unknownVars.length) { setNotice({ type: 'error', message: `Unknown variable {{${unknownVars[0]}}} found.` }); return; }
    setIsSending(true); setNotice(null);
    try {
      const id = (await saveDraft()) || draftId; if (!id) throw new Error('Save draft first');
      const res = await apiFetch(`${API_BASE}/api/campaigns/${id}/send`, { method: 'POST', headers: hdrs, body: JSON.stringify({ confirm_bulk_send: recipients.length > 5 }) });
      const d = await res.json();
      if (!res.ok) {
        // If it's an auth error, refresh auth state so UI reflects reality
        if (res.status === 401 || d.authError) {
          setGmailConnected(false);
          setNotice({ type: 'error', message: 'Gmail authorization expired. Please reconnect your account, then try again.' });
          await hydrateProfile();
          return;
        }
        throw new Error(d.error || 'Send failed');
      }
      setNotice({ type: 'success', message: d.status === 'scheduled' ? `Scheduled for ${scheduledAt}` : `Sent to ${recipients.length} recipients` });
      setErrors({ recipients: {} }); setPreviewOpen(false); await loadHistory();
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setIsSending(false); }
  }

  async function loadCampaign(id) {
    try {
      const res = await apiFetch(`${API_BASE}/api/campaigns/${id}`); const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setSubject(d.subject || ''); setBody(d.body_html || ''); setSendMode(d.send_mode || 'individual'); setSenderName(d.sender_name || '');
      const recs = (d.recipients || []).map(r => ({ ...r, _id: r._id || uid() })); setRecipients(recs); setPreviewRecipientId(recs[0]?._id || null);
      setErrors({ recipients: {} });
      if (d.scheduled_at) { setDeliveryMode('schedule'); setScheduledAt(d.scheduled_at.slice(0, 16)); } else { setDeliveryMode('now'); setScheduledAt(''); }
      setDraftId(d.id); setNotice({ type: 'info', message: 'Draft loaded' }); setUtilityDrawerOpen(false);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  /* ── group actions ── */

  function handleGroupImport(contacts, groupData) {
    const incoming = (contacts || []).filter(c => c?.email);
    if (!incoming.length) {
      setNotice({ type: 'error', message: 'No contacts to import' });
      return;
    }

    const existingEmails = new Set(recipients.map(r => (r.email || '').toLowerCase()));
    const seen = new Set(existingEmails);
    const additions = [];

    for (const c of incoming) {
      const email = (c.email || '').toLowerCase().trim();
      if (!emailRegex.test(email) || seen.has(email)) continue;
      seen.add(email);
      additions.push({
        _id: uid(),
        email,
        name: (c.name || '').trim() || nameFrom(email),
        variables: {},
        status: 'pending',
      });
    }

    const dupeCount = incoming.length - additions.length;
    if (!additions.length) {
      setNotice({ type: 'info', message: 'All selected contacts are already in your recipients list.' });
      return;
    }

    setRecipients(prev => [...prev, ...additions]);
    setPreviewRecipientId(prev => prev || additions[0]._id || null);
    setErrors({ recipients: {} });
    const baseMsg = `Imported ${additions.length} contact${additions.length !== 1 ? 's' : ''} from "${groupData?.companyName || 'group'}"`;
    setNotice({ type: 'info', message: dupeCount > 0 ? `${baseMsg}; ${dupeCount} duplicate${dupeCount !== 1 ? 's' : ''} skipped.` : baseMsg });
  }

  /* ── template actions ── */

  function importTemplate(t) {
    setSubject(t.subject || ''); setBody(t.body_html || '');
    setNotice({ type: 'info', message: `Template "${t.title}" applied` });
  }

  function openCreateTemplate() {
    if (!subject.trim() || !strip(body)) { setNotice({ type: 'error', message: 'Write subject & body first' }); return; }
    setTemplateTitle(''); setTemplateDrawer('create');
  }

  async function saveTemplate() {
    if (!templateTitle.trim()) { setNotice({ type: 'error', message: 'Title required' }); return; }
    try {
      const res = await apiFetch(`${API_BASE}/api/templates`, { method: 'POST', headers: hdrs, body: JSON.stringify({ title: templateTitle.trim(), subject, body_html: body }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setNotice({ type: 'success', message: 'Template saved' }); setTemplateDrawer(null); await loadTemplates();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  /* ── variables actions ── */

  async function createVariable() {
    if (!/^[a-z0-9]+$/.test(varForm.key || '')) { setNotice({ type: 'error', message: 'Key must be lowercase alphanumeric' }); return; }
    if (!varForm.label.trim()) { setNotice({ type: 'error', message: 'Label required' }); return; }
    try {
      const res = await apiFetch(`${API_BASE}/api/variables`, { method: 'POST', headers: hdrs, body: JSON.stringify({ ...varForm, key: varForm.key.toLowerCase() }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setVariables(prev => [...prev, d]);
      setVarForm({ key: '', label: '', required: false, description: '' });
      setNotice({ type: 'success', message: 'Variable added' });
    } catch (e) {
      setNotice({ type: 'error', message: e.message });
    }
  }

  /* ── render ── */

  if (!authLoading && !appUser) {
    return (
      <div className="landing-shell">
        <header className="hdr hdr--landing">
          <div className="hdr__left">
            <Mail size={20} className="hdr__logo" />
            <b className="hdr__name">Recruiter Mailer</b>
          </div>
          <div className="hdr__right" />
        </header>

        <main className="landing-main">
          <section className="landing-wrap">
            <div className="landing-copy">
              <h1 className="landing-title">Send personalized outreach faster, with control.</h1>
              <p className="landing-subtitle">Securely connect Gmail, personalize each message with variables, and review before every send.</p>

              <div className="feature-chips">
                <span className="feature-chip">Secure Gmail sending</span>
                <span className="feature-chip">Custom variables</span>
                <span className="feature-chip">Save templates</span>
                <span className="feature-chip">Controlled daily limits</span>
                <span className="feature-chip">Preview before send</span>
              </div>

              <button className="btn btn--primary landing-cta" onClick={login}>Login with Google</button>
            </div>

            <div className="landing-demo" aria-hidden="true">
              <div className="demo-window">
                <div className="demo-window__head">
                  <span className="demo-dot demo-dot--red" />
                  <span className="demo-dot demo-dot--yellow" />
                  <span className="demo-dot demo-dot--green" />
                </div>

                <div className="demo-block">
                  <span className="demo-label">Subject</span>
                  <div className="demo-subject">Application update for {'{{name}}'}</div>
                </div>

                <div className="demo-controls">
                  <span className="demo-control">Groups • Eng Hiring</span>
                  <span className="demo-control">Templates • Intro Follow-up</span>
                  <span className="demo-control">History • 12 sent</span>
                </div>

                <div className="demo-block">
                  <span className="demo-label">Variables</span>
                  <div className="demo-vars">
                    <span className="demo-var-key">{'{{name}}'}</span>
                    <span className="demo-var-val">Ava Johnson</span>
                  </div>
                </div>

                <div className="demo-actions">
                  <button className="demo-btn">Preview</button>
                  <span className="demo-status">Preview ready</span>
                </div>

                <div className="demo-preview">
                  <span className="demo-line demo-line--lg" />
                  <span className="demo-line" />
                  <span className="demo-line demo-line--sm" />
                </div>
              </div>
            </div>
          </section>
        </main>

        <Toast notice={notice} onClose={() => setNotice(null)} />
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="landing-shell">
        <header className="hdr hdr--landing">
          <div className="hdr__left">
            <Mail size={20} className="hdr__logo" />
            <b className="hdr__name">Recruiter Mailer</b>
          </div>
          <div className="hdr__right" />
        </header>
      </div>
    );
  }

  return (
    <div className="shell">
      {/* ── HEADER ── */}
      <header className="hdr">
        <div className="hdr__left">
          <Mail size={20} className="hdr__logo" />
          <b className="hdr__name">Recruiter Mailer</b>
        </div>
        <div className="hdr__right">
          <button
            className="hdr__utility-btn"
            onClick={() => {
              setUtilityDrawerOpen(true);
              setUtilityTab('history');
            }}
            aria-label="Open utility drawer"
          >
            <LayoutGrid size={16} />
          </button>

          <div className="hdr__user-menu" ref={userMenuRef}>
            <button className="hdr__user-trigger" onClick={() => setUserMenuOpen(v => !v)}>
              <span className="hdr__avatar">{(appUser?.displayName || appUser?.email || 'U').charAt(0).toUpperCase()}</span>
              <span className="hdr__username">{appUser?.displayName || appUser?.email?.split('@')[0] || 'User'}</span>
              <ChevronDown size={14} className={`hdr__chev ${userMenuOpen ? 'hdr__chev--open' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="hdr__dropdown" role="menu">
                <div className="hdr__dropdown-item hdr__dropdown-item--status">
                  Gmail Status
                  <span className={`hdr__status ${gmailConnected ? 'hdr__status--ok' : 'hdr__status--err'}`}>
                    {gmailConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
                {gmailConnected ? (
                  <button className="hdr__dropdown-item" onClick={() => { disconnectGmail(); setUserMenuOpen(false); }}>
                    Disconnect Gmail
                  </button>
                ) : (
                  <button className="hdr__dropdown-item" onClick={() => { connectGmail(); setUserMenuOpen(false); }}>
                    Connect Gmail
                  </button>
                )}
                <button className="hdr__dropdown-item" onClick={() => { reconnectGmail(); setUserMenuOpen(false); }}>
                  Reconnect Gmail
                </button>
                <button
                  className="hdr__dropdown-item"
                  onClick={() => {
                    setUtilityDrawerOpen(true);
                    setUtilityTab('settings');
                    setUserMenuOpen(false);
                  }}
                >
                  Settings
                </button>
                <div className="hdr__dropdown-divider" />
                <button className="hdr__dropdown-item hdr__dropdown-item--danger" onClick={logout}>Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="main">
        {/* LEFT */}
        <section className="side">
          <div className="side__scroll">

            {/* Sender */}
            <div className="card">
              <div className="card__head">
                <span className="card__title"><Mail size={16} /> Sender</span>
                <button className="link" onClick={saveSenderPreference} disabled={savingSenderName || senderName.trim() === savedSenderName}>
                  {savingSenderName ? 'Saving…' : 'Save'}
                </button>
              </div>
              <input className="inp" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Display name (optional)" />
              {errors.sender && <small className="err">{errors.sender}</small>}
            </div>

            {/* Recipients */}
            <div className="card">
              <div className="card__head">
                <span className="card__title"><Users size={16} /> Recipients</span>
                <div className="rec-actions">
                  <button className="link" onClick={() => setBulkMode(!bulkMode)}>{bulkMode ? 'Manual entry' : 'Paste Bulk'}</button>
                  <span className="gm-dot-sep" aria-hidden="true">•</span>
                  <button className="link" onClick={() => { loadGroups(); setImportModalOpen(true); }}>Import Group</button>
                </div>
              </div>

              {bulkMode ? (
                <textarea className="inp inp--area" rows={5} placeholder="Paste emails (comma / newline separated)" value={bulkInput} onChange={e => setBulkInput(e.target.value)} onPaste={e => { e.preventDefault(); doBulkPaste(e.clipboardData?.getData('text') || ''); }} />
              ) : (
                <RecipientList recipients={recipients} variables={variables} onChangeField={updateRecipient} onChangeVariable={updateRecipientVariable} onDelete={deleteRecipient} onEmailBlur={onEmailBlur} fieldErrors={errors.recipients} />
              )}
              <div className="rec-subactions">
                <div className="rec-subactions__side" />
                <button className="link" onClick={addRow}>+ Add recipient</button>
                <div className="rec-subactions__side rec-subactions__side--right">
                  <button className="link" onClick={() => setGroupManagerOpen(true)}>Manage Groups</button>
                </div>
              </div>
              {errors.recipientsGeneral && <small className="err">{errors.recipientsGeneral}</small>}
            </div>

            {/* Variables */}
            <div className="card">
              <div className="card__head">
                <span className="card__title"><Clock size={16} /> Variables</span>
              </div>
              {variables.length ? (
                <div className="group-chips" style={{ gap: 8 }}>
                  {variables.map(v => (
                    <div className="group-chip" key={v.id} style={{ maxWidth: '100%' }}>
                      <div className="group-chip__info">
                        <span className="group-chip__name">{`{{${v.key}}}`}</span>
                        <span className="group-chip__count">{v.label}{v.required ? ' • required' : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">No custom variables yet.</p>}
              <div className="field">
                <input className="inp" placeholder="Key (e.g. position)" value={varForm.key} onChange={e => setVarForm(f => ({ ...f, key: e.target.value.toLowerCase() }))} />
              </div>
              <div className="field">
                <input className="inp" placeholder="Label" value={varForm.label} onChange={e => setVarForm(f => ({ ...f, label: e.target.value }))} />
              </div>
              <div className="field">
                <input className="inp" placeholder="Description (optional)" value={varForm.description} onChange={e => setVarForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555' }}>
                <input type="checkbox" checked={varForm.required} onChange={e => setVarForm(f => ({ ...f, required: e.target.checked }))} /> Required for recipients
              </label>
              <button className="btn btn--ghost" onClick={createVariable} style={{ alignSelf: 'flex-start' }}>Add variable</button>
            </div>

            {/* Delivery */}
            <div className="card">
              <div className="card__head">
                <span className="card__title"><Send size={16} /> Delivery</span>
              </div>

              <div className="delivery-row">
                <div className="delivery-col">
                  <span className="lbl--upper">Timing</span>
                  <div className="toggle-row">
                    <button className={`tog ${deliveryMode === 'now' ? 'tog--on' : ''}`} onClick={() => { setDeliveryMode('now'); setErrors(p => ({ ...p, scheduledAt: undefined })); }}>Send now</button>
                    <button className={`tog ${deliveryMode === 'schedule' ? 'tog--on' : ''}`} onClick={() => setDeliveryMode('schedule')}>Schedule</button>
                  </div>
                  {deliveryMode === 'schedule' && <input className="inp" type="datetime-local" value={scheduledAt} onChange={e => { setScheduledAt(e.target.value); if (errors.scheduledAt) { const d = new Date(e.target.value); if (e.target.value && !Number.isNaN(d.getTime()) && d.getTime() > Date.now()) setErrors(p => ({ ...p, scheduledAt: undefined })); } }} style={{ marginTop: 4 }} />}
                  {errors.scheduledAt && <small className="err">{errors.scheduledAt}</small>}
                </div>

                <div className="delivery-col">
                  <span className="lbl--upper">Send type</span>
                  <div className="toggle-row">
                    <button className={`tog ${sendMode === 'individual' ? 'tog--on' : ''}`} onClick={() => setSendMode('individual')}>Individual</button>
                    <button className={`tog ${sendMode === 'single' ? 'tog--on' : ''}`} onClick={() => setSendMode('single')}>Single</button>
                  </div>
                </div>
              </div>
              <p className="hint">Individual mode personalizes each email with {'{{name}}'}</p>
            </div>

          </div>
        </section>

        {/* RIGHT */}
        <section className="compose">
          <div className="compose__inner">
            <div className="compose__scroll">
              <input className="compose__subject" value={subject} onChange={e => { setSubject(e.target.value); if (errors.subject) setErrors(p => ({ ...p, subject: undefined })); }} placeholder="Subject line" />
              {errors.subject && <span className="err--blue">{errors.subject}</span>}

              <div className="compose__editor">
                <p className="editor-hint">Type <b>/</b> in the editor to insert variables like {'{{name}}'} or your saved keys</p>
                <div className="quill-wrap">
                  <ReactQuill ref={quillRef} theme="snow" value={body} onChange={v => { setBody(v); if (errors.body && strip(v)) setErrors(p => ({ ...p, body: undefined })); }} modules={QUILL_MODULES} placeholder="Write your email…" />
                </div>
                {slashMenu.open && (
                  <div className="slash-menu" style={{ position: 'fixed', top: slashMenu.top, left: slashMenu.left, zIndex: 100 }}>
                    {variableKeys.map((opt, idx) => (
                      <button
                        key={opt}
                        className={idx === slashHighlight ? 'active' : ''}
                        onMouseDown={e => { e.preventDefault(); insertVariable(opt); }}
                      >
                        {`{{${opt}}}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.body && <span className="err--blue">{errors.body}</span>}

              <div className="compose__actions">
                <button className="btn btn--outline" onClick={() => saveDraft(true)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
                <button className="btn btn--white" onClick={doPreview} disabled={isPreviewing || !gmailConnected}>{isPreviewing ? 'Loading…' : 'Preview & Send'}</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="ftr">
        <Heart size={12} /> Built with care · Recruiter Mailer
      </footer>

      <Toast notice={notice} onClose={() => setNotice(null)} />

      {/* ── DRAWERS ── */}

      {/* Preview */}
      <Drawer open={previewOpen} title="Preview & Send" onClose={() => setPreviewOpen(false)} width={560}>
        {previewRecipientMeta && (
          <div className="pv-meta">
            <div><b>{previewRecipientMeta.name}</b> <span className="muted">({previewRecipientMeta.email})</span></div>
            <div className="pv-meta__acts">
              <button className="link" onClick={() => { const r = recipients[Math.floor(Math.random() * recipients.length)]; if (r) { setIsPreviewing(true); apiFetch(`${API_BASE}/api/campaigns/${draftId}/preview`, { method: 'POST', headers: hdrs, body: JSON.stringify({ recipient_id: r._id }) }).then(x => x.json()).then(d => { if (d.warnings?.length) setNotice({ type: 'info', message: d.warnings[0] }); setPreviewRecipientMeta(r); setPreviewHtml(d.html || ''); }).catch(e => setNotice({ type: 'error', message: e.message })).finally(() => setIsPreviewing(false)); } }}>Shuffle</button>
              <span className="muted" style={{ fontSize: 12 }}>(Random preview)</span>
            </div>
          </div>
        )}
        <div className="pv-frame" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        <div className="pv-foot">
          <button className="btn btn--ghost" onClick={() => setPreviewOpen(false)}>Cancel</button>
          <button className="btn btn--primary" onClick={doSend} disabled={isSending}>{isSending ? 'Sending…' : 'Confirm & Send'}</button>
        </div>
      </Drawer>

      {/* Utility drawer */}
      <Drawer open={utilityDrawerOpen} title="Utilities" onClose={() => setUtilityDrawerOpen(false)} width={520}>
        <div className="utility-tabs">
          <button className={`utility-tab ${utilityTab === 'history' ? 'utility-tab--active' : ''}`} onClick={() => setUtilityTab('history')}>History</button>
          <button className={`utility-tab ${utilityTab === 'templates' ? 'utility-tab--active' : ''}`} onClick={() => setUtilityTab('templates')}>Templates</button>
          <button className={`utility-tab ${utilityTab === 'groups' ? 'utility-tab--active' : ''}`} onClick={() => setUtilityTab('groups')}>Groups</button>
          <button className={`utility-tab ${utilityTab === 'settings' ? 'utility-tab--active' : ''}`} onClick={() => setUtilityTab('settings')}>Settings</button>
        </div>

        {utilityTab === 'history' && (
          <div className="utility-panel">
            {history.length ? history.map(h => (
              <button className="hist-row" key={h.id} onClick={() => loadCampaign(h.id)}>
                <div><b>{h.subject}</b><br /><small className="muted">{new Date(h.created_at).toLocaleString()}</small></div>
                <div className="hist-row__right"><span className={`pill pill--${h.status}`}>{h.status}</span><small className="muted">{h.recipient_count} recipients</small></div>
              </button>
            )) : <p className="muted">No campaigns yet.</p>}
          </div>
        )}

        {utilityTab === 'templates' && (
          <div className="utility-panel utility-panel--stack">
            <div className="utility-panel__head">
              <h4>Templates</h4>
              <button className="link" onClick={openCreateTemplate}>+ Save current</button>
            </div>
            {templates.length ? templates.map(t => (
              <div className="utility-row" key={t.id}>
                <div className="row__info" onClick={() => setTemplateDrawer(t)}>
                  <span className="utility-row__title">{t.title || t.subject}</span>
                  <span className="utility-row__sub">{strip(t.body_html || '').slice(0, 68)}</span>
                </div>
                <button className="chip-sm" onClick={() => importTemplate(t)}>Use</button>
              </div>
            )) : <p className="muted">No templates yet.</p>}
          </div>
        )}

        {utilityTab === 'groups' && (
          <div className="utility-panel utility-panel--stack">
            <div className="utility-panel__head">
              <h4>Groups</h4>
              <button className="link" onClick={() => { setUtilityDrawerOpen(false); setGroupManagerOpen(true); }}>Manage Groups</button>
            </div>
            {groups.length ? (
              <div className="group-chips">
                {groups.map(g => (
                  <div className="group-chip" key={g.id} onClick={() => { setUtilityDrawerOpen(false); setGroupManagerOpen(true); }}>
                    <div className="group-chip__info">
                      <span className="group-chip__name">{g.companyName}</span>
                      <span className="group-chip__count">{g.contactCount ?? 0} contacts</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No groups yet.</p>}
          </div>
        )}

        {utilityTab === 'settings' && (
          <div className="utility-panel utility-panel--stack">
            <div className="utility-settings-row">
              <span className="muted">Gmail Status</span>
              <span className={`hdr__status ${gmailConnected ? 'hdr__status--ok' : 'hdr__status--err'}`}>
                {gmailConnected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            {gmailConnected ? (
              <button className="btn btn--ghost" onClick={disconnectGmail} style={{ alignSelf: 'flex-start' }}>Disconnect Gmail</button>
            ) : (
              <button className="btn btn--primary" onClick={connectGmail} style={{ alignSelf: 'flex-start' }}>Connect Gmail</button>
            )}
            <button className="btn btn--white" onClick={reconnectGmail} style={{ alignSelf: 'flex-start' }}>
              Reconnect Gmail (fresh OAuth)
            </button>
            <div className="field" style={{ marginTop: 8 }}>
              <label className="lbl">Sender display name</label>
              <input className="inp" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Display name (optional)" />
            </div>
            <button className="btn btn--primary" onClick={saveSenderPreference} disabled={savingSenderName || senderName.trim() === savedSenderName} style={{ alignSelf: 'flex-start' }}>
              {savingSenderName ? 'Saving…' : 'Save sender name'}
            </button>
          </div>
        )}
      </Drawer>

      {/* Group Manager popup */}
      <GroupManager
        open={groupManagerOpen}
        onClose={() => setGroupManagerOpen(false)}
        authedFetch={authedFetch}
      />

      <ImportGroupModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        authedFetch={authedFetch}
        groups={groups}
        onImport={handleGroupImport}
      />

      {/* Template view */}
      <Drawer open={!!templateDrawer && templateDrawer !== 'create'} title={templateDrawer?.title || 'Template'} onClose={() => setTemplateDrawer(null)} width={480}>
        {templateDrawer && templateDrawer !== 'create' && (
          <>
            <p className="lbl" style={{ marginBottom: 4 }}>Subject</p>
            <p style={{ marginBottom: 16 }}>{templateDrawer.subject}</p>
            <p className="lbl" style={{ marginBottom: 4 }}>Body</p>
            <div className="pv-frame" style={{ minHeight: 120 }} dangerouslySetInnerHTML={{ __html: templateDrawer.body_html || '' }} />
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button className="btn btn--primary" onClick={() => { importTemplate(templateDrawer); setTemplateDrawer(null); }}>Use this template</button>
            </div>
          </>
        )}
      </Drawer>

      {/* Template create */}
      <Drawer open={templateDrawer === 'create'} title="Save as Template" onClose={() => setTemplateDrawer(null)} width={420}>
        <input className="inp" placeholder="Template name" value={templateTitle} onChange={e => setTemplateTitle(e.target.value)} style={{ marginBottom: 16 }} />
        <p className="lbl" style={{ marginBottom: 4 }}>Subject</p>
        <p className="muted" style={{ marginBottom: 12 }}>{subject || '(empty)'}</p>
        <p className="lbl" style={{ marginBottom: 4 }}>Body preview</p>
        <div className="pv-frame" style={{ minHeight: 80 }} dangerouslySetInnerHTML={{ __html: body || '<em>Empty</em>' }} />
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn btn--primary" onClick={saveTemplate}>Save Template</button>
        </div>
      </Drawer>
    </div>
  );
}
