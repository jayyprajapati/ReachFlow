import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill, { Quill } from 'react-quill';
import { useApp } from '../contexts/AppContext.jsx';
import { Send, FileText, Bookmark, RotateCcw, Plus, Trash2, UserPlus, Users, Clock, Eye, Paperclip, X, Shuffle, Calendar, Loader, History, CheckCheck } from 'lucide-react';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CUSTOM_VARIABLES = 2;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_TOTAL_MB = 20;
const ALLOWED_ATTACH_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/png', 'image/jpeg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg'];

// Register Quill fonts
const Font = Quill.import('formats/font');
Font.whitelist = ['arial', 'verdana', 'georgia', 'times-new-roman', 'tahoma', 'trebuchet-ms'];
try { Quill.register(Font, true); } catch (e) {}

const Size = Quill.import('formats/size');
Size.whitelist = ['small', 'large', 'huge'];
try { Quill.register(Size, true); } catch (e) {}

// Register variable blot
const Embed = Quill.import('blots/embed');
class VariableBlot extends Embed {
  static create(v) { const n = super.create(); n.setAttribute('data-key', v); n.setAttribute('contenteditable', 'false'); n.classList.add('var-token'); n.innerText = `{{${v}}}`; return n; }
  static value(n) { return n.getAttribute('data-key'); }
}
VariableBlot.blotName = 'variable'; VariableBlot.tagName = 'span'; VariableBlot.className = 'var-token';
try { Quill.register(VariableBlot, true); } catch (e) {}

const QUILL_MODULES = {
  toolbar: [
    [{ font: ['', 'arial', 'verdana', 'georgia', 'times-new-roman', 'tahoma', 'trebuchet-ms'] }],
    [{ size: ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    [{ color: [] }],
    ['link'],
    ['clean'],
  ],
};

function uid() { if (crypto?.getRandomValues) { const b = crypto.getRandomValues(new Uint8Array(12)); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); } return Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24); }
const strip = h => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cap = w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
const nameFrom = e => { const p = (e || '').split('@')[0].replace(/[0-9]/g, '').split(/[._-]+/).filter(Boolean); return p.length ? p.map(cap).join(' ') : 'There'; };
const VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const findVars = html => { const f = new Set(); let m; const r = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g; while ((m = r.exec(html || '')) !== null) f.add(m[1].toLowerCase()); return Array.from(f); };
const hasUnmatched = html => { const o = (html.match(/\{\{/g) || []).length; const c = (html.match(/\}\}/g) || []).length; return o !== c; };

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [importingGroupId, setImportingGroupId] = useState('');
  const quillRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const variableKeys = useMemo(() => ['name', ...variables.map(v => v.variableName)], [variables]);
  const hdrs = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  // Slash menu
  useEffect(() => {
    const quill = quillRef.current?.getEditor(); if (!quill) return;
    const handleKeyDown = e => {
      if (slashMenu.open) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) e.preventDefault();
        if (e.key === 'ArrowDown') { setSlashHighlight(p => (p + 1) % Math.max(variableKeys.length, 1)); return; }
        if (e.key === 'ArrowUp') { setSlashHighlight(p => (p - 1 + Math.max(variableKeys.length, 1)) % Math.max(variableKeys.length, 1)); return; }
        if (e.key === 'Enter') { insertVariable(variableKeys[slashHighlight] || 'name'); return; }
        if (e.key === 'Escape') { closeSlashMenu(); return; }
        closeSlashMenu(); return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sel = quill.getSelection(true); if (!sel) return;
        const bounds = quill.getBounds(sel.index); const rect = quill.root.getBoundingClientRect();
        setSlashMenu({ open: true, left: rect.left + bounds.left, top: rect.top + bounds.top + bounds.height + 4 });
        setSlashTriggerIdx(sel.index); setSlashHighlight(0);
      }
    };
    quill.root.addEventListener('keydown', handleKeyDown);
    return () => quill.root.removeEventListener('keydown', handleKeyDown);
  }, [slashMenu.open, slashHighlight, variableKeys]);

  function closeSlashMenu() { setSlashMenu({ open: false, top: 0, left: 0 }); setSlashTriggerIdx(null); }
  function insertVariable(key) { const q = quillRef.current?.getEditor(); if (!q || slashTriggerIdx === null) return; q.deleteText(slashTriggerIdx, 1); q.insertEmbed(slashTriggerIdx, 'variable', key); q.insertText(slashTriggerIdx + 1, ' '); q.setSelection(slashTriggerIdx + 2, 0); closeSlashMenu(); }

  // Recipients
  function addRow() { setRecipients(p => [...p, { _id: uid(), email: '', name: '', variables: {}, status: 'pending' }]); if (errors.recipientsGeneral) setErrors(p => ({ ...p, recipientsGeneral: undefined })); }
  function updateRecipient(idx, field, value) { setRecipients(p => { const n = [...p]; n[idx] = { ...n[idx], [field]: value }; return n; }); }
  function updateRecipientVariable(idx, key, value) { setRecipients(p => { const n = [...p]; n[idx] = { ...n[idx], variables: { ...(n[idx].variables || {}), [key]: value } }; return n; }); }
  function deleteRecipient(idx) { setRecipients(p => p.filter((_, i) => i !== idx)); }
  function onEmailBlur(idx) { setRecipients(p => { const n = [...p], r = n[idx]; if (!r || !emailRegex.test(r.email || '')) return p; n[idx] = { ...r, name: r.name?.trim() ? r.name : nameFrom(r.email) }; return n; }); }
  function doBulkPaste(text) { const parsed = parseBulk(text); if (!parsed.length) return; setRecipients(parsed); setBulkMode(false); setBulkInput(''); }
  function parseBulk(raw) { if (!raw) return []; const seen = new Set(), list = []; for (const t of raw.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)) { if (!emailRegex.test(t)) continue; const e = t.toLowerCase(); if (seen.has(e)) continue; seen.add(e); list.push({ email: e, name: nameFrom(e), variables: {}, _id: uid(), status: 'pending' }); } return list; }

  // Attachments
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

  // Drag & drop
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

  // Validation
  function validate() { const e = { recipients: {} }; if (!subject.trim()) e.subject = 'Required'; if (!strip(body)) e.body = 'Required'; if (!recipients.length) e.recipientsGeneral = 'Add at least one recipient'; if (recipients.length > 50) e.recipientsGeneral = 'Max 50 recipients per send'; if (hasUnmatched(body)) e.body = 'Invalid variable syntax.'; recipients.forEach(r => { const re = {}; if (!emailRegex.test(r.email || '')) re.email = 'Invalid'; if (!r.name?.trim()) re.name = 'Required'; if (Object.keys(re).length) e.recipients[r._id] = re; }); return e; }
  const hasErr = e => { const rr = Object.values(e.recipients || {}).some(o => Object.keys(o || {}).length); return !!(e.subject || e.body || e.recipientsGeneral || rr); };

  // Campaign payload
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
    if (!p.subject || !p.body_html || !p.recipients.length) { if (toast) setNotice({ type: 'error', message: 'Need subject, body & recipients' }); return; }
    setSaving(true);
    try {
      let res;
      if (draftId) { res = await authedFetch(`${API_BASE}/api/campaigns/${draftId}`, { method: 'PATCH', headers: hdrs, body: JSON.stringify(p) }); }
      else { res = await authedFetch(`${API_BASE}/api/campaigns`, { method: 'POST', headers: hdrs, body: JSON.stringify(p) }); }
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Save failed');
      if (!draftId && d.id) setDraftId(d.id);
      if (toast) setNotice({ type: 'info', message: 'Draft saved' });
      loadDrafts();
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setSaving(false); }
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
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Preview failed');
      if (d.warnings?.length) setNotice({ type: 'info', message: d.warnings[0] });
      setPreviewMeta(tgt); setPreviewRecipientId(tgt._id); setPreviewHtml(d.html || ''); setPreviewOpen(true);
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setIsPreviewing(false); }
  }

  async function doShuffle() {
    if (!recipients.length || isPreviewing) return;
    // Pick a different recipient than current
    let tgt;
    if (recipients.length > 1) {
      const others = recipients.filter(r => r._id !== previewRecipientId);
      tgt = others[Math.floor(Math.random() * others.length)];
    } else {
      tgt = recipients[0];
    }
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
      if (!res.ok) { if (res.status === 401 || d.authError) { setNotice({ type: 'error', message: 'Gmail authorization expired. Please reconnect.' }); hydrateProfile(); return; } throw new Error(d.error || 'Send failed'); }
      setNotice({ type: 'success', message: `Sent to ${recipients.length} recipients` });
      setPreviewOpen(false);
      loadHistory(); loadDrafts();
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setIsSending(false); }
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
      if (!res.ok) { if (d.authError) { setNotice({ type: 'error', message: 'Gmail authorization expired. Please reconnect.' }); hydrateProfile(); return; } throw new Error(d.error || 'Schedule failed'); }
      setNotice({ type: 'success', message: `Scheduled for ${scheduledAt.toLocaleString()}` });
      setScheduleOpen(false);
      loadDrafts();
    } catch (e) { setNotice({ type: 'error', message: e.message }); } finally { setIsScheduling(false); }
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

  // Variables
  async function createVariable() {
    const cleaned = String(varForm.variableName || '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!cleaned) { setNotice({ type: 'error', message: 'Variable name required' }); return; }
    if (variables.length >= MAX_CUSTOM_VARIABLES) { setNotice({ type: 'error', message: 'Max 2 custom variables' }); return; }
    try {
      const res = await authedFetch(`${API_BASE}/api/variables`, { method: 'POST', headers: hdrs, body: JSON.stringify({ variableName: cleaned, description: varForm.description }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setVariables(p => [...p, d]); setVarForm({ variableName: '', description: '' }); setNotice({ type: 'success', message: 'Variable added' });
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }
  async function deleteVariable(id) {
    const target = variables.find(v => v.id === id); if (!target) return;
    setWarningDialog({ title: 'Delete variable?', message: `Remove {{${target.variableName}}}?`, confirmText: 'Delete', intent: 'danger', onConfirm: async () => { try { if (!String(id).startsWith('local-')) { const res = await authedFetch(`${API_BASE}/api/variables/${id}`, { method: 'DELETE' }); const d = await res.json(); if (!res.ok) throw new Error(d.error); } setVariables(p => p.filter(v => v.id !== id)); setNotice({ type: 'info', message: 'Variable deleted' }); } catch (e) { setNotice({ type: 'error', message: e.message }); } } });
  }

  // Templates
  function importTemplate(t) { setSubject(t.subject || ''); setBody(t.body_html || ''); setNotice({ type: 'info', message: `Template "${t.title}" applied` }); }
  async function saveTemplate() {
    if (!templateTitle.trim()) { setNotice({ type: 'error', message: 'Title required' }); return; }
    try {
      const res = await authedFetch(`${API_BASE}/api/templates`, { method: 'POST', headers: hdrs, body: JSON.stringify({ title: templateTitle.trim(), subject, body_html: body }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error);
      setNotice({ type: 'success', message: 'Template saved' }); setTemplateDrawer(null); loadTemplates();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  // Group import
  function handleGroupImport(contacts) {
    const incoming = (contacts || []).filter(c => c?.email);
    if (!incoming.length) { setNotice({ type: 'error', message: 'No contacts to import' }); return; }
    const existing = new Set(recipients.map(r => (r.email || '').toLowerCase()));
    const adds = [];
    for (const c of incoming) {
      const e = (c.email || '').toLowerCase().trim();
      if (!emailRegex.test(e) || existing.has(e)) continue;
      existing.add(e);
      adds.push({ _id: uid(), email: e, name: (c.name || '').trim() || nameFrom(e), variables: {}, status: 'pending' });
    }
    if (!adds.length) { setNotice({ type: 'info', message: 'All contacts already in recipients.' }); return; }
    setRecipients(p => [...p, ...adds]);
    setNotice({ type: 'info', message: `Imported ${adds.length} contacts` });
  }

  async function importGroupRecipients(groupId) {
    if (!groupId || importingGroupId) return;
    setImportingGroupId(groupId);
    try {
      const r = await authedFetch(`${API_BASE}/api/groups/${groupId}`);
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      handleGroupImport(d.contacts || []);
      setImportModalOpen(false);
    } catch (e) {
      setNotice({ type: 'error', message: e.message });
    } finally {
      setImportingGroupId('');
    }
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
    } catch (e) {
      setNotice({ type: 'error', message: e.message });
    } finally { setCancellingId(null); }
  }

  function resetComposeState() { setRecipients([]); setSubject(''); setBody(''); setDraftId(null); setErrors({ recipients: {} }); setGroupImports([]); setNameFormat('first'); setBulkMode(false); setBulkInput(''); setAttachments([]); }

  // Min datetime for schedule picker (now + 1 minute)
  const minDateTime = useMemo(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 1);
    return d.toISOString().slice(0, 16);
  }, []);

  return (
    <div className="rf-compose" ref={dropRef} style={isDragging ? { outline: '2px dashed var(--rf-accent)', outlineOffset: '4px' } : {}}>
      {/* Subject */}
      <input className="rf-compose__subject" value={subject} onChange={e => { setSubject(e.target.value); if (errors.subject) setErrors(p => ({ ...p, subject: undefined })); }} placeholder="Subject line…" />
      {errors.subject && <span className="rf-field-error">{errors.subject}</span>}

      {/* Toolbar */}
      <div className="rf-compose__toolbar">
        <div className="rf-compose__toolbar-left">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setBulkMode(!bulkMode)}>{bulkMode ? 'Manual' : 'Paste Bulk'}</button>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { loadGroups(); setImportModalOpen(true); }}><UserPlus size={13} />Import Group</button>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={resetComposeState}><RotateCcw size={13} />Reset</button>
          <span style={{ width: 1, background: 'var(--rf-border-subtle)', alignSelf: 'stretch', margin: '0 4px' }} />
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { loadTemplates(); setTemplateBrowseOpen(true); }}><FileText size={13} />Templates</button>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { loadHistory(); loadDrafts(); loadScheduled(); setHistoryDrawerOpen(true); }}><History size={13} />History</button>
        </div>
        <div className="rf-compose__toolbar-right">
          <div className="rf-name-toggle">
            <span>Use {nameFormat === 'full' ? 'full name' : 'first name'}</span>
            <label className={`rf-name-toggle__switch ${nameFormat === 'full' ? 'rf-name-toggle__switch--on' : ''}`}>
              <input type="checkbox" checked={nameFormat === 'full'} onChange={e => setNameFormat(e.target.checked ? 'full' : 'first')} />
              <span className="rf-name-toggle__thumb" />
            </label>
          </div>
        </div>
      </div>

      {/* Recipients */}
      <div className="rf-recipients">
        <div className="rf-recipients__header">
          <span style={{ fontSize: 'var(--rf-text-sm)', fontWeight: 600, color: 'var(--rf-text-secondary)' }}><Users size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Recipients ({recipients.length})</span>
          {!bulkMode && <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={addRow}><Plus size={13} />Add</button>}
        </div>
        {bulkMode ? (
          <textarea className="rf-textarea" rows={4} placeholder="Paste emails (comma/newline separated)" value={bulkInput} onChange={e => setBulkInput(e.target.value)} onPaste={e => { e.preventDefault(); doBulkPaste(e.clipboardData?.getData('text') || ''); }} />
        ) : (
          <div className="rf-recipients__list">
            {recipients.map((r, idx) => {
              const errs = errors.recipients?.[r._id] || {};
              return (
                <div className="rf-recipient-row" key={r._id} style={{ gridTemplateColumns: `1fr 1fr ${variables.length ? `repeat(${Math.min(variables.length, 2)},1fr)` : ''} 28px` }}>
                  <div><input className="rf-input" value={r.email} placeholder="email@example.com" onChange={e => updateRecipient(idx, 'email', e.target.value)} onBlur={() => onEmailBlur(idx)} />{errs.email && <small className="rf-field-error">{errs.email}</small>}</div>
                  <div><input className="rf-input" value={r.name} placeholder="Name" onChange={e => updateRecipient(idx, 'name', e.target.value)} />{errs.name && <small className="rf-field-error">{errs.name}</small>}</div>
                  {variables.map(v => <div key={v.variableName}><input className="rf-input" value={r.variables?.[v.variableName] || ''} placeholder={v.variableName} onChange={e => updateRecipientVariable(idx, v.variableName, e.target.value)} /></div>)}
                  <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => deleteRecipient(idx)} title="Remove">✕</button>
                </div>
              );
            })}
            {!recipients.length && <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)', padding: 'var(--rf-sp-2) 0' }}>No recipients yet.</p>}
          </div>
        )}
        {errors.recipientsGeneral && <span className="rf-field-error">{errors.recipientsGeneral}</span>}
      </div>

      {/* Variables */}
      <div className="rf-varbar">
        <span className="rf-chip rf-chip--active">{'{{name}}'}</span>
        {variables.map(v => (
          <span className="rf-chip" key={v.id}>
            {`{{${v.variableName}}}`}
            <button className="rf-chip__remove" onClick={() => deleteVariable(v.id)}><Trash2 size={11} /></button>
          </span>
        ))}
        {variables.length < MAX_CUSTOM_VARIABLES && (
          <div className="rf-varbar__add">
            <input className="rf-input" style={{ width: 110, height: 26, fontSize: 'var(--rf-text-xs)' }} placeholder="var name" value={varForm.variableName} onChange={e => setVarForm(f => ({ ...f, variableName: e.target.value }))} />
            <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={createVariable}><Plus size={12} />Add</button>
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)' }}>{variables.length}/{MAX_CUSTOM_VARIABLES} custom vars</span>
      </div>

      {/* Editor */}
      <div className="rf-compose__body">
        <p className="rf-compose__hint">Type <b>/</b> to insert variables · Drag files to attach</p>
        <div className="rf-compose__editor-wrap">
          <ReactQuill ref={quillRef} theme="snow" value={body} onChange={v => { setBody(v); if (errors.body && strip(v)) setErrors(p => ({ ...p, body: undefined })); }} modules={QUILL_MODULES} placeholder="Write your email…" />
        </div>
        {slashMenu.open && (
          <div className="rf-slash-menu" style={{ position: 'fixed', top: slashMenu.top, left: slashMenu.left, zIndex: 100 }}>
            {variableKeys.map((opt, idx) => (
              <button key={opt} className={idx === slashHighlight ? 'active' : ''} onMouseDown={e => { e.preventDefault(); insertVariable(opt); }}>{`{{${opt}}}`}</button>
            ))}
          </div>
        )}
        {errors.body && <span className="rf-field-error">{errors.body}</span>}
      </div>

      {/* Attachments */}
      <div className="rf-attachments">
        <div className="rf-attachments__bar">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => fileInputRef.current?.click()} disabled={attachments.length >= MAX_ATTACHMENTS}>
            <Paperclip size={13} />Attach File
          </button>
          {attachments.length > 0 && (
            <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>
              {attachments.length}/{MAX_ATTACHMENTS} · {formatFileSize(attachments.reduce((s, a) => s + a.size, 0))} / {MAX_ATTACHMENT_TOTAL_MB}MB
            </span>
          )}
        </div>
        {attachments.length > 0 && (
          <div className="rf-attachments__chips">
            {attachments.map(att => (
              <div key={att.id} className="rf-attachment-chip">
                <Paperclip size={11} />
                <span className="rf-attachment-chip__name">{att.name}</span>
                <span className="rf-attachment-chip__size">{formatFileSize(att.size)}</span>
                <button className="rf-attachment-chip__remove" onClick={() => removeAttachment(att.id)} title="Remove"><X size={11} /></button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileInputRef} type="file" multiple accept={ALLOWED_EXTENSIONS.join(',')} style={{ display: 'none' }} onChange={e => { validateAndAddFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {/* Actions */}
      <div className="rf-compose__actions">
        <div className="rf-compose__actions-left">
          <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={() => saveDraft(true)} disabled={saving}><FileText size={14} />{saving ? 'Saving…' : 'Save Draft'}</button>
          <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={() => { if (!subject.trim() || !strip(body)) { setNotice({ type: 'error', message: 'Write subject & body first' }); return; } setTemplateTitle(''); setTemplateDrawer('create'); }}><Bookmark size={14} />Save Template</button>
        </div>
        <div className="rf-compose__actions-right">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setScheduleOpen(true)} disabled={!gmailConnected}><Calendar size={14} />Schedule</button>
          <button className="rf-btn rf-btn--primary" onClick={() => doPreview()} disabled={isPreviewing || !gmailConnected}><Eye size={15} />{isPreviewing ? 'Loading…' : 'Preview & Send'}</button>
        </div>
      </div>

      {/* Preview drawer */}
      {previewOpen && (
        <>
          <div className="rf-drawer-overlay" onClick={() => setPreviewOpen(false)} />
          <div className="rf-drawer">
            <div className="rf-drawer__header">
              <span className="rf-drawer__title">Preview & Send</span>
              <div style={{ display: 'flex', gap: 'var(--rf-sp-2)' }}>
                {recipients.length > 1 && (
                  <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={doShuffle} disabled={isPreviewing} title="Preview different recipient">
                    <Shuffle size={13} />{isPreviewing ? '…' : 'Shuffle'}
                  </button>
                )}
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setPreviewOpen(false)}>✕</button>
              </div>
            </div>
            <div className="rf-drawer__body">
              {previewMeta && (
                <div style={{ marginBottom: 'var(--rf-sp-4)', fontSize: 'var(--rf-text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--rf-sp-2)' }}>
                  <b>{previewMeta.name}</b>
                  <span className="rf-text-muted">({previewMeta.email})</span>
                  {recipients.length > 1 && <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)' }}>{recipients.indexOf(previewMeta) + 1} of {recipients.length}</span>}
                </div>
              )}
              {attachments.length > 0 && (
                <div style={{ marginBottom: 'var(--rf-sp-3)', display: 'flex', gap: 'var(--rf-sp-2)', flexWrap: 'wrap' }}>
                  {attachments.map(a => <span key={a.id} className="rf-attachment-chip rf-attachment-chip--preview"><Paperclip size={10} />{a.name}</span>)}
                </div>
              )}
              <div className="rf-preview-frame" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
            <div className="rf-drawer__footer">
              <button className="rf-btn rf-btn--ghost" onClick={() => setPreviewOpen(false)}>Cancel</button>
              <button className="rf-btn rf-btn--primary" onClick={doSend} disabled={isSending}><Send size={14} />{isSending ? 'Sending…' : `Send to ${recipients.length}`}</button>
            </div>
          </div>
        </>
      )}

      {/* Schedule modal */}
      {scheduleOpen && (
        <div className="rf-dialog-overlay" onClick={() => setScheduleOpen(false)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="rf-dialog__title"><Calendar size={18} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 8 }} />Schedule Send</div>
            <div className="rf-dialog__body" style={{ marginBottom: 'var(--rf-sp-4)' }}>
              <label className="rf-label">Send Date & Time</label>
              <input
                type="datetime-local"
                className="rf-input"
                min={minDateTime}
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                style={{ marginTop: 'var(--rf-sp-2)' }}
              />
              <p style={{ marginTop: 'var(--rf-sp-3)', fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>
                Campaign will be sent automatically at the scheduled time. You can cancel it from History before it sends.
              </p>
            </div>
            <div className="rf-dialog__actions">
              <button className="rf-btn rf-btn--ghost" onClick={() => setScheduleOpen(false)}>Cancel</button>
              <button className="rf-btn rf-btn--primary" onClick={doSchedule} disabled={isScheduling || !scheduleDate}>
                <Clock size={14} />{isScheduling ? 'Scheduling…' : 'Schedule Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template create drawer */}
      {templateDrawer === 'create' && (
        <>
          <div className="rf-drawer-overlay" onClick={() => setTemplateDrawer(null)} />
          <div className="rf-drawer" style={{ width: 'min(420px,90vw)' }}>
            <div className="rf-drawer__header">
              <span className="rf-drawer__title">Save as Template</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setTemplateDrawer(null)}>✕</button>
            </div>
            <div className="rf-drawer__body">
              <input className="rf-input rf-input--lg" placeholder="Template name" value={templateTitle} onChange={e => setTemplateTitle(e.target.value)} style={{ marginBottom: 'var(--rf-sp-4)' }} />
              <div className="rf-label">Subject</div>
              <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-secondary)', marginBottom: 'var(--rf-sp-3)' }}>{subject || '(empty)'}</p>
              <div className="rf-label">Body Preview</div>
              <div className="rf-preview-frame" style={{ minHeight: 80 }} dangerouslySetInnerHTML={{ __html: body || '<em>Empty</em>' }} />
            </div>
            <div className="rf-drawer__footer">
              <button className="rf-btn rf-btn--primary" onClick={saveTemplate}>Save Template</button>
            </div>
          </div>
        </>
      )}

      {/* Template browser drawer */}
      {templateBrowseOpen && (
        <>
          <div className="rf-drawer-overlay" onClick={() => setTemplateBrowseOpen(false)} />
          <div className="rf-drawer">
            <div className="rf-drawer__header">
              <span className="rf-drawer__title"><FileText size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Templates ({templates.length})</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setTemplateBrowseOpen(false)}>✕</button>
            </div>
            <div className="rf-drawer__body">
              {templatesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><Loader size={18} className="rf-spin" /></div>
              ) : templates.length === 0 ? (
                <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)', textAlign: 'center', padding: '24px 0' }}>No saved templates yet. Write an email and click "Save Template".</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {templates.map(t => (
                    <div key={t.id} style={{ border: '1px solid var(--rf-border-subtle)', borderRadius: 'var(--rf-radius-md)', padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)', marginBottom: 2 }}>{t.title || 'Untitled'}</div>
                      {t.subject && <div style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', marginBottom: 6 }}>Subject: {t.subject}</div>}
                      <div style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', marginBottom: 8, lineHeight: 1.4 }}>
                        {(t.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Empty body'}…
                      </div>
                      <button
                        className="rf-btn rf-btn--secondary rf-btn--sm"
                        style={{ width: '100%' }}
                        onClick={() => { importTemplate(t); setTemplateBrowseOpen(false); }}
                      >
                        <CheckCheck size={13} /> Use Template
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
              <span className="rf-drawer__title"><History size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Campaign History</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setHistoryDrawerOpen(false)}>✕</button>
            </div>
            <div className="rf-drawer__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-5)' }}>

              {/* Scheduled */}
              {(scheduled.length > 0 || scheduledLoading) && (
                <div>
                  <div style={{ fontSize: 'var(--rf-text-xs)', fontWeight: 700, color: 'var(--rf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={12} /> Scheduled
                  </div>
                  {scheduledLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Loader size={14} className="rf-spin" /></div> : scheduled.map(s => (
                    <div key={s.id} className="rf-history-item" style={{ marginBottom: 6 }}>
                      <div className="rf-history-item__info">
                        <div className="rf-history-item__subject">{s.subject || '(No subject)'}</div>
                        <div className="rf-history-item__date">Sends: {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : '—'} · {s.recipient_count} recipients</div>
                      </div>
                      <div className="rf-history-item__meta">
                        <span className="rf-badge rf-badge--scheduled">scheduled</span>
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" title="Cancel" onClick={() => cancelScheduled(s.id)} disabled={cancellingId === s.id}>
                          {cancellingId === s.id ? <Loader size={12} className="rf-spin" /> : <X size={12} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Drafts */}
              <div>
                <div style={{ fontSize: 'var(--rf-text-xs)', fontWeight: 700, color: 'var(--rf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Drafts
                </div>
                {draftsLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Loader size={14} className="rf-spin" /></div>
                : drafts.length === 0 ? <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', margin: 0 }}>No drafts.</p>
                : drafts.map(d => (
                  <div key={d.id} className="rf-history-item" style={{ marginBottom: 6, cursor: 'pointer' }} onClick={() => { loadCampaign(d.id); setHistoryDrawerOpen(false); }}>
                    <div className="rf-history-item__info">
                      <div className="rf-history-item__subject">{d.subject || '(No subject)'}</div>
                      <div className="rf-history-item__date">{new Date(d.updated_at || d.created_at).toLocaleDateString()} · {d.recipient_count} recipients</div>
                    </div>
                    <div className="rf-history-item__meta">
                      <span className="rf-badge rf-badge--draft">draft</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sent */}
              <div>
                <div style={{ fontSize: 'var(--rf-text-xs)', fontWeight: 700, color: 'var(--rf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Sent
                </div>
                {historyLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Loader size={14} className="rf-spin" /></div>
                : history.length === 0 ? <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', margin: 0 }}>No sent campaigns yet.</p>
                : history.map(h => (
                  <div key={h.id} className="rf-history-item" style={{ marginBottom: 6 }}>
                    <div className="rf-history-item__info">
                      <div className="rf-history-item__subject">{h.subject || '(No subject)'}</div>
                      <div className="rf-history-item__date">{new Date(h.updated_at || h.created_at).toLocaleDateString()} · {h.recipient_count} recipients</div>
                    </div>
                    <div className="rf-history-item__meta">
                      <span className={`rf-badge rf-badge--${h.status}`}>{h.status}</span>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </>
      )}

      {/* Import modal */}
      {importModalOpen && (
        <div className="rf-dialog-overlay" onClick={() => { if (!importingGroupId) setImportModalOpen(false); }}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="rf-dialog__title">Import from Group</div>
            <div className="rf-dialog__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-3)' }}>
                {groups.length ? groups.map(g => (
                  <button key={g.id} className="rf-btn rf-btn--secondary" style={{ justifyContent: 'flex-start' }} onClick={() => importGroupRecipients(g.id)} disabled={!!importingGroupId}>
                    {importingGroupId === g.id && <Loader size={13} className="rf-spin" />}
                    {g.companyName} ({g.contactCount || 0})
                    {importingGroupId === g.id && <span style={{ marginLeft: 'auto', fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>Importing…</span>}
                  </button>
                )) : <p className="rf-text-muted">No groups yet.</p>}
              </div>
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
