import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ClipboardPaste, Loader2, Plus, Trash2, Copy, Check, ChevronDown, ChevronUp, X } from 'lucide-react';

function CopyButton({ text, title = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button 
      className="gm-icon-btn" 
      onClick={handleCopy} 
      title={copied ? "Copied" : title}
      style={{ padding: '4px', flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
      type="button"
    >
      {copied ? <Check size={14} className="text-success" color="#10b981" /> : <Copy size={14} color="#8b8fa3" />}
    </button>
  );
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

const STATUS_OPTIONS = [
  { value: 'applied', label: 'Applied' },
  { value: 'oa', label: 'OA' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'offer', label: 'Offer' },
  { value: 'ghosted', label: 'Ghosted' },
  { value: 'on_hold', label: 'On Hold' },
];

const JOB_ID_PATTERNS = [
  /\b(?:job|req(?:uisition)?)\s*id\s*[:#]?\s*([A-Za-z0-9-]+)\b/i,
  /\bRequisition\s*(?:ID|#)\s*[:#]?\s*([A-Za-z0-9-]+)\b/i,
  /\b(?:JR|R)[-_ ]?\d+\b/i,
  /\b\d{4,}\b/,
];
const COMPANY_LABEL = /^company\s*[:\-]/i;
const BULLET_LINE = /^\s*(?:[-*]|\u2022|[0-9]+[.)])\s+/;
const COMPANY_STOP_WORDS = new Set(['inc', 'llc', 'ltd', 'corp', 'co', 'company', 'the']);

function normalizeCompanyKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildGroupLookup(groups) {
  const map = new Map();
  (groups || []).forEach(group => {
    const name = String(group.companyName || '').trim();
    const key = normalizeCompanyKey(name);
    if (key && !map.has(key)) map.set(key, group);
    const firstWord = name.split(/\s+/)[0] || '';
    const shortKey = normalizeCompanyKey(firstWord);
    if (shortKey && !map.has(shortKey)) map.set(shortKey, group);
  });
  return map;
}

function companyTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !COMPANY_STOP_WORDS.has(token));
}

function companySimilarity(a, b) {
  const keyA = normalizeCompanyKey(a);
  const keyB = normalizeCompanyKey(b);
  if (!keyA || !keyB) return 0;
  if (keyA === keyB) return 1;
  if (keyA.includes(keyB) || keyB.includes(keyA)) {
    const shorter = Math.min(keyA.length, keyB.length);
    const longer = Math.max(keyA.length, keyB.length);
    return shorter / longer;
  }

  const tokensA = companyTokens(a);
  const tokensB = companyTokens(b);
  if (!tokensA.length || !tokensB.length) return 0;

  const setB = new Set(tokensB);
  let matches = 0;
  tokensA.forEach(token => {
    if (setB.has(token)) matches += 1;
  });
  return matches / Math.max(tokensA.length, tokensB.length);
}

function splitApplications(raw) {
  const cleaned = String(raw || '').replace(/\r/g, '').trim();
  if (!cleaned) return [];

  const lines = cleaned.split('\n');
  const hasBullets = lines.some(line => BULLET_LINE.test(line));
  if (hasBullets) {
    const blocks = [];
    let current = '';
    lines.forEach(line => {
      if (BULLET_LINE.test(line)) {
        if (current) blocks.push(current.trim());
        current = line.replace(BULLET_LINE, '').trim();
        return;
      }
      if (current && line.trim()) {
        current = `${current} ${line.trim()}`;
        return;
      }
      if (!current && line.trim()) {
        blocks.push(line.trim());
      }
    });
    if (current) blocks.push(current.trim());
    return blocks.filter(Boolean);
  }

  const blockSplit = cleaned.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
  if (blockSplit.length > 1) return blockSplit;

  const lineSplit = cleaned.split('\n').map(s => s.trim()).filter(Boolean);
  if (lineSplit.length > 1) return lineSplit;

  return [cleaned];
}

function extractJobId(text) {
  const source = String(text || '');
  for (const pattern of JOB_ID_PATTERNS) {
    const match = source.match(pattern);
    if (!match) continue;
    const raw = match[1] || match[0] || '';
    return raw.replace(/\s+/g, '').trim();
  }
  return '';
}

function stripJobIdTokens(title) {
  let next = String(title || '');
  next = next.replace(/\s*-?\s*\b(?:req(?:uisition)?|job)\s*id\s*[:#]?\s*[A-Za-z0-9-]+\b/gi, '').trim();
  next = next.replace(/\s*-?\s*\bRequisition\s*(?:ID|#)?\s*[:#]?\s*[A-Za-z0-9-]+\b/gi, '').trim();
  next = next.replace(/\s*-?\s*\b(?:JR|R)[-_ ]?\d+\b/gi, '').trim();
  next = next.replace(/\s*-?\s*\b\d{4,}\b/g, '').trim();
  return next;
}

function extractJobTitleAndId(lines, text) {
  const cleanedLines = lines.map(normalizeLine).filter(Boolean);
  const firstLine = cleanedLines[0] || '';
  let jobTitle = firstLine;
  let jobId = '';

  const bracketMatch = firstLine.match(/\(([^)]+)\)/);
  if (bracketMatch) {
    jobId = bracketMatch[1].replace(/\s+/g, '').trim();
    jobTitle = normalizeLine(firstLine.replace(bracketMatch[0], ''));
  }

  jobTitle = stripJobIdTokens(jobTitle);
  if (!jobId) jobId = extractJobId(text);

  if (!jobTitle) {
    const fallback = cleanedLines.find(line => line !== firstLine) || '';
    jobTitle = stripJobIdTokens(fallback);
  }

  return { jobTitle: jobTitle.trim(), jobId: jobId.trim() };
}

function detectCompanyAndTitle(rawTitle, cleanedLines, knownGroups) {
  let companyName = '';
  let jobTitle = rawTitle;

  const labeled = cleanedLines.find(line => COMPANY_LABEL.test(line));
  if (labeled) {
    companyName = labeled.replace(COMPANY_LABEL, '').split(/[-|]/)[0].trim();
  } else {
    const atMatch = jobTitle.match(/\bat\s+([A-Za-z0-9&.,'\- ]{2,})/i);
    if (atMatch) {
      companyName = atMatch[1].split(/[-|]/)[0].trim();
      jobTitle = jobTitle.replace(atMatch[0], '').trim();
    } else if (jobTitle.includes(' - ')) {
      const parts = jobTitle.split(' - ').map(p => p.trim());
      if (parts.length === 2) {
        const p0Lower = parts[0].toLowerCase();
        const p1Lower = parts[1].toLowerCase();
        const p0Match = knownGroups.find(g => g.toLowerCase() === p0Lower);
        const p1Match = knownGroups.find(g => g.toLowerCase() === p1Lower);
        
        if (p0Match) {
          companyName = p0Match; jobTitle = parts[1];
        } else if (p1Match) {
          companyName = p1Match; jobTitle = parts[0];
        } else {
          if (parts[0].split(' ').length <= 3 && parts[0].length < parts[1].length) {
            companyName = parts[0]; jobTitle = parts[1];
          } else {
            companyName = parts[1]; jobTitle = parts[0];
          }
        }
      }
    }
  }

  if (!companyName && knownGroups && knownGroups.length > 0) {
    const fullText = cleanedLines.join(' ');
    const sortedGroups = [...knownGroups].sort((a, b) => b.length - a.length);
    for (const group of sortedGroups) {
      if (!group) continue;
      const escapedGroup = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedGroup}\\b`, 'i');
      if (regex.test(fullText)) {
        companyName = group;
        const titleRegex = new RegExp(`\\s*[-|]?\\s*\\b${escapedGroup}\\b\\s*[-|]?\\s*`, 'i');
        jobTitle = jobTitle.replace(titleRegex, ' ').trim();
        jobTitle = jobTitle.replace(/^[-|]\s*/, '').replace(/\s*[-|]$/, '').trim();
        break;
      }
    }
  }

  if (companyName && knownGroups && knownGroups.length > 0) {
    const exactMatch = knownGroups.find(g => g.toLowerCase() === companyName.toLowerCase());
    if (exactMatch) {
      companyName = exactMatch;
    } else {
      companyName = '';
    }
  } else if (companyName && (!knownGroups || knownGroups.length === 0)) {
     companyName = '';
  }

  return { companyName, jobTitle };
}

function parseApplicationBlock(block, knownGroups = []) {
  const text = String(block || '').trim();
  const lines = text.split('\n').map(line => line.trim());
  const { jobTitle: initialTitle, jobId } = extractJobTitleAndId(lines, text);
  const cleanedLines = lines.map(normalizeLine).filter(Boolean);

  const { companyName, jobTitle } = detectCompanyAndTitle(initialTitle, cleanedLines, knownGroups);

  return {
    jobTitle: jobTitle || initialTitle,
    jobId,
    companyName,
    rawSourceText: text,
  };
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

function buildCompanyOptions(applications) {
  const seen = new Set();
  const options = [];
  applications.forEach(app => {
    const name = String(app.companyNameSnapshot || '').trim();
    if (!name) return;
    if (seen.has(name)) return;
    seen.add(name);
    options.push(name);
  });
  return options.sort((a, b) => a.localeCompare(b));
}

function trimLogText(value, maxLen = 160) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function buildParsedLog(parsed) {
  return {
    jobTitle: parsed.jobTitle,
    jobId: parsed.jobId,
    companyName: parsed.companyName,
    rawSourcePreview: trimLogText(parsed.rawSourceText),
    rawSourceLength: parsed.rawSourceText ? parsed.rawSourceText.length : 0,
  };
}

export default function ApplicationsPage({
  authedFetch,
  authKey = '',
  groups = [],
  onGroupCreated,
  onGroupsRefresh,
  onNotify,
  onConfirm,
}) {
  const [rawInput, setRawInput] = useState('');
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [savingIds, setSavingIds] = useState(() => new Set());
  const [deletingId, setDeletingId] = useState('');
  const [creatingGroupKey, setCreatingGroupKey] = useState('');
  const [filters, setFilters] = useState({ status: 'all', company: 'all' });
  const [isExpanded, setIsExpanded] = useState(true);
  const [addingCompanyForId, setAddingCompanyForId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');

  const authedFetchRef = useRef(authedFetch);
  const pendingChangesRef = useRef(new Map());
  const saveTimersRef = useRef(new Map());
  const loadedRef = useRef(false);

  const groupLookup = useMemo(() => buildGroupLookup(groups), [groups]);
  const groupNames = useMemo(() => groups.map(g => g.companyName).filter(Boolean), [groups]);
  const groupKeys = useMemo(() => new Set(groups.map(g => normalizeCompanyKey(g.companyName))), [groups]);

  const companyFilterOptions = useMemo(() => buildCompanyOptions(applications), [applications]);

  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      if (filters.status !== 'all' && app.status !== filters.status) return false;
      if (filters.company !== 'all' && app.companyNameSnapshot !== filters.company) return false;
      return true;
    });
  }, [applications, filters]);

  const hasAutoSaving = savingIds.size > 0;
  const isBusy = parsing || adding || bulkAdding || !!creatingGroupKey;

  useEffect(() => {
    loadedRef.current = false;
  }, [authKey]);

  useEffect(() => {
    authedFetchRef.current = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    if (!authKey) {
      setApplications([]);
      setLoading(false);
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    let active = true;

    const loadApplications = async () => {
      setLoading(true);
      try {
        console.info('[applications] Loading applications');
        const res = await authedFetchRef.current(`${API_BASE}/api/applications`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load applications');
        if (active) setApplications(Array.isArray(data) ? data : []);
        console.info('[applications] Loaded applications', { count: Array.isArray(data) ? data.length : 0 });
      } catch (err) {
        if (onNotify) onNotify({ type: 'error', message: err.message || 'Failed to load applications' });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadApplications();

    return () => {
      active = false;
    };
  }, [authKey, onNotify]);

  useEffect(() => {
    return () => {
      saveTimersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  // Pending companies effect removed
  // queuePendingCompany removed

  async function saveApplication(id, patch) {
    if (!patch || !Object.keys(patch).length) return;

    setSavingIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    try {
      const res = await authedFetch(`${API_BASE}/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save application');
      setApplications(prev => prev.map(app => (app.id === id ? { ...app, ...data } : app)));
    } catch (err) {
      if (onNotify) onNotify({ type: 'error', message: err.message || 'Failed to save application' });
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function scheduleAutoSave(id) {
    if (saveTimersRef.current.has(id)) {
      clearTimeout(saveTimersRef.current.get(id));
    }

    const timer = setTimeout(() => {
      const pending = pendingChangesRef.current.get(id);
      if (pending) {
        pendingChangesRef.current.delete(id);
        saveApplication(id, pending);
      }
    }, 600);

    saveTimersRef.current.set(id, timer);
  }

  function updateApplication(id, patch, debounce = true) {
    setApplications(prev => prev.map(app => (app.id === id ? { ...app, ...patch } : app)));

    if (debounce) {
      const pending = pendingChangesRef.current.get(id) || {};
      pendingChangesRef.current.set(id, { ...pending, ...patch });
      scheduleAutoSave(id);
      return;
    }

    saveApplication(id, patch);
  }

  function resolveGroupMatch(companyName) {
    const key = normalizeCompanyKey(companyName);
    if (!key || key.length < 3) return { group: null, confidence: 0 };
    const exact = groupLookup.get(key);
    if (exact) return { group: exact, confidence: 1 };

    let best = null;
    let bestScore = 0;
    groups.forEach(group => {
      const score = companySimilarity(companyName, group.companyName);
      if (score > bestScore) {
        bestScore = score;
        best = group;
      }
    });

    if (bestScore >= 0.78) return { group: best, confidence: bestScore };
    return { group: null, confidence: bestScore };
  }

  async function handleAddEntry() {
    if (isBusy) return;
    if (!rawInput.trim()) {
      if (onNotify) onNotify({ type: 'error', message: 'Paste a job description or role details first.' });
      return;
    }

    console.info('[applications] Add button clicked', { inputLength: rawInput.trim().length });

    setParsing(true);
    const blocks = splitApplications(rawInput);
    const parsed = parseApplicationBlock(blocks[0], groupNames);
    if (blocks.length > 1 && onNotify) {
      onNotify({ type: 'info', message: 'Multiple entries detected. Use Bulk Paste to add all at once.' });
    }
    setParsing(false);

    console.info('[applications] Parsed result', buildParsedLog(parsed));

    if (!parsed.jobTitle && !parsed.companyName && !parsed.jobId) {
      if (onNotify) onNotify({ type: 'error', message: 'Could not detect job details. Try pasting a longer snippet.' });
      return;
    }

    setAdding(true);
    try {
      const match = resolveGroupMatch(parsed.companyName);
      const matchedGroup = match.group;
      const payload = {
        jobTitle: parsed.jobTitle,
        jobId: parsed.jobId,
        companyNameSnapshot: matchedGroup?.companyName || parsed.companyName || '',
        companyGroupId: matchedGroup?.id || null,
        status: 'applied',
        appliedDate: new Date().toISOString(),
        rawSourceText: parsed.rawSourceText,
      };

      console.info('[applications] API payload', {
        ...payload,
        rawSourcePreview: trimLogText(payload.rawSourceText),
        rawSourceLength: payload.rawSourceText ? payload.rawSourceText.length : 0,
      });

      const res = await authedFetch(`${API_BASE}/api/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.info('[applications] API response', { ok: res.ok, id: data?.id || null });
      if (!res.ok) throw new Error(data.error || 'Failed to add application');

      setApplications(prev => [data, ...prev]);
      setRawInput('');
    } catch (err) {
      if (onNotify) onNotify({ type: 'error', message: err.message || 'Failed to add application' });
    } finally {
      setAdding(false);
    }
  }

  async function handleBulkPaste() {
    if (isBusy) return;
    if (!rawInput.trim()) {
      if (onNotify) onNotify({ type: 'error', message: 'Paste job entries first.' });
      return;
    }

    console.info('[applications] Bulk paste clicked', { inputLength: rawInput.trim().length });

    setParsing(true);
    const blocks = splitApplications(rawInput);
    const entries = blocks
      .map(b => parseApplicationBlock(b, groupNames))
      .filter(item => item.jobTitle || item.companyName || item.jobId);
    setParsing(false);

    console.info('[applications] Parsed results', {
      count: entries.length,
      sample: entries.slice(0, 3).map(buildParsedLog),
    });

    if (!entries.length) {
      if (onNotify) onNotify({ type: 'error', message: 'No usable job entries detected.' });
      return;
    }

    setBulkAdding(true);
    try {
      const payload = entries.map(item => {
        const match = resolveGroupMatch(item.companyName);
        const matchedGroup = match.group;
        return {
          jobTitle: item.jobTitle,
          jobId: item.jobId,
          companyNameSnapshot: matchedGroup?.companyName || item.companyName || '',
          companyGroupId: matchedGroup?.id || null,
          status: 'applied',
          appliedDate: new Date().toISOString(),
          rawSourceText: item.rawSourceText,
        };
      });

      console.info('[applications] Bulk API payload', {
        count: payload.length,
        sample: payload.slice(0, 3).map(item => ({
          jobTitle: item.jobTitle,
          jobId: item.jobId,
          companyNameSnapshot: item.companyNameSnapshot,
          rawSourcePreview: trimLogText(item.rawSourceText),
          rawSourceLength: item.rawSourceText ? item.rawSourceText.length : 0,
        })),
      });

      const res = await authedFetch(`${API_BASE}/api/applications/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applications: payload }),
      });
      const data = await res.json();
      console.info('[applications] Bulk API response', { ok: res.ok, created: Array.isArray(data) ? data.length : 0 });
      if (!res.ok) throw new Error(data.error || 'Failed to import applications');

      const created = Array.isArray(data) ? data : [];
      if (created.length) {
        setApplications(prev => [...created, ...prev]);
        // Bulk import complete
      }

      setRawInput('');
    } catch (err) {
      if (onNotify) onNotify({ type: 'error', message: err.message || 'Failed to import applications' });
    } finally {
      setBulkAdding(false);
    }
  }

  async function handleDelete(app) {
    if (!app?.id || deletingId) return;
    const title = app.jobTitle || 'this application';

    if (onConfirm) {
      onConfirm({
        title: 'Delete application?',
        message: `This permanently deletes ${title}.`,
        confirmText: 'Delete',
        intent: 'danger',
        onConfirm: async () => {
          await runDelete(app.id);
        },
      });
      return;
    }

    await runDelete(app.id);
  }

  async function runDelete(id) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await authedFetch(`${API_BASE}/api/applications/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      setApplications(prev => prev.filter(app => app.id !== id));
    } catch (err) {
      if (onNotify) onNotify({ type: 'error', message: err.message || 'Failed to delete application' });
    } finally {
      setDeletingId('');
    }
  }

  function handleCompanyEdit(id, value) {
    const match = resolveGroupMatch(value);
    const patch = {
      companyNameSnapshot: match.group?.companyName || value,
      companyGroupId: match.group?.id || null,
    };
    updateApplication(id, patch, true);
  }

  function handleStatusChange(id, value) {
    updateApplication(id, { status: value }, false);
  }

  function handleJobTitleChange(id, value) {
    updateApplication(id, { jobTitle: value }, true);
  }

  function handleJobIdChange(id, value) {
    updateApplication(id, { jobId: value }, true);
  }

  async function handleSaveNewCompany(id) {
    if (!newCompanyName.trim() || creatingGroupKey) return;
    setCreatingGroupKey('creating');
    try {
      const res = await authedFetch(`${API_BASE}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: newCompanyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create group');

      if (onGroupCreated) onGroupCreated(data);
      if (onGroupsRefresh) onGroupsRefresh();

      updateApplication(id, { companyGroupId: data.id, companyNameSnapshot: data.companyName }, false);
      setAddingCompanyForId('');
      setNewCompanyName('');
    } catch (err) {
      if (onNotify) onNotify({ type: 'error', message: err.message || 'Failed to create group' });
    } finally {
      setCreatingGroupKey('');
    }
  }

  return (
    <div className="applications-shell">
      <div className="applications-head">
        <div>
          <h1 className="applications-title">Applications</h1>
          <p className="applications-subtitle">Paste role text, auto-parse, and track applications in seconds.</p>
        </div>
        <div className="applications-filters">
          <div className="app-filter">
            <span className="lbl lbl--upper">Status</span>
            <select
              className="app-select"
              value={filters.status}
              onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="all">All</option>
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="app-filter">
            <span className="lbl lbl--upper">Company</span>
            <select
              className="app-select"
              value={filters.company}
              onChange={e => setFilters(prev => ({ ...prev, company: e.target.value }))}
            >
              <option value="all">All</option>
              {companyFilterOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="applications-input">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: isExpanded ? '8px' : '0' }}>
          <button className="btn btn--ghost btn--sm" onClick={() => setIsExpanded(!isExpanded)} style={{ gap: '4px', padding: '4px 8px', fontSize: '12px' }}>
            {isExpanded ? <><ChevronUp size={14} /> Collapse</> : <><Plus size={14} /> Add Application</>}
          </button>
        </div>
        {isExpanded && (
          <>
            <textarea
              className="inp app-textarea"
              placeholder="Paste job description, title, or role details here..."
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              disabled={isBusy}
            />
            <div className="applications-toolbar">
              <div className="applications-actions">
                <button className="btn btn--primary" onClick={handleAddEntry} disabled={isBusy}>
                  <Plus size={14} />
                  {adding ? 'Adding...' : 'Add Entry'}
                </button>
                <button className="btn btn--ghost" onClick={handleBulkPaste} disabled={isBusy}>
                  <ClipboardPaste size={14} />
                  {bulkAdding ? 'Bulk import...' : 'Bulk Paste'}
                </button>
              </div>
              <div className="applications-statusbar">
                {parsing && (
                  <span className="app-status-chip app-status-chip--active">
                    <Loader2 size={12} className="app-spin" /> Parsing
                  </span>
                )}
                {adding && (
                  <span className="app-status-chip app-status-chip--active">
                    <Loader2 size={12} className="app-spin" /> Adding
                  </span>
                )}
                {bulkAdding && (
                  <span className="app-status-chip app-status-chip--active">
                    <Loader2 size={12} className="app-spin" /> Bulk import
                  </span>
                )}
                {creatingGroupKey && (
                  <span className="app-status-chip app-status-chip--active">
                    <Loader2 size={12} className="app-spin" /> Company creation
                  </span>
                )}
                {hasAutoSaving && (
                  <span className="app-status-chip">Auto-saving...</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>



      <div className="app-table-wrap">
        {loading ? (
          <div className="app-empty">Loading applications...</div>
        ) : (
          <table className="app-table">
            <colgroup>
              <col className="app-col-date" />
              <col className="app-col-title" />
              <col className="app-col-id" />
              <col className="app-col-company" />
              <col className="app-col-status" />
              <col className="app-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Date Applied</th>
                <th>Job Title</th>
                <th>Job ID</th>
                <th>Company</th>
                <th>Status</th>
                <th className="app-th-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApplications.map(app => (
                <tr key={app.id}>
                  <td>{formatDate(app.appliedDate)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        className="app-input"
                        value={app.jobTitle || ''}
                        placeholder="Job title"
                        onChange={e => handleJobTitleChange(app.id, e.target.value)}
                        disabled={isBusy}
                      />
                      <CopyButton text={app.jobTitle} title="Copy Job Title" />
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        className="app-input"
                        value={app.jobId || ''}
                        placeholder="Job ID"
                        onChange={e => handleJobIdChange(app.id, e.target.value)}
                        disabled={isBusy}
                      />
                      <CopyButton text={app.jobId} title="Copy Job ID" />
                    </div>
                  </td>
                  <td>
                    {addingCompanyForId === app.id ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input
                          className="app-input"
                          value={newCompanyName}
                          onChange={e => setNewCompanyName(e.target.value)}
                          placeholder="New Company"
                          autoFocus
                        />
                        <button className="gm-icon-btn" onClick={() => handleSaveNewCompany(app.id)} disabled={isBusy}><Check size={14}/></button>
                        <button className="gm-icon-btn gm-icon-btn--danger" onClick={() => setAddingCompanyForId('')} disabled={isBusy}><X size={14}/></button>
                      </div>
                    ) : (
                      <select
                        className="app-select"
                        value={app.companyNameSnapshot || ''}
                        onChange={e => {
                          if (e.target.value === '__ADD_NEW__') {
                            setAddingCompanyForId(app.id);
                            setNewCompanyName(app.companyNameSnapshot || '');
                          } else {
                            handleCompanyEdit(app.id, e.target.value);
                          }
                        }}
                        disabled={isBusy}
                        style={{ width: '100%' }}
                      >
                        <option value="" disabled>Select Company</option>
                        {app.companyNameSnapshot && !groupNames.includes(app.companyNameSnapshot) && (
                          <option value={app.companyNameSnapshot}>{app.companyNameSnapshot}</option>
                        )}
                        {groupNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value="__ADD_NEW__">+ Add New Company</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <select
                      className="app-select"
                      value={app.status || 'applied'}
                      onChange={e => handleStatusChange(app.id, e.target.value)}
                      disabled={isBusy}
                    >
                      {STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="app-row-actions">
                    <button
                      className="gm-icon-btn gm-icon-btn--danger"
                      onClick={() => handleDelete(app)}
                      disabled={isBusy || deletingId === app.id}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredApplications.length && (
                <tr>
                  <td colSpan={6} className="app-empty">
                    {applications.length ? 'No applications match your filters.' : 'No applications yet. Paste a role above to start tracking.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>


    </div>
  );
}
