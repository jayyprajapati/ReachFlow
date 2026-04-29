import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import { Plus, Trash2, Pencil, Check, X, Copy, Search, Linkedin, ClipboardPaste, FileDown, Upload, ExternalLink, Loader, Users } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_OPTIONS = ['', 'Recruiter', 'Senior Recruiter', 'Hiring Manager', 'HR', 'Talent Acquisition', 'Engineering Manager', 'Director', 'VP', 'Other'];
const EMAIL_STATUS_OPTIONS = [
  { value: 'verified', label: 'Valid' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'not_valid', label: 'Invalid' },
];

function EmailStatusBadge({ status }) {
  const map = { verified: ['Valid', 'success'], tentative: ['Tentative', 'neutral'], not_valid: ['Invalid', 'error'] };
  const [label, cls] = map[status] || map.tentative;
  return <span className={`rf-badge rf-badge--${cls}`}>{label}</span>;
}

function parseBulkText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    const angleMatch = line.match(/^(.+?)\s*<([^\s@]+@[^\s@]+\.[^\s@]+)>/);
    if (angleMatch) return { name: angleMatch[1].trim(), email: angleMatch[2].trim() };
    const parts = line.split(/[,\t]/).map(p => p.trim());
    const emailPart = parts.find(p => emailRegex.test(p));
    const namePart = parts.find(p => p && !emailRegex.test(p));
    if (emailPart) return { name: namePart || '', email: emailPart };
    if (emailRegex.test(line)) return { name: '', email: line };
    return { name: line, email: '' };
  });
}

function parseCSVText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const firstLower = lines[0].toLowerCase();
  const hasHeader = firstLower.includes('name') || firstLower.includes('email');
  const data = hasHeader ? lines.slice(1) : lines;
  return data.map(line => {
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    return {
      name: parts[0] || '',
      email: parts[1] || '',
      role: parts[2] || '',
      linkedin: parts[3] || '',
      connectionStatus: parts[4] || '',
      email_status: ['verified', 'tentative', 'not_valid'].includes(parts[5]) ? parts[5] : 'tentative',
    };
  }).filter(p => p.name || p.email);
}

export default function ContactsPage() {
  const { authedFetch, setNotice, setWarningDialog, groups, loadGroups } = useApp();
  const { path } = useRouter();

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState('');
  const [newCareers, setNewCareers] = useState('');
  const [createBusy, setCreateBusy] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [contactForm, setContactForm] = useState({});
  const [savingContact, setSavingContact] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const clickTimerRef = useRef({});

  const [editingLogo, setEditingLogo] = useState(false);
  const [logoInput, setLogoInput] = useState('');
  const [editingCareers, setEditingCareers] = useState(false);
  const [careersInput, setCareersInput] = useState('');
  const [savingGroupField, setSavingGroupField] = useState(false);

  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [bulkAdding, setBulkAdding] = useState(false);

  const [csvParsed, setCsvParsed] = useState(null);
  const [csvAdding, setCsvAdding] = useState(false);
  const csvFileRef = useRef();

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { if (copiedField) { const t = setTimeout(() => setCopiedField(''), 1200); return () => clearTimeout(t); } }, [copiedField]);

  useEffect(() => {
    const m = path.match(/^\/contacts\/(.+)$/);
    if (m && m[1]) openGroup(m[1]);
  }, [path]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g => g.companyName?.toLowerCase().includes(q));
  }, [groups, search]);

  const existingEmailsSet = useMemo(
    () => new Set((detail?.contacts || []).map(c => (c.email || '').toLowerCase())),
    [detail?.contacts]
  );

  async function openGroup(id) {
    setSelectedId(id); setDetailLoading(true); setEditingId(null);
    setEditingLogo(false); setEditingCareers(false);
    try {
      const r = await authedFetch(`${API}/api/groups/${id}`);
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setDetail(d);
    } catch (e) { setNotice({ type: 'error', message: e.message }); setDetail(null); }
    finally { setDetailLoading(false); }
  }

  async function createGroup() {
    if (!newName.trim() || createBusy) return;
    setCreateBusy(true);
    try {
      const r = await authedFetch(`${API}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: newName.trim(), logoUrl: newLogo.trim(), careersPageUrl: newCareers.trim() }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      loadGroups(); setCreating(false); setNewName(''); setNewLogo(''); setNewCareers(''); openGroup(d.id);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setCreateBusy(false); }
  }

  async function deleteGroup() {
    if (!detail) return;
    setWarningDialog({
      title: `Delete "${detail.companyName}"?`,
      message: 'This deletes the group and all contacts.',
      confirmText: 'Delete', intent: 'danger',
      onConfirm: async () => {
        try {
          await authedFetch(`${API}/api/groups/${detail.id}`, { method: 'DELETE' });
          loadGroups(); setDetail(null); setSelectedId(null);
        } catch (e) { setNotice({ type: 'error', message: e.message }); }
      },
    });
  }

  async function saveGroupField(field, value) {
    if (!detail || savingGroupField) return;
    setSavingGroupField(true);
    try {
      const r = await authedFetch(`${API}/api/groups/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setDetail(p => ({ ...p, [field]: value }));
      if (field === 'logoUrl') setEditingLogo(false);
      if (field === 'careersPageUrl') setEditingCareers(false);
      loadGroups();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setSavingGroupField(false); }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setContactForm({ name: c.name || '', email: c.email || '', role: c.role || '', linkedin: c.linkedin || '', connectionStatus: c.connectionStatus || 'not_connected', email_status: c.email_status || 'tentative' });
  }

  async function saveContact() {
    if (!detail || savingContact) return;
    setSavingContact(true);
    try {
      const isNew = editingId === '__new__';
      const url = isNew ? `${API}/api/groups/${detail.id}/contacts` : `${API}/api/groups/${detail.id}/contacts/${editingId}`;
      const method = isNew ? 'POST' : 'PATCH';
      const r = await authedFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contactForm) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      if (isNew) setDetail(p => ({ ...p, contacts: [d, ...(p?.contacts || [])] }));
      else setDetail(p => ({ ...p, contacts: (p?.contacts || []).map(c => c.id === editingId ? d : c) }));
      setEditingId(null); loadGroups();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setSavingContact(false); }
  }

  async function deleteContact(cid) {
    if (!detail) return;
    setWarningDialog({
      title: 'Delete contact?', message: 'Cannot be undone.', confirmText: 'Delete', intent: 'danger',
      onConfirm: async () => {
        try {
          await authedFetch(`${API}/api/groups/${detail.id}/contacts/${cid}`, { method: 'DELETE' });
          setDetail(p => ({ ...p, contacts: (p?.contacts || []).filter(c => c.id !== cid) }));
          loadGroups();
        } catch (e) { setNotice({ type: 'error', message: e.message }); }
      },
    });
  }

  function copyVal(text, key) { navigator.clipboard.writeText(text).then(() => setCopiedField(key)); }

  function handleNameClick(contact) {
    const key = contact.id;
    if (clickTimerRef.current[key]) {
      clearTimeout(clickTimerRef.current[key]);
      delete clickTimerRef.current[key];
      copyVal(contact.name, `name-${contact.id}`);
    } else {
      clickTimerRef.current[key] = setTimeout(() => {
        delete clickTimerRef.current[key];
        const firstName = (contact.name || '').split(/\s+/)[0];
        copyVal(firstName || contact.name, `name-${contact.id}`);
      }, 220);
    }
  }

  function exportCSV() {
    if (!detail?.contacts?.length) return;
    const headers = ['Name', 'Email', 'Role', 'LinkedIn', 'Connection Status', 'Email Status'];
    const rows = detail.contacts.map(c => [c.name, c.email, c.role, c.linkedin, c.connectionStatus, c.email_status]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(detail.companyName || 'contacts').replace(/[^a-z0-9]/gi, '_')}_contacts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCSVFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setCsvParsed(parseCSVText(ev.target.result || '')); };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function addParsedContacts(list, setBusy, onDone) {
    const toAdd = list.filter(p => p.name && !(p.email && existingEmailsSet.has(p.email.toLowerCase())));
    if (!toAdd.length) { setNotice({ type: 'info', message: 'No new contacts to add' }); onDone(); return; }
    setBusy(true);
    let added = 0, failed = 0;
    for (const contact of toAdd) {
      try {
        const r = await authedFetch(`${API}/api/groups/${detail.id}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: contact.name, email: contact.email || '', role: contact.role || '', linkedin: contact.linkedin || '', email_status: contact.email_status || 'tentative' }),
        });
        if (r.ok) { const d = await r.json(); setDetail(p => ({ ...p, contacts: [...(p?.contacts || []), d] })); added++; }
        else failed++;
      } catch { failed++; }
    }
    loadGroups();
    setNotice({ type: added > 0 ? 'success' : 'error', message: `Added ${added} contact${added !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}` });
    setBusy(false);
    onDone();
  }

  const bulkParsed = useMemo(() => parseBulkText(bulkPasteText), [bulkPasteText]);
  function isDupe(item) { return !!item.email && existingEmailsSet.has(item.email.toLowerCase()); }
  const bulkValid = bulkParsed.filter(p => p.name && !isDupe(p));
  const csvValid = (csvParsed || []).filter(p => p.name && !isDupe(p));

  return (
    <div className="rf-contacts">
      {/* Bulk paste modal */}
      {bulkPasteOpen && (
        <div className="rf-drawer-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !bulkAdding && setBulkPasteOpen(false)}>
          <div className="rf-bulk-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-md)' }}>Bulk Paste Contacts</span>
              <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setBulkPasteOpen(false)} disabled={bulkAdding}><X size={14} /></button>
            </div>
            <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', margin: 0 }}>
              One contact per line — <code>Name, email</code>, <code>Name &lt;email&gt;</code>, or just an email.
            </p>
            <textarea
              className="rf-textarea"
              style={{ height: 120, fontFamily: 'var(--rf-font-mono)', fontSize: 'var(--rf-text-xs)' }}
              placeholder={"John Smith, john@company.com\nJane Doe <jane@corp.io>\nalice@example.com"}
              value={bulkPasteText}
              onChange={e => setBulkPasteText(e.target.value)}
            />
            {bulkParsed.length > 0 && (
              <div className="rf-bulk-preview">
                {bulkParsed.map((p, i) => (
                  <div key={i} className={`rf-bulk-row${isDupe(p) ? ' rf-bulk-row--dupe' : ''}`}>
                    <span style={{ flex: 1, fontWeight: 500, fontSize: 'var(--rf-text-sm)' }}>{p.name || <span style={{ color: 'var(--rf-text-faint)' }}>—</span>}</span>
                    <span style={{ flex: 1, color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-xs)' }}>{p.email}</span>
                    {isDupe(p) && <span className="rf-badge rf-badge--neutral" style={{ fontSize: 10 }}>dupe</span>}
                    {!p.name && !isDupe(p) && <span className="rf-badge rf-badge--warning" style={{ fontSize: 10 }}>no name</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="rf-bulk-actions">
              <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>{bulkValid.length} to add</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setBulkPasteOpen(false)} disabled={bulkAdding}>Cancel</button>
              <button
                className="rf-btn rf-btn--primary rf-btn--sm"
                onClick={() => addParsedContacts(bulkParsed, setBulkAdding, () => { setBulkPasteOpen(false); setBulkPasteText(''); })}
                disabled={bulkAdding || !bulkValid.length}
              >
                {bulkAdding && <Loader size={13} style={{ animation: 'rf-spin 1s linear infinite' }} />}
                Add {bulkValid.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV import preview modal */}
      {csvParsed !== null && (
        <div className="rf-drawer-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => !csvAdding && setCsvParsed(null)}>
          <div className="rf-bulk-panel" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-md)' }}>Import CSV — Preview</span>
              <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setCsvParsed(null)} disabled={csvAdding}><X size={14} /></button>
            </div>
            {!csvParsed.length ? (
              <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)', textAlign: 'center', padding: 'var(--rf-sp-4)' }}>No contacts found in file.</p>
            ) : (
              <div className="rf-bulk-preview">
                {csvParsed.map((p, i) => (
                  <div key={i} className={`rf-bulk-row${isDupe(p) ? ' rf-bulk-row--dupe' : ''}`}>
                    <span style={{ flex: 1, fontWeight: 500, fontSize: 'var(--rf-text-sm)' }}>{p.name || <span style={{ color: 'var(--rf-text-faint)' }}>—</span>}</span>
                    <span style={{ flex: 1, color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-xs)' }}>{p.email}</span>
                    {p.role && <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)' }}>{p.role}</span>}
                    {isDupe(p) && <span className="rf-badge rf-badge--neutral" style={{ fontSize: 10 }}>dupe</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="rf-bulk-actions">
              <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>{csvValid.length} to add</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setCsvParsed(null)} disabled={csvAdding}>Cancel</button>
              <button
                className="rf-btn rf-btn--primary rf-btn--sm"
                onClick={() => addParsedContacts(csvParsed, setCsvAdding, () => setCsvParsed(null))}
                disabled={csvAdding || !csvValid.length}
              >
                {csvAdding && <Loader size={13} style={{ animation: 'rf-spin 1s linear infinite' }} />}
                Add {csvValid.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left - Company list */}
      <div className="rf-contacts__list">
        <div className="rf-contacts__list-header">
          <h2 style={{ fontSize: 'var(--rf-text-lg)', fontWeight: 700, fontFamily: 'var(--rf-font-display)' }}>Companies</h2>
          <div className="rf-search">
            <Search size={14} className="rf-search__icon" />
            <input className="rf-search__input" placeholder="Search companies…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="rf-btn rf-btn--primary rf-btn--sm" style={{ width: '100%' }} onClick={() => { setCreating(true); setNewName(''); setNewLogo(''); setNewCareers(''); }}>
            <Plus size={14} />New Company
          </button>
          {creating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
              <input className="rf-input" placeholder="Company name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
              <input className="rf-input" placeholder="Logo URL (optional)" value={newLogo} onChange={e => setNewLogo(e.target.value)} />
              <input className="rf-input" placeholder="Careers page URL (optional)" value={newCareers} onChange={e => setNewCareers(e.target.value)} />
              <div style={{ display: 'flex', gap: 'var(--rf-sp-2)' }}>
                <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={createGroup} disabled={createBusy}><Check size={14} /></button>
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setCreating(false)}><X size={14} /></button>
              </div>
            </div>
          )}
        </div>
        <div className="rf-contacts__list-scroll">
          {filtered.map(g => (
            <div key={g.id} className={`rf-company-item ${selectedId === g.id ? 'rf-company-item--active' : ''}`} onClick={() => openGroup(g.id)}>
              <div className="rf-company-item__logo">
                {g.logoUrl ? <img src={g.logoUrl} alt="" /> : <Users size={16} style={{ color: 'var(--rf-text-faint)' }} />}
              </div>
              <div className="rf-company-item__info">
                <div className="rf-company-item__name">{g.companyName}</div>
                <div className="rf-company-item__meta">{g.contactCount || 0} contacts</div>
              </div>
            </div>
          ))}
          {!filtered.length && <p style={{ padding: 'var(--rf-sp-4)', color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-sm)', textAlign: 'center' }}>No companies found.</p>}
        </div>
      </div>

      {/* Right - Detail */}
      <div className="rf-contacts__detail">
        {detailLoading ? (
          <div className="rf-empty"><div className="rf-spinner"><Loader size={20} /></div></div>
        ) : detail ? (
          <>
            <div className="rf-contacts__detail-header">
              {/* Logo with inline edit */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div className="rf-company-item__logo" style={{ width: 48, height: 48 }}>
                  {detail.logoUrl ? <img src={detail.logoUrl} alt="" /> : <Users size={20} style={{ color: 'var(--rf-text-faint)' }} />}
                </div>
                {!editingLogo && (
                  <button
                    className="rf-btn rf-btn--ghost rf-btn--icon"
                    style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, padding: 0, background: 'var(--rf-bg-surface)', border: '1px solid var(--rf-border)', borderRadius: '50%' }}
                    title="Edit logo URL"
                    onClick={() => { setLogoInput(detail.logoUrl || ''); setEditingLogo(true); }}
                  >
                    <Pencil size={10} />
                  </button>
                )}
              </div>

              {editingLogo ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--rf-sp-2)' }}>
                  <input className="rf-input" style={{ flex: 1 }} value={logoInput} onChange={e => setLogoInput(e.target.value)} placeholder="Logo URL" autoFocus onKeyDown={e => { if (e.key === 'Enter') saveGroupField('logoUrl', logoInput); if (e.key === 'Escape') setEditingLogo(false); }} />
                  <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => saveGroupField('logoUrl', logoInput)} disabled={savingGroupField}><Check size={14} /></button>
                  <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setEditingLogo(false)}><X size={14} /></button>
                </div>
              ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 'var(--rf-text-xl)', fontWeight: 700, fontFamily: 'var(--rf-font-display)' }}>{detail.companyName}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--rf-sp-3)', marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)' }}>{(detail.contacts || []).length} people</span>
                    {editingCareers ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--rf-sp-1)' }}>
                        <input
                          className="rf-input"
                          style={{ height: 26, fontSize: 'var(--rf-text-xs)', width: 220 }}
                          value={careersInput}
                          onChange={e => setCareersInput(e.target.value)}
                          placeholder="https://company.com/careers"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveGroupField('careersPageUrl', careersInput); if (e.key === 'Escape') setEditingCareers(false); }}
                        />
                        <button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={() => saveGroupField('careersPageUrl', careersInput)} disabled={savingGroupField}><Check size={12} /></button>
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingCareers(false)}><X size={12} /></button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {detail.careersPageUrl && (
                          <a href={detail.careersPageUrl} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-accent-text)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <ExternalLink size={10} />Careers
                          </a>
                        )}
                        <button
                          className="rf-btn rf-btn--ghost rf-btn--icon"
                          style={{ width: 20, height: 20, padding: 0 }}
                          title={detail.careersPageUrl ? 'Edit careers URL' : 'Add careers URL'}
                          onClick={() => { setCareersInput(detail.careersPageUrl || ''); setEditingCareers(true); }}
                        >
                          <Pencil size={10} />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              )}

              <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={deleteGroup}><Trash2 size={13} />Delete</button>
            </div>

            <div className="rf-contacts__detail-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--rf-sp-4)', flexWrap: 'wrap', gap: 'var(--rf-sp-2)' }}>
                <span style={{ fontSize: 'var(--rf-text-sm)', fontWeight: 600 }}>People</span>
                <div style={{ display: 'flex', gap: 'var(--rf-sp-2)', flexWrap: 'wrap' }}>
                  <input ref={csvFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCSVFile} />
                  <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => csvFileRef.current?.click()} title="Import contacts from CSV">
                    <Upload size={13} />Import
                  </button>
                  <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={exportCSV} disabled={!detail.contacts?.length} title="Export contacts to CSV">
                    <FileDown size={13} />Export
                  </button>
                  <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setBulkPasteText(''); setBulkPasteOpen(true); }}>
                    <ClipboardPaste size={13} />Paste
                  </button>
                  <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setEditingId('__new__'); setContactForm({ name: '', email: '', role: 'Recruiter', linkedin: '', connectionStatus: 'not_connected', email_status: 'tentative' }); }}>
                    <Plus size={13} />Add
                  </button>
                </div>
              </div>

              <table className="rf-contact-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Email Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {editingId === '__new__' && (
                    <tr style={{ background: 'var(--rf-bg-raised)' }}>
                      <td><input className="rf-input" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" autoFocus /></td>
                      <td><input className="rf-input" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" /></td>
                      <td>
                        <select className="rf-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="rf-select" value={contactForm.email_status} onChange={e => setContactForm(f => ({ ...f, email_status: e.target.value }))}>
                          {EMAIL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={saveContact} disabled={savingContact}><Check size={14} /></button>
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingId(null)}><X size={14} /></button>
                      </td>
                    </tr>
                  )}
                  {(detail.contacts || []).map(c => editingId === c.id ? (
                    <tr key={c.id} style={{ background: 'var(--rf-bg-raised)' }}>
                      <td><input className="rf-input" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} /></td>
                      <td><input className="rf-input" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></td>
                      <td>
                        <select className="rf-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="rf-select" value={contactForm.email_status} onChange={e => setContactForm(f => ({ ...f, email_status: e.target.value }))}>
                          {EMAIL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={saveContact} disabled={savingContact}><Check size={14} /></button>
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingId(null)}><X size={14} /></button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span>{c.name}</span>
                          {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" title="LinkedIn"><Linkedin size={11} style={{ color: 'var(--rf-accent-text)', flexShrink: 0 }} /></a>}
                          <button
                            className={`rf-copy-btn ${copiedField === `name-${c.id}` ? 'rf-copy-btn--copied' : ''}`}
                            title="Click: first name · Double-click: full name"
                            onClick={() => handleNameClick(c)}
                          >
                            <Copy size={11} />
                          </button>
                        </span>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span className="rf-truncate" style={{ maxWidth: 180 }}>{c.email}</span>
                          {c.email && (
                            <button className={`rf-copy-btn ${copiedField === `e-${c.id}` ? 'rf-copy-btn--copied' : ''}`} onClick={() => copyVal(c.email, `e-${c.id}`)}>
                              <Copy size={11} />
                            </button>
                          )}
                        </span>
                      </td>
                      <td><span className="rf-badge rf-badge--neutral">{c.role || '—'}</span></td>
                      <td><EmailStatusBadge status={c.email_status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => startEdit(c)}><Pencil size={13} /></button>
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => deleteContact(c.id)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                  {!(detail.contacts || []).length && editingId !== '__new__' && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--rf-text-muted)', padding: 'var(--rf-sp-6)' }}>No contacts yet. Click "Add" or "Paste" to get started.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="rf-empty">
            <div className="rf-empty__icon"><Users size={40} /></div>
            <div className="rf-empty__title">Select a company</div>
            <div className="rf-empty__desc">Choose a company from the left panel to view and manage contacts.</div>
          </div>
        )}
      </div>
    </div>
  );
}
