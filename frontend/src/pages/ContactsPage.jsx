import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import {
  Plus, Trash2, Pencil, Check, X, Copy, Search, Linkedin, ClipboardPaste,
  FileDown, Upload, ExternalLink, Loader, Users, Building2, Mail, ArrowUpRight,
  Send, Briefcase, Info, ArrowUpDown, MessageSquare, Phone, ChevronLeft, ChevronRight,
  MoreVertical, Minus,
} from 'lucide-react';
import ConversationsDrawer from '../components/ConversationsDrawer.jsx';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const looseEmailRegex = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
const looseEmailGlobalRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const looseLinkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/i;
const ROLE_OPTIONS = ['', 'Recruiter', 'Senior Recruiter', 'Hiring Manager', 'HR', 'Talent Acquisition', 'Engineering Manager', 'Director', 'VP', 'Other'];
const EMAIL_STATUS_OPTIONS = [
  { value: 'verified',  label: 'Valid' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'not_valid', label: 'Invalid' },
];

// Inline status indicator shown right before the email. Cycle on click.
const EMAIL_STATUS_ORDER = ['verified', 'tentative', 'not_valid'];
function EmailStatusIcon({ status, onCycle }) {
  const s = EMAIL_STATUS_ORDER.includes(status) ? status : 'verified';
  const map = {
    verified:  { Icon: Check,  cls: 'rf-ct__email-flag--ok',   label: 'Valid' },
    tentative: { Icon: Minus,  cls: 'rf-ct__email-flag--mid',  label: 'Tentative' },
    not_valid: { Icon: X,      cls: 'rf-ct__email-flag--bad',  label: 'Invalid' },
  };
  const { Icon, cls, label } = map[s];
  return (
    <button
      type="button"
      className={`rf-ct__email-flag ${cls}`}
      onClick={(e) => { e.stopPropagation(); onCycle?.(); }}
      title={`Email: ${label} · click to change`}
      aria-label={`Email status: ${label}`}
    >
      <Icon size={12} strokeWidth={2.5} />
    </button>
  );
}

function capitalizeDisplayName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s([{"'/-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function normalizeContactPayload(contact, defaultRole = '') {
  return {
    ...contact,
    name: capitalizeDisplayName(contact.name),
    role: contact.role || defaultRole,
    email: String(contact.email || '').trim().toLowerCase(),
    mobile: sanitizeMobileInput(contact.mobile),
  };
}

function extractMobile(text) {
  if (!text) return { mobile: '', raw: '' };
  const patterns = [
    /\+\d[\d\s\-.()]{6,}\d/,                       // +1 415-555-1234
    /\(\d{2,5}\)[\s.-]*\d[\d\s\-.()]{4,}/,         // (415) 555-1234
    /\b\d{3}[\s.\-/]\d{3}[\s.\-/]\d{4}\b/,         // 415-555-1234
    /\b\d{10,15}\b/,                                // 9876543210
  ];
  for (const re of patterns) {
    const m = String(text).match(re);
    if (m) {
      const raw = m[0];
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) {
        return { mobile: raw.trim(), raw };
      }
    }
  }
  return { mobile: '', raw: '' };
}

function sanitizeMobileInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return raw; // let server decide; show user as-typed
  return raw;
}

function isValidMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 0 || (digits.length >= 7 && digits.length <= 15);
}

function nameFromEmail(email) {
  const local = String(email || '').split('@')[0].split('+')[0].replace(/[0-9]/g, ' ');
  const words = local.split(/[._\-\s]+/).map(w => w.trim()).filter(Boolean);
  return words.length
    ? words.map(w => `${w.charAt(0).toUpperCase()}${w.slice(1).toLowerCase()}`).join(' ')
    : 'Unknown';
}

function extractEmail(text) {
  const match = String(text || '').match(looseEmailRegex);
  if (!match) return { email: '', raw: '' };
  const email = match[1].replace(/[).,;:]+$/g, '').toLowerCase();
  return emailRegex.test(email) ? { email, raw: match[0] } : { email: '', raw: '' };
}

function extractEmails(text) {
  return [...String(text || '').matchAll(looseEmailGlobalRegex)]
    .map(match => match[0].replace(/[).,;:]+$/g, '').toLowerCase())
    .filter(email => emailRegex.test(email));
}

function extractLinkedin(text) {
  const match = String(text || '').match(looseLinkedinRegex);
  if (!match) return { linkedin: '', raw: '' };
  return { linkedin: match[0], raw: match[0] };
}

function splitPasteRows(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).flatMap(line => {
    const emails = extractEmails(line);
    const remainder = line.replace(looseEmailGlobalRegex, ' ').replace(/[\s,;|]+/g, '');
    if (emails.length > 1 && !remainder) return emails;
    return [line];
  });
}

function parseContactLine(line) {
  const rawLine = String(line || '').trim();
  if (!rawLine) return null;
  // Extract LinkedIn URL first so it doesn't interfere with name/email detection.
  const { linkedin, raw: linkedinRaw } = extractLinkedin(rawLine);
  const withoutLinkedin = linkedinRaw ? rawLine.replace(linkedinRaw, ' ').replace(/\s+/g, ' ').trim() : rawLine;
  const { email, raw } = extractEmail(withoutLinkedin);
  // Detect trailing " V"/" v" marker — flags email as verified.
  // Only treat it as the verified-marker when there's an email AND the V is the
  // very last token, so legitimate names like "Andrew V" don't false-positive
  // when there's no email present.
  let verifiedFlag = false;
  let working = withoutLinkedin;
  if (email && /\s+[Vv]\s*$/.test(withoutLinkedin)) {
    verifiedFlag = true;
    working = withoutLinkedin.replace(/\s+[Vv]\s*$/, '');
  }
  // Strip email first so it doesn't interfere with phone detection.
  let cleaned = working.replace(raw || '', ' ');
  const { mobile, raw: mobileRaw } = extractMobile(cleaned);
  if (mobile && mobileRaw) cleaned = cleaned.replace(mobileRaw, ' ');
  cleaned = cleaned
    .replace(/[<>()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const segments = cleaned
    .split(/\s+[|;-]\s+|\s*,\s*|\t+/)
    .map(s => s.trim())
    .filter(Boolean);
  const name = capitalizeDisplayName(segments[0] || (email ? nameFromEmail(email) : cleaned));
  if (!name && !email && !mobile && !linkedin) return null;
  const result = { name, email, mobile, linkedin: linkedin || '', role: 'Recruiter', source: rawLine };
  if (verifiedFlag) result.email_status = 'verified';
  return result;
}

function parseBulkText(text) {
  return splitPasteRows(text).map(parseContactLine).filter(Boolean);
}

function parseCSVText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const firstLower = lines[0].toLowerCase();
  const hasHeader = firstLower.includes('name') || firstLower.includes('email');
  const data = hasHeader ? lines.slice(1) : lines;
  return data.map(line => {
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    const email = String(parts[1] || '').trim().toLowerCase();
    const explicitMobile = String(parts[6] || '').trim();
    let mobile = '';
    if (explicitMobile) {
      const found = extractMobile(explicitMobile);
      mobile = found.mobile || (isValidMobile(explicitMobile) ? explicitMobile : '');
    }
    if (!mobile) mobile = extractMobile(parts.slice(2).join(' ')).mobile || '';
    return {
      name: capitalizeDisplayName(parts[0] || (email ? nameFromEmail(email) : '')),
      email,
      mobile,
      role: parts[2] || '',
      linkedin: parts[3] || '',
      connectionStatus: parts[4] || '',
      email_status: ['verified', 'tentative', 'not_valid'].includes(parts[5]) ? parts[5] : 'tentative',
    };
  }).filter(p => p.name || p.email);
}

function normalizeCompanyKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|group)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function companyFromEmail(email) {
  const domain = String(email || '').split('@')[1] || '';
  const label = domain.split('.')[0] || '';
  return capitalizeDisplayName(label.replace(/[-_]+/g, ' '));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildGroupLookup(groups) {
  const map = new Map();
  const shortCounts = new Map();
  groups.forEach(g => {
    const shortKey = normalizeCompanyKey(String(g.companyName || '').trim().split(/\s+/)[0] || '');
    if (shortKey) shortCounts.set(shortKey, (shortCounts.get(shortKey) || 0) + 1);
  });
  groups.forEach(g => {
    const fullKey = normalizeCompanyKey(g.companyName);
    if (fullKey && !map.has(fullKey)) map.set(fullKey, g);
    const shortKey = normalizeCompanyKey(String(g.companyName || '').trim().split(/\s+/)[0] || '');
    if (shortKey && shortCounts.get(shortKey) === 1 && !map.has(shortKey)) map.set(shortKey, g);
  });
  return map;
}

function matchGroupForLine(line, email, groups, lookup) {
  const normalizedLine = normalizeCompanyKey(line);
  const byMention = [...groups]
    .filter(g => normalizeCompanyKey(g.companyName))
    .sort((a, b) => String(b.companyName || '').length - String(a.companyName || '').length)
    .find(g => normalizedLine.includes(normalizeCompanyKey(g.companyName)));
  if (byMention) return byMention;
  const domainCompany = companyFromEmail(email);
  return lookup.get(normalizeCompanyKey(domainCompany)) || null;
}

function removeCompanyFromLine(line, group) {
  if (!group?.companyName) return line;
  const full = escapeRegExp(group.companyName);
  const first = escapeRegExp(String(group.companyName || '').trim().split(/\s+/)[0] || '');
  let next = String(line || '').replace(new RegExp(`\\b${full}\\b`, 'ig'), ' ');
  if (first && first !== full) next = next.replace(new RegExp(`\\b${first}\\b`, 'ig'), ' ');
  return next;
}

function parseGlobalBulkText(text, groups) {
  const lookup = buildGroupLookup(groups);
  const seen = new Set();
  return splitPasteRows(text).map(line => {
    // Extract LinkedIn URL early so it doesn't interfere with company/name matching.
    const { linkedin, raw: linkedinRaw } = extractLinkedin(line);
    const withoutLinkedin = linkedinRaw ? line.replace(linkedinRaw, ' ').replace(/\s+/g, ' ').trim() : line;
    const { email, raw } = extractEmail(withoutLinkedin);
    // Detect trailing " V"/" v" valid-marker on the line (before email is stripped).
    const verifiedFlag = !!email && /\s+[Vv]\s*$/.test(withoutLinkedin);
    const withoutVerified = verifiedFlag ? withoutLinkedin.replace(/\s+[Vv]\s*$/, '') : withoutLinkedin;
    const emailKey = email.toLowerCase();
    if (emailKey) {
      if (seen.has(emailKey)) return null;
      seen.add(emailKey);
    }
    const target = matchGroupForLine(withoutVerified, email, groups, lookup);
    const withoutEmail = raw ? withoutVerified.replace(raw, ' ') : withoutVerified;
    const contactLine = `${target ? removeCompanyFromLine(withoutEmail, target) : withoutEmail} ${email}`.trim();
    const parsed = parseContactLine(contactLine);
    if (!parsed) return null;
    return {
      ...parsed,
      email,
      linkedin: linkedin || parsed.linkedin || '',
      name: capitalizeDisplayName(parsed.name || (email ? nameFromEmail(email) : '')),
      ...(verifiedFlag ? { email_status: 'verified' } : {}),
      targetGroup: target,
      targetGroupName: target?.companyName || (email ? companyFromEmail(email) : ''),
      source: line,
    };
  }).filter(Boolean);
}

function getNewCompanyShortcutLabel() {
  if (typeof navigator === 'undefined') return 'Alt↑N';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌥↑N' : 'Alt↑N';
}

export default function ContactsPage() {
  const { authedFetch, setNotice, setWarningDialog, groups, loadGroups } = useApp();
  const { path, navigateTo } = useRouter();

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortCompaniesAZ, setSortCompaniesAZ] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [nameSortDirection, setNameSortDirection] = useState('');
  const pageRef = useRef(null);
  const detailBodyRef = useRef(null);

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

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingLogo, setEditingLogo] = useState(false);
  const [logoInput, setLogoInput] = useState('');
  const [editingCareers, setEditingCareers] = useState(false);
  const [careersInput, setCareersInput] = useState('');
  const [savingGroupField, setSavingGroupField] = useState(false);

  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [bulkAdding, setBulkAdding] = useState(false);

  const [globalPasteOpen, setGlobalPasteOpen] = useState(false);
  const [globalPasteText, setGlobalPasteText] = useState('');
  const [globalAdding, setGlobalAdding] = useState(false);

  const [csvParsed, setCsvParsed] = useState(null);
  const [csvAdding, setCsvAdding] = useState(false);
  const csvFileRef = useRef();
  const newCompanyShortcutLabel = getNewCompanyShortcutLabel();

  // Sidebar collapse / resize
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const resizingRef = useRef(false);
  const searchInputRef = useRef(null);

  // Company-detail kebab menu
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const detailMenuRef = useRef(null);

  // Fixed-position hover tooltip — escapes all overflow:hidden ancestors
  const [hoverTip, setHoverTip] = useState(null);
  const showHoverTip = (e, text) => {
    if (!text) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverTip({ text, x: rect.right + 10, y: rect.top + rect.height / 2 });
  };
  const hideHoverTip = () => setHoverTip(null);

  // Global contact search
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [allContactsFlat, setAllContactsFlat] = useState([]);
  const [allContactsLoading, setAllContactsLoading] = useState(false);
  const [allContactsLoaded, setAllContactsLoaded] = useState(false);
  const globalSearchRef = useRef(null);
  const globalSearchInputRef = useRef(null);

  // Conversations drawer
  const [drawerContactId, setDrawerContactId] = useState(null);
  const [apps, setApps] = useState([]);
  const [appsLoaded, setAppsLoaded] = useState(false);

  const drawerContact = useMemo(() => {
    if (!drawerContactId || !detail) return null;
    return (detail.contacts || []).find(c => c.id === drawerContactId) || null;
  }, [drawerContactId, detail]);

  async function loadApplicationsOnce() {
    if (appsLoaded) return;
    try {
      const r = await authedFetch(`${API}/api/applications`);
      const d = await r.json();
      if (r.ok && Array.isArray(d)) setApps(d);
    } catch { /* leave empty */ }
    setAppsLoaded(true);
  }

  function openConversations(contact) {
    setDrawerContactId(contact.id);
    loadApplicationsOnce();
  }

  function closeConversations() {
    setDrawerContactId(null);
  }

  function applyContactUpdate(updated) {
    setDetail(p => p ? { ...p, contacts: (p.contacts || []).map(c => c.id === updated.id ? { ...c, ...updated } : c) } : p);
  }

  const startCreateCompany = useCallback(() => {
    setCreating(true);
    setNewName('');
    setNewLogo('');
    setNewCareers('');
  }, []);

  // Sidebar collapse/expand helpers
  function handleCollapse() {
    if (creating) {
      setCreating(false);
      setNewName(''); setNewLogo(''); setNewCareers('');
    }
    setSidebarCollapsed(true);
  }

  function expandAndFocusSearch() {
    setSidebarCollapsed(false);
    setTimeout(() => searchInputRef.current?.focus(), 60);
  }

  function expandAndStartCreate() {
    setSidebarCollapsed(false);
    setTimeout(() => startCreateCompany(), 60);
  }

  // Resize drag handle
  function startResize(e) {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(ev) {
      if (!resizingRef.current) return;
      const delta = ev.clientX - startX;
      const next = Math.min(300, Math.max(160, startWidth + delta));
      setSidebarWidth(next);
    }
    function onMouseUp() {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Load all contacts lazily for global search
  async function loadAllContacts() {
    if (allContactsLoading || allContactsLoaded) return;
    setAllContactsLoading(true);
    const flat = [];
    await Promise.all(
      groups.filter(g => g.contactCount > 0).map(async g => {
        try {
          const r = await authedFetch(`${API}/api/groups/${g.id}`);
          const d = await r.json();
          if (r.ok) {
            for (const c of (d.contacts || [])) flat.push({ contact: c, group: g });
          }
        } catch { /* skip failed group */ }
      })
    );
    setAllContactsFlat(flat);
    setAllContactsLoaded(true);
    setAllContactsLoading(false);
  }

  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return allContactsFlat.filter(({ contact, group }) => {
      const hay = [contact.name || '', contact.email || '', group.companyName || '', contact.linkedin || ''].join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 25);
  }, [globalSearch, allContactsFlat]);

  useEffect(() => { loadGroups(); }, []);
  useEffect(() => { if (copiedField) { const t = setTimeout(() => setCopiedField(''), 2000); return () => clearTimeout(t); } }, [copiedField]);

  // Close global search dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target)) {
        setGlobalSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close company-detail kebab menu when clicking outside
  useEffect(() => {
    if (!detailMenuOpen) return;
    function handleClickOutside(e) {
      if (detailMenuRef.current && !detailMenuRef.current.contains(e.target)) {
        setDetailMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [detailMenuOpen]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyN') {
        e.preventDefault();
        startCreateCompany();
        resetContactsScroll();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startCreateCompany]);

  useEffect(() => {
    const m = path.match(/^\/contacts\/(.+)$/);
    if (m && m[1]) openGroup(m[1]);
  }, [path]);

  const filtered = useMemo(() => {
    const source = search.trim()
      ? groups.filter(g => g.companyName?.toLowerCase().includes(search.toLowerCase()))
      : groups;
    if (!sortCompaniesAZ) return source;
    return [...source].sort((a, b) => String(a.companyName || '').localeCompare(String(b.companyName || ''), undefined, { sensitivity: 'base' }));
  }, [groups, search, sortCompaniesAZ]);

  const globalParsed = useMemo(() => parseGlobalBulkText(globalPasteText, groups), [globalPasteText, groups]);
  const globalReady = globalParsed.filter(p => p.targetGroup && p.name);
  const globalUnmatched = globalParsed.filter(p => !p.targetGroup);
  const globalUnmatchedText = globalUnmatched.map(p => p.source).join('\n');

  function resetContactsScroll() {
    requestAnimationFrame(() => {
      detailBodyRef.current?.scrollTo({ top: 0, left: 0 });
      pageRef.current?.closest('.rf-shell__content')?.scrollTo({ top: 0, left: 0 });
    });
  }

  function openGlobalPaste() {
    setGlobalPasteText('');
    setGlobalPasteOpen(true);
  }

  function contactFormDefaults() {
    return { name: '', email: '', mobile: '', role: 'Recruiter', linkedin: '', connectionStatus: 'not_connected', email_status: 'verified' };
  }

  function getNameCopyTitle(contact) {
    if (copiedField === `name-${contact.id}-first`) return 'First name copied. Double-click to copy full name.';
    if (copiedField === `name-${contact.id}-full`) return 'Full name copied.';
    return 'Click to copy first name. Double-click to copy full name.';
  }

  function closeGlobalPaste() {
    setGlobalPasteOpen(false);
    setGlobalPasteText('');
  }

  async function copyUnmatchedGlobalRows() {
    if (!globalUnmatchedText) return;
    await navigator.clipboard.writeText(globalUnmatchedText);
    setNotice({ type: 'success', message: 'Unmatched rows copied. Create the company first and keep these details saved until then.' });
  }

  async function addGlobalParsedContacts() {
    if (globalAdding || !globalReady.length) return;
    setGlobalAdding(true);
    let added = 0, failed = 0, skipped = 0;
    const affectedGroups = new Set();
    try {
      const byGroup = new Map();
      for (const row of globalReady) {
        const groupId = row.targetGroup.id;
        if (!byGroup.has(groupId)) byGroup.set(groupId, []);
        byGroup.get(groupId).push(row);
      }

      for (const [groupId, rows] of byGroup.entries()) {
        const detailResp = await authedFetch(`${API}/api/groups/${groupId}`);
        const detailData = await detailResp.json();
        if (!detailResp.ok) throw new Error(detailData.error || 'Failed to check existing contacts');
        const existing = new Set((detailData.contacts || []).map(c => String(c.email || '').toLowerCase()).filter(Boolean));

        for (const row of rows) {
          const emailKey = String(row.email || '').toLowerCase();
          if (emailKey && existing.has(emailKey)) { skipped++; continue; }
          try {
            const payload = normalizeContactPayload(row, 'Recruiter');
            const r = await authedFetch(`${API}/api/groups/${groupId}/contacts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: payload.name,
                email: payload.email,
                mobile: payload.mobile || '',
                role: payload.role,
                linkedin: payload.linkedin || '',
                email_status: payload.email_status || 'tentative',
              }),
            });
            if (r.ok) {
              added++;
              affectedGroups.add(groupId);
              if (emailKey) existing.add(emailKey);
            } else failed++;
          } catch { failed++; }
        }
      }

      loadGroups();
      if (selectedId && affectedGroups.has(String(selectedId))) openGroup(selectedId);
      setNotice({
        type: added > 0 ? 'success' : 'info',
        message: `Added ${added} contact${added !== 1 ? 's' : ''}${skipped ? `, skipped ${skipped} duplicate${skipped !== 1 ? 's' : ''}` : ''}${failed ? `, ${failed} failed` : ''}${globalUnmatched.length ? `. ${globalUnmatched.length} need a company first.` : ''}`,
      });
      if (globalUnmatched.length) {
        setGlobalPasteText(globalUnmatchedText);
      } else {
        closeGlobalPaste();
      }
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to add contacts' });
    } finally {
      setGlobalAdding(false);
    }
  }

  const existingEmailsSet = useMemo(
    () => new Set((detail?.contacts || []).map(c => (c.email || '').toLowerCase())),
    [detail?.contacts]
  );

  const visibleContacts = useMemo(() => {
    const terms = contactSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let list = detail?.contacts || [];
    if (terms.length) {
      list = list.filter(c => {
        const haystack = `${c.name || ''} ${c.email || ''}`.toLowerCase();
        return terms.every(term => haystack.includes(term));
      });
    }
    if (!nameSortDirection) return list;
    return [...list].sort((a, b) => {
      const result = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
      return nameSortDirection === 'asc' ? result : -result;
    });
  }, [detail?.contacts, contactSearch, nameSortDirection]);

  function toggleNameSort() {
    setNameSortDirection(current => {
      if (current === 'asc') return 'desc';
      if (current === 'desc') return '';
      return 'asc';
    });
  }

  function renderHighlightedText(value, fallback = null) {
    const text = String(value || '');
    if (!text) return fallback;
    const terms = contactSearch.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return text;
    const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'ig');
    return text.split(re).map((part, i) => (
      terms.some(term => part.toLowerCase() === term.toLowerCase())
        ? <mark key={`${part}-${i}`} className="rf-ct__match">{part}</mark>
        : part
    ));
  }

  function highlightWithQuery(value, query) {
    const text = String(value || '');
    if (!text) return text;
    const terms = String(query || '').trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return text;
    const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'ig');
    return text.split(re).map((part, i) => (
      terms.some(term => part.toLowerCase() === term.toLowerCase())
        ? <mark key={`${part}-${i}`} className="rf-ct__match">{part}</mark>
        : part
    ));
  }

  async function openGroup(id) {
    resetContactsScroll();
    setSelectedId(id); setDetailLoading(true); setEditingId(null);
    setContactSearch('');
    setEditingName(false); setEditingLogo(false); setEditingCareers(false);
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
      const companyName = capitalizeDisplayName(newName);
      const r = await authedFetch(`${API}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, logoUrl: newLogo.trim(), careersPageUrl: newCareers.trim() }),
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
      const nextValue = field === 'companyName' ? capitalizeDisplayName(value) : value;
      const r = await authedFetch(`${API}/api/groups/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: nextValue }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setDetail(p => ({ ...p, [field]: d[field] ?? nextValue }));
      if (field === 'companyName') setEditingName(false);
      if (field === 'logoUrl') setEditingLogo(false);
      if (field === 'careersPageUrl') setEditingCareers(false);
      loadGroups();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setSavingGroupField(false); }
  }

  async function saveDetailFields() {
    if (!detail || savingGroupField) return;
    const payload = {};
    const nextName = capitalizeDisplayName(nameInput);
    if (nextName && nextName !== detail.companyName) payload.companyName = nextName;
    if (detail.careersPageUrl !== undefined && careersInput !== (detail.careersPageUrl || '')) {
      payload.careersPageUrl = careersInput;
    }
    if (!Object.keys(payload).length) { setEditingName(false); return; }
    setSavingGroupField(true);
    try {
      const r = await authedFetch(`${API}/api/groups/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setDetail(p => ({
        ...p,
        ...(payload.companyName !== undefined ? { companyName: d.companyName ?? payload.companyName } : {}),
        ...(payload.careersPageUrl !== undefined ? { careersPageUrl: d.careersPageUrl ?? payload.careersPageUrl } : {}),
      }));
      setEditingName(false);
      loadGroups();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setSavingGroupField(false); }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setContactForm({
      name: c.name || '', email: c.email || '', mobile: c.mobile || '', role: c.role || '',
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
      const payload = normalizeContactPayload(contactForm);
      const r = await authedFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      if (isNew) setDetail(p => ({ ...p, contacts: [d, ...(p?.contacts || [])] }));
      else setDetail(p => ({ ...p, contacts: (p?.contacts || []).map(c => c.id === editingId ? d : c) }));
      setEditingId(null); loadGroups();
    } catch (e) { setNotice({ type: 'error', message: e.message }); }
    finally { setSavingContact(false); }
  }

  async function cycleEmailStatus(c) {
    if (!detail) return;
    const cur = EMAIL_STATUS_ORDER.includes(c.email_status) ? c.email_status : 'verified';
    const next = EMAIL_STATUS_ORDER[(EMAIL_STATUS_ORDER.indexOf(cur) + 1) % EMAIL_STATUS_ORDER.length];
    // Optimistic update
    setDetail(p => ({ ...p, contacts: (p?.contacts || []).map(x => x.id === c.id ? { ...x, email_status: next } : x) }));
    try {
      const r = await authedFetch(`${API}/api/groups/${detail.id}/contacts/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_status: next }),
      });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setDetail(p => ({ ...p, contacts: (p?.contacts || []).map(x => x.id === c.id ? d : x) }));
    } catch (e) {
      // revert
      setDetail(p => ({ ...p, contacts: (p?.contacts || []).map(x => x.id === c.id ? { ...x, email_status: cur } : x) }));
      setNotice({ type: 'error', message: e.message });
    }
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

  function copyVal(text, key) { navigator.clipboard.writeText(text || '').then(() => setCopiedField(key)); }

  function handleNameClick(contact, anchorEl) {
    const key = contact.id;
    // Capture the button's screen position now — by the time the setTimeout fires,
    // React may have re-rendered the row and the synthetic event's currentTarget is gone.
    const rect = anchorEl?.getBoundingClientRect?.();
    if (clickTimerRef.current[key]) {
      clearTimeout(clickTimerRef.current[key]);
      delete clickTimerRef.current[key];
      copyVal(contact.name, `name-${contact.id}-full`);
      showCopyTip(rect, 'Full name copied');
    } else {
      clickTimerRef.current[key] = setTimeout(() => {
        delete clickTimerRef.current[key];
        const firstName = (contact.name || '').split(/\s+/)[0];
        copyVal(firstName || contact.name, `name-${contact.id}-first`);
        showCopyTip(rect, 'Click twice to copy full');
      }, 220);
    }
  }

  const [copyTip, setCopyTip] = useState(null);
  const copyTipTimerRef = useRef(null);
  function showCopyTip(rect, text) {
    if (!rect) return;
    if (copyTipTimerRef.current) clearTimeout(copyTipTimerRef.current);
    setCopyTip({ text, x: rect.left + rect.width / 2, y: rect.top });
    copyTipTimerRef.current = setTimeout(() => setCopyTip(null), 1800);
  }
  useEffect(() => () => { if (copyTipTimerRef.current) clearTimeout(copyTipTimerRef.current); }, []);

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
    const headers = ['Name', 'Email', 'Role', 'LinkedIn', 'Connection Status', 'Email Status', 'Mobile'];
    const rows = detail.contacts.map(c => [c.name, c.email, c.role, c.linkedin, c.connectionStatus, c.email_status, c.mobile || '']);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(detail.companyName || 'contacts').replace(/[^a-z0-9]/gi, '_')}_contacts.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [exportingAll, setExportingAll] = useState(false);
  async function exportAllCSV() {
    if (exportingAll || !groups.length) return;
    setExportingAll(true);
    try {
      const headers = ['Company', 'Name', 'Email', 'Role', 'LinkedIn', 'Connection Status', 'Email Status', 'Mobile'];
      const rows = [];
      for (const g of groups) {
        if (!g.contactCount) continue;
        try {
          const r = await authedFetch(`${API}/api/groups/${g.id}`);
          const data = await r.json();
          if (!r.ok) continue;
          for (const c of (data.contacts || [])) {
            rows.push([data.companyName || g.companyName, c.name, c.email, c.role, c.linkedin, c.connectionStatus, c.email_status, c.mobile || '']);
          }
        } catch {/* skip failed group */}
      }
      if (!rows.length) {
        setNotice({ type: 'info', message: 'No contacts to export' });
        return;
      }
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reachflow_all_contacts_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice({ type: 'success', message: `Exported ${rows.length} contact${rows.length !== 1 ? 's' : ''} across ${groups.filter(g => g.contactCount).length} compan${groups.filter(g => g.contactCount).length !== 1 ? 'ies' : 'y'}.` });
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Export failed' });
    } finally {
      setExportingAll(false);
    }
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
        const payload = normalizeContactPayload(contact, 'Recruiter');
        const r = await authedFetch(`${API}/api/groups/${detail.id}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.name, email: payload.email, mobile: payload.mobile || '', role: payload.role,
            linkedin: payload.linkedin || '', email_status: payload.email_status || 'tentative',
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
    <div className="rf-page rf-page--wide rf-contacts-page" ref={pageRef}>
      {copyTip && (
        <div
          className="rf-copy-toast"
          role="status"
          style={{ top: Math.max(8, copyTip.y - 36), left: copyTip.x }}
        >
          {copyTip.text}
        </div>
      )}
      {hoverTip && (
        <div
          className="rf-hover-tip"
          role="tooltip"
          style={{ top: hoverTip.y, left: hoverTip.x }}
        >
          {hoverTip.text}
        </div>
      )}
      <header className="rf-page-header rf-ct__page-header">
        <div className="rf-page-header__lead">
          <div className="rf-page-header__eyebrow"><DotMark /> Contacts</div>
          <h1 className="rf-page-header__title">Companies & contacts</h1>
          <p className="rf-page-header__subtitle">
            Group HR, recruiters, and hiring managers by company. Import groups straight into Compose, or jump to your applications for any company.
          </p>
        </div>
        <div className="rf-page-header__actions rf-ct__header-side">
          {/* Top row — global contact search */}
          <div className="rf-ct__global-search-wrap" ref={globalSearchRef}>
            <div className="rf-search rf-ct__global-search">
              <Search size={14} className="rf-search__icon" />
              <input
                ref={globalSearchInputRef}
                className="rf-search__input"
                placeholder="Search all contacts…"
                value={globalSearch}
                onChange={e => { setGlobalSearch(e.target.value); setGlobalSearchOpen(true); }}
                onFocus={() => { setGlobalSearchOpen(true); loadAllContacts(); }}
                onKeyDown={e => { if (e.key === 'Escape') { setGlobalSearchOpen(false); setGlobalSearch(''); } }}
              />
              {globalSearch && (
                <button className="rf-ct__search-clear" onClick={() => { setGlobalSearch(''); setGlobalSearchOpen(false); }} aria-label="Clear global search">
                  <X size={13} />
                </button>
              )}
            </div>
            {globalSearchOpen && (globalSearch.trim() || allContactsLoading) && (
              <div className="rf-ct__global-dropdown">
                {allContactsLoading ? (
                  <div className="rf-ct__global-status"><Loader size={13} className="rf-spin" /> Loading contacts…</div>
                ) : !globalSearch.trim() ? null : globalSearchResults.length === 0 ? (
                  <div className="rf-ct__global-status">No results for "{globalSearch}"</div>
                ) : (
                  <>
                    {globalSearchResults.map(({ contact, group }, i) => (
                      <div
                        key={`${group.id}-${contact.id || i}`}
                        className="rf-ct__global-result"
                        onClick={() => { openGroup(group.id); navigateTo(`/contacts/${group.id}`); setGlobalSearchOpen(false); }}
                      >
                        <span className="rf-ct__global-result-name" title={contact.name || ''}>
                          {highlightWithQuery(contact.name || '—', globalSearch)}
                          {contact.name && (
                            <button
                              className={`rf-copy-btn${copiedField === `gs-n-${i}` ? ' rf-copy-btn--copied' : ''}`}
                              onClick={e => { e.stopPropagation(); copyVal(contact.name, `gs-n-${i}`); }}
                              title="Copy name"
                            >
                              {copiedField === `gs-n-${i}` ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          )}
                        </span>
                        {contact.email && (
                          <span className="rf-ct__global-result-email" title={contact.email}>
                            <Mail size={11} />
                            <span className="rf-ct__global-result-email-text">{highlightWithQuery(contact.email, globalSearch)}</span>
                            <button
                              className={`rf-copy-btn${copiedField === `gs-e-${i}` ? ' rf-copy-btn--copied' : ''}`}
                              onClick={e => { e.stopPropagation(); copyVal(contact.email, `gs-e-${i}`); }}
                              title="Copy email"
                            >
                              {copiedField === `gs-e-${i}` ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </span>
                        )}
                        <span className="rf-ct__global-result-meta" title={group.companyName}>
                          <Building2 size={11} />
                          <span className="rf-truncate">{group.companyName}</span>
                          {contact.linkedin && <ExternalLink size={11} />}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Bottom row — stats + action buttons */}
          <div className="rf-ct__header-meta">
            <span className="rf-ct__header-stats">
              <span className="rf-num rf-ct__header-stat-num">{groups.length}</span> companies
              <span className="rf-ct__meta-dot">·</span>
              <span className="rf-num rf-ct__header-stat-num">{totalContacts}</span> contacts
            </span>
            <button
              className="rf-btn rf-btn--ghost rf-btn--sm"
              onClick={exportAllCSV}
              disabled={exportingAll || !totalContacts}
              title={totalContacts ? 'Export every contact across all companies as CSV' : 'Add contacts first'}
            >
              {exportingAll ? <Loader size={14} className="rf-spin" /> : <FileDown size={14} />}
              {exportingAll ? 'Exporting…' : 'Export all'}
            </button>
            <button
              className="rf-btn rf-btn--ghost rf-btn--sm"
              onClick={openGlobalPaste}
            >
              <ClipboardPaste size={14} /> Global paste
            </button>
          </div>
        </div>
      </header>

      <div
        className="rf-ct"
        style={{ gridTemplateColumns: sidebarCollapsed ? `52px var(--rf-sp-4) minmax(0,1fr)` : `${sidebarWidth}px 8px minmax(0,1fr)` }}
      >
        {/* Edge-hugging collapse pill (mirrors the main app sidebar pattern) */}
        <button
          className="rf-ct__edge-collapse"
          onClick={() => { (sidebarCollapsed ? setSidebarCollapsed(false) : handleCollapse()); hideHoverTip(); }}
          onMouseEnter={(e) => showHoverTip(e, sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
          onMouseLeave={hideHoverTip}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ left: `${(sidebarCollapsed ? 52 : sidebarWidth) - 12}px` }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* Left pane — companies */}
        {sidebarCollapsed ? (
          <aside className="rf-ct__sidebar rf-ct__sidebar--collapsed">
            <div className="rf-ct__collapsed-head">
              <button
                className="rf-ct__collapsed-action"
                onClick={() => { expandAndFocusSearch(); hideHoverTip(); }}
                onMouseEnter={(e) => showHoverTip(e, 'Search companies')}
                onMouseLeave={hideHoverTip}
                aria-label="Search companies"
              >
                <Search size={14} />
              </button>
              <button
                className={`rf-ct__collapsed-action${sortCompaniesAZ ? ' rf-ct__collapsed-action--active' : ''}`}
                onClick={() => setSortCompaniesAZ(v => !v)}
                onMouseEnter={(e) => showHoverTip(e, sortCompaniesAZ ? 'Sorted A–Z (click to reset)' : 'Sort companies A–Z')}
                onMouseLeave={hideHoverTip}
                aria-label="Sort companies A-Z"
              >
                <ArrowUpDown size={14} />
              </button>
              <button
                className="rf-ct__collapsed-action"
                onClick={() => { expandAndStartCreate(); hideHoverTip(); }}
                onMouseEnter={(e) => showHoverTip(e, 'New company')}
                onMouseLeave={hideHoverTip}
                aria-label="New company"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="rf-ct__collapsed-list">
              {filtered.map(g => {
                const tip = `${g.companyName} · ${g.contactCount || 0} contact${(g.contactCount || 0) === 1 ? '' : 's'}`;
                return (
                  <button
                    key={g.id}
                    className={`rf-ct__collapsed-company${selectedId === g.id ? ' rf-ct__collapsed-company--active' : ''}`}
                    onClick={() => { openGroup(g.id); navigateTo(`/contacts/${g.id}`); hideHoverTip(); }}
                    onMouseEnter={(e) => showHoverTip(e, tip)}
                    onMouseLeave={hideHoverTip}
                    onFocus={(e) => showHoverTip(e, tip)}
                    onBlur={hideHoverTip}
                    aria-label={g.companyName}
                  >
                    {g.logoUrl ? <img src={g.logoUrl} alt="" /> : <Building2 size={16} />}
                  </button>
                );
              })}
            </div>
          </aside>
        ) : (
          <aside className="rf-ct__sidebar">
            <div className="rf-ct__sidebar-head">
              <div className="rf-ct__sidebar-tools">
                <div className="rf-search">
                  <Search size={14} className="rf-search__icon" />
                  <input
                    ref={searchInputRef}
                    className="rf-search__input"
                    placeholder="Search companies…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      className="rf-ct__search-clear"
                      onClick={() => setSearch('')}
                      aria-label="Clear company search"
                      title="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="rf-ct__sidebar-actions">
                  <button
                    className={`rf-btn rf-btn--ghost rf-btn--sm rf-ct__sort${sortCompaniesAZ ? ' rf-ct__sort--active' : ''}`}
                    onClick={() => setSortCompaniesAZ(v => !v)}
                    title={sortCompaniesAZ ? 'Using alphabetical order' : 'Sort companies A-Z'}
                  >
                    <ArrowUpDown size={13} /> Sort
                  </button>
                  <div className="rf-ct__new-company-action">
                    <button
                      className="rf-btn rf-btn--primary rf-btn--sm rf-ct__new-company"
                      onClick={startCreateCompany}
                      title={`New company (${newCompanyShortcutLabel})`}
                    >
                      <Plus size={16} strokeWidth={2.4} /> New company <kbd className="rf-ct__shortcut">{newCompanyShortcutLabel}</kbd>
                    </button>
                  </div>
                </div>
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
        )}

        {/* Resize handle — always rendered so grid column count stays at 3 */}
        <div
          className="rf-ct__resize-handle"
          style={sidebarCollapsed ? { cursor: 'default', pointerEvents: 'none' } : undefined}
          onMouseDown={sidebarCollapsed ? undefined : startResize}
        />

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
                  ) : editingName ? (
                    <div className="rf-ct__name-edit">
                      <input
                        className="rf-input rf-input--sm"
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        placeholder="Company name"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveDetailFields(); if (e.key === 'Escape') setEditingName(false); }}
                      />
                      {detail.careersPageUrl ? (
                        <input
                          className="rf-input rf-input--sm"
                          value={careersInput}
                          onChange={e => setCareersInput(e.target.value)}
                          placeholder="Careers page URL"
                          onKeyDown={e => { if (e.key === 'Enter') saveDetailFields(); if (e.key === 'Escape') setEditingName(false); }}
                        />
                      ) : null}
                      <button className="rf-btn rf-btn--primary rf-btn--icon rf-btn--sm" onClick={saveDetailFields} disabled={savingGroupField || !nameInput.trim()} title="Save"><Check size={13} /></button>
                      <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setEditingName(false)} title="Cancel"><X size={13} /></button>
                    </div>
                  ) : (
                    <div className="rf-ct__title-meta-row">
                      <h2 className="rf-ct__title">{detail.companyName}</h2>
                      <span className="rf-ct__meta-dot">·</span>
                      <span className="rf-ct__title-people">
                        <span className="rf-num">{(detail.contacts || []).length}</span> people
                      </span>
                      <span className="rf-ct__meta-dot">·</span>
                      {editingCareers ? (
                        <span className="rf-ct__careers-edit">
                          <input
                            className="rf-input rf-input--sm"
                            style={{ width: 200 }}
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
                        </a>
                      ) : (
                        <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setCareersInput(''); setEditingCareers(true); }}>
                          <Plus size={11} /> Careers page
                        </button>
                      )}
                      {/* Single combined edit pencil — edits name (and careers URL when present) */}
                      <button
                        className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm rf-ct__title-edit"
                        onClick={() => {
                          setNameInput(detail.companyName || '');
                          setCareersInput(detail.careersPageUrl || '');
                          setEditingName(true);
                        }}
                        title={detail.careersPageUrl ? 'Edit company name & careers URL' : 'Edit company name'}
                      ><Pencil size={12} /></button>
                    </div>
                  )}
                </div>

                <div className="rf-ct__detail-actions">
                  <div className="rf-search rf-ct__contact-search rf-ct__contact-search--inline">
                    <Search size={13} className="rf-search__icon" />
                    <input
                      className="rf-search__input"
                      placeholder="Search name or email…"
                      value={contactSearch}
                      onChange={e => setContactSearch(e.target.value)}
                    />
                    {contactSearch && (
                      <button
                        className="rf-ct__search-clear"
                        onClick={() => setContactSearch('')}
                        aria-label="Clear people search"
                        title="Clear search"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <input ref={csvFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCSVFile} />
                  <button
                    className="rf-btn rf-btn--ghost rf-btn--sm"
                    onClick={() => { setBulkPasteText(''); setBulkPasteOpen(true); }}
                  >
                    <ClipboardPaste size={13} /> Paste
                  </button>
                  <button
                    className="rf-btn rf-btn--primary rf-btn--sm"
                    onClick={() => { setEditingId('__new__'); setContactForm(contactFormDefaults()); }}
                  >
                    <Plus size={13} /> Add contact
                  </button>
                  <div className="rf-ct__detail-menu" ref={detailMenuRef}>
                    <button
                      className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm"
                      onClick={() => setDetailMenuOpen(v => !v)}
                      title="More actions"
                      aria-haspopup="menu"
                      aria-expanded={detailMenuOpen}
                    >
                      <MoreVertical size={14} />
                    </button>
                    {detailMenuOpen && (
                      <div className="rf-ct__detail-menu-pop" role="menu">
                        <button
                          className="rf-ct__detail-menu-item"
                          onClick={() => { setDetailMenuOpen(false); navigateTo(`/pipeline?company=${encodeURIComponent(detail.companyName)}`); }}
                        >
                          <Briefcase size={13} /> View applications
                        </button>
                        <button
                          className="rf-ct__detail-menu-item"
                          onClick={() => { setDetailMenuOpen(false); composeToCompany(); }}
                          disabled={!(detail.contacts || []).length}
                          title={(detail.contacts || []).length ? 'Open Compose, then import this group' : 'Add contacts first'}
                        >
                          <Send size={13} /> Compose to group
                        </button>
                        <div className="rf-ct__detail-menu-sep" role="separator" />
                        <button
                          className="rf-ct__detail-menu-item"
                          onClick={() => { setDetailMenuOpen(false); csvFileRef.current?.click(); }}
                        >
                          <Upload size={13} /> Import CSV
                        </button>
                        <button
                          className="rf-ct__detail-menu-item"
                          onClick={() => { setDetailMenuOpen(false); exportCSV(); }}
                          disabled={!detail.contacts?.length}
                        >
                          <FileDown size={13} /> Export
                        </button>
                        <div className="rf-ct__detail-menu-sep" role="separator" />
                        <button
                          className="rf-ct__detail-menu-item rf-ct__detail-menu-item--danger"
                          onClick={() => { setDetailMenuOpen(false); deleteGroup(); }}
                        >
                          <Trash2 size={13} /> Delete company
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              <div className="rf-ct__detail-body" ref={detailBodyRef}>

                <div className="rf-ct__table-wrap">
                  <table className="rf-ct__table">
                    <thead>
                      <tr>
                        <th>
                          <button className="rf-ct__th-sort" onClick={toggleNameSort} title="Sort names alphabetically">
                            <ArrowUpDown size={12} /> Name
                            {nameSortDirection && <span className="rf-ct__sort-indicator">{nameSortDirection === 'asc' ? 'A-Z' : 'Z-A'}</span>}
                          </button>
                        </th>
                        <th>Email</th>
                        <th style={{ width: 140 }}>Role</th>
                        <th style={{ width: 150, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingId === '__new__' && (
                        <tr className="rf-ct__table-edit">
                          <td>
                            <div className="rf-ct__edit-stack">
                              <input className="rf-input rf-input--sm" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" autoFocus />
                              <div className="rf-ct__edit-linkedin">
                                <Linkedin size={12} />
                                <input className="rf-input rf-input--sm" value={contactForm.linkedin || ''} onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="LinkedIn URL (optional)" />
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="rf-ct__edit-stack">
                              <input className="rf-input rf-input--sm" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="email@company.com" />
                              <div className="rf-ct__edit-mobile">
                                <Phone size={12} />
                                <input
                                  className="rf-input rf-input--sm"
                                  value={contactForm.mobile || ''}
                                  onChange={e => setContactForm(f => ({ ...f, mobile: e.target.value }))}
                                  placeholder="Mobile (optional)"
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <select className="rf-select rf-input--sm" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
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
                      {visibleContacts.map(c => editingId === c.id ? (
                        <tr key={c.id} className="rf-ct__table-edit">
                          <td>
                            <div className="rf-ct__edit-stack">
                              <input className="rf-input rf-input--sm" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
                              <div className="rf-ct__edit-linkedin">
                                <Linkedin size={12} />
                                <input className="rf-input rf-input--sm" value={contactForm.linkedin || ''} onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="LinkedIn URL (optional)" />
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="rf-ct__edit-stack">
                              <input className="rf-input rf-input--sm" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                              <div className="rf-ct__edit-mobile">
                                <Phone size={12} />
                                <input
                                  className="rf-input rf-input--sm"
                                  value={contactForm.mobile || ''}
                                  onChange={e => setContactForm(f => ({ ...f, mobile: e.target.value }))}
                                  placeholder="Mobile (optional)"
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <select className="rf-select rf-input--sm" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '—'}</option>)}
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
                            <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}>
                              <span className="rf-ct__contact-name" style={{ fontWeight: 600 }}>{renderHighlightedText(c.name, <em style={{ color: 'var(--rf-text-faint)' }}>Unnamed</em>)}</span>
                              {c.linkedin && (
                                <a href={c.linkedin} target="_blank" rel="noreferrer" title="LinkedIn">
                                  <ExternalLink size={12} style={{ color: 'var(--rf-info-text)' }} />
                                </a>
                              )}
                              {c.name && (
                                <button
                                  className={`rf-copy-btn ${copiedField.startsWith(`name-${c.id}-`) ? 'rf-copy-btn--copied' : ''}`}
                                  title={
                                    copiedField === `name-${c.id}-full` ? 'Full name copied'
                                    : copiedField === `name-${c.id}-first` ? 'First name copied · click twice for full name'
                                    : 'Copy first name · double-click for full name'
                                  }
                                  onClick={(e) => handleNameClick(c, e.currentTarget)}
                                >
                                  {copiedField.startsWith(`name-${c.id}-`) ? <Check size={11} /> : <Copy size={11} />}
                                </button>
                              )}
                            </span>
                          </td>
                          <td>
                            <div className="rf-ct__email-stack">
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <EmailStatusIcon status={c.email_status} onCycle={() => cycleEmailStatus(c)} />
                                <span className="rf-truncate" style={{ maxWidth: 240 }}>{renderHighlightedText(c.email, <em style={{ color: 'var(--rf-text-faint)' }}>—</em>)}</span>
                                {c.email && (
                                  <button
                                    className={`rf-copy-btn ${copiedField === `e-${c.id}` ? 'rf-copy-btn--copied' : ''}`}
                                    onClick={() => copyVal(c.email, `e-${c.id}`)}
                                    title={copiedField === `e-${c.id}` ? 'Email copied' : 'Copy email'}
                                  >
                                    {copiedField === `e-${c.id}` ? <Check size={11} /> : <Copy size={11} />}
                                  </button>
                                )}
                              </span>
                              {c.mobile && (
                                <span className="rf-ct__mobile-line">
                                  <Phone size={11} />
                                  <span className="rf-truncate" style={{ maxWidth: 220 }}>{c.mobile}</span>
                                  <button
                                    className={`rf-copy-btn ${copiedField === `m-${c.id}` ? 'rf-copy-btn--copied' : ''}`}
                                    onClick={() => copyVal(c.mobile, `m-${c.id}`)}
                                    title={copiedField === `m-${c.id}` ? 'Mobile copied' : 'Copy mobile'}
                                  >
                                    {copiedField === `m-${c.id}` ? <Check size={11} /> : <Copy size={11} />}
                                  </button>
                                </span>
                              )}
                            </div>
                          </td>
                          <td><span className="rf-badge rf-badge--neutral">{c.role || '—'}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm rf-ct__conv-btn"
                              onClick={() => openConversations(c)}
                              title={`Conversations${(c.conversations || []).length ? ` (${c.conversations.length})` : ''}`}
                            >
                              <MessageSquare size={13} />
                              {(c.conversations || []).length > 0 && (
                                <span className="rf-ct__conv-badge">{c.conversations.length}</span>
                              )}
                            </button>
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => startEdit(c)} title="Edit"><Pencil size={13} /></button>
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => deleteContact(c.id)} title="Delete"><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                      {(detail.contacts || []).length > 0 && !visibleContacts.length && editingId !== '__new__' && (
                        <tr>
                          <td colSpan={5} style={{ padding: 36 }}>
                            <div className="rf-empty" style={{ padding: 0 }}>
                              <Search size={22} className="rf-empty__icon" />
                              <div className="rf-empty__title">No matching contacts</div>
                              <p className="rf-empty__desc">Try a different name or email search.</p>
                            </div>
                          </td>
                        </tr>
                      )}
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
                                  onClick={() => { setEditingId('__new__'); setContactForm(contactFormDefaults()); }}
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

      {/* Global bulk paste modal */}
      {globalPasteOpen && (
        <div className="rf-dialog-overlay">
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="rf-dialog__title"><ClipboardPaste size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} /> Global bulk paste</div>
            <div className="rf-dialog__body">
              <p className="rf-help" style={{ marginTop: 0 }}>
                Paste people from any company. Matching companies are added to existing groups; unmatched rows need a company created first.
              </p>
              <ul className="rf-help-tips">
                <li>One contact per line. Email anywhere on the line; name &amp; company keywords are auto-detected.</li>
                <li>Append <code>V</code> at the end of a row to mark the email as <strong>Valid</strong>. Example: <code>Jane jane@acme.com V</code>.</li>
                <li>Phone numbers are auto-extracted (international too): <code>+1 415-555-1234</code>, <code>(555) 123-4567</code>, <code>9876543210</code>.</li>
                <li>LinkedIn URLs are auto-extracted: <code>linkedin.com/in/username</code> or full https URL.</li>
              </ul>
              <textarea
                className="rf-textarea"
                style={{ fontFamily: 'var(--rf-font-mono)', fontSize: 13, minHeight: 150 }}
                placeholder={"Jane Smith jane@stripe.com linkedin.com/in/janesmith +1 415-555-1234\nAcme, John Doe, john@acme.com V\nalex@unknown.com 9876543210"}
                value={globalPasteText}
                onChange={e => setGlobalPasteText(e.target.value)}
                disabled={globalAdding}
              />
              {globalParsed.length > 0 && (
                <div className="rf-bulk-preview" style={{ marginTop: 12 }}>
                  {globalParsed.map((p, i) => (
                    <div key={`${p.source}-${i}`} className={`rf-bulk-row${!p.targetGroup ? ' rf-bulk-row--dupe' : ''}`}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{p.name || <span style={{ color: 'var(--rf-text-faint)' }}>—</span>}</span>
                      <span style={{ flex: 1, color: 'var(--rf-text-muted)' }}>{p.email || 'No email'}</span>
                      {p.mobile && (
                        <span className="rf-badge rf-badge--neutral" title="Detected mobile">
                          <Phone size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} />{p.mobile}
                        </span>
                      )}
                      {p.linkedin && (
                        <span className="rf-badge rf-badge--neutral" title={p.linkedin}>
                          <Linkedin size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} />LinkedIn
                        </span>
                      )}
                      <span className={`rf-badge ${p.targetGroup ? 'rf-badge--success' : 'rf-badge--warning'}`}>
                        {p.targetGroup ? p.targetGroup.companyName : 'create company first'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {globalUnmatched.length > 0 && (
                <p className="rf-help" style={{ marginTop: 10 }}>
                  {globalUnmatched.length} row{globalUnmatched.length === 1 ? '' : 's'} could not be matched. Copy them and save them somewhere until the company group exists.
                </p>
              )}
            </div>
            <div className="rf-dialog__actions">
              <span style={{ marginRight: 'auto', fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)' }}>
                {globalReady.length} ready · {globalUnmatched.length} unmatched
              </span>
              {globalUnmatched.length > 0 && (
                <button className="rf-btn rf-btn--ghost" onClick={copyUnmatchedGlobalRows} disabled={globalAdding}>
                  <Copy size={14} /> Copy unmatched
                </button>
              )}
              <button className="rf-btn rf-btn--ghost" onClick={closeGlobalPaste} disabled={globalAdding}>Cancel</button>
              <button
                className="rf-btn rf-btn--primary"
                onClick={addGlobalParsedContacts}
                disabled={globalAdding || !globalReady.length}
              >
                {globalAdding ? <Loader size={14} className="rf-spin" /> : <Check size={14} />}
                Add {globalReady.length}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk paste modal */}
      {bulkPasteOpen && (
        <div className="rf-dialog-overlay">
          <div className="rf-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="rf-dialog__title"><ClipboardPaste size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} /> Bulk paste contacts</div>
            <div className="rf-dialog__body">
              <p className="rf-help" style={{ marginTop: 0 }}>
                One contact per line. Formats accepted: <code>Name, email</code>, <code>Name &lt;email&gt;</code>, or just an email. Role defaults to Recruiter.
              </p>
              <ul className="rf-help-tips">
                <li>Append <code>V</code> at the end of a row to mark the email <strong>Valid</strong>. Example: <code>Jane jane@acme.com V</code>.</li>
                <li>Phone numbers auto-detected — international &amp; common formats supported.</li>
                <li>LinkedIn URLs auto-detected: <code>linkedin.com/in/username</code> or full URL.</li>
              </ul>
              <textarea
                className="rf-textarea"
                style={{ fontFamily: 'var(--rf-font-mono)', fontSize: 13, minHeight: 140 }}
                placeholder={"John Smith, john@company.com, +1 415-555-1234\nJane Doe <jane@corp.io> linkedin.com/in/janedoe V\nalice@example.com 9876543210"}
                value={bulkPasteText}
                onChange={e => setBulkPasteText(e.target.value)}
              />
              {bulkParsed.length > 0 && (
                <div className="rf-bulk-preview" style={{ marginTop: 12 }}>
                  {bulkParsed.map((p, i) => (
                    <div key={i} className={`rf-bulk-row${isDupe(p) ? ' rf-bulk-row--dupe' : ''}`}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{p.name || <span style={{ color: 'var(--rf-text-faint)' }}>—</span>}</span>
                      <span style={{ flex: 1, color: 'var(--rf-text-muted)' }}>{p.email}</span>
                      {p.mobile && (
                        <span className="rf-badge rf-badge--neutral" title="Detected mobile">
                          <Phone size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} />{p.mobile}
                        </span>
                      )}
                      {p.linkedin && (
                        <span className="rf-badge rf-badge--neutral" title={p.linkedin}>
                          <Linkedin size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} />LinkedIn
                        </span>
                      )}
                      {p.email_status === 'verified' && <span className="rf-badge rf-badge--success" title="Marked Valid via V flag">V</span>}
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

      {/* Conversations drawer */}
      {drawerContact && detail && (
        <ConversationsDrawer
          contact={drawerContact}
          groupId={detail.id}
          companyName={detail.companyName}
          applications={apps}
          authedFetch={authedFetch}
          apiBase={API}
          onClose={closeConversations}
          onContactUpdated={applyContactUpdate}
          setNotice={setNotice}
          setWarningDialog={setWarningDialog}
          onNavigate={(path) => navigateTo(path)}
        />
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
