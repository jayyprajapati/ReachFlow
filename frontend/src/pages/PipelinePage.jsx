import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import {
  Plus, Trash2, Copy, Loader, LayoutGrid, List, Check, X, Briefcase,
  ChevronRight, ChevronDown, Info, Users, Building2, ArrowUpRight, CheckCheck,
  SlidersHorizontal,
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
    .replace(/^[\s\-–—|,;:()\[\]{}]+|[\s\-–—|,;:()\[\]{}]+$/g, '')
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
  // Match explicit labels: "ID: 1234", "(job number: r323432)", "#REQ-0001", etc.
  const labeled = text.match(/(?:\(|\b)(?:job|req|requisition|opening|posting|job\s+number|req\s+number|job\s+id|req\s+id)?\s*(?:id|no|number|#)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\b\)?/i);
  if (labeled) {
    return {
      jobId: labeled[1],
      text: cleanupParsedText(text.replace(labeled[0], ' ')),
    };
  }
  // Fallback: token that looks like a real job ID (pure digits, or short letter-prefix then 4+ digits)
  const tokens = text.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const clean = tokens[i].replace(/^[#(]+|[),.;:]+$/g, '');
    // Require: pure digits (≥3), OR ≤4-letter prefix followed by 4+ digits
    if (/^\d{3,}$/.test(clean) || /^[A-Za-z]{0,4}[-]?\d{4,}[A-Za-z0-9._-]*$/.test(clean)) {
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
      // With 2 parts: title | company (job ID absent)
      // With 3+ parts: title | jobId | company
      const rawId = parts.length >= 3 ? parts[1] : '';
      const jobId = rawId ? (extractJobId(rawId).jobId || cleanupParsedText(rawId)) : '';
      const company = parts.length >= 3 ? parts[2] : parts[1];
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
  const abs = new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diff === 0) return `Today (${abs})`;
  if (diff === 1) return `1d ago (${abs})`;
  if (diff < 14)  return `${diff}d ago (${abs})`;
  return abs;
}

/* ──────────────────────────────────────────────────────────
   PipelinePage
   ────────────────────────────────────────────────────────── */

export default function PipelinePage() {
  const { authedFetch, setNotice, setWarningDialog, groups, loadGroups } = useApp();
  const { search, navigateTo } = useRouter();

  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rawInput, setRawInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [hoverTip, setHoverTip] = useState(null);
  const showHoverTip = (e, text) => {
    if (!text) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const estimatedWidth = text.length * 7.5 + 24;
    const spaceRight = window.innerWidth - rect.right - 15;
    if (spaceRight >= estimatedWidth) {
      setHoverTip({ text, x: rect.right + 10, y: rect.top + rect.height / 2, dir: 'right' });
    } else {
      setHoverTip({ text, x: rect.left - 10, y: rect.top + rect.height / 2, dir: 'left' });
    }
  };
  const hideHoverTip = () => setHoverTip(null);
  const [viewMode, setViewMode] = useState('kanban');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [copiedId, setCopiedId] = useState('');
  const [addingCompanyForId, setAddingCompanyForId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [companyBusyId, setCompanyBusyId] = useState('');
  const [fieldBusyId, setFieldBusyId] = useState('');
  const [jobIdSearch, setJobIdSearch] = useState('');
  const [pendingEntries, setPendingEntries] = useState([]);
  const autoGhostedRef = useRef(false);

  const hdrs = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  useEffect(() => { loadApps(); loadGroups(); }, []);

  useEffect(() => {
    if (!search) return;
    const params = new URLSearchParams(search);
    const company = params.get('company');
    if (company) setCompanyFilter(company);
  }, [search]);
  useEffect(() => { if (copiedId) { const t = setTimeout(() => setCopiedId(''), 1500); return () => clearTimeout(t); } }, [copiedId]);

  useEffect(() => {
    if (loading || autoGhostedRef.current || !apps.length) return;
    autoGhostedRef.current = true;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const toGhost = apps.filter(a =>
      ['applied', 'oa', 'interviewing', 'on_hold'].includes(a.status) &&
      a.appliedDate && new Date(a.appliedDate).getTime() < thirtyDaysAgo
    );
    if (!toGhost.length) return;
    toGhost.forEach(a => updateStatus(a.id, 'ghosted'));
    setNotice({ type: 'info', message: `${toGhost.length} application${toGhost.length > 1 ? 's' : ''} auto-moved to Ghosted (30+ days without response)` });
  }, [loading, apps.length]);

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

      const directSave = parsed.filter(app => !app.companyName || !!app.companyGroupId);
      const needsConfirm = parsed.filter(app => app.companyName && !app.companyGroupId);

      let savedCount = 0;
      for (const app of directSave) {
        const r = await authedFetch(`${API_BASE_URL}/api/applications`, { method: 'POST', headers: hdrs, body: JSON.stringify(app) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
        setApps(p => [d, ...p]);
        savedCount++;
      }

      setRawInput(''); setInputOpen(false);

      if (needsConfirm.length) {
        setPendingEntries(needsConfirm);
      } else if (savedCount > 0) {
        setNotice({ type: 'success', message: `Added ${savedCount} application${savedCount === 1 ? '' : 's'}` });
      }
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setParsing(false); }
  }

  async function savePendingEntry(entry) {
    try {
      const group = findGroupByName(entry.companyName);
      const payload = {
        jobTitle: entry.jobTitle || '',
        jobId: entry.jobId || '',
        companyNameSnapshot: group?.companyName || entry.companyName || '',
        companyGroupId: group?.id || null,
        status: entry.status || 'applied',
        appliedDate: entry.appliedDate || new Date().toISOString().split('T')[0],
      };
      const r = await authedFetch(`${API_BASE_URL}/api/applications`, { method: 'POST', headers: hdrs, body: JSON.stringify(payload) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setApps(p => [d, ...p]);
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
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
      // Store as a temporary name snapshot — does NOT create a contact
      const ar = await authedFetch(`${API_BASE_URL}/api/applications/${id}`, {
        method: 'PATCH', headers: hdrs,
        body: JSON.stringify({ companyNameSnapshot: name, companyGroupId: null }),
      });
      const appData = await ar.json(); if (!ar.ok) throw new Error(appData.error || 'Failed to update application');
      setApps(p => p.map(a => a.id === id ? { ...a, ...appData } : a));
      setAddingCompanyForId(''); setNewCompanyName('');
      setNotice({ type: 'success', message: 'Company name saved' });
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

  const uniqueCompanies = useMemo(() => {
    const seen = new Set();
    return apps
      .map(a => getCompanyName(a))
      .filter(name => { if (!name || seen.has(name)) return false; seen.add(name); return true; })
      .sort((a, b) => a.localeCompare(b));
  }, [apps, groupById]);

  const companyAppCounts = useMemo(() => {
    const counts = {};
    apps.forEach(a => {
      if (a.status === 'rejected') return;
      const name = getCompanyName(a);
      if (!name) return;
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }, [apps, groupById]);

  const filtered = useMemo(() => {
    let list = apps;
    if (statusFilter)  list = list.filter(a => a.status === statusFilter);
    if (companyFilter) list = list.filter(a => getCompanyName(a) === companyFilter);
    if (jobIdSearch)   list = list.filter(a => (a.jobId || '').toLowerCase().includes(jobIdSearch.toLowerCase()));
    return list;
  }, [apps, statusFilter, companyFilter, jobIdSearch, groupById]);

  const hasFilters = !!(statusFilter || companyFilter || jobIdSearch);

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
      {hoverTip && (
        <div
          className={`rf-hover-tip${hoverTip.dir === 'left' ? ' rf-hover-tip--left' : ''}`}
          role="tooltip"
          style={hoverTip.dir === 'left'
            ? { top: hoverTip.y, right: window.innerWidth - hoverTip.x }
            : { top: hoverTip.y, left: hoverTip.x }
          }
        >
          {hoverTip.text}
        </div>
      )}
      {pendingEntries.length > 0 && (
        <CompanyConfirmDialog
          key={`${pendingEntries[0].companyName}:${pendingEntries[0].jobTitle}:${pendingEntries.length}`}
          entry={pendingEntries[0]}
          remaining={pendingEntries.length - 1}
          onSave={async (editedEntry) => {
            await savePendingEntry(editedEntry);
            setPendingEntries(prev => prev.slice(1));
          }}
          onSkip={() => setPendingEntries(prev => prev.slice(1))}
        />
      )}
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
          {apps.length > 0 && (
            <button
              className={`rf-pl-filter-btn${hasFilters ? ' rf-pl-filter-btn--active' : ''}`}
              onClick={() => setFilterSheetOpen(true)}
              aria-label="Open filters"
            >
              <SlidersHorizontal size={14} /> Filters{hasFilters ? ` (${[statusFilter, companyFilter, jobIdSearch].filter(Boolean).length})` : ''}
            </button>
          )}
        </div>
        {apps.length > 0 && (
          <div className="rf-pl-sec2__right">
            <input
              type="text"
              className="rf-input rf-input--sm"
              style={{ width: 150 }}
              placeholder="Search job ID…"
              value={jobIdSearch}
              onChange={e => setJobIdSearch(e.target.value)}
            />
            <select className="rf-select rf-input--sm rf-pl-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select
              className="rf-select rf-input--sm rf-pl-filter-select"
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
            >
              <option value="">All companies</option>
              {uniqueCompanies.map(name => (
                <option key={name} value={name}>
                  {name}{companyAppCounts[name] ? ` (${companyAppCounts[name]})` : ''}
                </option>
              ))}
            </select>
            {hasFilters && (
              <button
                className="rf-btn rf-btn--ghost rf-btn--sm"
                onClick={() => { setStatusFilter(''); setCompanyFilter(''); setJobIdSearch(''); }}
                title="Reset all filters"
              >
                <X size={13} /> Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add input */}
      {inputOpen && (
        <div className="rf-cp-card" style={{ marginTop: 'var(--rf-sp-3)', marginBottom: 'var(--rf-sp-3)' }}>
          <header className="rf-cp-card__head">
            <div className="rf-cp-card__title">
              <Plus size={16} /> Add applications
              <span
                className="rf-info-btn"
                aria-label="Paste format help"
                onMouseEnter={(e) => showHoverTip(e, 'Format: Job Title | Company or Job Title | Job ID | Company — one per line. Loose format works too.')}
                onMouseLeave={hideHoverTip}
              ><Info size={14} /></span>
            </div>
          </header>

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
                        <select
                          className="rf-pl-card__status-select"
                          value={app.status || 'applied'}
                          onChange={e => { e.stopPropagation(); updateStatus(app.id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                          title="Move to another stage"
                        >
                          {STATUS_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile filter bottom sheet */}
      {filterSheetOpen && (
        <div className="rf-pl-filter-sheet-overlay" onClick={() => setFilterSheetOpen(false)}>
          <div className="rf-pl-filter-sheet" onClick={e => e.stopPropagation()}>
            <div className="rf-pl-filter-sheet__head">
              <span className="rf-pl-filter-sheet__title">Filters</span>
              <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setFilterSheetOpen(false)} aria-label="Close filters">
                <X size={16} />
              </button>
            </div>
            <div className="rf-pl-filter-sheet__body">
              <div>
                <div className="rf-pl-filter-sheet__label">Search by job ID</div>
                <input
                  type="text"
                  className="rf-input rf-input--sm"
                  style={{ width: '100%' }}
                  placeholder="Search job ID…"
                  value={jobIdSearch}
                  onChange={e => setJobIdSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <div className="rf-pl-filter-sheet__label">Status</div>
                <select className="rf-select rf-input--sm" style={{ width: '100%' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  {STATUS_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <div className="rf-pl-filter-sheet__label">Company</div>
                <select className="rf-select rf-input--sm" style={{ width: '100%' }} value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
                  <option value="">All companies</option>
                  {uniqueCompanies.map(name => (
                    <option key={name} value={name}>{name}{companyAppCounts[name] ? ` (${companyAppCounts[name]})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
            {hasFilters && (
              <div className="rf-pl-filter-sheet__footer">
                <button
                  className="rf-btn rf-btn--ghost rf-btn--sm"
                  style={{ width: '100%' }}
                  onClick={() => { setStatusFilter(''); setCompanyFilter(''); setJobIdSearch(''); setFilterSheetOpen(false); }}
                >
                  <X size={13} /> Reset all filters
                </button>
              </div>
            )}
          </div>
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

function CompanyConfirmDialog({ entry, remaining, onSave, onSkip }) {
  const [jobTitle, setJobTitle] = useState(entry.jobTitle || '');
  const [companyName, setCompanyName] = useState(entry.companyName || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ ...entry, jobTitle, companyName });
    setSaving(false);
  }

  return (
    <div className="rf-dialog-overlay">
      <div className="rf-dialog" style={{ maxWidth: 440 }}>
        <div className="rf-dialog__title">New company detected</div>
        <div className="rf-dialog__body">
          <p style={{ marginBottom: 'var(--rf-sp-3)', color: 'var(--rf-text-secondary)', fontSize: 'var(--rf-text-sm)' }}>
            <strong>{entry.companyName}</strong> isn't in your contacts. Review the details below and edit if needed.
            {remaining > 0 && (
              <span style={{ color: 'var(--rf-text-muted)' }}> ({remaining} more to review after this)</span>
            )}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job title</span>
              <input
                className="rf-input rf-input--sm"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="Job title"
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company name</span>
              <input
                className="rf-input rf-input--sm"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Company name"
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
              />
            </label>
          </div>
        </div>
        <div className="rf-dialog__actions">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={onSkip} disabled={saving}>
            Skip
          </button>
          <button
            className="rf-btn rf-btn--primary rf-btn--sm"
            onClick={handleSave}
            disabled={saving || (!jobTitle.trim() && !companyName.trim())}
          >
            {saving ? <><Loader size={13} className="rf-spin" /> Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
