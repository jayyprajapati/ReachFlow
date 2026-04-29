import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { Plus, Trash2, Copy, Loader, LayoutGrid, List, Check, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const STATUS_COLS = [
  { key:'applied', label:'Applied', color:'var(--rf-status-applied)' },
  { key:'oa', label:'OA', color:'var(--rf-status-oa)' },
  { key:'interviewing', label:'Interviewing', color:'var(--rf-status-interviewing)' },
  { key:'offer', label:'Offer', color:'var(--rf-status-offer)' },
  { key:'rejected', label:'Rejected', color:'var(--rf-status-rejected)' },
  { key:'ghosted', label:'Ghosted', color:'var(--rf-status-ghosted)' },
  { key:'on_hold', label:'On Hold', color:'var(--rf-status-onhold)' },
];

function parseApplicationBlock(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  for (const line of lines) {
    const parts = line.split(/[|\t]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 1) {
      const title = parts[0] || '';
      const jobId = parts[1] || '';
      const company = parts[2] || '';
      results.push({ jobTitle: title, jobId, companyName: company, status: 'applied', appliedDate: new Date().toISOString().split('T')[0] });
    }
  }
  return results;
}

function normalizeCompanyKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default function PipelinePage() {
  const { authedFetch, setNotice, setWarningDialog, groups, loadGroups } = useApp();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rawInput, setRawInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [viewMode, setViewMode] = useState('kanban');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [dragId, setDragId] = useState(null);
  const [copiedId, setCopiedId] = useState('');
  const [addingCompanyForId, setAddingCompanyForId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [companyBusyId, setCompanyBusyId] = useState('');

  const hdrs = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  useEffect(() => { loadApps(); loadGroups(); }, []);
  useEffect(() => { if (copiedId) { const t = setTimeout(() => setCopiedId(''), 1500); return () => clearTimeout(t); } }, [copiedId]);

  async function loadApps() {
    setLoading(true);
    try {
      const r = await authedFetch(`${API_BASE_URL}/api/applications`);
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setApps(Array.isArray(d) ? d : []);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  }

  async function addApplications() {
    if (!rawInput.trim()) return;
    setParsing(true);
    try {
      const parsed = parseApplicationBlock(rawInput).map(app => {
        const group = findGroupByName(app.companyName);
        return group ? { ...app, companyGroupId: group.id, companyName: group.companyName } : app;
      });
      if (!parsed.length) { setNotice({ type: 'error', message: 'No valid applications found' }); return; }
      for (const app of parsed) {
        const r = await authedFetch(`${API_BASE_URL}/api/applications`, { method: 'POST', headers: hdrs, body: JSON.stringify(app) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
        setApps(p => [d, ...p]);
      }
      setRawInput(''); setNotice({ type: 'success', message: `Added ${parsed.length} applications` }); setInputOpen(false);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setParsing(false); }
  }

  async function updateStatus(id, status) {
    try {
      const r = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, { method: 'PATCH', headers: hdrs, body: JSON.stringify({ status }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setApps(p => p.map(a => a.id === id ? { ...a, ...d } : a));
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
  }

  async function updateCompany(id, groupId) {
    if (!id || companyBusyId) return;
    setCompanyBusyId(id);
    try {
      const r = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, {
        method: 'PATCH',
        headers: hdrs,
        body: JSON.stringify({ companyGroupId: groupId || null, companyNameSnapshot: groupId ? undefined : '' }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setApps(p => p.map(a => a.id === id ? { ...a, ...d } : a));
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setCompanyBusyId(''); }
  }

  async function createCompanyForApp(id) {
    const name = newCompanyName.trim();
    if (!name || !id || companyBusyId) return;
    const existing = findGroupByName(name);
    if (existing) {
      await updateCompany(id, existing.id);
      setAddingCompanyForId('');
      setNewCompanyName('');
      return;
    }
    setCompanyBusyId(id);
    try {
      const r = await authedFetch(`${API_BASE_URL}/api/groups`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ companyName: name }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to create company');
      await loadGroups();
      const ar = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, {
        method: 'PATCH',
        headers: hdrs,
        body: JSON.stringify({ companyGroupId: d.id }),
      });
      const appData = await ar.json(); if (!ar.ok) throw new Error(appData.error || 'Failed to update application');
      setApps(p => p.map(a => a.id === id ? { ...a, ...appData } : a));
      setAddingCompanyForId('');
      setNewCompanyName('');
      setNotice({ type: 'success', message: 'Company added to contacts' });
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setCompanyBusyId(''); }
  }

  async function deleteApp(id) {
    setWarningDialog({ title: 'Delete application?', message: 'This cannot be undone.', confirmText: 'Delete', intent: 'danger', onConfirm: async () => {
      try { const r = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, { method: 'DELETE' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setApps(p => p.filter(a => a.id !== id)); setNotice({ type: 'info', message: 'Deleted' }); }
      catch (e) { setNotice({ type: 'error', message: e.message }); }
    }});
  }

  function copyText(text, id) { navigator.clipboard.writeText(text).then(() => setCopiedId(id)); }

  function onDragStart(e, id) { setDragId(id); e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function onDrop(e, status) { e.preventDefault(); if (dragId) { updateStatus(dragId, status); setDragId(null); } }

  const companyOptions = useMemo(
    () => [...groups].sort((a, b) => String(a.companyName || '').localeCompare(String(b.companyName || ''))),
    [groups]
  );
  const groupById = useMemo(() => new Map(groups.map(g => [String(g.id), g])), [groups]);
  const groupByKey = useMemo(() => new Map(groups.map(g => [normalizeCompanyKey(g.companyName), g])), [groups]);

  function findGroupByName(name) {
    return groupByKey.get(normalizeCompanyKey(name));
  }

  function getCompanyName(app) {
    const linked = app?.companyGroupId ? groupById.get(String(app.companyGroupId)) : null;
    return linked?.companyName || app?.companyNameSnapshot || app?.companyName || '';
  }

  function getCompanySelectValue(app) {
    if (app?.companyGroupId && groupById.has(String(app.companyGroupId))) return String(app.companyGroupId);
    const name = getCompanyName(app);
    return name ? `snapshot:${name}` : '';
  }

  const filtered = useMemo(() => {
    let list = apps;
    if (statusFilter) list = list.filter(a => a.status === statusFilter);
    if (companyFilter) list = list.filter(a => getCompanyName(a).toLowerCase().includes(companyFilter.toLowerCase()));
    return list;
  }, [apps, statusFilter, companyFilter, groupById]);

  const byStatus = useMemo(() => {
    const map = {}; STATUS_COLS.forEach(c => { map[c.key] = []; });
    filtered.forEach(a => { const s = map[a.status] ? a.status : 'applied'; (map[s] = map[s] || []).push(a); });
    return map;
  }, [filtered]);

  const relDate = d => { if (!d) return ''; const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); if (diff === 0) return 'Today'; if (diff === 1) return '1d ago'; return `${diff}d ago`; };

  if (loading) return <div className="rf-empty"><div className="rf-spinner"><Loader size={24} /></div><p className="rf-text-muted">Loading pipeline…</p></div>;

  return (
    <div className="rf-pipeline">
      <div className="rf-page-header">
        <div><h1 className="rf-page-header__title">Pipeline</h1><p className="rf-page-header__subtitle">{apps.length} applications tracked</p></div>
        <div className="rf-page-header__actions">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setViewMode(v => v === 'kanban' ? 'table' : 'kanban')}>{viewMode === 'kanban' ? <><List size={14} />Table</> : <><LayoutGrid size={14} />Kanban</>}</button>
          <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => setInputOpen(!inputOpen)}><Plus size={14} />Add</button>
        </div>
      </div>

      {/* Input */}
      {inputOpen && (
        <div className="rf-pipeline__input">
          <textarea className="rf-textarea" rows={4} value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder="Job Title | Job ID | Company (one per line)" />
          <div className="rf-pipeline__input-actions">
            <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={addApplications} disabled={parsing || !rawInput.trim()}>{parsing ? 'Adding…' : 'Add Applications'}</button>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setInputOpen(false); setRawInput(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      {apps.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--rf-sp-2)', flexWrap: 'wrap' }}>
          <select className="rf-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input className="rf-input" style={{ width: 180 }} placeholder="Filter by company" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} />
        </div>
      )}

      {/* Kanban */}
      {viewMode === 'kanban' ? (
        <div className="rf-pipeline__board">
          {STATUS_COLS.map(col => (
            <div className="rf-pipeline__column" key={col.key}>
              <div className="rf-pipeline__col-header">
                <span className="rf-pipeline__col-title"><span className="rf-dot" style={{ background: col.color }} />{col.label}</span>
                <span className="rf-pipeline__col-count">{(byStatus[col.key] || []).length}</span>
              </div>
              <div className={`rf-pipeline__col-cards ${dragId ? 'rf-pipeline__col-cards--dragover' : ''}`} onDragOver={onDragOver} onDrop={e => onDrop(e, col.key)}>
                {(byStatus[col.key] || []).map(app => (
                  <div key={app.id} className={`rf-app-card ${dragId === app.id ? 'rf-app-card--dragging' : ''}`} draggable onDragStart={e => onDragStart(e, app.id)}>
                    <div className="rf-app-card__title">{app.jobTitle || 'Untitled'}</div>
                    <div className="rf-app-card__company">{getCompanyName(app) || '—'}</div>
                    <div className="rf-app-card__footer">
                      <span className="rf-app-card__date">{relDate(app.appliedDate)}</span>
                      {app.jobId && <span className="rf-app-card__id">{app.jobId}</span>}
                      <div className="rf-app-card__actions">
                        {app.jobTitle && <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => copyText(app.jobTitle, `t-${app.id}`)} title="Copy title"><Copy size={12} /></button>}
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => deleteApp(app.id)} title="Delete"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {!(byStatus[col.key] || []).length && <div style={{ padding: 'var(--rf-sp-4)', textAlign: 'center', color: 'var(--rf-text-faint)', fontSize: 'var(--rf-text-xs)' }}>Drop here</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="rf-pipeline__table-wrap">
          <table className="rf-pipeline__table">
            <thead><tr><th>Date</th><th>Job Title</th><th>Job ID</th><th>Company</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(app => (
                <tr key={app.id}>
                  <td>{app.appliedDate ? new Date(app.appliedDate).toLocaleDateString() : '—'}</td>
                  <td style={{ fontWeight: 500 }}>{app.jobTitle || '—'}</td>
                  <td><span className="rf-mono" style={{ fontSize: 'var(--rf-text-xs)' }}>{app.jobId || '—'}</span></td>
                  <td>
                    {addingCompanyForId === app.id ? (
                      <div className="rf-pipeline__company-add">
                        <input
                          className="rf-input"
                          value={newCompanyName}
                          placeholder="Company name"
                          onChange={e => setNewCompanyName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') createCompanyForApp(app.id); }}
                          disabled={companyBusyId === app.id}
                          autoFocus
                        />
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => createCompanyForApp(app.id)} disabled={!newCompanyName.trim() || companyBusyId === app.id} title="Create company">
                          <Check size={13} />
                        </button>
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => { setAddingCompanyForId(''); setNewCompanyName(''); }} disabled={companyBusyId === app.id} title="Cancel">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <select
                        className="rf-select rf-pipeline__company-select"
                        value={getCompanySelectValue(app)}
                        onChange={e => {
                          const next = e.target.value;
                          if (next === '__add_new__') {
                            setAddingCompanyForId(app.id);
                            setNewCompanyName(getCompanyName(app));
                            return;
                          }
                          if (next.startsWith('snapshot:')) return;
                          updateCompany(app.id, next);
                        }}
                        disabled={companyBusyId === app.id}
                      >
                        <option value="">Select company</option>
                        {getCompanyName(app) && getCompanySelectValue(app).startsWith('snapshot:') && (
                          <option value={`snapshot:${getCompanyName(app)}`}>{getCompanyName(app)}</option>
                        )}
                        {companyOptions.map(g => <option key={g.id} value={g.id}>{g.companyName}</option>)}
                        <option value="__add_new__">+ Add new company</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <select className="rf-select rf-pipeline__status-select" value={app.status || 'applied'} onChange={e => updateStatus(app.id, e.target.value)}>
                      {STATUS_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => deleteApp(app.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--rf-text-muted)', padding: 'var(--rf-sp-6)' }}>No applications found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
