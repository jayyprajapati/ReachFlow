import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import {
  Plus, Trash2, Pencil, Check, X, Copy, Search, Linkedin, ClipboardPaste,
  FileDown, Upload, ExternalLink, Loader, Users, Building2, Mail, ArrowUpRight,
  Send, Briefcase, Info,
} from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_OPTIONS = ['', 'Recruiter', 'Senior Recruiter', 'Hiring Manager', 'HR', 'Talent Acquisition', 'Engineering Manager', 'Director', 'VP', 'Other'];
const EMAIL_STATUS_OPTIONS = [
  { value: 'verified',  label: 'Valid' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'not_valid', label: 'Invalid' },
];

function EmailStatusBadge({ status }) {
  const map = {
    verified:  ['Valid', 'success'],
    tentative: ['Tentative', 'neutral'],
    not_valid: ['Invalid', 'error'],
  };
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
  const { path, navigateTo } = useRouter();

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
    } catch (e) {
      setNotice({ type: 'error', message: e.message });
      setDetail(null);
    } finally { setDetailLoading(false); }
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
      loadGroups();
      setCreating(false); setNewName(''); setNewLogo(''); setNewCareers('');
      openGroup(d.id);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setCreateBusy(false); }
  }

  async function deleteGroup() {
    if (!detail) return;
    setWarningDialog({
      title: `Delete "${detail.companyName}"?`,
      message: 'This deletes the company and every contact in it. Applications linked to this company will lose their company association but remain in your pipeline.',
      confirmText: 'Delete', intent: 'danger',
      onConfirm: async () => {
        try {
          await authedFetch(`${API}/api/groups/${detail.id}`, { method: 'DELETE' });
          loadGroups(); setDetail(null); setSelectedId(null);
          setNotice({ type: 'info', message: 'Company deleted' });
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
    setContactForm({
      name: c.name || '', email: c.email || '', role: c.role || '',
      linkedin: c.linkedin || '', connectionStatus: c.connectionStatus || 'not_connected',
      email_status: c.email_status || 'tentative',
    });
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
      title: 'Delete contact?', message: 'This cannot be undone.', confirmText: 'Delete', intent: 'danger',
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

  function composeToCompany() {
    if (!detail?.contacts?.length) {
      setNotice({ type: 'info', message: 'Add contacts first, then compose.' });
      return;
    }
    // Hand off via sessionStorage and the existing compose pre-fill mechanism.
    // We don't pre-fill recipients (Compose has Import Group); we just navigate
    // and surface a friendly nudge to import this group.
    sessionStorage.setItem('rf_compose_prefill_group', JSON.stringify({ groupId: detail.id, companyName: detail.companyName }));
    navigateTo('/compose');
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
          body: JSON.stringify({
            name: contact.name, email: contact.email || '', role: contact.role || '',
            linkedin: contact.linkedin || '', email_status: contact.email_status || 'tentative',
          }),
        });
        if (r.ok) { const d = await r.json(); setDetail(p => ({ ...p, contacts: [...(p?.contacts || []), d] })); added++; }
        else failed++;
      } catch { failed++; }
    }
    loadGroups();
    setNotice({
      type: added > 0 ? 'success' : 'error',
      message: `Added ${added} contact${added !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}`,
    });
    setBusy(false);
    onDone();
  }

  const bulkParsed = useMemo(() => parseBulkText(bulkPasteText), [bulkPasteText]);
  const isDupe = (item) => !!item.email && existingEmailsSet.has(item.email.toLowerCase());
  const bulkValid = bulkParsed.filter(p => p.name && !isDupe(p));
  const csvValid = (csvParsed || []).filter(p => p.name && !isDupe(p));

  /* ── Render ────────────────────────────────────────────── */

  const totalContacts = useMemo(() => groups.reduce((sum, g) => sum + (g.contactCount || 0), 0), [groups]);

  return (
    <div className="rf-page rf-page--wide rf-contacts-page">
      <header className="rf-page-header">
        <div className="rf-page-header__lead">
          <div className="rf-page-header__eyebrow"><DotMark /> Contacts</div>
          <h1 className="rf-page-header__title">Companies & contacts</h1>
          <p className="rf-page-header__subtitle">
            Group HR, recruiters, and hiring managers by company. Import groups straight into Compose, or jump to your applications for any company.
          </p>
        </div>
        <div className="rf-page-header__actions">
          <span style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)' }}>
            <span className="rf-num" style={{ color: 'var(--rf-text)', fontWeight: 600 }}>{groups.length}</span> companies · <span className="rf-num" style={{ color: 'var(--rf-text)', fontWeight: 600 }}>{totalContacts}</span> contacts
          </span>
          <button
            className="rf-btn rf-btn--primary rf-btn--sm"
            onClick={() => { setCreating(true); setNewName(''); setNewLogo(''); setNewCareers(''); }}
          >
            <Plus size={14} /> New company
          </button>
        </div>
      </header>

      <div className="rf-ct">
        {/* Left pane — companies */}
        <aside className="rf-ct__sidebar">
          <div className="rf-ct__sidebar-head">
            <div className="rf-search">
              <Search size={14} className="rf-search__icon" />
              <input
                className="rf-search__input"
                placeholder="Search companies…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {creating && (
            <div className="rf-ct__creator">
              <input className="rf-input rf-input--sm" placeholder="Company name (required)" value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) createGroup(); if (e.key === 'Escape') setCreating(false); }}
              />
              <input className="rf-input rf-input--sm" placeholder="Logo URL (optional)" value={newLogo} onChange={e => setNewLogo(e.target.value)} />
              <input className="rf-input rf-input--sm" placeholder="Careers page URL (optional)" value={newCareers} onChange={e => setNewCareers(e.target.value)} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={createGroup} disabled={createBusy || !newName.trim()}>
                  {createBusy ? <Loader size={13} className="rf-spin" /> : <Check size={13} />} Create
                </button>
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setCreating(false)}>
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          )}

          <div className="rf-ct__sidebar-scroll">
            {filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-sm)' }}>
                {search.trim() ? `No companies match "${search}"` : 'No companies yet. Click New company to get started.'}
              </div>
            ) : filtered.map(g => (
              <button
                key={g.id}
                className={`rf-ct__company${selectedId === g.id ? ' rf-ct__company--active' : ''}`}
                onClick={() => { openGroup(g.id); navigateTo(`/contacts/${g.id}`); }}
              >
                <span className="rf-ct__company-logo">
                  {g.logoUrl ? <img src={g.logoUrl} alt="" /> : <Building2 size={14} />}
                </span>
                <span className="rf-ct__company-body">
                  <span className="rf-ct__company-name">{g.companyName}</span>
                  <span className="rf-ct__company-meta">{g.contactCount || 0} contact{(g.contactCount || 0) === 1 ? '' : 's'}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Right pane — detail */}
        <section className="rf-ct__detail">
          {detailLoading ? (
            <div className="rf-empty"><Loader size={20} className="rf-spin" /></div>
          ) : !detail ? (
            <div className="rf-empty">
              <Users size={28} className="rf-empty__icon" />
              <div className="rf-empty__title">{groups.length === 0 ? 'Create your first company' : 'Select a company'}</div>
              <p className="rf-empty__desc">
                {groups.length === 0
                  ? 'Companies hold your recruiter and HR contacts. Group them so you can import an entire team into a Compose campaign with one click.'
                  : 'Pick a company on the left to see and edit its contacts. You can also import contacts in bulk via CSV or paste.'}
              </p>
            </div>
          ) : (
            <>
              <header className="rf-ct__detail-head">
                <div className="rf-ct__logo">
                  {detail.logoUrl
                    ? <img src={detail.logoUrl} alt="" />
                    : <Building2 size={22} />}
                  {!editingLogo && (
                    <button
                      className="rf-ct__logo-edit"
                      title="Edit logo URL"
                      onClick={() => { setLogoInput(detail.logoUrl || ''); setEditingLogo(true); }}
                    ><Pencil size={10} /></button>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingLogo ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="rf-input rf-input--sm"
                        value={logoInput}
                        onChange={e => setLogoInput(e.target.value)}
                        placeholder="Logo URL"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveGroupField('logoUrl', logoInput); if (e.key === 'Escape') setEditingLogo(false); }}
                      />
                      <button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={() => saveGroupField('logoUrl', logoInput)} disabled={savingGroupField}><Check size={13} /></button>
                      <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingLogo(false)}><X size={13} /></button>
                    </div>
                  ) : (
                    <>
                      <h2 className="rf-ct__title">{detail.companyName}</h2>
                      <div className="rf-ct__meta">
                        <span><span className="rf-num">{(detail.contacts || []).length}</span> people</span>
                        <span className="rf-ct__meta-dot">·</span>
                        {editingCareers ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              className="rf-input rf-input--sm"
                              style={{ width: 220 }}
                              value={careersInput}
                              onChange={e => setCareersInput(e.target.value)}
                              placeholder="https://company.com/careers"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') saveGroupField('careersPageUrl', careersInput); if (e.key === 'Escape') setEditingCareers(false); }}
                            />
                            <button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={() => saveGroupField('careersPageUrl', careersInput)} disabled={savingGroupField}><Check size={12} /></button>
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingCareers(false)}><X size={12} /></button>
                          </span>
                        ) : detail.careersPageUrl ? (
                          <a href={detail.careersPageUrl} target="_blank" rel="noreferrer" className="rf-ct__link" title="Open careers page">
                            <ExternalLink size={11} /> Careers page
                            <button
                              className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm"
                              style={{ width: 18, height: 18 }}
                              onClick={(e) => { e.preventDefault(); setCareersInput(detail.careersPageUrl || ''); setEditingCareers(true); }}
                              title="Edit URL"
                            ><Pencil size={10} /></button>
                          </a>
                        ) : (
                          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setCareersInput(''); setEditingCareers(true); }}>
                            <Plus size={11} /> Careers page
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="rf-ct__detail-actions">
                  <button
                    className="rf-btn rf-btn--secondary rf-btn--sm"
                    onClick={() => navigateTo(`/pipeline?company=${encodeURIComponent(detail.companyName)}`)}
                    title="See applications at this company"
                  >
                    <Briefcase size={13} /> View pipeline
                  </button>
                  <button
                    className="rf-btn rf-btn--primary rf-btn--sm"
                    onClick={composeToCompany}
                    disabled={!(detail.contacts || []).length}
                    title={(detail.contacts || []).length ? 'Open Compose, then import this group' : 'Add contacts first'}
                  >
                    <Send size={13} /> Compose to group
                  </button>
                  <button
                    className="rf-btn rf-btn--danger rf-btn--icon rf-btn--sm"
                    onClick={deleteGroup}
                    title="Delete company"
                  ><Trash2 size={13} /></button>
                </div>
              </header>

              <div className="rf-ct__detail-body">
                <div className="rf-ct__people-head">
                  <div className="rf-ct__people-title">
                    <span>People</span>
                    {(detail.contacts || []).length > 0 && (
                      <span className="rf-ct__people-count rf-num">{detail.contacts.length}</span>
                    )}
                  </div>
                  <div className="rf-ct__people-actions">
                    <input ref={csvFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCSVFile} />
                    <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => csvFileRef.current?.click()} title="Import from CSV (Name,Email,Role,LinkedIn,…)">
                      <Upload size={13} /> Import CSV
                    </button>
                    <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={exportCSV} disabled={!detail.contacts?.length}>
                      <FileDown size={13} /> Export
                    </button>
                    <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setBulkPasteText(''); setBulkPasteOpen(true); }}>
                      <ClipboardPaste size={13} /> Paste
                    </button>
                    <button
                      className="rf-btn rf-btn--primary rf-btn--sm"
                      onClick={() => { setEditingId('__new__'); setContactForm({ name: '', email: '', role: 'Recruiter', linkedin: '', connectionStatus: 'not_connected', email_status: 'tentative' }); }}
                    >
                      <Plus size={13} /> Add contact
                    </button>
                  </div>
                </div>

                <div className="rf-ct__table-wrap">
                  <table className="rf-ct__table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th style={{ width: 180 }}>Role</th>
                        <th style={{ width: 130 }}>Email status</th>
                        <th style={{ width: 80, textAlign: 'right' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingId === '__new__' && (
                        <tr className="rf-ct__table-edit">
                          <td>
                            <input className="rf-input rf-input--sm" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" autoFocus />
                          </td>
                          <td>
                            <input className="rf-input rf-input--sm" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="email@company.com" />
                          </td>
                          <td>
                            <select className="rf-select rf-input--sm" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="rf-select rf-input--sm" value={contactForm.email_status} onChange={e => setContactForm(f => ({ ...f, email_status: e.target.value }))}>
                              {EMAIL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={saveContact} disabled={savingContact}>
                              {savingContact ? <Loader size={13} className="rf-spin" /> : <Check size={13} />}
                            </button>
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingId(null)}><X size={13} /></button>
                          </td>
                        </tr>
                      )}
                      {(detail.contacts || []).map(c => editingId === c.id ? (
                        <tr key={c.id} className="rf-ct__table-edit">
                          <td><input className="rf-input rf-input--sm" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} /></td>
                          <td><input className="rf-input rf-input--sm" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></td>
                          <td>
                            <select className="rf-select rf-input--sm" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="rf-select rf-input--sm" value={contactForm.email_status} onChange={e => setContactForm(f => ({ ...f, email_status: e.target.value }))}>
                              {EMAIL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={saveContact} disabled={savingContact}>
                              {savingContact ? <Loader size={13} className="rf-spin" /> : <Check size={13} />}
                            </button>
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingId(null)}><X size={13} /></button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={c.id}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 600 }}>{c.name || <em style={{ color: 'var(--rf-text-faint)' }}>Unnamed</em>}</span>
                              {c.linkedin && (
                                <a href={c.linkedin} target="_blank" rel="noreferrer" title="LinkedIn">
                                  <Linkedin size={12} style={{ color: 'var(--rf-info-text)' }} />
                                </a>
                              )}
                              {c.name && (
                                <button
                                  className={`rf-copy-btn ${copiedField === `name-${c.id}` ? 'rf-copy-btn--copied' : ''}`}
                                  title="Click: first name · Double-click: full name"
                                  onClick={() => handleNameClick(c)}
                                ><Copy size={11} /></button>
                              )}
                            </span>
                          </td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span className="rf-truncate" style={{ maxWidth: 240 }}>{c.email || <em style={{ color: 'var(--rf-text-faint)' }}>—</em>}</span>
                              {c.email && (
                                <button
                                  className={`rf-copy-btn ${copiedField === `e-${c.id}` ? 'rf-copy-btn--copied' : ''}`}
                                  onClick={() => copyVal(c.email, `e-${c.id}`)}
                                  title="Copy email"
                                ><Copy size={11} /></button>
                              )}
                            </span>
                          </td>
                          <td><span className="rf-badge rf-badge--neutral">{c.role || '—'}</span></td>
                          <td><EmailStatusBadge status={c.email_status} /></td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => startEdit(c)} title="Edit"><Pencil size={13} /></button>
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => deleteContact(c.id)} title="Delete"><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                      {!(detail.contacts || []).length && editingId !== '__new__' && (
                        <tr>
                          <td colSpan={5} style={{ padding: 36 }}>
                            <div className="rf-empty" style={{ padding: 0 }}>
                              <Mail size={22} className="rf-empty__icon" />
                              <div className="rf-empty__title">No contacts yet at {detail.companyName}</div>
                              <p className="rf-empty__desc">Add HR, recruiters, or hiring managers — then import the whole group into a Compose campaign.</p>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  className="rf-btn rf-btn--primary rf-btn--sm"
                                  onClick={() => { setEditingId('__new__'); setContactForm({ name: '', email: '', role: 'Recruiter', linkedin: '', connectionStatus: 'not_connected', email_status: 'tentative' }); }}
                                >
                                  <Plus size={13} /> Add a contact
                                </button>
                                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setBulkPasteText(''); setBulkPasteOpen(true); }}>
                                  <ClipboardPaste size={13} /> Paste bulk
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Bulk paste modal */}
      {bulkPasteOpen && (
        <div className="rf-dialog-overlay" onClick={() => !bulkAdding && setBulkPasteOpen(false)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="rf-dialog__title"><ClipboardPaste size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} /> Bulk paste contacts</div>
            <div className="rf-dialog__body">
              <p className="rf-help" style={{ marginTop: 0 }}>
                One contact per line. Formats accepted: <code>Name, email</code>, <code>Name &lt;email&gt;</code>, or just an email.
              </p>
              <textarea
                className="rf-textarea"
                style={{ fontFamily: 'var(--rf-font-mono)', fontSize: 13, minHeight: 140 }}
                placeholder={"John Smith, john@company.com\nJane Doe <jane@corp.io>\nalice@example.com"}
                value={bulkPasteText}
                onChange={e => setBulkPasteText(e.target.value)}
              />
              {bulkParsed.length > 0 && (
                <div className="rf-bulk-preview" style={{ marginTop: 12 }}>
                  {bulkParsed.map((p, i) => (
                    <div key={i} className={`rf-bulk-row${isDupe(p) ? ' rf-bulk-row--dupe' : ''}`}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{p.name || <span style={{ color: 'var(--rf-text-faint)' }}>—</span>}</span>
                      <span style={{ flex: 1, color: 'var(--rf-text-muted)' }}>{p.email}</span>
                      {isDupe(p)         && <span className="rf-badge rf-badge--neutral">duplicate</span>}
                      {!p.name && !isDupe(p) && <span className="rf-badge rf-badge--warning">no name</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rf-dialog__actions">
              <span style={{ marginRight: 'auto', fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)' }}>
                {bulkValid.length} ready to add
              </span>
              <button className="rf-btn rf-btn--ghost" onClick={() => setBulkPasteOpen(false)} disabled={bulkAdding}>Cancel</button>
              <button
                className="rf-btn rf-btn--primary"
                onClick={() => addParsedContacts(bulkParsed, setBulkAdding, () => { setBulkPasteOpen(false); setBulkPasteText(''); })}
                disabled={bulkAdding || !bulkValid.length}
              >
                {bulkAdding ? <Loader size={14} className="rf-spin" /> : <Check size={14} />}
                Add {bulkValid.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV preview modal */}
      {csvParsed !== null && (
        <div className="rf-dialog-overlay" onClick={() => !csvAdding && setCsvParsed(null)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="rf-dialog__title"><Upload size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} /> Import CSV — preview</div>
            <div className="rf-dialog__body">
              {!csvParsed.length ? (
                <div className="rf-empty">
                  <Info size={20} className="rf-empty__icon" />
                  <div className="rf-empty__title">No contacts found</div>
                  <p className="rf-empty__desc">The file looks empty. Expected columns: Name, Email, Role, LinkedIn, Connection, Email Status.</p>
                </div>
              ) : (
                <div className="rf-bulk-preview">
                  {csvParsed.map((p, i) => (
                    <div key={i} className={`rf-bulk-row${isDupe(p) ? ' rf-bulk-row--dupe' : ''}`}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{p.name || <span style={{ color: 'var(--rf-text-faint)' }}>—</span>}</span>
                      <span style={{ flex: 1, color: 'var(--rf-text-muted)' }}>{p.email}</span>
                      {p.role && <span style={{ fontSize: 12, color: 'var(--rf-text-faint)' }}>{p.role}</span>}
                      {isDupe(p) && <span className="rf-badge rf-badge--neutral">duplicate</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rf-dialog__actions">
              <span style={{ marginRight: 'auto', fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)' }}>
                {csvValid.length} ready to add
              </span>
              <button className="rf-btn rf-btn--ghost" onClick={() => setCsvParsed(null)} disabled={csvAdding}>Cancel</button>
              <button
                className="rf-btn rf-btn--primary"
                onClick={() => addParsedContacts(csvParsed, setCsvAdding, () => setCsvParsed(null))}
                disabled={csvAdding || !csvValid.length}
              >
                {csvAdding ? <Loader size={14} className="rf-spin" /> : <Check size={14} />}
                Add {csvValid.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DotMark() {
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--rf-accent)', display: 'inline-block' }} />;
}
