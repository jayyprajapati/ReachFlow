import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import {
  Plus, Trash2, Copy, Loader, LayoutGrid, List, Check, X, Briefcase, Filter,
  ChevronRight, ChevronDown, Info, Users, Building2, ArrowUpRight, CheckCheck,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

const STATUS_COLS = [
  { key: 'applied',      label: 'Applied',      color: 'var(--rf-status-applied)' },
  { key: 'oa',           label: 'OA',           color: 'var(--rf-status-oa)' },
  { key: 'interviewing', label: 'Interviewing', color: 'var(--rf-status-interviewing)' },
  { key: 'offer',        label: 'Offer',        color: 'var(--rf-status-offer)' },
  { key: 'rejected',     label: 'Rejected',     color: 'var(--rf-status-rejected)' },
  { key: 'ghosted',      label: 'Ghosted',      color: 'var(--rf-status-ghosted)' },
  { key: 'on_hold',      label: 'On Hold',      color: 'var(--rf-status-onhold)' },
];

/* ── Loose-line parsing (unchanged) ──────────────────── */

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function cleanupParsedText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—|,;:]+|[\s\-–—|,;:]+$/g, '')
    .trim();
}
function extractKnownCompany(text, groups = []) {
  const sorted = [...groups]
    .filter(g => g?.companyName)
    .sort((a, b) => String(b.companyName).length - String(a.companyName).length);

  for (const group of sorted) {
    const name = String(group.companyName || '').trim();
    if (!name) continue;
    const rx = new RegExp(`(^|[\\s,;:/@()\\-–—])(${escapeRegExp(name)})(?=$|[\\s,;:/@()\\-–—])`, 'i');
    const match = text.match(rx);
    if (match) {
      const matchedText = match[2];
      const nextText = cleanupParsedText(text.replace(matchedText, ' '));
      return { group, companyName: group.companyName, text: nextText };
    }
  }
  return { group: null, companyName: '', text };
}
function extractJobId(text) {
  const labeled = text.match(/\b(?:job|req|requisition|opening|posting)?\s*(?:id|no|number|#)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\b/i);
  if (labeled) {
    return {
      jobId: labeled[1],
      text: cleanupParsedText(text.replace(labeled[0], ' ')),
    };
  }
  const tokens = text.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const clean = tokens[i].replace(/^[#(]+|[),.;:]+$/g, '');
    if (/^(?=.*\d)[A-Za-z0-9._-]{3,}$/.test(clean)) {
      tokens.splice(i, 1);
      return { jobId: clean, text: cleanupParsedText(tokens.join(' ')) };
    }
  }
  return { jobId: '', text };
}
function parseLooseApplicationLine(rawLine, groups = []) {
  let working = cleanupParsedText(rawLine);
  let companyName = '';
  let companyGroupId = null;

  const known = extractKnownCompany(working, groups);
  if (known.companyName) {
    companyName = known.companyName;
    companyGroupId = known.group?.id || null;
    working = known.text;
  }

  const idResult = extractJobId(working);
  const jobId = idResult.jobId;
  working = idResult.text;

  if (!companyName) {
    const atMatch = working.match(/\s+(?:at|@)\s+([^,|–—-]+)$/i);
    if (atMatch) {
      companyName = cleanupParsedText(atMatch[1]);
      working = cleanupParsedText(working.slice(0, atMatch.index));
    }
  }

  if (!companyName) {
    const segments = working.split(/\s+(?:-|–|—|\bat\b|@)\s+|,\s*/).map(cleanupParsedText).filter(Boolean);
    if (segments.length >= 2) {
      companyName = segments[segments.length - 1];
      working = segments.slice(0, -1).join(' - ');
    }
  }

  const title = cleanupParsedText(working) || cleanupParsedText(rawLine);
  const group = companyGroupId ? groups.find(g => String(g.id) === String(companyGroupId)) : null;

  return {
    jobTitle: title,
    jobId,
    companyName: group?.companyName || companyName,
    companyGroupId,
    status: 'applied',
    appliedDate: new Date().toISOString().split('T')[0],
  };
}

function parseApplicationBlock(text, groups = []) {
  if (!text || !text.trim()) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  for (const line of lines) {
    const parts = line.split(/[|\t]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const title = parts[0] || '';
      const jobId = parts[1] || '';
      const company = parts[2] || '';
      const group = groups.find(g => normalizeCompanyKey(g.companyName) === normalizeCompanyKey(company));
      results.push({
        jobTitle: title,
        jobId,
        companyName: group?.companyName || company,
        companyGroupId: group?.id || null,
        status: 'applied',
        appliedDate: new Date().toISOString().split('T')[0],
      });
    } else {
      results.push(parseLooseApplicationLine(line, groups));
    }
  }
  return results;
}

function normalizeCompanyKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function relDate(d) {
  if (!d) return '';
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return '1d ago';
  if (diff < 14)  return `${diff}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ──────────────────────────────────────────────────────────
   PipelinePage
   ────────────────────────────────────────────────────────── */

export default function PipelinePage() {
  const { authedFetch, setNotice, setWarningDialog, groups, loadGroups } = useApp();
  const { navigateTo } = useRouter();

  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rawInput, setRawInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [viewMode, setViewMode] = useState('kanban');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [copiedId, setCopiedId] = useState('');
  const [addingCompanyForId, setAddingCompanyForId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [companyBusyId, setCompanyBusyId] = useState('');
  const [fieldBusyId, setFieldBusyId] = useState('');

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
      const parsed = parseApplicationBlock(rawInput, groups).map(app => {
        const group = findGroupByName(app.companyName);
        return group ? { ...app, companyGroupId: group.id, companyName: group.companyName } : app;
      });
      if (!parsed.length) { setNotice({ type: 'error', message: 'No valid applications found' }); return; }
      for (const app of parsed) {
        const r = await authedFetch(`${API_BASE_URL}/api/applications`, { method: 'POST', headers: hdrs, body: JSON.stringify(app) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
        setApps(p => [d, ...p]);
      }
      setRawInput(''); setInputOpen(false);
      setNotice({ type: 'success', message: `Added ${parsed.length} application${parsed.length === 1 ? '' : 's'}` });
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

  function updateLocalApplication(id, changes) {
    setApps(p => p.map(a => a.id === id ? { ...a, ...changes } : a));
  }

  async function saveApplicationFields(id, changes) {
    if (!id || !Object.keys(changes || {}).length) return;
    setFieldBusyId(`${id}:${Object.keys(changes).join(',')}`);
    try {
      const r = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, { method: 'PATCH', headers: hdrs, body: JSON.stringify(changes) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setApps(p => p.map(a => a.id === id ? { ...a, ...d } : a));
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setFieldBusyId(''); }
  }

  async function updateCompany(id, groupId) {
    if (!id || companyBusyId) return;
    setCompanyBusyId(id);
    try {
      const r = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, {
        method: 'PATCH', headers: hdrs,
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
      setAddingCompanyForId(''); setNewCompanyName('');
      return;
    }
    setCompanyBusyId(id);
    try {
      const r = await authedFetch(`${API_BASE_URL}/api/groups`, {
        method: 'POST', headers: hdrs, body: JSON.stringify({ companyName: name }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to create company');
      await loadGroups();
      const ar = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, {
        method: 'PATCH', headers: hdrs, body: JSON.stringify({ companyGroupId: d.id }),
      });
      const appData = await ar.json(); if (!ar.ok) throw new Error(appData.error || 'Failed to update application');
      setApps(p => p.map(a => a.id === id ? { ...a, ...appData } : a));
      setAddingCompanyForId(''); setNewCompanyName('');
      setNotice({ type: 'success', message: 'Company added to contacts' });
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setCompanyBusyId(''); }
  }

  async function deleteApp(id) {
    setWarningDialog({
      title: 'Delete application?',
      message: 'This removes the application record. Linked contacts and resumes are unaffected. This cannot be undone.',
      confirmText: 'Delete', intent: 'danger',
      onConfirm: async () => {
        try {
          const r = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, { method: 'DELETE' });
          const d = await r.json(); if (!r.ok) throw new Error(d.error);
          setApps(p => p.filter(a => a.id !== id));
          setNotice({ type: 'info', message: 'Application deleted' });
        } catch (e) { setNotice({ type: 'error', message: e.message }); }
      },
    });
  }

  function copyText(text, id) { navigator.clipboard.writeText(text).then(() => setCopiedId(id)); }

  function onDragStart(e, id) { setDragId(id); e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e, status) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(status); }
  function onDragLeave() { setDragOverCol(null); }
  function onDrop(e, status) {
    e.preventDefault();
    setDragOverCol(null);
    if (dragId) { updateStatus(dragId, status); setDragId(null); }
  }

  const companyOptions = useMemo(
    () => [...groups].sort((a, b) => String(a.companyName || '').localeCompare(String(b.companyName || ''))),
    [groups]
  );
  const groupById = useMemo(() => new Map(groups.map(g => [String(g.id), g])), [groups]);
  const groupByKey = useMemo(() => new Map(groups.map(g => [normalizeCompanyKey(g.companyName), g])), [groups]);

  function findGroupByName(name) { return groupByKey.get(normalizeCompanyKey(name)); }
  function getCompanyName(app) {
    const linked = app?.companyGroupId ? groupById.get(String(app.companyGroupId)) : null;
    return linked?.companyName || app?.companyNameSnapshot || app?.companyName || '';
  }
  function getCompanyGroup(app) {
    if (app?.companyGroupId && groupById.has(String(app.companyGroupId))) {
      return groupById.get(String(app.companyGroupId));
    }
    return findGroupByName(app?.companyNameSnapshot || app?.companyName || '');
  }
  function getCompanySelectValue(app) {
    if (app?.companyGroupId && groupById.has(String(app.companyGroupId))) return String(app.companyGroupId);
    const name = getCompanyName(app);
    return name ? `snapshot:${name}` : '';
  }

  const filtered = useMemo(() => {
    let list = apps;
    if (statusFilter)  list = list.filter(a => a.status === statusFilter);
    if (companyFilter) list = list.filter(a => getCompanyName(a).toLowerCase().includes(companyFilter.toLowerCase()));
    return list;
  }, [apps, statusFilter, companyFilter, groupById]);

  const byStatus = useMemo(() => {
    const map = {}; STATUS_COLS.forEach(c => { map[c.key] = []; });
    filtered.forEach(a => { const s = map[a.status] ? a.status : 'applied'; (map[s] = map[s] || []).push(a); });
    return map;
  }, [filtered]);

  const summary = useMemo(() => {
    const inFlight = apps.filter(a => ['applied', 'oa', 'interviewing'].includes(a.status)).length;
    const offers = apps.filter(a => a.status === 'offer').length;
    const closed = apps.filter(a => ['rejected', 'ghosted'].includes(a.status)).length;
    return { total: apps.length, inFlight, offers, closed };
  }, [apps]);

  /* ── Render ────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="rf-page">
        <div className="rf-empty">
          <Loader size={20} className="rf-spin" />
          <p className="rf-empty__desc">Loading pipeline…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rf-page rf-page--wide rf-pipeline-page">
      {/* sec1: title left, stats right */}
      <div className="rf-pl-sec1">
        <div className="rf-pl-sec1__lead">
          <div className="rf-page-header__eyebrow"><DotMark /> Applications</div>
          <h1 className="rf-page-header__title">Application pipeline</h1>
          <p className="rf-page-header__subtitle">
            Every application you've sent, organized by stage. Drag cards between columns to update status, or switch to table for bulk edits.
          </p>
        </div>
        {apps.length > 0 && (
          <div className="rf-pl-sec1__stats">
            <SummaryStat label="Total" value={summary.total} active={!statusFilter} onClick={() => setStatusFilter('')} />
            <SummaryStat label="In-flight" value={summary.inFlight} sub="Applied · OA · Interviewing" />
            <SummaryStat label="Offers" value={summary.offers} accent onClick={() => setStatusFilter('offer')} active={statusFilter === 'offer'} />
            <SummaryStat label="Closed" value={summary.closed} sub="Rejected · Ghosted" />
          </div>
        )}
      </div>

      {/* sec2: actions left, filters right */}
      <div className="rf-pl-sec2">
        <div className="rf-pl-sec2__left">
          <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => setInputOpen(v => !v)}>
            <Plus size={14} /> {inputOpen ? 'Close' : 'Add applications'}
          </button>
          <div className="rf-pl-view-toggle">
            <span className="rf-tooltip-wrap" data-tooltip="Board view">
              <button
                className={`rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm${viewMode === 'kanban' ? ' rf-pl-view-btn--active' : ''}`}
                onClick={() => setViewMode('kanban')}
                aria-label="Board view"
              ><LayoutGrid size={15} /></button>
            </span>
            <span className="rf-tooltip-wrap" data-tooltip="Table view">
              <button
                className={`rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm${viewMode === 'table' ? ' rf-pl-view-btn--active' : ''}`}
                onClick={() => setViewMode('table')}
                aria-label="Table view"
              ><List size={15} /></button>
            </span>
          </div>
        </div>
        {apps.length > 0 && (
          <div className="rf-pl-sec2__right">
            <select className="rf-select rf-input--sm rf-pl-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <div className="rf-search rf-pl-filter-search">
              <Filter size={14} className="rf-search__icon" />
              <input
                className="rf-search__input"
                placeholder="Company"
                value={companyFilter}
                onChange={e => setCompanyFilter(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Add input */}
      {inputOpen && (
        <div className="rf-cp-card" style={{ marginTop: 'var(--rf-sp-3)', marginBottom: 'var(--rf-sp-3)' }}>
          <header className="rf-cp-card__head">
            <div className="rf-cp-card__title">
              <Plus size={16} /> Add applications
              <button
                className="rf-info-btn"
                onClick={() => setHelpOpen(v => !v)}
                title="Show paste format help"
                aria-label="Help on paste format"
              ><Info size={14} /></button>
            </div>
          </header>

          {helpOpen && (
            <div className="rf-pl-help">
              <p>
                <strong>Best:</strong> one application per line, pipe-separated as <code>Job Title | Job ID | Company</code>.
                <br />
                <strong>Loose lines work too</strong> — the parser pulls out IDs, "at Company", and matches against your existing contact groups.
              </p>
              <pre className="rf-pl-help__example">
{`Senior SWE | 12345 | Stripe
Backend Engineer at OpenAI #JR-9921
Product Manager - Linear`}
              </pre>
            </div>
          )}

          <textarea
            className="rf-textarea"
            rows={5}
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            placeholder={'Senior SWE | 12345 | Stripe\nBackend Engineer at OpenAI #JR-9921'}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={addApplications} disabled={parsing || !rawInput.trim()}>
              {parsing ? <><Loader size={13} className="rf-spin" /> Adding…</> : <><Plus size={13} /> Add applications</>}
            </button>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setInputOpen(false); setRawInput(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {apps.length === 0 && !inputOpen && (
        <div className="rf-empty" style={{ marginTop: 'var(--rf-sp-6)' }}>
          <Briefcase size={28} className="rf-empty__icon" />
          <div className="rf-empty__title">No applications tracked yet</div>
          <p className="rf-empty__desc">
            Paste a list of jobs you've applied to and we'll organize them by stage. Drag cards to move them through your funnel.
          </p>
          <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => setInputOpen(true)}>
            <Plus size={14} /> Add your first application
          </button>
        </div>
      )}

      {/* Kanban */}
      {apps.length > 0 && viewMode === 'kanban' && (
        <div className="rf-pl-board">
          {STATUS_COLS.map(col => {
            const items = byStatus[col.key] || [];
            const isOver = dragOverCol === col.key;
            return (
              <div className="rf-pl-col" key={col.key}>
                <div className="rf-pl-col__head">
                  <span className="rf-pl-col__title">
                    <span className="rf-pl-col__dot" style={{ background: col.color }} />
                    {col.label}
                  </span>
                  <span className="rf-pl-col__count rf-num">{items.length}</span>
                </div>
                <div
                  className={`rf-pl-col__body${isOver ? ' rf-pl-col__body--dragover' : ''}`}
                  onDragOver={(e) => onDragOver(e, col.key)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, col.key)}
                >
                  {items.length === 0 ? (
                    <div className="rf-pl-col__empty">
                      {isOver ? 'Drop to move here' : `No ${col.label.toLowerCase()} apps`}
                    </div>
                  ) : items.map(app => {
                    const group = getCompanyGroup(app);
                    const companyName = getCompanyName(app);
                    return (
                      <div
                        key={app.id}
                        className={`rf-pl-card${dragId === app.id ? ' rf-pl-card--dragging' : ''}`}
                        draggable
                        onDragStart={(e) => onDragStart(e, app.id)}
                      >
                        <div className="rf-pl-card__title">{app.jobTitle || 'Untitled role'}</div>
                        <div className="rf-pl-card__company">
                          {group ? (
                            <span className="rf-pl-card__logo">
                              {group.logoUrl
                                ? <img src={group.logoUrl} alt="" />
                                : (companyName.charAt(0).toUpperCase() || '?')}
                            </span>
                          ) : (
                            <span className="rf-pl-card__logo rf-pl-card__logo--ghost">
                              <Building2 size={11} />
                            </span>
                          )}
                          <span className="rf-truncate">{companyName || 'Unknown company'}</span>
                        </div>
                        <div className="rf-pl-card__foot">
                          <span className="rf-pl-card__date">{relDate(app.appliedDate)}</span>
                          {app.jobId && (
                            <button
                              className="rf-pl-card__id"
                              onClick={() => copyText(app.jobId, `id-${app.id}`)}
                              title="Click to copy job ID"
                            >
                              {copiedId === `id-${app.id}` ? <CheckCheck size={11} /> : <Copy size={11} />}
                              {app.jobId}
                            </button>
                          )}
                          <div className="rf-pl-card__actions">
                            {group && (
                              <button
                                className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm"
                                title="View contacts at this company"
                                onClick={() => navigateTo(`/contacts/${group.id}`)}
                              >
                                <Users size={12} />
                              </button>
                            )}
                            <button
                              className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm"
                              title="Delete"
                              onClick={() => deleteApp(app.id)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table view */}
      {apps.length > 0 && viewMode === 'table' && (
        <div className="rf-pl-table-wrap">
          <table className="rf-pl-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Date</th>
                <th>Job title</th>
                <th style={{ width: 160 }}>Job ID</th>
                <th style={{ width: 240 }}>Company</th>
                <th style={{ width: 160 }}>Status</th>
                <th style={{ width: 50, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(app => (
                <tr key={app.id}>
                  <td className="rf-num" style={{ color: 'var(--rf-text-muted)' }}>
                    {app.appliedDate ? new Date(app.appliedDate).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <input
                      className="rf-input rf-input--sm"
                      value={app.jobTitle || ''}
                      placeholder="Job title"
                      onChange={e => updateLocalApplication(app.id, { jobTitle: e.target.value })}
                      onBlur={e => saveApplicationFields(app.id, { jobTitle: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      disabled={fieldBusyId.startsWith(`${app.id}:`)}
                    />
                  </td>
                  <td>
                    <input
                      className="rf-input rf-input--sm rf-mono"
                      value={app.jobId || ''}
                      placeholder="Job ID"
                      onChange={e => updateLocalApplication(app.id, { jobId: e.target.value })}
                      onBlur={e => saveApplicationFields(app.id, { jobId: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      disabled={fieldBusyId.startsWith(`${app.id}:`)}
                    />
                  </td>
                  <td>
                    {addingCompanyForId === app.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          className="rf-input rf-input--sm"
                          value={newCompanyName}
                          placeholder="Company name"
                          onChange={e => setNewCompanyName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') createCompanyForApp(app.id); }}
                          disabled={companyBusyId === app.id}
                          autoFocus
                        />
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => createCompanyForApp(app.id)} disabled={!newCompanyName.trim() || companyBusyId === app.id} title="Create company">
                          {companyBusyId === app.id ? <Loader size={13} className="rf-spin" /> : <Check size={13} />}
                        </button>
                        <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => { setAddingCompanyForId(''); setNewCompanyName(''); }} disabled={companyBusyId === app.id} title="Cancel">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <select
                        className="rf-select rf-input--sm"
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
                    <select
                      className="rf-select rf-input--sm"
                      value={app.status || 'applied'}
                      onChange={e => updateStatus(app.id, e.target.value)}
                    >
                      {STATUS_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm"
                      onClick={() => deleteApp(app.id)}
                      title="Delete"
                    ><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--rf-text-muted)', padding: 'var(--rf-sp-8)' }}>
                    No applications match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function DotMark() {
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--rf-accent)', display: 'inline-block' }} />;
}

function SummaryStat({ label, value, sub, active, accent, onClick }) {
  const clickable = !!onClick;
  return (
    <button
      className={`rf-pl-summary__stat${active ? ' rf-pl-summary__stat--active' : ''}${accent ? ' rf-pl-summary__stat--accent' : ''}`}
      onClick={onClick}
      disabled={!clickable}
      style={!clickable ? { cursor: 'default' } : undefined}
    >
      <span className="rf-pl-summary__label">{label}</span>
      <span className="rf-pl-summary__value rf-num">{value}</span>
      {sub && <span className="rf-pl-summary__sub">{sub}</span>}
    </button>
  );
}
