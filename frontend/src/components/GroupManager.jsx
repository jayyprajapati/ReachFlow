import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Pencil, Check, X, ChevronRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS = ['', 'Recruiter', 'Hiring Manager', 'HR', 'Engineer', 'Designer', 'PM', 'Founder', 'Other'];
const CONNECTION_OPTIONS = [
    { value: '', label: '—' },
    { value: 'not_connected', label: 'Not Connected' },
    { value: 'pending', label: 'Pending' },
    { value: 'connected', label: 'Connected' },
];

export default function GroupManager({ open, onClose, authedFetch, onImport }) {
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
    const [contactForm, setContactForm] = useState({ name: '', email: '', role: '', linkedin: '', connectionStatus: '', leftCompany: false });

    // Unsaved changes tracking
    const [dirty, setDirty] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState(null); // null | { action: fn }

    // Import mode
    const [importMode, setImportMode] = useState(false);
    const [importStep, setImportStep] = useState(1);
    const [importGroupId, setImportGroupId] = useState(null);
    const [importRoles, setImportRoles] = useState([]);
    const [importGroup, setImportGroupData] = useState(null);

    // Bulk paste
    const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkRole, setBulkRole] = useState('');
    const [bulkParsed, setBulkParsed] = useState(null); // null | array
    const [bulkMessage, setBulkMessage] = useState('');

    const overlayRef = useRef(null);

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
            setImportMode(false);
            setImportStep(1);
            setImportGroupId(null);
            setImportRoles([]);
            setImportGroupData(null);
        }
    }, [open, loadGroups]);

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
        setContactForm({ name: '', email: '', role: '', linkedin: '', connectionStatus: '', leftCompany: false });
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

    /* ── import flow ── */

    async function handleImportSelectGroup(gId) {
        setImportGroupId(gId);
        try {
            const r = await authedFetch(`${API_BASE}/api/groups/${gId}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setImportGroupData(d);
            // collect unique roles
            const roles = [...new Set(d.contacts.map(c => c.role).filter(Boolean))];
            setImportRoles(roles.length ? roles : []);
            setImportStep(2);
        } catch (e) {
            setError(e.message);
        }
    }

    const [selectedImportRoles, setSelectedImportRoles] = useState([]);

    useEffect(() => {
        if (importStep === 2 && importRoles.length) {
            setSelectedImportRoles([...importRoles]);
        }
    }, [importStep, importRoles]);

    function toggleRole(role) {
        setSelectedImportRoles(prev =>
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
    }

    const importPreviewContacts = useMemo(() => {
        if (!importGroup) return [];
        if (!selectedImportRoles.length) return importGroup.contacts;
        return importGroup.contacts.filter(c => selectedImportRoles.includes(c.role) || !c.role);
    }, [importGroup, selectedImportRoles]);

    function doImport() {
        if (!importPreviewContacts.length) return;
        onImport(importPreviewContacts, importGroup);
        onClose();
    }

    /* ── render guard ── */

    if (!open) return null;

    /* ── import modal ── */

    if (importMode) {
        return (
            <div className="gm-overlay" onClick={() => setImportMode(false)}>
                <div className="gm-popup gm-popup--sm" onClick={e => e.stopPropagation()}>
                    <div className="gm-topbar">
                        <span className="gm-title">Import from Groups</span>
                        <button className="gm-text-btn" onClick={() => setImportMode(false)}>Cancel</button>
                    </div>

                    {importStep === 1 && (
                        <div className="gm-import-list">
                            {groups.length ? groups.map(g => (
                                <button key={g.id} className="gm-import-row" onClick={() => handleImportSelectGroup(g.id)}>
                                    {g.logoUrl && <img src={g.logoUrl} className="gm-tile-logo" alt="" />}
                                    <span>{g.companyName}</span>
                                    <span className="gm-muted">{g.contactCount} contacts</span>
                                </button>
                            )) : <p className="gm-muted">No groups yet.</p>}
                        </div>
                    )}

                    {importStep === 2 && importGroup && (
                        <div className="gm-import-step2">
                            <p className="gm-muted" style={{ marginBottom: 8 }}>Filter by role (optional)</p>
                            <div className="gm-role-chips">
                                {importRoles.length ? importRoles.map(role => (
                                    <button
                                        key={role}
                                        className={`gm-role-chip ${selectedImportRoles.includes(role) ? 'gm-role-chip--active' : ''}`}
                                        onClick={() => toggleRole(role)}
                                    >
                                        {role}
                                    </button>
                                )) : <span className="gm-muted">No roles assigned</span>}
                            </div>
                            <p style={{ margin: '12px 0', fontSize: 13 }}>
                                <strong>{importPreviewContacts.length}</strong> contact{importPreviewContacts.length !== 1 ? 's' : ''} will be imported
                            </p>
                            <div className="gm-import-actions">
                                <button className="gm-text-btn" onClick={() => { setImportStep(1); setImportGroupData(null); }}>Back</button>
                                <button className="btn btn--primary" onClick={doImport} disabled={!importPreviewContacts.length}>Import</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

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
                                {onImport && <button className="gm-text-btn" onClick={() => { setImportMode(true); setImportStep(1); setImportGroupId(null); setImportGroupData(null); }}>Import from Groups</button>}
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
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="gm-text-btn" onClick={startAddContact}>Add Person</button>
                                <button className="gm-text-btn" onClick={() => setBulkPasteOpen(true)}>Bulk Paste</button>
                            </div>
                        </div>

                        <div className="gm-table-wrap">
                            <table className="gm-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>LinkedIn</th>
                                        <th>Status</th>
                                        <th>Left</th>
                                        <th style={{ width: 60 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* New contact row */}
                                    {editingContactId === '__new__' && (
                                        <tr className="gm-row--editing">
                                            <td><input className="gm-inp" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" autoFocus /></td>
                                            <td><input className="gm-inp" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" /></td>
                                            <td>
                                                <select className="gm-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                                                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                                                </select>
                                            </td>
                                            <td><input className="gm-inp" value={contactForm.linkedin} onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="LinkedIn URL" /></td>
                                            <td>
                                                <select className="gm-select" value={contactForm.connectionStatus} onChange={e => setContactForm(f => ({ ...f, connectionStatus: e.target.value }))}>
                                                    {CONNECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            </td>
                                            <td><input type="checkbox" checked={contactForm.leftCompany} onChange={e => setContactForm(f => ({ ...f, leftCompany: e.target.checked }))} /></td>
                                            <td className="gm-row-actions">
                                                <button className="gm-icon-btn gm-icon-btn--save" onClick={saveContact} title="Save"><Check size={15} /></button>
                                                <button className="gm-icon-btn" onClick={cancelContactEdit} title="Cancel"><X size={15} /></button>
                                            </td>
                                        </tr>
                                    )}

                                    {activeGroup.contacts.map(c => (
                                        editingContactId === c.id ? (
                                            <tr key={c.id} className="gm-row--editing">
                                                <td><input className="gm-inp" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} /></td>
                                                <td><input className="gm-inp" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></td>
                                                <td>
                                                    <select className="gm-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                                                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                                                    </select>
                                                </td>
                                                <td><input className="gm-inp" value={contactForm.linkedin} onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="LinkedIn URL" /></td>
                                                <td>
                                                    <select className="gm-select" value={contactForm.connectionStatus} onChange={e => setContactForm(f => ({ ...f, connectionStatus: e.target.value }))}>
                                                        {CONNECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                </td>
                                                <td><input type="checkbox" checked={contactForm.leftCompany} onChange={e => setContactForm(f => ({ ...f, leftCompany: e.target.checked }))} /></td>
                                                <td className="gm-row-actions">
                                                    <button className="gm-icon-btn gm-icon-btn--save" onClick={saveContact} title="Save"><Check size={15} /></button>
                                                    <button className="gm-icon-btn" onClick={cancelContactEdit} title="Cancel"><X size={15} /></button>
                                                </td>
                                            </tr>
                                        ) : (
                                            <tr key={c.id}>
                                                <td>{c.name}</td>
                                                <td>{c.email}</td>
                                                <td>{c.role || '—'}</td>
                                                <td className="gm-td-url">{c.linkedin ? <a href={c.linkedin} target="_blank" rel="noreferrer" className="gm-text-btn">Link</a> : '—'}</td>
                                                <td>
                                                    {c.connectionStatus ? (
                                                        <span className={`gm-status gm-status--${c.connectionStatus}`}>
                                                            {CONNECTION_OPTIONS.find(o => o.value === c.connectionStatus)?.label || c.connectionStatus}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td>{c.leftCompany ? '✓' : ''}</td>
                                                <td className="gm-row-actions">
                                                    <button className="gm-icon-btn" onClick={() => startEditContact(c)} title="Edit"><Pencil size={14} /></button>
                                                    <button className="gm-icon-btn gm-icon-btn--danger" onClick={() => deleteContact(c.id)} title="Delete"><Trash2 size={14} /></button>
                                                </td>
                                            </tr>
                                        )
                                    ))}

                                    {!activeGroup.contacts.length && editingContactId !== '__new__' && (
                                        <tr><td colSpan={7} className="gm-muted" style={{ textAlign: 'center', padding: 20 }}>No contacts yet. Click "Add Person" to add one.</td></tr>
                                    )}
                                </tbody>
                            </table>
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
