import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Pencil, Check, X, ChevronRight, Mail, Linkedin, Plus, ClipboardPaste, FileUp, FileDown, AlertTriangle } from 'lucide-react';
import ContactsTable from './ContactsTable.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS = ['', 'Recruiter', 'Hiring Manager', 'HR', 'Engineer', 'Designer', 'PM', 'Founder', 'Other'];
const CONNECTION_OPTIONS = [
    { value: 'not_connected', label: 'Not Connected' },
    { value: 'request_sent', label: 'Pending' },
    { value: 'connected', label: 'Connected' },
];

function buildContactFormDefaults({ fastEntry = false } = {}) {
    return {
        name: '',
        email: '',
        role: fastEntry ? 'Recruiter' : '',
        linkedin: '',
        connectionStatus: 'not_connected',
        email_status: fastEntry ? 'verified' : 'tentative',
        lastContactedDate: '',
        emailCount: 0,
        linkedInCount: 0,
    };
}

function normalizeLinkedinUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const cleaned = withScheme.replace(/[),.;\]]+$/, '');
    return /linkedin\.com\//i.test(cleaned) ? cleaned : '';
}

function nameFromLinkedin(linkedinUrl) {
    const match = String(linkedinUrl || '').match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (!match?.[1]) return '';
    return match[1]
        .split(/[-_]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function extractLinkedinUrlsFromHtml(html) {
    if (!html || typeof window === 'undefined' || !window.DOMParser) return [];
    try {
        const doc = new window.DOMParser().parseFromString(String(html), 'text/html');
        return Array.from(doc.querySelectorAll('a[href]'))
            .map(a => normalizeLinkedinUrl(a.getAttribute('href')))
            .filter(Boolean);
    } catch (_err) {
        return [];
    }
}

function normalizeCompanyKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toTitleCase(value) {
    return String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function companyFromEmail(email) {
    const domain = String(email || '').split('@')[1] || '';
    const companyPart = domain.split('.')[0] || '';
    const normalizedPart = companyPart.replace(/[-_]+/g, ' ').trim();
    const fallback = normalizedPart || 'Unknown Company';
    return toTitleCase(fallback);
}

function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                field += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(field);
            field = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i += 1;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            continue;
        }

        field += char;
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function csvEscape(value) {
    const text = String(value || '');
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

export default function GroupManager({ open = false, onClose, authedFetch, standalone = false }) {
    const isVisible = standalone || open;

    /* ── state ── */
    const [groups, setGroups] = useState([]);
    const [view, setView] = useState('grid');           // 'grid' | 'detail'
    const [activeGroup, setActiveGroup] = useState(null); // full group object with contacts
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
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
    const [contactForm, setContactForm] = useState(buildContactFormDefaults());
    const [newContactForm, setNewContactForm] = useState(buildContactFormDefaults({ fastEntry: true }));
    const [savingContactId, setSavingContactId] = useState(null);
    const [savingNewEntry, setSavingNewEntry] = useState(false);
    const [deletingContactId, setDeletingContactId] = useState('');

    // Unsaved changes tracking
    const [dirty, setDirty] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState(null); // null | { action: fn }
    const [deleteGroupDialogOpen, setDeleteGroupDialogOpen] = useState(false);
    const [deleteContactDialog, setDeleteContactDialog] = useState(null); // null | { id, name }

    // Bulk paste
    const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkRole, setBulkRole] = useState('');
    const [bulkHtml, setBulkHtml] = useState('');
    const [bulkParsed, setBulkParsed] = useState(null); // null | array
    const [bulkMessage, setBulkMessage] = useState('');
    const [bulkParseBusy, setBulkParseBusy] = useState(false);
    const [bulkSaveBusy, setBulkSaveBusy] = useState(false);
    const [copiedField, setCopiedField] = useState('');

    // Global import/export (groups page)
    const [globalImportOpen, setGlobalImportOpen] = useState(false);
    const [globalImportMode, setGlobalImportMode] = useState('bulk'); // 'bulk' | 'csv'
    const [globalText, setGlobalText] = useState('');
    const [globalFileName, setGlobalFileName] = useState('');
    const [globalParsed, setGlobalParsed] = useState(null); // null | parsed array
    const [globalMessage, setGlobalMessage] = useState('');
    const [globalBusy, setGlobalBusy] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);
    const [createGroupBusy, setCreateGroupBusy] = useState(false);
    const [saveInfoBusy, setSaveInfoBusy] = useState(false);
    const [deleteGroupBusy, setDeleteGroupBusy] = useState(false);

    /* ── load groups ── */

    const loadGroups = useCallback(async () => {
        setGroupsLoading(true);
        try {
            const r = await authedFetch(`${API_BASE}/api/groups`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setGroups(d);
        } catch (e) {
            setError(e.message);
        } finally {
            setGroupsLoading(false);
        }
    }, [authedFetch]);

    const loadGroupDetail = useCallback(async (id) => {
        setDetailLoading(true);
        try {
            const r = await authedFetch(`${API_BASE}/api/groups/${id}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setActiveGroup(d);
        } catch (e) {
            setError(e.message);
        } finally {
            setDetailLoading(false);
        }
    }, [authedFetch]);

    useEffect(() => {
        if (isVisible) {
            loadGroups();
            setView('grid');
            setActiveGroup(null);
            setCreating(false);
            setEditingInfo(false);
            setEditingContactId(null);
            setContactForm(buildContactFormDefaults());
            setNewContactForm(buildContactFormDefaults({ fastEntry: true }));
            setDirty(false);
            setError('');
            setDeleteGroupDialogOpen(false);
            setDeleteContactDialog(null);
            setGlobalImportOpen(false);
            setGlobalImportMode('bulk');
            setGlobalText('');
            setGlobalFileName('');
            setGlobalParsed(null);
            setGlobalMessage('');
            setGlobalBusy(false);
            setExportBusy(false);
            setBulkParseBusy(false);
            setBulkSaveBusy(false);
            setCreateGroupBusy(false);
            setSaveInfoBusy(false);
            setDeleteGroupBusy(false);
        }
    }, [isVisible]);

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

    function buildGroupLookup(sourceGroups) {
        const map = new Map();
        for (const g of sourceGroups) {
            const fullKey = normalizeCompanyKey(g.companyName);
            if (fullKey && !map.has(fullKey)) map.set(fullKey, g);
            const firstWord = String(g.companyName || '').trim().split(/\s+/)[0] || '';
            const shortKey = normalizeCompanyKey(firstWord);
            if (shortKey && !map.has(shortKey)) map.set(shortKey, g);
        }
        return map;
    }

    function parseGlobalInputToRows(rawInput) {
        const lines = String(rawInput || '').split('\n').map(l => l.trim()).filter(Boolean);
        const seenEmails = new Set();
        const parsed = [];

        for (const line of lines) {
            const emailMatch = line.match(/([^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+)/);
            if (!emailMatch) continue;
            const email = emailMatch[1].toLowerCase().trim();
            if (!emailRegex.test(email) || seenEmails.has(email)) continue;
            seenEmails.add(email);

            let name = line
                .replace(emailMatch[0], '')
                .replace(/[<>|;,\-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!name) name = nameFromEmail(email);

            const companyName = companyFromEmail(email);
            parsed.push({
                name,
                email,
                companyName,
                companyKey: normalizeCompanyKey(companyName),
            });
        }

        return parsed;
    }

    function annotateParsedRows(rows) {
        const groupLookup = buildGroupLookup(groups);
        return rows.map(row => {
            const matched = groupLookup.get(row.companyKey) || null;
            return {
                ...row,
                targetGroupId: matched?.id || null,
                targetGroupName: matched?.companyName || row.companyName,
                targetExists: !!matched,
                isDuplicate: false,
            };
        });
    }

    async function markGlobalDuplicates(rows) {
        const groupIds = Array.from(new Set(rows.filter(r => r.targetExists && r.targetGroupId).map(r => r.targetGroupId)));
        if (!groupIds.length) return rows;

        const emailMapByGroupId = new Map();
        await Promise.all(groupIds.map(async (groupId) => {
            const resp = await authedFetch(`${API_BASE}/api/groups/${groupId}`);
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to check duplicates');
            const emailSet = new Set((data.contacts || []).map(c => String(c.email || '').toLowerCase()));
            emailMapByGroupId.set(groupId, emailSet);
        }));

        return rows.map(row => {
            if (!row.targetExists || !row.targetGroupId) return row;
            const emailSet = emailMapByGroupId.get(row.targetGroupId);
            return {
                ...row,
                isDuplicate: !!emailSet?.has(String(row.email || '').toLowerCase()),
            };
        });
    }

    async function parseGlobalBulkText() {
        const parsed = parseGlobalInputToRows(globalText);
        if (!parsed.length) {
            setGlobalMessage('No valid contacts detected. Please paste name and email pairs.');
            setGlobalParsed([]);
            return;
        }
        try {
            setGlobalMessage('');
            const annotated = annotateParsedRows(parsed);
            const withDuplicates = await markGlobalDuplicates(annotated);
            setGlobalParsed(withDuplicates);
        } catch (e) {
            setGlobalParsed(null);
            setGlobalMessage(e.message || 'Failed to parse pasted contacts.');
        }
    }

    function parseCsvTextContent(text) {
        const rows = parseCsvRows(text).filter(r => r.some(cell => String(cell || '').trim() !== ''));
        if (rows.length < 2) {
            throw new Error('This is not a valid data inside file to parse.');
        }

        const header = rows[0].map(cell => String(cell || '').trim().toLowerCase());
        if (header.length !== 2 || !header.includes('name') || !header.includes('email')) {
            throw new Error('This is not a valid data inside file to parse.');
        }

        const nameIndex = header.indexOf('name');
        const emailIndex = header.indexOf('email');
        const seenEmails = new Set();
        const parsed = [];

        for (let i = 1; i < rows.length; i += 1) {
            const current = rows[i];
            if (current.length !== 2) {
                throw new Error('This is not a valid data inside file to parse.');
            }

            const rawName = String(current[nameIndex] || '').trim();
            const rawEmail = String(current[emailIndex] || '').toLowerCase().trim();
            if (!rawName || !emailRegex.test(rawEmail)) {
                throw new Error('This is not a valid data inside file to parse.');
            }
            if (seenEmails.has(rawEmail)) continue;
            seenEmails.add(rawEmail);

            const companyName = companyFromEmail(rawEmail);
            parsed.push({
                name: rawName,
                email: rawEmail,
                companyName,
                companyKey: normalizeCompanyKey(companyName),
            });
        }

        if (!parsed.length) {
            throw new Error('This is not a valid data inside file to parse.');
        }
        return parsed;
    }

    function onCsvFilePicked(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setGlobalMessage('');
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const content = String(reader.result || '');
                const parsed = parseCsvTextContent(content);
                setGlobalFileName(file.name);
                setGlobalParsed(null);
                markGlobalDuplicates(annotateParsedRows(parsed))
                    .then(withDuplicates => {
                        setGlobalParsed(withDuplicates);
                    })
                    .catch(err => {
                        setGlobalParsed(null);
                        setGlobalMessage(err.message || 'Failed to parse CSV file.');
                    });
            } catch (e) {
                setGlobalParsed(null);
                setGlobalFileName(file.name);
                setGlobalMessage(e.message || 'This is not a valid data inside file to parse.');
            }
        };
        reader.onerror = () => {
            setGlobalParsed(null);
            setGlobalFileName(file.name);
            setGlobalMessage('Unable to read CSV file.');
        };
        reader.readAsText(file);
    }

    async function saveGlobalParsedContacts() {
        if (!globalParsed?.length || globalBusy) return;
        setGlobalBusy(true);
        setGlobalMessage('');

        const workingGroups = [...groups];
        const lookup = buildGroupLookup(workingGroups);
        const bucketById = new Map();
        let addedCount = 0;
        let duplicateCount = 0;
        let createdGroupCount = 0;
        let failedCount = 0;

        async function getBucketForCompany(row) {
            const normalized = row.companyKey;
            let group = lookup.get(normalized);

            if (!group) {
                const createResp = await authedFetch(`${API_BASE}/api/groups`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyName: row.companyName, logoUrl: '' }),
                });
                const createData = await createResp.json();
                if (!createResp.ok) throw new Error(createData.error || 'Failed to create group');
                group = createData;
                workingGroups.push(group);
                createdGroupCount += 1;
                const refreshedLookup = buildGroupLookup(workingGroups);
                refreshedLookup.forEach((value, key) => lookup.set(key, value));
            }

            if (!bucketById.has(group.id)) {
                const detailResp = await authedFetch(`${API_BASE}/api/groups/${group.id}`);
                const detailData = await detailResp.json();
                if (!detailResp.ok) throw new Error(detailData.error || 'Failed to load group');
                const emailSet = new Set((detailData.contacts || []).map(c => String(c.email || '').toLowerCase()));
                bucketById.set(group.id, { group, emails: emailSet, full: false });
            }

            return bucketById.get(group.id);
        }

        for (const row of globalParsed) {
            try {
                if (row.isDuplicate) {
                    duplicateCount += 1;
                    continue;
                }

                const bucket = await getBucketForCompany(row);
                if (bucket.full || bucket.emails.has(row.email)) {
                    duplicateCount += 1;
                    continue;
                }

                const addResp = await authedFetch(`${API_BASE}/api/groups/${bucket.group.id}/contacts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: row.name,
                        email: row.email,
                        role: '',
                        connectionStatus: 'not_connected',
                        linkedin: '',
                        email_status: 'tentative',
                    }),
                });
                const addData = await addResp.json();

                if (!addResp.ok) {
                    if (addData?.error === 'Group contact limit reached (300).') {
                        bucket.full = true;
                    }
                    failedCount += 1;
                    continue;
                }

                bucket.emails.add(row.email);
                addedCount += 1;
            } catch (_) {
                failedCount += 1;
            }
        }

        await loadGroups();
        setGlobalBusy(false);

        let message = `Added ${addedCount} contact${addedCount !== 1 ? 's' : ''}.`;
        if (createdGroupCount > 0) message += ` Created ${createdGroupCount} new group${createdGroupCount !== 1 ? 's' : ''}.`;
        if (duplicateCount > 0) message += ` ${duplicateCount} duplicate${duplicateCount !== 1 ? 's were' : ' was'} skipped.`;
        if (failedCount > 0) message += ` ${failedCount} row${failedCount !== 1 ? 's' : ''} failed.`;
        setGlobalMessage(message);
        setGlobalParsed(null);
        setGlobalText('');
        setGlobalFileName('');
        setTimeout(() => {
            setGlobalImportOpen(false);
            setGlobalMessage('');
        }, 1800);
    }

    async function exportAllAsCsv() {
        const totalContacts = groups.reduce((sum, g) => sum + Number(g.contactCount || 0), 0);
        if (!totalContacts || exportBusy) return;
        setExportBusy(true);
        setError('');

        try {
            const detailResponses = await Promise.all(groups.map(g => authedFetch(`${API_BASE}/api/groups/${g.id}`)));
            const detailPayloads = await Promise.all(detailResponses.map(async (resp) => {
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error || 'Failed to load groups for export');
                return data;
            }));

            const seen = new Set();
            const merged = [];
            for (const group of detailPayloads) {
                for (const contact of (group.contacts || [])) {
                    const email = String(contact.email || '').toLowerCase();
                    if (!email || seen.has(email)) continue;
                    seen.add(email);
                    merged.push({
                        name: String(contact.name || '').trim(),
                        email,
                    });
                }
            }

            if (!merged.length) {
                setExportBusy(false);
                return;
            }

            const csv = ['name,email', ...merged.map(row => `${csvEscape(row.name)},${csvEscape(row.email)}`)].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `all-group-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e.message || 'Failed to export contacts');
        } finally {
            setExportBusy(false);
        }
    }

    function closeGlobalImport() {
        if (globalBusy) return;
        setGlobalImportOpen(false);
        setGlobalText('');
        setGlobalFileName('');
        setGlobalParsed(null);
        setGlobalMessage('');
        setGlobalImportMode('bulk');
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
            setNewContactForm(buildContactFormDefaults({ fastEntry: true }));
            await loadGroupDetail(groupId);
            setView('detail');
        });
    }

    function handleClose() {
        if (standalone) return;
        guardNav(() => onClose?.());
    }

    /* ── group CRUD ── */

    async function createGroup() {
        if (!newName.trim() || createGroupBusy) return;
        setCreateGroupBusy(true);
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
        } finally {
            setCreateGroupBusy(false);
        }
    }

    async function performDeleteGroup() {
        if (!activeGroup || deleteGroupBusy) return;
        setDeleteGroupBusy(true);
        try {
            const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}`, { method: 'DELETE' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setView('grid');
            setActiveGroup(null);
            await loadGroups();
        } catch (e) {
            setError(e.message);
        } finally {
            setDeleteGroupBusy(false);
            setDeleteGroupDialogOpen(false);
        }
    }

    function deleteGroup() {
        if (!activeGroup) return;
        setDeleteGroupDialogOpen(true);
    }

    /* ── company info edit ── */

    function startEditInfo() {
        setEditName(activeGroup.companyName);
        setEditLogo(activeGroup.logoUrl || '');
        setEditingInfo(true);
        setDirty(true);
    }

    async function saveInfo() {
        if (!editName.trim() || saveInfoBusy) return;
        setSaveInfoBusy(true);
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
        } finally {
            setSaveInfoBusy(false);
        }
    }

    function cancelEditInfo() {
        setEditingInfo(false);
        setDirty(false);
    }

    /* ── contact CRUD ── */

    function startAddContact() {
        setContactForm(buildContactFormDefaults());
        setEditingContactId('__new__');
        setDirty(true);
    }

    function startEditContact(c) {
        const normalizedEmailStatus = c.email_status === 'flagged' ? 'not_valid' : (c.email_status || 'tentative');
        const normalizedConnectionStatus = c.connectionStatus === 'pending' ? 'request_sent' : (c.connectionStatus || 'not_connected');
        const rawDate = c.lastContactedDate || c.lastContacted?.date || '';
        const parsedDate = rawDate ? new Date(rawDate) : null;
        const dateForInput = parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString().slice(0, 10)
            : '';
        setContactForm({
            name: c.name,
            email: c.email,
            role: c.role || '',
            linkedin: c.linkedin || '',
            connectionStatus: normalizedConnectionStatus,
            email_status: normalizedEmailStatus,
            lastContactedDate: dateForInput,
            emailCount: Number.isFinite(Number(c.emailCount)) ? Number(c.emailCount) : 0,
            linkedInCount: Number.isFinite(Number(c.linkedInCount)) ? Number(c.linkedInCount) : 0,
        });
        setEditingContactId(c.id);
        setDirty(true);
    }

    function cancelContactEdit() {
        setEditingContactId(null);
        setDirty(false);
    }

    function resetNewEntryRow() {
        setNewContactForm(buildContactFormDefaults({ fastEntry: true }));
    }

    function toContactPayload(form, { isFastEntry = false } = {}) {
        const defaultEmailStatus = isFastEntry ? 'verified' : 'tentative';
        return {
            ...form,
            role: String(form.role || '').trim() || (isFastEntry ? 'Recruiter' : ''),
            connectionStatus: form.connectionStatus || 'not_connected',
            email_status: form.email_status || defaultEmailStatus,
            lastContactedDate: form.lastContactedDate ? new Date(form.lastContactedDate).toISOString() : null,
            emailCount: Math.max(0, Number(form.emailCount) || 0),
            linkedInCount: Math.max(0, Number(form.linkedInCount) || 0),
        };
    }

    async function saveContact() {
        if (!activeGroup || savingContactId) return;
        const normalizedEmail = String(contactForm.email || '').trim();
        if (!contactForm.name.trim()) {
            setError('Name is required');
            return;
        }
        if (normalizedEmail && !emailRegex.test(normalizedEmail)) {
            setError('Email must be valid when provided');
            return;
        }
        setError('');
        setSavingContactId(editingContactId || '__new__');
        try {
            const payload = toContactPayload(contactForm, { isFastEntry: false });
            if (editingContactId === '__new__') {
                const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Failed');
                setActiveGroup(prev => ({ ...prev, contacts: [d, ...prev.contacts] }));
            } else {
                const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts/${editingContactId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
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
            await loadGroups();
        } catch (e) {
            setError(e.message);
        } finally {
            setSavingContactId(null);
        }
    }

    async function saveNewEntryContact() {
        if (!activeGroup || savingNewEntry) return;
        const normalizedEmail = String(newContactForm.email || '').trim();
        if (!newContactForm.name.trim()) {
            setError('Name is required');
            return;
        }
        if (normalizedEmail && !emailRegex.test(normalizedEmail)) {
            setError('Email must be valid when provided');
            return;
        }

        setError('');
        setSavingNewEntry(true);
        try {
            const payload = toContactPayload(newContactForm, { isFastEntry: true });
            const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');

            setActiveGroup(prev => ({ ...prev, contacts: [d, ...(prev?.contacts || [])] }));
            resetNewEntryRow();
            await loadGroups();
        } catch (e) {
            setError(e.message);
        } finally {
            setSavingNewEntry(false);
        }
    }

    function requestDeleteContact(contactId) {
        const target = (activeGroup?.contacts || []).find(c => c.id === contactId);
        if (!target) return;
        setDeleteContactDialog({ id: contactId, name: target.name || 'this contact' });
    }

    async function performDeleteContact() {
        const contactId = deleteContactDialog?.id;
        if (!contactId || !activeGroup || deletingContactId) return;
        setDeletingContactId(contactId);
        try {
            const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts/${contactId}`, { method: 'DELETE' });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            setActiveGroup(prev => ({
                ...prev,
                contacts: (prev?.contacts || []).filter(c => c.id !== contactId),
            }));
            await loadGroups();
        } catch (e) {
            setError(e.message);
        } finally {
            setDeletingContactId('');
            setDeleteContactDialog(null);
        }
    }

    /* ── bulk paste ── */

    function nameFromEmail(email) {
        const local = (email || '').split('@')[0].replace(/[0-9]/g, '').split(/[._\-+]+/).filter(Boolean);
        return local.length ? local.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Unknown';
    }

    function parseContactLine(line, fallbackLinkedin = '') {
        const rawLine = String(line || '').trim();
        if (!rawLine) return null;

        const emailMatch = rawLine.match(/([\w.%+-]+@[\w.-]+\.[A-Za-z]{2,})/);
        const email = emailMatch ? String(emailMatch[1]).toLowerCase().trim() : '';
        if (email && !emailRegex.test(email)) return null;

        const linkedinInLine = normalizeLinkedinUrl((rawLine.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[\w\-./?=&%#]+/i) || [])[0]);
        const linkedin = normalizeLinkedinUrl(linkedinInLine || fallbackLinkedin);

        let cleaned = rawLine
            .replace(emailMatch?.[0] || '', ' ')
            .replace(linkedinInLine || '', ' ')
            .replace(/\bLinkedIn\b/gi, ' ')
            .replace(/[<>]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const segments = cleaned
            .split(/\s+[|\-]\s+|\s*,\s*/)
            .map(s => s.trim())
            .filter(Boolean);

        let name = segments[0] || '';
        let role = segments[1] || '';

        if (!name && email) name = nameFromEmail(email);
        if (!name && linkedin) name = nameFromLinkedin(linkedin);
        if (!name) return null;
        if (!role) role = String(bulkRole || 'Recruiter').trim() || 'Recruiter';

        return { name, email, role, linkedin };
    }

    function parseBulkText() {
        if ((!bulkText || !bulkText.trim()) && (!bulkHtml || !bulkHtml.trim())) {
            setBulkMessage('No valid contacts detected. Paste one contact per line with name and optional email, role, or LinkedIn URL.');
            setBulkParsed([]);
            return;
        }

        setBulkParseBusy(true);
        try {
            const htmlLinkedin = extractLinkedinUrlsFromHtml(bulkHtml);
            const lines = String(bulkText || '').split('\n').map(l => l.trim()).filter(Boolean);
            const results = [];
            const dedupe = new Set();

            lines.forEach((line, idx) => {
                const parsed = parseContactLine(line, htmlLinkedin[idx] || '');
                if (!parsed) return;
                const dedupeKey = parsed.email
                    ? `email:${parsed.email}`
                    : parsed.linkedin
                        ? `linkedin:${parsed.linkedin.toLowerCase()}`
                        : `name:${parsed.name.toLowerCase()}`;
                if (dedupe.has(dedupeKey)) return;
                dedupe.add(dedupeKey);
                results.push(parsed);
            });

            if (!results.length && htmlLinkedin.length) {
                htmlLinkedin.forEach((linkedin, idx) => {
                    const parsed = parseContactLine(`LinkedIn ${idx + 1}`, linkedin);
                    if (!parsed) return;
                    const key = `linkedin:${parsed.linkedin.toLowerCase()}`;
                    if (dedupe.has(key)) return;
                    dedupe.add(key);
                    results.push(parsed);
                });
            }

            if (!results.length) {
                setBulkMessage('No valid contacts detected. Paste one contact per line with name and optional email, role, or LinkedIn URL.');
                setBulkParsed([]);
                return;
            }

            setBulkMessage('');
            setBulkParsed(results);
        } finally {
            setBulkParseBusy(false);
        }
    }

    function removeBulkRow(idx) {
        setBulkParsed(prev => prev.filter((_, i) => i !== idx));
    }

    async function doBulkImport() {
        if (!bulkParsed || !bulkParsed.length || bulkSaveBusy) return;
        setBulkSaveBusy(true);
        try {
            const existingEmails = new Set((activeGroup?.contacts || []).map(c => String(c.email || '').toLowerCase()).filter(Boolean));
            const existingLinkedin = new Set((activeGroup?.contacts || []).map(c => String(c.linkedin || '').toLowerCase()).filter(Boolean));
            const unique = bulkParsed.filter(c => {
                const normalizedEmail = String(c.email || '').toLowerCase();
                const normalizedLinkedin = String(c.linkedin || '').toLowerCase();
                if (normalizedEmail && existingEmails.has(normalizedEmail)) return false;
                if (!normalizedEmail && normalizedLinkedin && existingLinkedin.has(normalizedLinkedin)) return false;
                return true;
            });
            const dupeCount = bulkParsed.length - unique.length;

            if (!unique.length) {
                setBulkMessage(`All ${bulkParsed.length} contacts are duplicates.`);
                return;
            }

            let addedCount = 0;
            let limitReached = false;
            const newContacts = [];
            for (const c of unique) {
                try {
                    const r = await authedFetch(`${API_BASE}/api/groups/${activeGroup.id}/contacts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: c.name,
                            email: c.email,
                            role: String(c.role || bulkRole || 'Recruiter').trim() || 'Recruiter',
                            connectionStatus: 'not_connected',
                            linkedin: c.linkedin || '',
                            email_status: 'verified',
                        }),
                    });
                    const d = await r.json();
                    if (!r.ok) {
                        if (d?.error === 'Group contact limit reached (300).') {
                            limitReached = true;
                            setBulkMessage('Group contact limit reached (300).');
                            break;
                        }
                        continue;
                    }
                    newContacts.push(d);
                    if (d?.email) existingEmails.add(String(d.email).toLowerCase());
                    if (d?.linkedin) existingLinkedin.add(String(d.linkedin).toLowerCase());
                    addedCount++;
                } catch (_) { /* skip failures */ }
            }

            if (newContacts.length) {
                setActiveGroup(prev => ({ ...prev, contacts: [...newContacts, ...prev.contacts] }));
            }

            if (!limitReached) {
                let msg = `Added ${addedCount} contact${addedCount !== 1 ? 's' : ''}.`;
                if (dupeCount > 0) msg += ` ${dupeCount} duplicate${dupeCount !== 1 ? 's' : ''} skipped.`;
                setBulkMessage(msg);
            }
            setBulkParsed(null);
            setBulkText('');
            setBulkHtml('');
            setBulkRole('');
            // Close panel after small delay so user sees the message
            setTimeout(() => { setBulkPasteOpen(false); setBulkMessage(''); }, 1800);
        } finally {
            setBulkSaveBusy(false);
        }
    }

    function closeBulkPaste() {
        if (bulkSaveBusy) return;
        setBulkPasteOpen(false);
        setBulkText('');
        setBulkHtml('');
        setBulkRole('');
        setBulkParsed(null);
        setBulkMessage('');
        setBulkParseBusy(false);
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

    /* ── render guard ── */

    if (!isVisible) return null;

    /* ── main popup ── */

    return (
        <>
            {!standalone && <div className="gm-overlay" onClick={handleClose} />}
            <div className={standalone ? 'gm-page' : 'gm-popup'} onClick={e => e.stopPropagation()}>

                {error && <div className="gm-error">{error} <button className="gm-text-btn" onClick={() => setError('')}>✕</button></div>}

                {/* ────── VIEW: GROUPS GRID ────── */}
                {view === 'grid' && (
                    <>
                        <div className="gm-topbar">
                            <span className="gm-title">{standalone ? 'Contacts' : 'Groups'}</span>
                            <div className="gm-grid-actions">
                                <button className="gm-text-btn" onClick={() => setCreating(true)} disabled={createGroupBusy}><Plus size={14} /> Create Group</button>
                                {!standalone && <span className="gm-dot-sep" aria-hidden="true">•</span>}
                                {!standalone && <button className="gm-text-btn" onClick={() => { setGlobalImportMode('bulk'); setGlobalImportOpen(true); }} disabled={globalBusy}><ClipboardPaste size={14} /> Bulk Paste</button>}
                                {!standalone && <span className="gm-dot-sep" aria-hidden="true">•</span>}
                                {!standalone && <button className="gm-text-btn" onClick={() => { setGlobalImportMode('csv'); setGlobalImportOpen(true); }} disabled={globalBusy}><FileUp size={14} /> Import CSV</button>}
                                {!standalone && <span className="gm-dot-sep" aria-hidden="true">•</span>}
                                <button
                                    className="gm-text-btn"
                                    onClick={exportAllAsCsv}
                                    disabled={exportBusy || groupsLoading || groups.reduce((sum, g) => sum + Number(g.contactCount || 0), 0) === 0}
                                >
                                    <FileDown size={14} /> {exportBusy ? 'Exporting…' : 'Export All as CSV'}
                                </button>
                            </div>
                        </div>

                        {creating && (
                            <div className="gm-create-row">
                                <input className="gm-inp" placeholder="Company name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus disabled={createGroupBusy} />
                                <input className="gm-inp" placeholder="Logo URL (optional)" value={newLogo} onChange={e => setNewLogo(e.target.value)} disabled={createGroupBusy} />
                                <button className="gm-icon-btn gm-icon-btn--save" onClick={createGroup} title="Create" disabled={createGroupBusy}><Check size={16} /></button>
                                <button className="gm-icon-btn" onClick={() => { setCreating(false); setNewName(''); setNewLogo(''); }} title="Cancel" disabled={createGroupBusy}><X size={16} /></button>
                            </div>
                        )}

                        <div className={`gm-grid ${standalone ? 'gm-grid--cards' : ''}`}>
                            {groups.length ? groups.map(g => (
                                <button key={g.id} className={`gm-tile ${standalone ? 'gm-tile--card' : ''}`} onClick={() => openGroup(g.id)} disabled={groupsLoading || detailLoading}>
                                    {g.logoUrl ? <img src={g.logoUrl} className="gm-tile-logo" alt="" /> : <span className="gm-tile-logo-placeholder" />}
                                    <div className="gm-tile-copy">
                                        <span className="gm-tile-name">{g.companyName}</span>
                                        {standalone && <span className="gm-tile-count">{Number(g.contactCount || 0)} contacts</span>}
                                    </div>
                                </button>
                            )) : !creating && !groupsLoading && <p className="gm-muted">No groups yet. Create one to get started.</p>}
                        </div>

                        {groupsLoading && <div className="gm-muted" style={{ textAlign: 'center', padding: standalone ? 36 : 16 }}>Loading contacts…</div>}
                    </>
                )}

                {/* ────── VIEW: GROUP DETAIL ────── */}
                {view === 'detail' && activeGroup && (
                    <>
                        {/* Breadcrumb row */}
                        <div className="gm-topbar">
                            <div className="gm-breadcrumb">
                                <button className="gm-text-btn" onClick={goGrid}>{standalone ? 'Contacts' : 'Groups'}</button>
                                <ChevronRight size={14} />
                                <span>{activeGroup.companyName}</span>
                            </div>
                            <button className="gm-text-btn gm-text-btn--danger" onClick={deleteGroup} disabled={deleteGroupBusy}>
                                <Trash2 size={14} /> Delete Group
                            </button>
                        </div>

                        {/* Company info row */}
                        <div className="gm-info-row">
                            {editingInfo ? (
                                <>
                                    <div className="gm-info-col">
                                        <label className="gm-label">Company Name</label>
                                        <input className="gm-inp" value={editName} onChange={e => setEditName(e.target.value)} disabled={saveInfoBusy} />
                                    </div>
                                    <div className="gm-info-col">
                                        <label className="gm-label">Logo URL</label>
                                        <input className="gm-inp" value={editLogo} onChange={e => setEditLogo(e.target.value)} disabled={saveInfoBusy} />
                                    </div>
                                    <div className="gm-info-col gm-info-col--preview">
                                        <label className="gm-label">Preview</label>
                                        <div className="gm-info-preview-wrap">
                                            {editLogo ? <img src={editLogo} className="gm-info-preview" alt="" /> : <span className="gm-muted">—</span>}
                                            <div className="gm-info-actions">
                                                <button className="gm-icon-btn gm-icon-btn--save" onClick={saveInfo} title="Save" disabled={saveInfoBusy}><Check size={16} /></button>
                                                <button className="gm-icon-btn" onClick={cancelEditInfo} title="Cancel" disabled={saveInfoBusy}><X size={16} /></button>
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
                                {!standalone && <button className="gm-text-btn" onClick={startAddContact}><Plus size={14} /> Add Person</button>}
                                {!standalone && <span className="gm-dot-sep" aria-hidden="true">•</span>}
                                <button className="gm-text-btn" onClick={() => setBulkPasteOpen(true)} disabled={bulkParseBusy || bulkSaveBusy}><ClipboardPaste size={14} /> Bulk Paste</button>
                            </div>
                        </div>

                        <div className={`gm-table-wrap ${standalone ? 'gm-table-wrap--standalone' : ''}`}>
                            <ContactsTable
                                contacts={activeGroup.contacts}
                                editingContactId={editingContactId}
                                contactForm={contactForm}
                                setContactForm={setContactForm}
                                copiedField={copiedField}
                                onCopyClick={onCopyClick}
                                onStartEdit={startEditContact}
                                onDelete={requestDeleteContact}
                                onSave={saveContact}
                                onCancel={cancelContactEdit}
                                roleOptions={ROLE_OPTIONS}
                                connectionOptions={CONNECTION_OPTIONS}
                                alwaysShowNewRow={standalone}
                                newContactForm={newContactForm}
                                setNewContactForm={setNewContactForm}
                                onSaveNewEntry={saveNewEntryContact}
                                onResetNewEntry={resetNewEntryRow}
                                busyState={{
                                    tableBusy: !!savingContactId || savingNewEntry || !!deletingContactId,
                                    savingContactId,
                                    savingNewEntry,
                                    deletingContactId,
                                }}
                            />
                        </div>

                        <div className="gm-legend">
                            <div className="gm-legend-icons">
                                <span><Mail size={12} /> = Email contact</span>
                                <span><Linkedin size={12} /> = LinkedIn contact</span>
                            </div>
                            <p className="gm-legend-note">
                                <strong>Contact History</strong> shows the last time you contacted someone and how many emails and LinkedIn messages were sent.
                                You can manually update the date and counters if you contacted someone outside this platform.
                            </p>
                        </div>
                    </>
                )}

                {detailLoading && <div className="gm-muted" style={{ textAlign: 'center', padding: 32 }}>Loading…</div>}
            </div>

            {/* Bulk Paste panel */}
            {bulkPasteOpen && (
                <>
                    <div className="gm-confirm-overlay" onClick={closeBulkPaste} />
                    <div className="gm-bulk-panel" onClick={e => e.stopPropagation()}>
                        <div className="gm-topbar">
                            <span className="gm-title">Bulk Paste Contacts</span>
                            <button className="gm-text-btn" onClick={closeBulkPaste} disabled={bulkSaveBusy}>Cancel</button>
                        </div>

                        {bulkMessage && <div className={bulkMessage.startsWith('Added') ? 'gm-bulk-success' : 'gm-bulk-warn'}>{bulkMessage}</div>}

                        {!bulkParsed ? (
                            <>
                                <textarea
                                    className="gm-bulk-textarea"
                                    rows={8}
                                    value={bulkText}
                                    onChange={e => setBulkText(e.target.value)}
                                    placeholder={'John Doe john@company.com\nJane Smith | Recruiter | https://linkedin.com/in/jane-smith\nJohn Doe - Senior Recruiter - LinkedIn'}
                                    onPaste={e => setBulkHtml(e.clipboardData?.getData('text/html') || '')}
                                    autoFocus
                                    disabled={bulkSaveBusy}
                                />
                                <div className="gm-bulk-role-row">
                                    <label className="gm-label">Default role (when missing)</label>
                                    <select className="gm-select" value={bulkRole} onChange={e => setBulkRole(e.target.value)} disabled={bulkSaveBusy}>
                                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r || '— None —'}</option>)}
                                    </select>
                                </div>
                                <div className="gm-bulk-actions">
                                    <button className="btn btn--primary" onClick={parseBulkText} disabled={(!bulkText.trim() && !bulkHtml.trim()) || bulkParseBusy || bulkSaveBusy}>{bulkParseBusy ? 'Parsing…' : 'Parse'}</button>
                                </div>
                            </>
                        ) : bulkParsed.length > 0 ? (
                            <>
                                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Parsed Contacts ({bulkParsed.length})</p>
                                <div className="gm-bulk-preview">
                                    {bulkParsed.map((c, i) => (
                                        <div key={i} className="gm-bulk-preview-row">
                                            <span className="gm-bulk-preview-name">{c.name}</span>
                                            <span className="gm-bulk-preview-email">{c.email || 'No email'}</span>
                                            <button className="gm-icon-btn gm-icon-btn--danger" onClick={() => removeBulkRow(i)} title="Remove" disabled={bulkSaveBusy}><X size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="gm-bulk-actions">
                                    <button className="gm-text-btn" onClick={() => { setBulkParsed(null); setBulkMessage(''); }} disabled={bulkSaveBusy}>Back</button>
                                    <button className="btn btn--primary" onClick={doBulkImport} disabled={!bulkParsed.length || bulkSaveBusy}>{bulkSaveBusy ? 'Saving…' : 'Add to Group'}</button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </>
            )}

            {/* Global import panel */}
            {globalImportOpen && (
                <>
                    <div className="gm-confirm-overlay" onClick={closeGlobalImport} />
                    <div className="gm-bulk-panel" onClick={e => e.stopPropagation()}>
                        <div className="gm-topbar">
                            <span className="gm-title">Import Contacts Across Groups</span>
                            <button className="gm-text-btn" onClick={closeGlobalImport} disabled={globalBusy}>Cancel</button>
                        </div>

                        <div className="gm-import-mode-tabs" role="tablist" aria-label="Import mode">
                            <button
                                className={`gm-import-tab ${globalImportMode === 'bulk' ? 'gm-import-tab--active' : ''}`}
                                onClick={() => { setGlobalImportMode('bulk'); setGlobalMessage(''); setGlobalParsed(null); setGlobalFileName(''); }}
                                disabled={globalBusy}
                            >
                                Bulk Paste
                            </button>
                            <button
                                className={`gm-import-tab ${globalImportMode === 'csv' ? 'gm-import-tab--active' : ''}`}
                                onClick={() => { setGlobalImportMode('csv'); setGlobalMessage(''); setGlobalParsed(null); setGlobalText(''); }}
                                disabled={globalBusy}
                            >
                                Import CSV
                            </button>
                        </div>

                        {globalMessage && (
                            <div className={globalMessage.startsWith('Added') ? 'gm-bulk-success' : 'gm-bulk-warn'}>{globalMessage}</div>
                        )}

                        {!globalParsed ? (
                            globalImportMode === 'bulk' ? (
                                <>
                                    <textarea
                                        className="gm-bulk-textarea"
                                        rows={8}
                                        value={globalText}
                                        onChange={e => setGlobalText(e.target.value)}
                                        placeholder={'John Doe john@company.com\njane@stripe.com Jane Smith\nJohn Doe <john@company.com>'}
                                        autoFocus
                                        disabled={globalBusy}
                                    />
                                    <p className="gm-muted">Company is auto-detected from email domain (text between @ and first dot).</p>
                                    <div className="gm-bulk-actions">
                                        <button className="btn btn--primary" onClick={parseGlobalBulkText} disabled={!globalText.trim() || globalBusy}>Parse</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <label className="gm-csv-upload">
                                        <input type="file" accept=".csv,text/csv" onChange={onCsvFilePicked} disabled={globalBusy} />
                                        <span>{globalFileName || 'Choose CSV file'}</span>
                                    </label>
                                    <p className="gm-muted">CSV must have exactly two columns: name and email (any order).</p>
                                </>
                            )
                        ) : globalParsed.length > 0 ? (
                            <>
                                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Confirm Import ({globalParsed.length})</p>
                                {globalParsed.some(row => row.isDuplicate) && (
                                    <div className="gm-bulk-warn gm-bulk-warn--dupes">
                                        <AlertTriangle size={14} />
                                        <span>
                                            {globalParsed.filter(row => row.isDuplicate).length} duplicate contact{globalParsed.filter(row => row.isDuplicate).length !== 1 ? 's are' : ' is'} already in target group and will be skipped.
                                        </span>
                                    </div>
                                )}
                                <div className="gm-bulk-preview">
                                    {globalParsed.map((row, i) => (
                                        <div key={`${row.email}-${i}`} className={`gm-bulk-preview-row gm-bulk-preview-row--wide ${row.isDuplicate ? 'gm-bulk-preview-row--duplicate' : ''}`}>
                                            <span className="gm-bulk-preview-name">{row.name}</span>
                                            <span className="gm-bulk-preview-email">{row.email}</span>
                                            <div className="gm-bulk-preview-meta">
                                                <span className={`gm-bulk-preview-group ${row.targetExists ? '' : 'gm-bulk-preview-group--new'}`}>
                                                    {row.targetGroupName} {row.targetExists ? '' : '(new)'}
                                                </span>
                                                {row.isDuplicate && <span className="gm-bulk-preview-dupemark">Will skip</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="gm-bulk-actions">
                                    <button
                                        className="gm-text-btn"
                                        onClick={() => { setGlobalParsed(null); setGlobalMessage(''); }}
                                        disabled={globalBusy}
                                    >
                                        Back
                                    </button>
                                    <button className="btn btn--primary" onClick={saveGlobalParsedContacts} disabled={!globalParsed.length || globalBusy}>
                                        {globalBusy ? 'Saving…' : 'Confirm and Save'}
                                    </button>
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

            {deleteGroupDialogOpen && activeGroup && (
                <div className="gm-confirm-overlay" onClick={() => setDeleteGroupDialogOpen(false)}>
                    <div className="gm-confirm" onClick={e => e.stopPropagation()}>
                        <p>Delete “{activeGroup.companyName}” and all its contacts?</p>
                        <div className="gm-confirm-actions">
                            <button className="gm-text-btn" onClick={() => setDeleteGroupDialogOpen(false)} disabled={deleteGroupBusy}>Cancel</button>
                            <button className="gm-text-btn gm-text-btn--danger" onClick={performDeleteGroup} disabled={deleteGroupBusy}>{deleteGroupBusy ? 'Deleting…' : 'Delete group'}</button>
                        </div>
                    </div>
                </div>
            )}

            {deleteContactDialog && (
                <div className="gm-confirm-overlay" onClick={() => setDeleteContactDialog(null)}>
                    <div className="gm-confirm" onClick={e => e.stopPropagation()}>
                        <p>Delete contact “{deleteContactDialog.name}”?</p>
                        <div className="gm-confirm-actions">
                            <button className="gm-text-btn" onClick={() => setDeleteContactDialog(null)} disabled={!!deletingContactId}>Cancel</button>
                            <button className="gm-text-btn gm-text-btn--danger" onClick={performDeleteContact} disabled={!!deletingContactId}>{deletingContactId ? 'Deleting…' : 'Delete contact'}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
