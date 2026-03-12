import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Pencil, Check, X, ChevronRight, Copy, Info } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS = ['', 'Recruiter', 'Hiring Manager', 'HR', 'Engineer', 'Designer', 'PM', 'Founder', 'Other'];
const CONNECTION_OPTIONS = [
    { value: '', label: '—' },
    { value: 'not_connected', label: 'Not Connected' },
    { value: 'pending', label: 'Pending' },
    { value: 'connected', label: 'Connected' },
];

function Tooltip({ content, children, className = '' }) {
    return (
        <span className={`gm-tooltip ${className}`.trim()} tabIndex={0}>
            {children}
            <span className="gm-tooltip__bubble" role="tooltip">{content}</span>
        </span>
    );
}

function TruncatedValue({ value, children, className = '' }) {
    const text = value || '—';
    return (
        <Tooltip content={text} className={`gm-truncate ${className}`.trim()}>
            <span className="gm-truncate__text">{children || text}</span>
        </Tooltip>
    );
}

export default function GroupManager({ open, onClose, authedFetch }) {
    /* ── state ── */
    const [groups, setGroups] = useState([]);
    const [view, setView] = useState('grid');           // 'grid' | 'detail'
    const [activeGroup, setActiveGroup] = useState(null); // full group object with contacts
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Create group
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newLogo, setNewLogo] = useState('');

    // Edit company info
    const [editingInfo, setEditingInfo] = useState(false);
    const [editName, setEditName] = useState('');
    const [editLogo, setEditLogo] = useState('');

    // Contact editing
    const [editingContactId, setEditingContactId] = useState(null); // contact id or '__new__'
    const [contactForm, setContactForm] = useState({ name: '', email: '', role: '', linkedin: '', connectionStatus: '', leftCompany: false, email_status: 'tentative' });

    // Unsaved changes tracking
    const [dirty, setDirty] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState(null); // null | { action: fn }

    // Bulk paste
    const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkRole, setBulkRole] = useState('');
    const [bulkParsed, setBulkParsed] = useState(null); // null | array
    const [bulkMessage, setBulkMessage] = useState('');
    const [copiedField, setCopiedField] = useState('');

    /* ── load groups ── */

    const loadGroups = useCallback(async () => {
        try {
            const r = await authedFetch(`${API_BASE}/api/groups`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setGroups(d);
        } catch (e) {
            setError(e.message);
        }
    }, [authedFetch]);

    const loadGroupDetail = useCallback(async (id) => {
        setLoading(true);
        try {
            const r = await authedFetch(`${API_BASE}/api/groups/${id}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setActiveGroup(d);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [authedFetch]);

    useEffect(() => {
        if (open) {
            loadGroups();
            setView('grid');
            setActiveGroup(null);
            setCreating(false);
            setEditingInfo(false);
            setEditingContactId(null);
            setDirty(false);
            setError('');
        }
    }, [open, loadGroups]);

    useEffect(() => {
        if (!copiedField) return;
        const timer = setTimeout(() => setCopiedField(''), 1200);
        return () => clearTimeout(timer);
    }, [copiedField]);

    /* ── navigation helpers ── */

    function guardNav(action) {
        if (dirty) {
            setConfirmDialog({ action });
        } else {
            action();
        }
    }

    function handleConfirm(choice) {
        if (choice === 'discard') {
            setDirty(false);
            setEditingInfo(false);
            setEditingContactId(null);
            confirmDialog?.action();
        }
        // 'cancel' just closes dialog
        setConfirmDialog(null);
    }

    function goGrid() {
        guardNav(() => {
            setView('grid');
            setActiveGroup(null);
            setEditingInfo(false);
            setEditingContactId(null);
            setDirty(false);
            loadGroups();
        });
    }

    function openGroup(groupId) {
        guardNav(async () => {
            setDirty(false);
            setEditingInfo(false);
            setEditingContactId(null);
            await loadGroupDetail(groupId);
            setView('detail');
        });
    }

    function handleClose() {
        guardNav(() => onClose());
    }

    /* ── group CRUD ── */

    async function createGroup() {
        if (!newName.trim()) return;
        try {
            const r = await authedFetch(`${API_BASE}/api/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyName: newName.trim(), logoUrl: newLogo.trim() }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setCreating(false);
            setNewName('');
            setNewLogo('');
            await loadGroups();
        } catch (e) {
            setError(e.message);
        }
    }

    async function deleteGroup() {
        if (!activeGroup) return;
        if (!window.confirm(`Delete "${activeGroup.companyName}" and all its contacts?`)) return;
        try {
            const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}`, { method: 'DELETE' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setView('grid');
            setActiveGroup(null);
            await loadGroups();
        } catch (e) {
            setError(e.message);
        }
    }

    /* ── company info edit ── */

    function startEditInfo() {
        setEditName(activeGroup.companyName);
        setEditLogo(activeGroup.logoUrl || '');
        setEditingInfo(true);
        setDirty(true);
    }

    async function saveInfo() {
        if (!editName.trim()) return;
        try {
            const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyName: editName.trim(), logoUrl: editLogo.trim() }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setActiveGroup(prev => ({ ...prev, companyName: d.companyName, logoUrl: d.logoUrl }));
            setEditingInfo(false);
            setDirty(false);
            loadGroups();
        } catch (e) {
            setError(e.message);
        }
    }

    function cancelEditInfo() {
        setEditingInfo(false);
        setDirty(false);
    }

    /* ── contact CRUD ── */

    function startAddContact() {
        setContactForm({ name: '', email: '', role: '', linkedin: '', connectionStatus: '', leftCompany: false, email_status: 'tentative' });
        setEditingContactId('__new__');
        setDirty(true);
    }

    function startEditContact(c) {
        setContactForm({
            name: c.name,
            email: c.email,
            role: c.role || '',
            linkedin: c.linkedin || '',
            connectionStatus: c.connectionStatus || '',
            leftCompany: !!c.leftCompany,
            email_status: c.email_status || 'tentative',
        });
        setEditingContactId(c.id);
        setDirty(true);
    }

    function cancelContactEdit() {
        setEditingContactId(null);
        setDirty(false);
    }

    async function saveContact() {
        if (!contactForm.name.trim() || !emailRegex.test(contactForm.email)) {
            setError('Name and valid email are required');
            return;
        }
        setError('');
        try {
            if (editingContactId === '__new__') {
                const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(contactForm),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Failed');
                setActiveGroup(prev => ({ ...prev, contacts: [d, ...prev.contacts] }));
            } else {
                const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts/${editingContactId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(contactForm),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Failed');
                setActiveGroup(prev => ({
                    ...prev,
                    contacts: prev.contacts.map(c => c.id === editingContactId ? d : c),
                }));
            }
            setEditingContactId(null);
            setDirty(false);
        } catch (e) {
            setError(e.message);
        }
    }

    async function deleteContact(contactId) {
        try {
            const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts/${contactId}`, { method: 'DELETE' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setActiveGroup(prev => ({
                ...prev,
                contacts: prev.contacts.filter(c => c.id !== contactId),
            }));
        } catch (e) {
            setError(e.message);
        }
    }

    /* ── bulk paste ── */

    function nameFromEmail(email) {
        const local = (email || '').split('@')[0].replace(/[0-9]/g, '').split(/[._\-+]+/).filter(Boolean);
        return local.length ? local.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Unknown';
    }

    function parseBulkText() {
        if (!bulkText.trim()) {
            setBulkMessage('No valid contacts detected. Please paste name and email pairs.');
            setBulkParsed([]);
            return;
        }
        const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
        const results = [];
        for (const line of lines) {
            // extract email
            const emailMatch = line.match(/([^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+)/);
            if (!emailMatch) continue;
            const email = emailMatch[1].toLowerCase();
            if (!emailRegex.test(email)) continue;
            // extract name = everything that's not the email, stripped of delimiters
            let name = line
                .replace(emailMatch[0], '')
                .replace(/[<>\-,;|]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!name) name = nameFromEmail(email);
            results.push({ name, email });
        }
        if (!results.length) {
            setBulkMessage('No valid contacts detected. Please paste name and email pairs.');
            setBulkParsed([]);
            return;
        }
        setBulkMessage('');
        setBulkParsed(results);
    }

    function removeBulkRow(idx) {
        setBulkParsed(prev => prev.filter((_, i) => i !== idx));
    }

    async function doBulkImport() {
        if (!bulkParsed || !bulkParsed.length) return;
        const existingEmails = new Set((activeGroup?.contacts || []).map(c => c.email.toLowerCase()));
        const unique = bulkParsed.filter(c => !existingEmails.has(c.email.toLowerCase()));
        const dupeCount = bulkParsed.length - unique.length;

        if (!unique.length) {
            setBulkMessage(`All ${bulkParsed.length} contacts are duplicates.`);
            return;
        }

        let addedCount = 0;
        const newContacts = [];
        for (const c of unique) {
            try {
                const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: c.name,
                        email: c.email,
                        role: bulkRole,
                        connectionStatus: 'not_connected',
                        leftCompany: false,
                        linkedin: '',
                    }),
                });
                const d = await r.json();
                if (r.ok) { newContacts.push(d); addedCount++; }
            } catch (_) { /* skip failures */ }
        }

        if (newContacts.length) {
            setActiveGroup(prev => ({ ...prev, contacts: [...newContacts, ...prev.contacts] }));
        }

        let msg = `Added ${addedCount} contact${addedCount !== 1 ? 's' : ''}.`;
        if (dupeCount > 0) msg += ` ${dupeCount} duplicate${dupeCount !== 1 ? 's' : ''} skipped.`;
        setBulkMessage(msg);
        setBulkParsed(null);
        setBulkText('');
        setBulkRole('');
        // Close panel after small delay so user sees the message
        setTimeout(() => { setBulkPasteOpen(false); setBulkMessage(''); }, 1800);
    }

    function closeBulkPaste() {
        setBulkPasteOpen(false);
        setBulkText('');
        setBulkRole('');
        setBulkParsed(null);
        setBulkMessage('');
    }


    function onCopyClick(e, key, value) {
        e.preventDefault();
        e.stopPropagation();
        if (!value) return;
        navigator.clipboard.writeText(value).then(() => {
            setCopiedField(key);
        }).catch(() => {
            setCopiedField('');
        });
    }

    function renderEmailStatus(status) {
        const normalized = ['verified', 'tentative', 'flagged'].includes(status) ? status : 'tentative';
        return <span className={`gm-pill gm-pill--${normalized}`}>{normalized.charAt(0).toUpperCase() + normalized.slice(1)}</span>;
    }

    function renderLastContacted(c) {
        if (!c.last_contacted_at || !c.last_contacted_via) return 'Last contacted: -';
        const d = new Date(c.last_contacted_at);
        if (Number.isNaN(d.getTime())) return 'Last contacted: -';
        const formatted = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
        const via = c.last_contacted_via === 'linkedin' ? 'LinkedIn' : 'Email';
        return `Last contacted: ${formatted} via ${via}`;
    }

    /* ── render guard ── */

    if (!open) return null;

    /* ── main popup ── */

    return (
        <>
            <div className="gm-overlay" onClick={handleClose} />
            <div className="gm-popup" onClick={e => e.stopPropagation()}>

                {error && <div className="gm-error">{error} <button className="gm-text-btn" onClick={() => setError('')}>✕</button></div>}

                {/* ────── VIEW: GROUPS GRID ────── */}
                {view === 'grid' && (
                    <>
                        <div className="gm-topbar">
                            <span className="gm-title">Groups</span>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="gm-text-btn" onClick={() => setCreating(true)}>Create Group</button>
                            </div>
                        </div>

                        {creating && (
                            <div className="gm-create-row">
                                <input className="gm-inp" placeholder="Company name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
                                <input className="gm-inp" placeholder="Logo URL (optional)" value={newLogo} onChange={e => setNewLogo(e.target.value)} />
                                <button className="gm-icon-btn gm-icon-btn--save" onClick={createGroup} title="Create"><Check size={16} /></button>
                                <button className="gm-icon-btn" onClick={() => { setCreating(false); setNewName(''); setNewLogo(''); }} title="Cancel"><X size={16} /></button>
                            </div>
                        )}

                        <div className="gm-grid">
                            {groups.length ? groups.map(g => (
                                <button key={g.id} className="gm-tile" onClick={() => openGroup(g.id)}>
                                    {g.logoUrl ? <img src={g.logoUrl} className="gm-tile-logo" alt="" /> : <span className="gm-tile-logo-placeholder" />}
                                    <span className="gm-tile-name">{g.companyName}</span>
                                </button>
                            )) : !creating && <p className="gm-muted">No groups yet. Create one to get started.</p>}
                        </div>
                    </>
                )}

                {/* ────── VIEW: GROUP DETAIL ────── */}
                {view === 'detail' && activeGroup && (
                    <>
                        {/* Breadcrumb row */}
                        <div className="gm-topbar">
                            <div className="gm-breadcrumb">
                                <button className="gm-text-btn" onClick={goGrid}>Groups</button>
                                <ChevronRight size={14} />
                                <span>{activeGroup.companyName}</span>
                            </div>
                            <button className="gm-text-btn gm-text-btn--danger" onClick={deleteGroup}>
                                <Trash2 size={14} /> Delete Group
                            </button>
                        </div>

                        {/* Company info row */}
                        <div className="gm-info-row">
                            {editingInfo ? (
                                <>
                                    <div className="gm-info-col">
                                        <label className="gm-label">Company Name</label>
                                        <input className="gm-inp" value={editName} onChange={e => setEditName(e.target.value)} />
                                    </div>
                                    <div className="gm-info-col">
                                        <label className="gm-label">Logo URL</label>
                                        <input className="gm-inp" value={editLogo} onChange={e => setEditLogo(e.target.value)} />
                                    </div>
                                    <div className="gm-info-col gm-info-col--preview">
                                        <label className="gm-label">Preview</label>
                                        <div className="gm-info-preview-wrap">
                                            {editLogo ? <img src={editLogo} className="gm-info-preview" alt="" /> : <span className="gm-muted">—</span>}
                                            <div className="gm-info-actions">
                                                <button className="gm-icon-btn gm-icon-btn--save" onClick={saveInfo} title="Save"><Check size={16} /></button>
                                                <button className="gm-icon-btn" onClick={cancelEditInfo} title="Cancel"><X size={16} /></button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="gm-info-col">
                                        <label className="gm-label">Company Name</label>
                                        <span className="gm-info-value">{activeGroup.companyName}</span>
                                    </div>
                                    <div className="gm-info-col">
                                        <label className="gm-label">Logo URL</label>
                                        <span className="gm-info-value gm-info-value--url">{activeGroup.logoUrl || '—'}</span>
                                    </div>
                                    <div className="gm-info-col gm-info-col--preview">
                                        <label className="gm-label">Preview</label>
                                        <div className="gm-info-preview-wrap">
                                            {activeGroup.logoUrl ? <img src={activeGroup.logoUrl} className="gm-info-preview" alt="" /> : <span className="gm-muted">—</span>}
                                            <button className="gm-icon-btn" onClick={startEditInfo} title="Edit"><Pencil size={14} /></button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Contacts section */}
                        <div className="gm-contacts-head">
                            <span className="gm-subtitle">People from {activeGroup.companyName} ({activeGroup.contacts.length})</span>
                            <div className="gm-action-group">
                                <button className="gm-text-btn" onClick={startAddContact}>Add Person</button>
                                <span className="gm-action-divider" aria-hidden="true" />
                                <button className="gm-text-btn" onClick={() => setBulkPasteOpen(true)}>Bulk Paste</button>
                            </div>
                        </div>

                        <div className="gm-table-wrap">
                            <div className="gm-grid-head">
                                <div>Name</div>
                                <div>Email</div>
                                <div>Role</div>
                                <div>LinkedIn</div>
                                <div>Status</div>
                                <div>
                                    <span className="gm-th-help">
                                        Left Company
                                        <Tooltip content="Person has left the company" className="gm-help-tooltip">
                                            <span className="gm-help-btn" aria-label="Person has left the company">
                                                <Info size={12} />
                                            </span>
                                        </Tooltip>
                                    </span>
                                </div>
                                <div style={{ textAlign: 'right' }}>Actions</div>
                            </div>

                            <div className="gm-grid-body">
                                {editingContactId === '__new__' && (
                                    <div className="gm-grid-row gm-row--editing">
                                        <div className="gm-cell"><input className="gm-inp" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" autoFocus /></div>
                                        <div className="gm-cell"><input className="gm-inp" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" /></div>
                                        <div className="gm-cell">
                                            <select className="gm-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                                                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                                            </select>
                                        </div>
                                        <div className="gm-cell"><input className="gm-inp" value={contactForm.linkedin} onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="LinkedIn URL" /></div>
                                        <div className="gm-cell">
                                            <select className="gm-select" value={contactForm.email_status} onChange={e => setContactForm(f => ({ ...f, email_status: e.target.value }))}>
                                                <option value="verified">Verified</option>
                                                <option value="tentative">Tentative</option>
                                                <option value="flagged">Flagged</option>
                                            </select>
                                        </div>
                                        <div className="gm-cell gm-left-cell"><input type="checkbox" checked={contactForm.leftCompany} onChange={e => setContactForm(f => ({ ...f, leftCompany: e.target.checked }))} /></div>
                                        <div className="gm-cell gm-row-actions">
                                            <button className="gm-icon-btn gm-icon-btn--save" onClick={saveContact} title="Save"><Check size={15} /></button>
                                            <button className="gm-icon-btn" onClick={cancelContactEdit} title="Cancel"><X size={15} /></button>
                                        </div>
                                    </div>
                                )}

                                {activeGroup.contacts.map(c => (
                                    editingContactId === c.id ? (
                                        <div key={c.id} className="gm-grid-row gm-row--editing">
                                            <div className="gm-cell"><input className="gm-inp" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} /></div>
                                            <div className="gm-cell"><input className="gm-inp" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></div>
                                            <div className="gm-cell">
                                                <select className="gm-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                                                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                                                </select>
                                            </div>
                                            <div className="gm-cell"><input className="gm-inp" value={contactForm.linkedin} onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="LinkedIn URL" /></div>
                                            <div className="gm-cell">
                                                <select className="gm-select" value={contactForm.email_status} onChange={e => setContactForm(f => ({ ...f, email_status: e.target.value }))}>
                                                    <option value="verified">Verified</option>
                                                    <option value="tentative">Tentative</option>
                                                    <option value="flagged">Flagged</option>
                                                </select>
                                            </div>
                                            <div className="gm-cell gm-left-cell"><input type="checkbox" checked={contactForm.leftCompany} onChange={e => setContactForm(f => ({ ...f, leftCompany: e.target.checked }))} /></div>
                                            <div className="gm-cell gm-row-actions">
                                                <button className="gm-icon-btn gm-icon-btn--save" onClick={saveContact} title="Save"><Check size={15} /></button>
                                                <button className="gm-icon-btn" onClick={cancelContactEdit} title="Cancel"><X size={15} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div key={c.id} className="gm-grid-row">
                                            <div className="gm-cell">
                                                <span className="gm-copy-wrap">
                                                    <TruncatedValue value={c.name} className="gm-copy-text">
                                                        {c.name}
                                                    </TruncatedValue>
                                                    <button className="gm-copy-btn" onClick={e => onCopyClick(e, `name-${c.id}`, c.name)} aria-label="Copy name" title={copiedField === `name-${c.id}` ? 'Copied' : 'Copy'}>
                                                        <Copy size={12} />
                                                    </button>
                                                    {copiedField === `name-${c.id}` && <span className="gm-copy-tip">Copied</span>}
                                                </span>
                                            </div>
                                            <div className="gm-cell">
                                                <span className="gm-copy-wrap">
                                                    <TruncatedValue value={c.email} className="gm-copy-text">
                                                        {c.email}
                                                    </TruncatedValue>
                                                    <button className="gm-copy-btn" onClick={e => onCopyClick(e, `email-${c.id}`, c.email)} aria-label="Copy email" title={copiedField === `email-${c.id}` ? 'Copied' : 'Copy'}>
                                                        <Copy size={12} />
                                                    </button>
                                                    {copiedField === `email-${c.id}` && <span className="gm-copy-tip">Copied</span>}
                                                </span>
                                            </div>
                                            <div className="gm-cell">
                                                <TruncatedValue value={c.role || '—'}>{c.role || '—'}</TruncatedValue>
                                            </div>
                                            <div className="gm-cell gm-td-url">
                                                {c.linkedin ? (
                                                    <span className="gm-copy-wrap">
                                                        <TruncatedValue value={c.linkedin} className="gm-copy-text">
                                                            <a href={c.linkedin} target="_blank" rel="noreferrer" className="gm-link-ellipsis">{c.linkedin}</a>
                                                        </TruncatedValue>
                                                        <button className="gm-copy-btn" onClick={e => onCopyClick(e, `linkedin-${c.id}`, c.linkedin)} aria-label="Copy LinkedIn URL" title={copiedField === `linkedin-${c.id}` ? 'Copied' : 'Copy'}>
                                                            <Copy size={12} />
                                                        </button>
                                                        {copiedField === `linkedin-${c.id}` && <span className="gm-copy-tip">Copied</span>}
                                                    </span>
                                                ) : '—'}
                                            </div>
                                            <div className="gm-cell">
                                                <div className="gm-meta-col">
                                                    {renderEmailStatus(c.email_status)}
                                                    <TruncatedValue value={renderLastContacted(c)} className="gm-meta-line gm-meta-tooltip">
                                                        {renderLastContacted(c)}
                                                    </TruncatedValue>
                                                    <span className="gm-meta-line">Contacted {Number.isFinite(c.contact_count) ? c.contact_count : 0} times</span>
                                                </div>
                                            </div>
                                            <div className="gm-cell gm-left-cell">{c.leftCompany ? 'Yes' : 'No'}</div>
                                            <div className="gm-cell gm-row-actions">
                                                <button className="gm-icon-btn" onClick={() => startEditContact(c)} title="Edit"><Pencil size={14} /></button>
                                                <button className="gm-icon-btn gm-icon-btn--danger" onClick={() => deleteContact(c.id)} title="Delete"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    )
                                ))}

                                {!activeGroup.contacts.length && editingContactId !== '__new__' && (
                                    <div className="gm-empty-row">No contacts yet. Click "+ Add Person" to add one.</div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {loading && <div className="gm-muted" style={{ textAlign: 'center', padding: 32 }}>Loading…</div>}
            </div>

            {/* Bulk Paste panel */}
            {bulkPasteOpen && (
                <>
                    <div className="gm-confirm-overlay" onClick={closeBulkPaste} />
                    <div className="gm-bulk-panel" onClick={e => e.stopPropagation()}>
                        <div className="gm-topbar">
                            <span className="gm-title">Bulk Paste Contacts</span>
                            <button className="gm-text-btn" onClick={closeBulkPaste}>Cancel</button>
                        </div>

                        {bulkMessage && <div className={bulkMessage.startsWith('Added') ? 'gm-bulk-success' : 'gm-bulk-warn'}>{bulkMessage}</div>}

                        {!bulkParsed ? (
                            <>
                                <textarea
                                    className="gm-bulk-textarea"
                                    rows={8}
                                    value={bulkText}
                                    onChange={e => setBulkText(e.target.value)}
                                    placeholder={'John Doe john@company.com\nJane Smith jane@company.com\nJohn Doe <john@company.com>\nJohn Doe - john@company.com'}
                                    autoFocus
                                />
                                <div className="gm-bulk-role-row">
                                    <label className="gm-label">Role for imported contacts</label>
                                    <select className="gm-select" value={bulkRole} onChange={e => setBulkRole(e.target.value)}>
                                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '— None —'}</option>)}
                                    </select>
                                </div>
                                <div className="gm-bulk-actions">
                                    <button className="btn btn--primary" onClick={parseBulkText} disabled={!bulkText.trim()}>Parse</button>
                                </div>
                            </>
                        ) : bulkParsed.length > 0 ? (
                            <>
                                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Parsed Contacts ({bulkParsed.length})</p>
                                <div className="gm-bulk-preview">
                                    {bulkParsed.map((c, i) => (
                                        <div key={i} className="gm-bulk-preview-row">
                                            <span className="gm-bulk-preview-name">{c.name}</span>
                                            <span className="gm-bulk-preview-email">{c.email}</span>
                                            <button className="gm-icon-btn gm-icon-btn--danger" onClick={() => removeBulkRow(i)} title="Remove"><X size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="gm-bulk-actions">
                                    <button className="gm-text-btn" onClick={() => { setBulkParsed(null); setBulkMessage(''); }}>Back</button>
                                    <button className="btn btn--primary" onClick={doBulkImport} disabled={!bulkParsed.length}>Add to Group</button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </>
            )}

            {/* Unsaved changes dialog */}
            {confirmDialog && (
                <div className="gm-confirm-overlay">
                    <div className="gm-confirm">
                        <p>You have unsaved changes.</p>
                        <div className="gm-confirm-actions">
                            <button className="gm-text-btn gm-text-btn--danger" onClick={() => handleConfirm('discard')}>Discard changes</button>
                            <button className="gm-text-btn" onClick={() => handleConfirm('cancel')}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
