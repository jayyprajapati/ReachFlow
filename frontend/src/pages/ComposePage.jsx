import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill, { Quill } from 'react-quill';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import {
  Send, FileText, Bookmark, RotateCcw, Plus, Trash2, UserPlus, Users, Clock, Eye,
  Paperclip, X, Shuffle, Calendar, Loader, History, CheckCheck, Sparkles, ClipboardPaste,
  Info, ChevronRight, AtSign, Variable, Wand2, MailCheck, AlertTriangle, ArrowUpRight,
  ChevronDown, Lock,
} from 'lucide-react';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CUSTOM_VARIABLES = 2;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_TOTAL_MB = 20;
const ALLOWED_ATTACH_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/png', 'image/jpeg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg'];

/* ── Quill registration (idempotent) ────────────────────── */
const Font = Quill.import('formats/font');
Font.whitelist = ['arial', 'verdana', 'georgia', 'times-new-roman', 'calibri', 'tahoma', 'trebuchet-ms'];
try { Quill.register(Font, true); } catch (e) {}
const Size = Quill.import('formats/size');
Size.whitelist = ['small', 'large', 'huge'];
try { Quill.register(Size, true); } catch (e) {}

const Embed = Quill.import('blots/embed');
class VariableBlot extends Embed {
  static create(v) { const n = super.create(); n.setAttribute('data-key', v); n.setAttribute('contenteditable', 'false'); n.classList.add('var-token'); n.innerText = `{{${v}}}`; return n; }
  static value(n) { return n.getAttribute('data-key'); }
}
VariableBlot.blotName = 'variable'; VariableBlot.tagName = 'span'; VariableBlot.className = 'var-token';
try { Quill.register(VariableBlot, true); } catch (e) {}

const QUILL_MODULES = {
  toolbar: [
    [{ font: ['', 'arial', 'verdana', 'georgia', 'times-new-roman', 'calibri', 'tahoma', 'trebuchet-ms'] }],
    [{ size: ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    [{ color: [] }],
    ['link'],
    ['clean'],
  ],
};

/* ── Helpers ───────────────────────────────────────────── */
function uid() {
  if (crypto?.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24);
}
const strip = h => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
const nameFrom = e => {
  const p = (e || '').split('@')[0].replace(/[0-9]/g, '').split(/[._-]+/).filter(Boolean);
  return p.length ? p.map(cap).join(' ') : 'There';
};
const findVars = html => { const f = new Set(); let m; const r = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g; while ((m = r.exec(html || '')) !== null) f.add(m[1].toLowerCase()); return Array.from(f); };
const hasUnmatched = html => {
  const o = (html.match(/\{\{/g) || []).length;
  const c = (html.match(/\}\}/g) || []).length;
  return o !== c;
};
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function roleKey(value) {
  return String(value || '').trim().toLowerCase();
}

function buildRoleBuckets(contacts = []) {
  const map = new Map();
  for (const contact of contacts) {
    const raw = String(contact?.role || '').trim();
    const key = roleKey(raw);
    if (!map.has(key)) map.set(key, { key, label: raw || 'No role', count: 0 });
    map.get(key).count += 1;
  }
  return [...map.values()];
}

/* ──────────────────────────────────────────────────────────
   ComposePage
   ────────────────────────────────────────────────────────── */

export default function ComposePage() {
  const {
    API_BASE, authedFetch, gmailConnected, setNotice, setWarningDialog,
    variables, setVariables, loadVariables,
    groups, loadGroups,
    templates, templatesLoading, loadTemplates,
    history, historyLoading, loadHistory,
    drafts, draftsLoading, loadDrafts,
    scheduled, scheduledLoading, loadScheduled,
    senderName, hydrateProfile,
  } = useApp();
  const { navigateTo } = useRouter();

  /* State (unchanged from before — keep all behavior intact) */
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({ recipients: {} });
  const [saving, setSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [nameFormat, setNameFormat] = useState('first');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [varForm, setVarForm] = useState({ variableName: '', description: '' });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewMeta, setPreviewMeta] = useState(null);
  const [previewRecipientId, setPreviewRecipientId] = useState(null);
  const [groupImports, setGroupImports] = useState([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [roleImportPrompt, setRoleImportPrompt] = useState(null);
  const [recipientsCollapsed, setRecipientsCollapsed] = useState(false);
  const [lastImportSource, setLastImportSource] = useState(null); // { groupName, added }
  const [templateDrawer, setTemplateDrawer] = useState(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateBrowseOpen, setTemplateBrowseOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [slashMenu, setSlashMenu] = useState({ open: false, top: 0, left: 0 });
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [slashTriggerIdx, setSlashTriggerIdx] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [importingGroupId, setImportingGroupId] = useState('');
  const quillRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const variableKeys = useMemo(() => ['name', ...variables.map(v => v.variableName)], [variables]);
  const hdrs = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  /* Pre-fill from HR-email handoff */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('rf_compose_prefill');
      if (raw) {
        const prefill = JSON.parse(raw);
        sessionStorage.removeItem('rf_compose_prefill');
        if (prefill.subject) setSubject(prefill.subject);
        if (prefill.body_html) setBody(prefill.body_html);
      }
    } catch {}

    /* Pre-fill from "Compose to group" handoff (Contacts → Compose) */
    try {
      const raw = sessionStorage.getItem('rf_compose_prefill_group');
      if (raw) {
        const { groupId, companyName } = JSON.parse(raw);
        sessionStorage.removeItem('rf_compose_prefill_group');
        if (groupId) {
          // Auto-import the group's contacts
          (async () => {
            try {
              const r = await authedFetch(`${API_BASE}/api/groups/${groupId}`);
              const d = await r.json();
              if (r.ok && d.contacts) {
                maybeImportGroupByRole(d.contacts, companyName || d.companyName || 'group');
              }
            } catch { /* silent */ }
          })();
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Slash menu */
  useEffect(() => {
    const quill = quillRef.current?.getEditor(); if (!quill) return;
    const handleKeyDown = e => {
      if (slashMenu.open) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) e.preventDefault();
        if (e.key === 'ArrowDown') { setSlashHighlight(p => (p + 1) % Math.max(variableKeys.length, 1)); return; }
        if (e.key === 'ArrowUp')   { setSlashHighlight(p => (p - 1 + Math.max(variableKeys.length, 1)) % Math.max(variableKeys.length, 1)); return; }
        if (e.key === 'Enter')     { insertVariable(variableKeys[slashHighlight] || 'name'); return; }
        if (e.key === 'Escape')    { closeSlashMenu(); return; }
        closeSlashMenu(); return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sel = quill.getSelection(true); if (!sel) return;
        const bounds = quill.getBounds(sel.index);
        const rect = quill.root.getBoundingClientRect();
        setSlashMenu({ open: true, left: rect.left + bounds.left, top: rect.top + bounds.top + bounds.height + 4 });
        setSlashTriggerIdx(sel.index);
        setSlashHighlight(0);
      }
    };
    quill.root.addEventListener('keydown', handleKeyDown);
    return () => quill.root.removeEventListener('keydown', handleKeyDown);
  }, [slashMenu.open, slashHighlight, variableKeys]);

  function closeSlashMenu() { setSlashMenu({ open: false, top: 0, left: 0 }); setSlashTriggerIdx(null); }
  function insertVariable(key) {
    const q = quillRef.current?.getEditor();
    if (!q || slashTriggerIdx === null) return;
    q.deleteText(slashTriggerIdx, 1);
    q.insertEmbed(slashTriggerIdx, 'variable', key);
    q.insertText(slashTriggerIdx + 1, ' ');
    q.setSelection(slashTriggerIdx + 2, 0);
    closeSlashMenu();
  }

  /* Recipients */
  function addRow() {
    setRecipients(p => [...p, { _id: uid(), email: '', name: '', variables: {}, status: 'pending' }]);
    if (errors.recipientsGeneral) setErrors(p => ({ ...p, recipientsGeneral: undefined }));
  }
  function updateRecipient(idx, field, value) {
    setRecipients(p => { const n = [...p]; n[idx] = { ...n[idx], [field]: value }; return n; });
  }
  function updateRecipientVariable(idx, key, value) {
    setRecipients(p => { const n = [...p]; n[idx] = { ...n[idx], variables: { ...(n[idx].variables || {}), [key]: value } }; return n; });
  }
  function deleteRecipient(idx) { setRecipients(p => p.filter((_, i) => i !== idx)); }
  function clearAllRecipients() {
    if (!recipients.length) return;
    setWarningDialog({
      title: 'Clear all recipients?',
      message: `This removes ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''} from this draft. Subject, body, and attachments stay unchanged.`,
      confirmText: 'Clear all',
      intent: 'danger',
      onConfirm: () => {
        setRecipients([]);
        setErrors(p => ({ ...p, recipients: {}, recipientsGeneral: undefined }));
        setLastImportSource(null);
        setRecipientsCollapsed(false);
      },
    });
  }
  function onEmailBlur(idx) {
    setRecipients(p => {
      const n = [...p], r = n[idx];
      if (!r || !emailRegex.test(r.email || '')) return p;
      n[idx] = { ...r, name: r.name?.trim() ? r.name : nameFrom(r.email) };
      return n;
    });
  }
  function doBulkPaste(text) {
    const parsed = parseBulk(text);
    if (!parsed.length) return;
    setRecipients(parsed);
    setBulkMode(false);
    setBulkInput('');
  }
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

  /* Attachments */
  function validateAndAddFiles(files) {
    const existing = [...attachments];
    const remaining = MAX_ATTACHMENTS - existing.length;
    if (remaining <= 0) { setNotice({ type: 'error', message: `Max ${MAX_ATTACHMENTS} attachments` }); return; }

    const toAdd = [];
    let totalSize = existing.reduce((s, a) => s + (a.size || 0), 0);

    for (const file of Array.from(files).slice(0, remaining)) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_ATTACH_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
        setNotice({ type: 'error', message: `File type not allowed: ${file.name}` }); continue;
      }
      totalSize += file.size;
      if (totalSize > MAX_ATTACHMENT_TOTAL_MB * 1024 * 1024) {
        setNotice({ type: 'error', message: `Total attachments exceed ${MAX_ATTACHMENT_TOTAL_MB}MB` }); break;
      }
      toAdd.push(file);
    }

    toAdd.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        const base64 = dataUrl.split(',')[1];
        setAttachments(prev => [...prev, { id: uid(), name: file.name, mimeType: file.type || 'application/octet-stream', data: base64, size: file.size }]);
      };
      reader.readAsDataURL(file);
    });
  }
  function removeAttachment(id) { setAttachments(p => p.filter(a => a.id !== id)); }

  /* Drag & drop */
  useEffect(() => {
    const el = dropRef.current; if (!el) return;
    const onDragOver = e => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = () => setIsDragging(false);
    const onDrop = e => { e.preventDefault(); setIsDragging(false); validateAndAddFiles(e.dataTransfer.files); };
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    return () => { el.removeEventListener('dragover', onDragOver); el.removeEventListener('dragleave', onDragLeave); el.removeEventListener('drop', onDrop); };
  }, [attachments]);

  /* Validation */
  function validate() {
    const e = { recipients: {} };
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!strip(body)) e.body = 'Message body is required';
    if (!recipients.length) e.recipientsGeneral = 'Add at least one recipient';
    if (recipients.length > 50) e.recipientsGeneral = 'Max 50 recipients per send';
    if (hasUnmatched(body)) e.body = 'Invalid variable syntax — check {{ }} pairs.';
    recipients.forEach(r => {
      const re = {};
      if (!emailRegex.test(r.email || '')) re.email = 'Invalid email';
      if (!r.name?.trim()) re.name = 'Required';
      if (Object.keys(re).length) e.recipients[r._id] = re;
    });
    return e;
  }
  const hasErr = e => {
    const rr = Object.values(e.recipients || {}).some(o => Object.keys(o || {}).length);
    return !!(e.subject || e.body || e.recipientsGeneral || rr);
  };

  function buildPayload() {
    return {
      subject,
      body_html: body,
      sender_name: senderName,
      name_format: nameFormat,
      recipients: recipients.map(r => ({ ...r, email: (r.email || '').toLowerCase().trim(), name: (r.name || '').trim() })),
      variables: variables.map(v => v.variableName).filter(Boolean),
      group_imports: groupImports,
      attachments: attachments.map(({ name, mimeType, data, size }) => ({ name, mimeType, data, size })),
    };
  }

  async function saveDraft(toast = false) {
    const p = buildPayload();
    if (!p.subject || !p.body_html || !p.recipients.length) {
      if (toast) setNotice({ type: 'error', message: 'Need subject, body & recipients' });
      return;
    }
    setSaving(true);
    try {
      let res;
      if (draftId) res = await authedFetch(`${API_BASE}/api/campaigns/${draftId}`, { method: 'PATCH', headers: hdrs, body: JSON.stringify(p) });
      else         res = await authedFetch(`${API_BASE}/api/campaigns`,            { method: 'POST',  headers: hdrs, body: JSON.stringify(p) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Save failed');
      if (!draftId && d.id) setDraftId(d.id);
      if (toast) setNotice({ type: 'info', message: 'Draft saved' });
      loadDrafts();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setSaving(false); }
  }

  async function doPreview(recipientId = null) {
    const ve = validate(); setErrors(ve); if (hasErr(ve)) return;
    setIsPreviewing(true);
    try {
      const tgt = recipientId
        ? recipients.find(r => r._id === recipientId) || recipients[Math.floor(Math.random() * recipients.length)]
        : recipients[Math.floor(Math.random() * recipients.length)];
      if (!tgt) throw new Error('No recipients');
      const payload = buildPayload();
      const res = await authedFetch(`${API_BASE}/api/campaigns/preview`, { method: 'POST', headers: hdrs, body: JSON.stringify({ ...payload, recipient_id: tgt._id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Preview failed');
      if (d.warnings?.length) setNotice({ type: 'info', message: d.warnings[0] });
      setPreviewMeta(tgt); setPreviewRecipientId(tgt._id); setPreviewHtml(d.html || ''); setPreviewOpen(true);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setIsPreviewing(false); }
  }

  async function doShuffle() {
    if (!recipients.length || isPreviewing) return;
    let tgt;
    if (recipients.length > 1) {
      const others = recipients.filter(r => r._id !== previewRecipientId);
      tgt = others[Math.floor(Math.random() * others.length)];
    } else tgt = recipients[0];
    await doPreview(tgt._id);
  }

  async function doSend() {
    if (hasUnmatched(body) || hasUnmatched(subject)) { setNotice({ type: 'error', message: 'Invalid variable syntax.' }); return; }
    const ve = validate(); setErrors(ve); if (hasErr(ve)) return;
    setIsSending(true);
    try {
      const payload = buildPayload();
      const res = await authedFetch(`${API_BASE}/api/campaigns/send-now`, { method: 'POST', headers: hdrs, body: JSON.stringify({ ...payload, confirm_bulk_send: recipients.length > 5 }) });
      const d = await res.json();
      if (!res.ok) {
        if (res.status === 401 || d.authError) { setNotice({ type: 'error', message: 'Gmail authorization expired. Please reconnect.' }); hydrateProfile(); return; }
        throw new Error(d.error || 'Send failed');
      }
      setNotice({ type: 'success', message: `Sent to ${recipients.length} recipients` });
      setPreviewOpen(false);
      loadHistory(); loadDrafts();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setIsSending(false); }
  }

  async function doSchedule() {
    if (!scheduleDate) { setNotice({ type: 'error', message: 'Pick a date/time' }); return; }
    const scheduledAt = new Date(scheduleDate);
    if (isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) { setNotice({ type: 'error', message: 'Schedule must be in the future' }); return; }
    const ve = validate(); setErrors(ve); if (hasErr(ve)) return;
    setIsScheduling(true);
    try {
      const payload = buildPayload();
      const res = await authedFetch(`${API_BASE}/api/campaigns/schedule-send`, { method: 'POST', headers: hdrs, body: JSON.stringify({ ...payload, scheduledAt: scheduledAt.toISOString() }) });
      const d = await res.json();
      if (!res.ok) {
        if (d.authError) { setNotice({ type: 'error', message: 'Gmail authorization expired. Please reconnect.' }); hydrateProfile(); return; }
        throw new Error(d.error || 'Schedule failed');
      }
      setNotice({ type: 'success', message: `Scheduled for ${scheduledAt.toLocaleString()}` });
      setScheduleOpen(false);
      loadDrafts();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setIsScheduling(false); }
  }

  async function loadCampaign(id) {
    try {
      const res = await authedFetch(`${API_BASE}/api/campaigns/${id}`);
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setSubject(d.subject || ''); setBody(d.body_html || ''); setNameFormat(d.name_format === 'full' ? 'full' : 'first');
      const recs = (d.recipients || []).map(r => ({ ...r, _id: r._id || uid() }));
      setRecipients(recs); setDraftId(d.id);
      setNotice({ type: 'info', message: 'Draft loaded' });
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  /* Variables */
  async function createVariable() {
    const cleaned = String(varForm.variableName || '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!cleaned) { setNotice({ type: 'error', message: 'Variable name required' }); return; }
    if (variables.length >= MAX_CUSTOM_VARIABLES) { setNotice({ type: 'error', message: 'Max 2 custom variables' }); return; }
    try {
      const res = await authedFetch(`${API_BASE}/api/variables`, { method: 'POST', headers: hdrs, body: JSON.stringify({ variableName: cleaned, description: varForm.description }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setVariables(p => [...p, d]);
      setVarForm({ variableName: '', description: '' });
      setNotice({ type: 'success', message: 'Variable added' });
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }
  async function deleteVariable(id) {
    const target = variables.find(v => v.id === id); if (!target) return;
    setWarningDialog({
      title: 'Delete variable?',
      message: `This removes the {{${target.variableName}}} placeholder from your library. Existing campaigns are unaffected.`,
      confirmText: 'Delete', intent: 'danger',
      onConfirm: async () => {
        try {
          if (!String(id).startsWith('local-')) {
            const res = await authedFetch(`${API_BASE}/api/variables/${id}`, { method: 'DELETE' });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
          }
          setVariables(p => p.filter(v => v.id !== id));
          setNotice({ type: 'info', message: 'Variable deleted' });
        } catch (e) { setNotice({ type: 'error', message: e.message }); }
      },
    });
  }

  /* Templates */
  function importTemplate(t) {
    setSubject(t.subject || '');
    setBody(t.body_html || '');
    setNotice({ type: 'info', message: `Template "${t.title}" applied` });
  }
  async function saveTemplate() {
    if (!templateTitle.trim()) { setNotice({ type: 'error', message: 'Title required' }); return; }
    try {
      const res = await authedFetch(`${API_BASE}/api/templates`, { method: 'POST', headers: hdrs, body: JSON.stringify({ title: templateTitle.trim(), subject, body_html: body }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setNotice({ type: 'success', message: 'Template saved' });
      setTemplateDrawer(null);
      loadTemplates();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  /* Groups */
  function maybeImportGroupByRole(contacts, groupName = 'group') {
    const incoming = contacts || [];
    const roles = buildRoleBuckets(incoming);
    if (roles.length > 1) {
      setRoleImportPrompt({ contacts: incoming, groupName, roles });
      return true;
    }
    handleGroupImport(incoming, groupName);
    return false;
  }

  function importSelectedRole(role) {
    if (!roleImportPrompt) return;
    const selected = roleImportPrompt.contacts.filter(c => roleKey(c.role) === role.key);
    setRoleImportPrompt(null);
    handleGroupImport(selected, `${roleImportPrompt.groupName} · ${role.label}`);
  }

  function handleGroupImport(contacts, groupName = 'group') {
    const incoming = contacts || [];
    if (!incoming.length) { setNotice({ type: 'error', message: 'No contacts to import' }); return; }
    const existing = new Set(recipients.map(r => (r.email || '').toLowerCase()));
    const adds = [];
    const invalid = [];
    let duplicateCount = 0;
    for (const c of incoming) {
      const e = (c.email || '').toLowerCase().trim();
      const invalidEmail = !e || !emailRegex.test(e) || c.email_status === 'not_valid';
      if (invalidEmail) {
        invalid.push((c.name && e) ? `${c.name} <${e}>` : (e || c.name || 'Unnamed contact'));
        continue;
      }
      if (existing.has(e)) { duplicateCount++; continue; }
      existing.add(e);
      adds.push({ _id: uid(), email: e, name: (c.name || '').trim() || nameFrom(e), variables: {}, status: 'pending' });
    }
    const invalidMsg = invalid.length
      ? ` Not imported as invalid: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? `, +${invalid.length - 3} more` : ''}.`
      : '';
    if (!adds.length) {
      setNotice({
        type: invalid.length ? 'warning' : 'info',
        message: invalid.length
          ? `No contacts imported from ${groupName}${duplicateCount ? `; ${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} skipped` : ''}.${invalidMsg}`
          : 'All contacts already in recipients.',
      });
      return;
    }
    setRecipients(p => [...p, ...adds]);
    setLastImportSource({ groupName, added: adds.length });
    setRecipientsCollapsed(true);
    setNotice({
      type: invalid.length ? 'warning' : 'info',
      message: `Imported ${adds.length} contact${adds.length !== 1 ? 's' : ''}${duplicateCount ? `, skipped ${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''}` : ''}.${invalidMsg}`,
    });
  }

  async function importGroupRecipients(groupId) {
    if (!groupId || importingGroupId) return;
    setImportingGroupId(groupId);
    try {
      const r = await authedFetch(`${API_BASE}/api/groups/${groupId}`);
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      maybeImportGroupByRole(d.contacts || [], d.companyName || 'group');
      setImportModalOpen(false);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setImportingGroupId(''); }
  }

  async function cancelScheduled(id) {
    if (cancellingId) return;
    setCancellingId(id);
    try {
      const r = await authedFetch(`${API_BASE}/api/campaigns/${id}/cancel-schedule`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to cancel');
      setNotice({ type: 'info', message: 'Scheduled send cancelled' });
      loadScheduled(); loadDrafts();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setCancellingId(null); }
  }

  function resetComposeState() {
    setRecipients([]); setSubject(''); setBody(''); setDraftId(null);
    setErrors({ recipients: {} }); setGroupImports([]);
    setNameFormat('first'); setBulkMode(false); setBulkInput(''); setAttachments([]);
    setRecipientsCollapsed(false); setLastImportSource(null); setRoleImportPrompt(null);
  }

  async function doRewrite() {
    if (!strip(body)) { setNotice({ type: 'error', message: 'Write a body first before rewriting' }); return; }
    setIsRewriting(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/campaigns/rewrite-body`, { method: 'POST', headers: hdrs, body: JSON.stringify({ subject, body_html: body }) });
      const d = await res.json();
      if (!res.ok) {
        if (res.status === 402) { setNotice({ type: 'error', message: 'Configure AI in Settings first' }); return; }
        throw new Error(d.error || 'Rewrite failed');
      }
      if (d.body_html) { setBody(d.body_html); setNotice({ type: 'success', message: 'Body rewritten' }); }
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setIsRewriting(false); }
  }

  const minDateTime = useMemo(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 1);
    return d.toISOString().slice(0, 16);
  }, []);

  const totalAttachmentBytes = useMemo(() => attachments.reduce((s, a) => s + (a.size || 0), 0), [attachments]);
  const recipientCount = recipients.length;
  const canSend = gmailConnected && !isSending && !isPreviewing;

  /* ──────────────────────────────────────────────────────
     Render
     ────────────────────────────────────────────────────── */

  return (
    <div className="rf-page" ref={dropRef} style={isDragging ? { background: 'var(--rf-accent-subtle)', transition: 'background 120ms' } : undefined}>
      {/* Header */}
      <header className="rf-page-header">
        <div className="rf-page-header__lead">
          <div className="rf-page-header__eyebrow"><PenLineDot /> Compose</div>
          <h1 className="rf-page-header__title">New outreach</h1>
          <p className="rf-page-header__subtitle">
            Personalized email with variables, AI rewrite, and scheduled delivery. Drafts auto-save when you save.
          </p>
        </div>
        <div className="rf-page-header__actions">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { loadTemplates(); setTemplateBrowseOpen(true); }} title="Browse saved templates">
            <FileText size={14} /> Templates
            {templates.length > 0 && <span className="rf-num" style={{ color: 'var(--rf-text-faint)', fontSize: 11 }}>{templates.length}</span>}
          </button>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { loadHistory(); loadDrafts(); loadScheduled(); setHistoryDrawerOpen(true); }} title="Recent campaigns and drafts">
            <History size={14} /> History
          </button>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={resetComposeState} title="Reset to a blank compose">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </header>

      {!gmailConnected && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 16px', marginBottom: 'var(--rf-sp-5)',
          background: 'var(--rf-warning-muted)',
          border: '1px solid rgba(232, 146, 68, 0.32)',
          borderRadius: 'var(--rf-radius-md)',
          color: 'var(--rf-warning-text)',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, fontSize: 'var(--rf-text-base)' }}>
            <strong>Gmail is not connected.</strong> Connect your Google account in Settings before you can preview or send.
          </div>
          <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={() => navigateTo('/settings')}>
            Open Settings <ChevronRight size={13} />
          </button>
        </div>
      )}

      <div className="rf-compose">
        {/* Recipients */}
        <section className={`rf-cp-card${recipientsCollapsed ? ' rf-cp-card--collapsed' : ''}`}>
          <header className="rf-cp-card__head">
            <button
              type="button"
              className="rf-cp-card__title rf-cp-card__title--toggle"
              onClick={() => setRecipientsCollapsed(v => !v)}
              aria-expanded={!recipientsCollapsed}
              aria-controls="rf-cp-recipients-body"
              title={recipientsCollapsed ? 'Expand recipients' : 'Collapse recipients'}
            >
              <Users size={16} />
              <span>Recipients</span>
              {recipientCount > 0 && <span className="rf-cp-card__count rf-num">{recipientCount}</span>}
              {recipientsCollapsed && recipientCount > 0 && (() => {
                const validCount = recipients.filter(r => emailRegex.test((r.email || '').trim())).length;
                const sourceLabel = lastImportSource?.groupName
                  ? `from ${lastImportSource.groupName}`
                  : '';
                return (
                  <span className="rf-cp-card__summary">
                    <span className="rf-cp-card__summary-dot" />
                    <span>{validCount} valid · {recipientCount - validCount} pending</span>
                    {sourceLabel && <span className="rf-cp-card__summary-source">{sourceLabel}</span>}
                  </span>
                );
              })()}
              <ChevronDown size={14} className={`rf-cp-card__chevron${recipientsCollapsed ? ' rf-cp-card__chevron--collapsed' : ''}`} />
            </button>
            {!recipientsCollapsed && (
            <div className="rf-cp-card__toolbar">
              {!bulkMode && (
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={addRow}>
                  <Plus size={13} /> Add
                </button>
              )}
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setBulkMode(v => !v)}>
                <ClipboardPaste size={13} /> {bulkMode ? 'Manual' : 'Paste bulk'}
              </button>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { loadGroups(); setImportModalOpen(true); }}>
                <UserPlus size={13} /> From group
              </button>
              {recipientCount > 0 && (
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={clearAllRecipients}>
                  <Trash2 size={13} /> Clear all
                </button>
              )}
              <span className="rf-toolbar__divider" />
              <div className="rf-cp-name-format" title="How {{name}} renders for each recipient">
                <span style={{ fontSize: 12, color: 'var(--rf-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</span>
                <label className="rf-cp-name-format__opt">
                  <input type="radio" name="nameFormat" value="first" checked={nameFormat === 'first'} onChange={() => setNameFormat('first')} />
                  First
                </label>
                <label className="rf-cp-name-format__opt">
                  <input type="radio" name="nameFormat" value="full" checked={nameFormat === 'full'} onChange={() => setNameFormat('full')} />
                  Full
                </label>
              </div>
            </div>
            )}
          </header>
          {!recipientsCollapsed && (
          <div id="rf-cp-recipients-body" className="rf-cp-card__body-wrap">

          {bulkMode ? (
            <div className="rf-cp-bulk">
              <textarea
                className="rf-textarea"
                rows={5}
                placeholder="Paste emails (comma, space, or newline separated). I'll dedupe and infer names from addresses."
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                onPaste={e => { e.preventDefault(); doBulkPaste(e.clipboardData?.getData('text') || ''); }}
              />
            </div>
          ) : recipientCount === 0 ? (
            <div className="rf-cp-recipients__empty">
              <AtSign size={18} />
              <p>
                No recipients yet. Add manually, paste bulk, or import from a contact group.
                {variables.length === 0 ? '' : ' Custom variables will appear as extra columns per row.'}
              </p>
            </div>
          ) : (
            <div className="rf-cp-recipients" role="table" aria-label="Recipients">
              <div className="rf-cp-recipients__row rf-cp-recipients__row--head" style={{ gridTemplateColumns: gridTemplate(variables.length) }}>
                <div>Email</div>
                <div>Name</div>
                {variables.map(v => (
                  <div key={v.variableName} title={v.description || `Per-recipient {{${v.variableName}}}`}>
                    {v.variableName}
                  </div>
                ))}
                <div />
              </div>
              {recipients.map((r, idx) => {
                const errs = errors.recipients?.[r._id] || {};
                return (
                  <div key={r._id} className="rf-cp-recipients__row" style={{ gridTemplateColumns: gridTemplate(variables.length) }}>
                    <div>
                      <input
                        className={`rf-input rf-input--sm${errs.email ? ' rf-input--err' : ''}`}
                        value={r.email}
                        placeholder="email@example.com"
                        onChange={e => updateRecipient(idx, 'email', e.target.value)}
                        onBlur={() => onEmailBlur(idx)}
                      />
                      {errs.email && <small className="rf-field-error">{errs.email}</small>}
                    </div>
                    <div>
                      <input
                        className={`rf-input rf-input--sm${errs.name ? ' rf-input--err' : ''}`}
                        value={r.name}
                        placeholder="Recipient name"
                        onChange={e => updateRecipient(idx, 'name', e.target.value)}
                      />
                      {errs.name && <small className="rf-field-error">{errs.name}</small>}
                    </div>
                    {variables.map(v => (
                      <div key={v.variableName}>
                        <input
                          className="rf-input rf-input--sm"
                          value={r.variables?.[v.variableName] || ''}
                          placeholder={v.variableName}
                          onChange={e => updateRecipientVariable(idx, v.variableName, e.target.value)}
                        />
                      </div>
                    ))}
                    <button
                      className="rf-cp-recipients__remove"
                      onClick={() => deleteRecipient(idx)}
                      title="Remove recipient"
                      aria-label="Remove recipient"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {errors.recipientsGeneral && <span className="rf-field-error" style={{ marginTop: 8, display: 'block' }}>{errors.recipientsGeneral}</span>}
          </div>
          )}
        </section>

        {/* Subject */}
        <section className="rf-cp-card rf-cp-card--subject">
          <label className="rf-cp-card__subject-label">Subject</label>
          <input
            className="rf-cp-subject-input"
            value={subject}
            onChange={e => { setSubject(e.target.value); if (errors.subject) setErrors(p => ({ ...p, subject: undefined })); }}
            placeholder='e.g. "Software Engineer interest — Stripe"'
          />
          {errors.subject && <span className="rf-field-error">{errors.subject}</span>}
        </section>

        {/* Message */}
        <section className="rf-cp-card">
          <header className="rf-cp-card__head">
            <div className="rf-cp-card__title">
              <Variable size={16} />
              <span>Message</span>
              <span className="rf-cp-card__hint">
                Type <kbd>/</kbd> to insert a variable
              </span>
            </div>
            <div className="rf-cp-card__toolbar">
              <span title="Feature coming soon" style={{ display: 'inline-flex' }}>
                <button
                  className="rf-btn rf-btn--ghost rf-btn--sm rf-btn--locked"
                  aria-disabled="true"
                  type="button"
                  onClick={(e) => e.preventDefault()}
                >
                  <Lock size={12} /> Rewrite with AI
                </button>
              </span>
            </div>
          </header>

          <div className="rf-cp-vars">
            <span
              className={`rf-chip rf-chip--interactive ${variableKeys.includes('name') ? 'rf-chip--active' : ''}`}
              onClick={() => { const q = quillRef.current?.getEditor(); if (q) { const idx = q.getSelection(true)?.index ?? q.getLength(); q.insertEmbed(idx, 'variable', 'name'); q.insertText(idx + 1, ' '); q.setSelection(idx + 2, 0); }}}
              title="Click to insert {{name}} at cursor"
            >
              {'{{name}}'}
            </span>
            {variables.map(v => (
              <span key={v.id} className="rf-chip rf-chip--interactive" title="Click to insert">
                <span
                  onClick={() => { const q = quillRef.current?.getEditor(); if (q) { const idx = q.getSelection(true)?.index ?? q.getLength(); q.insertEmbed(idx, 'variable', v.variableName); q.insertText(idx + 1, ' '); q.setSelection(idx + 2, 0); }}}
                  style={{ cursor: 'pointer' }}
                >{`{{${v.variableName}}}`}</span>
                <button
                  className="rf-chip__remove"
                  onClick={(e) => { e.stopPropagation(); deleteVariable(v.id); }}
                  title="Delete variable"
                  aria-label="Delete variable"
                ><Trash2 size={11} /></button>
              </span>
            ))}
            {variables.length < MAX_CUSTOM_VARIABLES && (
              <div className="rf-cp-vars__add">
                <input
                  className="rf-input rf-input--sm"
                  style={{ width: 140 }}
                  placeholder="custom var"
                  value={varForm.variableName}
                  onChange={e => setVarForm(f => ({ ...f, variableName: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && createVariable()}
                />
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={createVariable}>
                  <Plus size={12} /> Add
                </button>
              </div>
            )}
            <span className="rf-cp-vars__count">{variables.length}/{MAX_CUSTOM_VARIABLES} custom</span>
          </div>

          <div className="rf-cp-editor">
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={body}
              onChange={v => { setBody(v); if (errors.body && strip(v)) setErrors(p => ({ ...p, body: undefined })); }}
              modules={QUILL_MODULES}
              placeholder="Hi {{name}}, …"
            />
          </div>

          {slashMenu.open && (
            <div className="rf-slash-menu" style={{ position: 'fixed', top: slashMenu.top, left: slashMenu.left, zIndex: 100 }}>
              {variableKeys.map((opt, idx) => (
                <button
                  key={opt}
                  className={idx === slashHighlight ? 'active' : ''}
                  onMouseDown={e => { e.preventDefault(); insertVariable(opt); }}
                >{`{{${opt}}}`}</button>
              ))}
            </div>
          )}

          {errors.body && <span className="rf-field-error">{errors.body}</span>}
        </section>

        {/* Attachments */}
        <section className="rf-cp-card">
          <header className="rf-cp-card__head">
            <div className="rf-cp-card__title">
              <Paperclip size={16} />
              <span>Attachments</span>
              {attachments.length > 0 && <span className="rf-cp-card__count rf-num">{attachments.length}</span>}
              <span className="rf-cp-card__hint">
                {attachments.length === 0
                  ? 'Drag files anywhere on this page, or click attach.'
                  : `${formatFileSize(totalAttachmentBytes)} of ${MAX_ATTACHMENT_TOTAL_MB} MB · ${MAX_ATTACHMENTS - attachments.length} more allowed`}
              </span>
            </div>
            <div className="rf-cp-card__toolbar">
              <button
                className="rf-btn rf-btn--ghost rf-btn--sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_ATTACHMENTS}
              >
                <Paperclip size={13} /> Attach file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS.join(',')}
                style={{ display: 'none' }}
                onChange={e => { validateAndAddFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
          </header>
          {attachments.length > 0 && (
            <div className="rf-attachments__chips" style={{ marginTop: 8 }}>
              {attachments.map(att => (
                <div key={att.id} className="rf-attachment-chip">
                  <Paperclip size={11} />
                  <span className="rf-attachment-chip__name" title={att.name}>{att.name}</span>
                  <span className="rf-attachment-chip__size">{formatFileSize(att.size)}</span>
                  <button className="rf-attachment-chip__remove" onClick={() => removeAttachment(att.id)} title="Remove" aria-label="Remove attachment">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Action bar */}
        <div className="rf-cp-actions">
          <div className="rf-cp-actions__group">
            <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={() => saveDraft(true)} disabled={saving}>
              {saving ? <><Loader size={13} className="rf-spin" /> Saving…</> : <><FileText size={13} /> Save draft</>}
            </button>
            <button
              className="rf-btn rf-btn--ghost rf-btn--sm"
              onClick={() => {
                if (!subject.trim() || !strip(body)) { setNotice({ type: 'error', message: 'Write subject & body first' }); return; }
                setTemplateTitle('');
                setTemplateDrawer('create');
              }}
            >
              <Bookmark size={13} /> Save as template
            </button>
          </div>
          <div className="rf-cp-actions__group">
            <button
              className="rf-btn rf-btn--ghost rf-btn--sm"
              onClick={() => setScheduleOpen(true)}
              disabled={!canSend}
              title={canSend ? 'Schedule send' : 'Connect Gmail in Settings first'}
            >
              <Calendar size={13} /> Schedule
            </button>
            <button
              className="rf-btn rf-btn--primary"
              onClick={() => doPreview()}
              disabled={!canSend}
              title={canSend ? 'Preview as a recipient, then send' : 'Connect Gmail in Settings first'}
            >
              <Eye size={15} /> {isPreviewing ? 'Loading…' : 'Preview & send'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview drawer */}
      {previewOpen && (
        <>
          <div className="rf-drawer-overlay" onClick={() => setPreviewOpen(false)} />
          <div className="rf-drawer">
            <div className="rf-drawer__header">
              <span className="rf-drawer__title"><MailCheck size={16} /> Preview & send</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {recipients.length > 1 && (
                  <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={doShuffle} disabled={isPreviewing} title="Preview a different recipient">
                    <Shuffle size={13} /> {isPreviewing ? '…' : 'Shuffle'}
                  </button>
                )}
                <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setPreviewOpen(false)} aria-label="Close preview">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="rf-drawer__body">
              {previewMeta && (
                <div style={{ marginBottom: 'var(--rf-sp-4)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-secondary)' }}>
                  <strong style={{ color: 'var(--rf-text)' }}>{previewMeta.name}</strong>
                  <span style={{ color: 'var(--rf-text-muted)' }}>· {previewMeta.email}</span>
                  {recipients.length > 1 && (
                    <span style={{ marginLeft: 'auto', color: 'var(--rf-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                      {recipients.indexOf(previewMeta) + 1} of {recipients.length}
                    </span>
                  )}
                </div>
              )}
              {attachments.length > 0 && (
                <div style={{ marginBottom: 'var(--rf-sp-3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {attachments.map(a => (
                    <span key={a.id} className="rf-attachment-chip rf-attachment-chip--preview">
                      <Paperclip size={10} /> {a.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="rf-preview-frame" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
            <div className="rf-drawer__footer">
              <button className="rf-btn rf-btn--ghost" onClick={() => setPreviewOpen(false)}>Cancel</button>
              <button className="rf-btn rf-btn--primary" onClick={doSend} disabled={isSending}>
                {isSending ? <><Loader size={14} className="rf-spin" /> Sending…</> : <><Send size={14} /> Send to {recipients.length}</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Schedule modal */}
      {scheduleOpen && (
        <div className="rf-dialog-overlay" onClick={() => setScheduleOpen(false)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="rf-dialog__title"><Calendar size={18} style={{ verticalAlign: '-3px', marginRight: 8 }} /> Schedule send</div>
            <div className="rf-dialog__body">
              <label className="rf-label">Send at</label>
              <input
                type="datetime-local"
                className="rf-input"
                min={minDateTime}
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
              />
              <p className="rf-help">Sends automatically at the scheduled time. Cancel anytime from History before it sends.</p>
            </div>
            <div className="rf-dialog__actions">
              <button className="rf-btn rf-btn--ghost" onClick={() => setScheduleOpen(false)}>Cancel</button>
              <button className="rf-btn rf-btn--primary" onClick={doSchedule} disabled={isScheduling || !scheduleDate}>
                {isScheduling ? <><Loader size={14} className="rf-spin" /> Scheduling…</> : <><Clock size={14} /> Schedule</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save-as-template drawer */}
      {templateDrawer === 'create' && (
        <>
          <div className="rf-drawer-overlay" onClick={() => setTemplateDrawer(null)} />
          <div className="rf-drawer" style={{ width: 'min(440px, 92vw)' }}>
            <div className="rf-drawer__header">
              <span className="rf-drawer__title"><Bookmark size={16} /> Save as template</span>
              <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setTemplateDrawer(null)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <div className="rf-drawer__body">
              <label className="rf-label">Template name</label>
              <input className="rf-input rf-input--lg" placeholder="e.g. Cold outreach v3" value={templateTitle} onChange={e => setTemplateTitle(e.target.value)} />
              <p className="rf-help">Templates save the subject and body. Variables and attachments aren't stored.</p>

              <div style={{ marginTop: 'var(--rf-sp-5)' }}>
                <label className="rf-label">Subject</label>
                <p style={{ fontSize: 'var(--rf-text-base)', color: 'var(--rf-text-secondary)' }}>{subject || <em>(empty)</em>}</p>
              </div>
              <div style={{ marginTop: 'var(--rf-sp-5)' }}>
                <label className="rf-label">Body preview</label>
                <div className="rf-preview-frame" style={{ minHeight: 100 }} dangerouslySetInnerHTML={{ __html: body || '<em>Empty</em>' }} />
              </div>
            </div>
            <div className="rf-drawer__footer">
              <button className="rf-btn rf-btn--ghost" onClick={() => setTemplateDrawer(null)}>Cancel</button>
              <button className="rf-btn rf-btn--primary" onClick={saveTemplate}><CheckCheck size={14} /> Save template</button>
            </div>
          </div>
        </>
      )}

      {/* Template browser */}
      {templateBrowseOpen && (
        <>
          <div className="rf-drawer-overlay" onClick={() => setTemplateBrowseOpen(false)} />
          <div className="rf-drawer">
            <div className="rf-drawer__header">
              <span className="rf-drawer__title">
                <FileText size={16} /> Templates
                <span className="rf-num" style={{ color: 'var(--rf-text-muted)', fontWeight: 500, fontSize: 14 }}>{templates.length}</span>
              </span>
              <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setTemplateBrowseOpen(false)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <div className="rf-drawer__body">
              {templatesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <Loader size={18} className="rf-spin" />
                </div>
              ) : templates.length === 0 ? (
                <div className="rf-empty">
                  <FileText size={24} className="rf-empty__icon" />
                  <div className="rf-empty__title">No saved templates yet</div>
                  <p className="rf-empty__desc">Write a message, then click <strong>Save as template</strong> to reuse it later.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {templates.map(t => (
                    <div key={t.id} className="rf-cp-template-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rf-cp-template-row__title">{t.title || 'Untitled'}</div>
                        {t.subject && <div className="rf-cp-template-row__subject">Subject: {t.subject}</div>}
                        <div className="rf-cp-template-row__preview">
                          {(t.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Empty body'}…
                        </div>
                      </div>
                      <button
                        className="rf-btn rf-btn--secondary rf-btn--sm"
                        onClick={() => { importTemplate(t); setTemplateBrowseOpen(false); }}
                      >
                        <CheckCheck size={13} /> Use
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* History drawer */}
      {historyDrawerOpen && (
        <>
          <div className="rf-drawer-overlay" onClick={() => setHistoryDrawerOpen(false)} />
          <div className="rf-drawer">
            <div className="rf-drawer__header">
              <span className="rf-drawer__title"><History size={16} /> Campaign history</span>
              <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setHistoryDrawerOpen(false)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <div className="rf-drawer__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-6)' }}>
              <HistorySection
                title="Scheduled"
                icon={<Calendar size={12} />}
                loading={scheduledLoading}
                empty="No scheduled sends."
                items={scheduled}
                renderMeta={s => <span>Sends {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : '—'} · {s.recipient_count} recipients</span>}
                statusBadge={() => <span className="rf-badge rf-badge--scheduled">scheduled</span>}
                trailing={s => (
                  <button
                    className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm"
                    onClick={() => cancelScheduled(s.id)}
                    disabled={cancellingId === s.id}
                    title="Cancel scheduled send"
                  >
                    {cancellingId === s.id ? <Loader size={12} className="rf-spin" /> : <X size={12} />}
                  </button>
                )}
              />

              <HistorySection
                title="Drafts"
                loading={draftsLoading}
                empty="No drafts."
                items={drafts}
                renderMeta={d => <span>{new Date(d.updated_at || d.created_at).toLocaleDateString()} · {d.recipient_count} recipients</span>}
                statusBadge={() => <span className="rf-badge rf-badge--draft">draft</span>}
                onItemClick={(d) => { loadCampaign(d.id); setHistoryDrawerOpen(false); }}
              />

              <HistorySection
                title="Sent"
                loading={historyLoading}
                empty="No sent campaigns yet."
                items={history}
                renderMeta={h => <span>{new Date(h.updated_at || h.created_at).toLocaleDateString()} · {h.recipient_count} recipients</span>}
                statusBadge={h => <span className={`rf-badge rf-badge--${h.status}`}>{h.status}</span>}
              />
            </div>
          </div>
        </>
      )}

      {/* Role picker for group imports */}
      {roleImportPrompt && (
        <div className="rf-dialog-overlay" onClick={() => setRoleImportPrompt(null)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="rf-dialog__title"><Users size={18} style={{ verticalAlign: '-3px', marginRight: 8 }} /> Choose recipient role</div>
            <div className="rf-dialog__body">
              <p className="rf-help" style={{ marginTop: 0, marginBottom: 'var(--rf-sp-4)' }}>
                {roleImportPrompt.groupName} has multiple roles. Choose which role to import.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {roleImportPrompt.roles.map(role => (
                  <button
                    key={role.key || '__empty__'}
                    className="rf-cp-group-row"
                    onClick={() => importSelectedRole(role)}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {role.label}
                    </span>
                    <span style={{ color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-sm)', fontVariantNumeric: 'tabular-nums' }}>
                      {role.count} contact{role.count === 1 ? '' : 's'}
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--rf-text-faint)' }} />
                  </button>
                ))}
              </div>
            </div>
            <div className="rf-dialog__actions">
              <button className="rf-btn rf-btn--ghost" onClick={() => setRoleImportPrompt(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import group dialog */}
      {importModalOpen && (
        <div className="rf-dialog-overlay" onClick={() => { if (!importingGroupId) setImportModalOpen(false); }}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="rf-dialog__title"><Users size={18} style={{ verticalAlign: '-3px', marginRight: 8 }} /> Import recipients from group</div>
            <div className="rf-dialog__body">
              <p className="rf-help" style={{ marginTop: 0, marginBottom: 'var(--rf-sp-4)' }}>
                Pulls contacts from the selected company group. If the group has multiple roles, choose one before importing. Already-added emails are skipped.
              </p>
              {groups.length === 0 ? (
                <div className="rf-empty">
                  <Users size={20} className="rf-empty__icon" />
                  <div className="rf-empty__title">No groups yet</div>
                  <p className="rf-empty__desc">Create a company group in Contacts to import recipients.</p>
                  <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={() => { setImportModalOpen(false); navigateTo('/contacts'); }}>
                    Open Contacts <ArrowUpRight size={13} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {groups.map(g => (
                    <button
                      key={g.id}
                      className="rf-cp-group-row"
                      onClick={() => importGroupRecipients(g.id)}
                      disabled={!!importingGroupId}
                    >
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {g.companyName}
                      </span>
                      <span style={{ color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-sm)', fontVariantNumeric: 'tabular-nums' }}>
                        {g.contactCount || 0} contact{(g.contactCount || 0) === 1 ? '' : 's'}
                      </span>
                      {importingGroupId === g.id
                        ? <Loader size={13} className="rf-spin" />
                        : <ChevronRight size={14} style={{ color: 'var(--rf-text-faint)' }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="rf-dialog__actions">
              <button className="rf-btn rf-btn--ghost" onClick={() => setImportModalOpen(false)} disabled={!!importingGroupId}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────── */

function gridTemplate(varCount) {
  const vars = varCount > 0 ? ` repeat(${Math.min(varCount, 2)}, minmax(120px, 1fr))` : '';
  return `minmax(220px, 1.4fr) minmax(160px, 1fr)${vars} 36px`;
}

// Small dot adornment for the page eyebrow
function PenLineDot() {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: 999, background: 'var(--rf-accent)',
      display: 'inline-block',
    }} />
  );
}

function HistorySection({ title, icon, loading, empty, items, renderMeta, statusBadge, trailing, onItemClick }) {
  return (
    <div>
      <div className="rf-cp-history__head">
        {icon}<span>{title}</span>
        {items?.length > 0 && <span className="rf-num" style={{ color: 'var(--rf-text-faint)' }}>{items.length}</span>}
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
          <Loader size={14} className="rf-spin" />
        </div>
      ) : (items?.length || 0) === 0 ? (
        <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)', margin: 0 }}>{empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => (
            <div
              key={item.id}
              className="rf-history-item"
              style={onItemClick ? { cursor: 'pointer' } : { cursor: 'default' }}
              onClick={() => onItemClick && onItemClick(item)}
            >
              <div className="rf-history-item__info">
                <div className="rf-history-item__subject">{item.subject || '(No subject)'}</div>
                <div className="rf-history-item__date">{renderMeta(item)}</div>
              </div>
              <div className="rf-history-item__meta">
                {statusBadge && statusBadge(item)}
                {trailing && trailing(item)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
