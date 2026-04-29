import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import { Plus, Trash2, Pencil, Check, X, Copy, Search, Linkedin, Mail, ClipboardPaste, FileDown, ChevronRight, Loader, Users } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_OPTIONS = ['', 'Recruiter', 'Senior Recruiter', 'Hiring Manager', 'HR', 'Talent Acquisition', 'Engineering Manager', 'Director', 'VP', 'Other'];

function StatusDot({ ok }) { return <span className={`rf-dot rf-dot--${ok ? 'success' : 'muted'}`} />; }

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
  const [createBusy, setCreateBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [contactForm, setContactForm] = useState({});
  const [savingContact, setSavingContact] = useState(false);
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { if (copiedField) { const t = setTimeout(() => setCopiedField(''), 1200); return () => clearTimeout(t); } }, [copiedField]);

  // Auto-select from URL
  useEffect(() => {
    const m = path.match(/^\/contacts\/(.+)$/);
    if (m && m[1]) { openGroup(m[1]); }
  }, [path]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g => g.companyName?.toLowerCase().includes(q));
  }, [groups, search]);

  async function openGroup(id) {
    setSelectedId(id); setDetailLoading(true); setEditingId(null);
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
      const r = await authedFetch(`${API}/api/groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyName: newName.trim(), logoUrl: newLogo.trim() }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      loadGroups(); setCreating(false); setNewName(''); setNewLogo(''); openGroup(d.id);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setCreateBusy(false); }
  }

  async function deleteGroup() {
    if (!detail) return;
    setWarningDialog({ title: `Delete "${detail.companyName}"?`, message: 'This deletes the group and all contacts.', confirmText: 'Delete', intent: 'danger', onConfirm: async () => {
      try { await authedFetch(`${API}/api/groups/${detail.id}`, { method: 'DELETE' }); loadGroups(); setDetail(null); setSelectedId(null); }
      catch (e) { setNotice({ type: 'error', message: e.message }); }
    }});
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
    setWarningDialog({ title: 'Delete contact?', message: 'Cannot be undone.', confirmText: 'Delete', intent: 'danger', onConfirm: async () => {
      try { await authedFetch(`${API}/api/groups/${detail.id}/contacts/${cid}`, { method: 'DELETE' }); setDetail(p => ({ ...p, contacts: (p?.contacts || []).filter(c => c.id !== cid) })); loadGroups(); }
      catch (e) { setNotice({ type: 'error', message: e.message }); }
    }});
  }

  function copyVal(text, key) { navigator.clipboard.writeText(text).then(() => setCopiedField(key)); }

  return (
    <div className="rf-contacts">
      {/* Left - Company list */}
      <div className="rf-contacts__list">
        <div className="rf-contacts__list-header">
          <h2 style={{ fontSize: 'var(--rf-text-lg)', fontWeight: 700, fontFamily: 'var(--rf-font-display)' }}>Companies</h2>
          <div className="rf-search"><Search size={14} className="rf-search__icon" /><input className="rf-search__input" placeholder="Search companies…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <button className="rf-btn rf-btn--primary rf-btn--sm" style={{ width: '100%' }} onClick={() => { setCreating(true); setNewName(''); setNewLogo(''); }}><Plus size={14} />New Company</button>
          {creating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
              <input className="rf-input" placeholder="Company name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
              <input className="rf-input" placeholder="Logo URL (optional)" value={newLogo} onChange={e => setNewLogo(e.target.value)} />
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
              <div className="rf-company-item__logo">{g.logoUrl ? <img src={g.logoUrl} alt="" /> : <Users size={16} style={{ color: 'var(--rf-text-faint)' }} />}</div>
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
              <div className="rf-company-item__logo" style={{ width: 48, height: 48 }}>{detail.logoUrl ? <img src={detail.logoUrl} alt="" /> : <Users size={20} style={{ color: 'var(--rf-text-faint)' }} />}</div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 'var(--rf-text-xl)', fontWeight: 700, fontFamily: 'var(--rf-font-display)' }}>{detail.companyName}</h2>
                <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)' }}>{(detail.contacts || []).length} people</p>
              </div>
              <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={deleteGroup}><Trash2 size={13} />Delete</button>
            </div>
            <div className="rf-contacts__detail-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--rf-sp-4)' }}>
                <span style={{ fontSize: 'var(--rf-text-sm)', fontWeight: 600 }}>People</span>
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setEditingId('__new__'); setContactForm({ name: '', email: '', role: 'Recruiter', linkedin: '', connectionStatus: 'not_connected', email_status: 'tentative' }); }}><Plus size={13} />Add Person</button>
              </div>
              <table className="rf-contact-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {editingId === '__new__' && (
                    <tr style={{ background: 'var(--rf-bg-raised)' }}>
                      <td><input className="rf-input" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" autoFocus /></td>
                      <td><input className="rf-input" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" /></td>
                      <td><select className="rf-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>{ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}</select></td>
                      <td><StatusDot ok={contactForm.email_status === 'verified'} /></td>
                      <td style={{ textAlign: 'right' }}><button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={saveContact} disabled={savingContact}><Check size={14} /></button><button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingId(null)}><X size={14} /></button></td>
                    </tr>
                  )}
                  {(detail.contacts || []).map(c => editingId === c.id ? (
                    <tr key={c.id} style={{ background: 'var(--rf-bg-raised)' }}>
                      <td><input className="rf-input" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} /></td>
                      <td><input className="rf-input" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></td>
                      <td><select className="rf-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>{ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}</select></td>
                      <td><StatusDot ok={contactForm.email_status === 'verified'} /></td>
                      <td style={{ textAlign: 'right' }}><button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={saveContact} disabled={savingContact}><Check size={14} /></button><button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingId(null)}><X size={14} /></button></td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{c.name}{c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer"><Linkedin size={11} style={{ color: 'var(--rf-accent-text)' }} /></a>}</span></td>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span className="rf-truncate" style={{ maxWidth: 180 }}>{c.email}</span><button className={`rf-copy-btn ${copiedField === `e-${c.id}` ? 'rf-copy-btn--copied' : ''}`} onClick={() => copyVal(c.email, `e-${c.id}`)}><Copy size={11} /></button></span></td>
                      <td><span className="rf-badge rf-badge--neutral">{c.role || '—'}</span></td>
                      <td><StatusDot ok={c.email_status === 'verified'} /></td>
                      <td style={{ textAlign: 'right' }}><button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => startEdit(c)}><Pencil size={13} /></button><button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => deleteContact(c.id)}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                  {!(detail.contacts || []).length && editingId !== '__new__' && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--rf-text-muted)', padding: 'var(--rf-sp-6)' }}>No contacts. Click "Add Person" to add one.</td></tr>}
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
