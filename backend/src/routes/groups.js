const express = require('express');
const { Types } = require('mongoose');
const { Group, Application } = require('../db');
const {
  encryptJson,
  decryptJson,
  isEncryptedEnvelope,
  normalizeEmail,
  computeEmailHash,
  normalizeCompanyKey,
  deriveCompanyKeyFromEmail,
} = require('../utils/dataSecurity');

const router = express.Router();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GROUP_CONTACTS = 300;
const PURPOSE_MAX = 100;
const NOTE_MAX = 2000;
const PLATFORM_VALUES = new Set(['gmail', 'linkedin']);
const SOURCE_VALUES = new Set(['manual', 'reachflow_email', 'reachflow_linkedin']);

function sanitizeMobile(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return raw.slice(0, 40);
}

function sanitizeConversation(entry, { allowAutoSource = false } = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const parsedDate = entry.date ? new Date(entry.date) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;

  const platform = PLATFORM_VALUES.has(entry.platform) ? entry.platform : 'gmail';
  let source = SOURCE_VALUES.has(entry.source) ? entry.source : 'manual';
  if (!allowAutoSource && source !== 'manual') source = 'manual';

  const purpose = String(entry.purpose || '').slice(0, PURPOSE_MAX).trim();
  const note = String(entry.note || '').slice(0, NOTE_MAX);

  const appIds = Array.isArray(entry.applicationIds) ? entry.applicationIds : [];
  const applicationIds = appIds
    .map((id) => String(id || ''))
    .filter((id) => Types.ObjectId.isValid(id));

  const createdAt = entry.createdAt ? new Date(entry.createdAt) : parsedDate;

  return {
    id: entry.id ? String(entry.id) : new Types.ObjectId().toString(),
    date: parsedDate,
    platform,
    purpose,
    note,
    applicationIds,
    source,
    createdAt: Number.isNaN(createdAt.getTime()) ? parsedDate : createdAt,
  };
}

function sanitizeConversations(list) {
  if (!Array.isArray(list)) return [];
  return list.map((entry) => sanitizeConversation(entry, { allowAutoSource: true })).filter(Boolean);
}

function deriveContactMetrics(conversations) {
  const list = sanitizeConversations(conversations);
  const emailCount = list.filter((c) => c.platform === 'gmail').length;
  const linkedInCount = list.filter((c) => c.platform === 'linkedin').length;
  const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
  const last = sorted.length ? sorted[sorted.length - 1] : null;
  return {
    lastContacted: last ? { type: last.platform === 'linkedin' ? 'linkedin' : 'email', date: last.date } : null,
    emailCount,
    linkedInCount,
  };
}

function decryptContactPayload(contact) {
  if (isEncryptedEnvelope(contact.encryptedPayload)) {
    const payload = decryptJson(contact.encryptedPayload) || {};
    // Back-compat: older payloads may still hold contactHistory instead of conversations.
    let conversations = Array.isArray(payload.conversations) ? payload.conversations : null;
    if (!conversations && Array.isArray(payload.contactHistory)) {
      conversations = payload.contactHistory.map((h) => ({
        id: new Types.ObjectId().toString(),
        date: h?.date,
        platform: h?.type === 'linkedin' ? 'linkedin' : 'gmail',
        purpose: '',
        note: '',
        applicationIds: [],
        source: h?.type === 'linkedin' ? 'reachflow_linkedin' : 'reachflow_email',
        createdAt: h?.date,
      }));
    }
    return {
      name: payload.name || '',
      email: normalizeEmail(payload.email || ''),
      linkedin: payload.linkedin || '',
      mobile: typeof payload.mobile === 'string' ? payload.mobile : '',
      conversations: conversations || [],
    };
  }
  return {
    name: contact.name || '',
    email: normalizeEmail(contact.email || ''),
    linkedin: contact.linkedin || '',
    mobile: '',
    conversations: [],
  };
}

function sanitizeContactInput(raw) {
  const emailStatus = ['verified', 'tentative', 'not_valid', 'flagged'].includes(raw.email_status)
    ? raw.email_status
    : 'tentative';
  const normalizedEmailStatus = emailStatus === 'flagged' ? 'not_valid' : emailStatus;
  const normalizedConnectionStatus = ['', 'not_connected', 'request_sent', 'connected', 'pending'].includes(raw.connectionStatus)
    ? (raw.connectionStatus === 'pending' ? 'request_sent' : raw.connectionStatus)
    : '';

  const conversations = sanitizeConversations(raw.conversations || []);
  const metrics = deriveContactMetrics(conversations);
  const lastDate = raw.lastContactedDate ? new Date(raw.lastContactedDate) : null;

  return {
    name: String(raw.name || '').trim(),
    email: normalizeEmail(raw.email || ''),
    role: String(raw.role || '').trim(),
    linkedin: String(raw.linkedin || '').trim(),
    mobile: sanitizeMobile(raw.mobile),
    connectionStatus: normalizedConnectionStatus,
    email_status: normalizedEmailStatus,
    conversations,
    lastContactedDate: lastDate && !Number.isNaN(lastDate.getTime()) ? lastDate : (metrics.lastContacted?.date || null),
    emailCount: Number.isFinite(Number(raw.emailCount)) ? Math.max(0, Number(raw.emailCount)) : metrics.emailCount,
    linkedInCount: Number.isFinite(Number(raw.linkedInCount)) ? Math.max(0, Number(raw.linkedInCount)) : metrics.linkedInCount,
  };
}

function validateContact(contact) {
  if (!contact.name) return 'Name is required';
  if (contact.email && !emailRegex.test(contact.email)) return 'Invalid email';
  return null;
}

function toConversationResponse(conv) {
  return {
    id: String(conv.id),
    date: conv.date,
    platform: conv.platform,
    purpose: conv.purpose || '',
    note: conv.note || '',
    applicationIds: (conv.applicationIds || []).map((id) => String(id)),
    source: conv.source || 'manual',
    createdAt: conv.createdAt || conv.date,
  };
}

function toContactPayload(contact) {
  const decrypted = decryptContactPayload(contact);
  const conversations = sanitizeConversations(decrypted.conversations || []);
  const metrics = deriveContactMetrics(conversations);

  const manualDate = contact.lastContactedDate ? new Date(contact.lastContactedDate) : null;
  const safeManualDate = manualDate && !Number.isNaN(manualDate.getTime()) ? manualDate : null;
  const lastContacted = safeManualDate
    ? { type: metrics.lastContacted?.type || 'email', date: safeManualDate }
    : metrics.lastContacted;

  const normalizedEmailStatus = contact.email_status === 'flagged' ? 'not_valid' : (contact.email_status || 'tentative');

  return {
    id: contact._id.toString(),
    name: decrypted.name || '',
    email: normalizeEmail(decrypted.email || ''),
    role: contact.role || '',
    linkedin: decrypted.linkedin || '',
    mobile: decrypted.mobile || '',
    connectionStatus: contact.connectionStatus === 'pending' ? 'request_sent' : (contact.connectionStatus || ''),
    email_status: normalizedEmailStatus,
    conversations: conversations.map(toConversationResponse),
    lastContacted,
    lastContactedDate: lastContacted?.date || null,
    emailCount: Number.isFinite(Number(contact.emailCount)) ? Number(contact.emailCount) : metrics.emailCount,
    linkedInCount: Number.isFinite(Number(contact.linkedInCount)) ? Number(contact.linkedInCount) : metrics.linkedInCount,
  };
}

function toEncryptedContact(input) {
  const clean = sanitizeContactInput(input);
  const companyKey = deriveCompanyKeyFromEmail(clean.email);
  const emailHash = clean.email ? computeEmailHash(clean.email) : undefined;

  return {
    emailHash,
    companyKey,
    encryptedPayload: encryptJson({
      name: clean.name,
      email: clean.email,
      linkedin: clean.linkedin,
      mobile: clean.mobile,
      conversations: clean.conversations,
    }),
    role: clean.role,
    connectionStatus: clean.connectionStatus,
    email_status: clean.email_status,
    lastContactedDate: clean.lastContactedDate,
    emailCount: clean.emailCount,
    linkedInCount: clean.linkedInCount,
    name: undefined,
    email: undefined,
    linkedin: undefined,
    contactHistory: undefined,
  };
}

async function filterOwnedApplicationIds(userId, ids) {
  const candidate = (ids || []).map((id) => String(id || '')).filter((id) => Types.ObjectId.isValid(id));
  if (!candidate.length) return [];
  const owned = await Application.find({ _id: { $in: candidate }, userId }).select('_id');
  const ownedSet = new Set(owned.map((doc) => doc._id.toString()));
  return candidate.filter((id) => ownedSet.has(id));
}

// Mutate a contact's encryptedPayload + counters + lastContactedDate in-place.
function applyConversationUpdate(contact, mutator) {
  const decrypted = decryptContactPayload(contact);
  const list = sanitizeConversations(decrypted.conversations || []);
  const next = mutator(list);
  const sanitizedNext = sanitizeConversations(next);
  const metrics = deriveContactMetrics(sanitizedNext);

  contact.encryptedPayload = encryptJson({
    name: decrypted.name || '',
    email: decrypted.email || '',
    linkedin: decrypted.linkedin || '',
    mobile: decrypted.mobile || '',
    conversations: sanitizedNext,
  });
  contact.emailCount = metrics.emailCount;
  contact.linkedInCount = metrics.linkedInCount;
  contact.lastContactedDate = metrics.lastContacted?.date || null;
  // Top-level legacy plaintext stays cleared.
  contact.name = undefined;
  contact.email = undefined;
  contact.linkedin = undefined;
  contact.contactHistory = undefined;
}

router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    const payload = groups.map(g => {
      const contactCount = Number.isFinite(Number(g.contactCount)) ? Number(g.contactCount) : (g.contacts || []).length;
      // email_status is a plaintext top-level field on each contact subdoc; legacy "flagged" maps to invalid.
      const invalidCount = (g.contacts || []).filter(c => c.email_status === 'not_valid' || c.email_status === 'flagged').length;
      return {
        id: g._id.toString(),
        companyName: g.companyName,
        logoUrl: g.logoUrl || '',
        careersPageUrl: g.careersPageUrl || '',
        contactCount,
        invalidCount,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      };
    });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load groups' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Not found' });
    res.json({
      id: group._id.toString(),
      companyName: group.companyName,
      logoUrl: group.logoUrl || '',
      careersPageUrl: group.careersPageUrl || '',
      contacts: (group.contacts || []).map(toContactPayload),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load group' });
  }
});

router.post('/', async (req, res) => {
  const { companyName, logoUrl, careersPageUrl } = req.body || {};
  if (!companyName || !companyName.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  try {
    const normalizedCompany = normalizeCompanyKey(companyName);
    const doc = await Group.create({
      userId: req.user._id,
      companyName: companyName.trim(),
      companyKey: normalizedCompany,
      logoUrl: (logoUrl || '').trim(),
      careersPageUrl: (careersPageUrl || '').trim(),
      contacts: [],
      contactCount: 0,
    });
    res.json({ id: doc._id.toString(), companyName: doc.companyName, logoUrl: doc.logoUrl || '', careersPageUrl: doc.careersPageUrl || '' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create group' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const { companyName, logoUrl, careersPageUrl } = req.body || {};
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Not found' });
    if (companyName !== undefined) {
      if (!companyName.trim()) return res.status(400).json({ error: 'Company name is required' });
      group.companyName = companyName.trim();
      group.companyKey = normalizeCompanyKey(companyName);
    }
    if (logoUrl !== undefined) group.logoUrl = (logoUrl || '').trim();
    if (careersPageUrl !== undefined) group.careersPageUrl = (careersPageUrl || '').trim();
    await group.save();
    res.json({ id: group._id.toString(), companyName: group.companyName, logoUrl: group.logoUrl || '', careersPageUrl: group.careersPageUrl || '' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update group' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const result = await Group.deleteOne({ _id: id, userId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete group' });
  }
});

router.post('/:id/contacts', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid group id' });

  const clean = sanitizeContactInput(req.body || {});
  const err = validateContact(clean);
  if (err) return res.status(400).json({ error: err });

  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if ((group.contacts || []).length >= MAX_GROUP_CONTACTS) {
      return res.status(400).json({ error: 'Group contact limit reached (300).' });
    }

    const incomingHash = clean.email ? computeEmailHash(clean.email) : null;
    if (incomingHash && (group.contacts || []).some(c => c.emailHash === incomingHash)) {
      return res.status(409).json({ error: 'Duplicate contact in group' });
    }

    const contact = toEncryptedContact(clean);
    group.contacts.push(contact);
    group.contactCount = group.contacts.length;
    await group.save();

    const added = group.contacts[group.contacts.length - 1];
    res.json(toContactPayload(added));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to add contact' });
  }
});

router.patch('/:id/contacts/:contactId', async (req, res) => {
  const { id, contactId } = req.params;
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(contactId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const contact = group.contacts.id(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const current = toContactPayload(contact);
    const merged = sanitizeContactInput({ ...current, ...req.body });
    const err = validateContact(merged);
    if (err) return res.status(400).json({ error: err });

    const incomingHash = merged.email ? computeEmailHash(merged.email) : null;
    const hasDuplicate = incomingHash
      ? (group.contacts || []).some(c => String(c._id) !== String(contactId) && c.emailHash === incomingHash)
      : false;
    if (hasDuplicate) return res.status(409).json({ error: 'Duplicate contact in group' });

    const next = toEncryptedContact(merged);
    Object.assign(contact, next);
    group.contactCount = group.contacts.length;
    await group.save();

    res.json(toContactPayload(contact));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to update contact' });
  }
});

router.delete('/:id/contacts/:contactId', async (req, res) => {
  const { id, contactId } = req.params;
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(contactId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const contact = group.contacts.id(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    contact.deleteOne();
    group.contactCount = group.contacts.length;
    await group.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to delete contact' });
  }
});

// ─── Conversations ─────────────────────────────────────────

router.post('/:id/contacts/:contactId/conversations', async (req, res) => {
  const { id, contactId } = req.params;
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(contactId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const contact = group.contacts.id(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const body = req.body || {};
    if (!body.date) return res.status(400).json({ error: 'Date is required' });
    if (!PLATFORM_VALUES.has(body.platform)) return res.status(400).json({ error: 'Invalid platform' });

    const ownedAppIds = await filterOwnedApplicationIds(req.user._id, body.applicationIds);

    const draft = sanitizeConversation({
      id: new Types.ObjectId().toString(),
      date: body.date,
      platform: body.platform,
      purpose: body.purpose,
      note: body.note,
      applicationIds: ownedAppIds,
      source: 'manual',
      createdAt: new Date(),
    });
    if (!draft) return res.status(400).json({ error: 'Invalid conversation' });

    applyConversationUpdate(contact, (list) => [...list, draft]);
    await group.save();

    const saved = toContactPayload(contact).conversations.find((c) => c.id === draft.id);
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to add conversation' });
  }
});

router.patch('/:id/contacts/:contactId/conversations/:convId', async (req, res) => {
  const { id, contactId, convId } = req.params;
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(contactId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const contact = group.contacts.id(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const decrypted = decryptContactPayload(contact);
    const list = sanitizeConversations(decrypted.conversations || []);
    const existing = list.find((c) => String(c.id) === String(convId));
    if (!existing) return res.status(404).json({ error: 'Conversation not found' });
    if (existing.source !== 'manual') {
      return res.status(403).json({ error: 'Auto-tracked records cannot be edited' });
    }

    const body = req.body || {};
    const platform = body.platform !== undefined
      ? (PLATFORM_VALUES.has(body.platform) ? body.platform : null)
      : existing.platform;
    if (!platform) return res.status(400).json({ error: 'Invalid platform' });

    const ownedAppIds = body.applicationIds !== undefined
      ? await filterOwnedApplicationIds(req.user._id, body.applicationIds)
      : existing.applicationIds;

    const updated = sanitizeConversation({
      id: existing.id,
      date: body.date !== undefined ? body.date : existing.date,
      platform,
      purpose: body.purpose !== undefined ? body.purpose : existing.purpose,
      note: body.note !== undefined ? body.note : existing.note,
      applicationIds: ownedAppIds,
      source: 'manual',
      createdAt: existing.createdAt,
    });
    if (!updated) return res.status(400).json({ error: 'Invalid conversation' });

    applyConversationUpdate(contact, (entries) =>
      entries.map((c) => (String(c.id) === String(convId) ? updated : c))
    );
    await group.save();

    const saved = toContactPayload(contact).conversations.find((c) => c.id === updated.id);
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to update conversation' });
  }
});

router.delete('/:id/contacts/:contactId/conversations/:convId', async (req, res) => {
  const { id, contactId, convId } = req.params;
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(contactId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const contact = group.contacts.id(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const decrypted = decryptContactPayload(contact);
    const list = sanitizeConversations(decrypted.conversations || []);
    const existing = list.find((c) => String(c.id) === String(convId));
    if (!existing) return res.status(404).json({ error: 'Conversation not found' });
    if (existing.source !== 'manual') {
      return res.status(403).json({ error: 'Auto-tracked records cannot be deleted' });
    }

    applyConversationUpdate(contact, (entries) =>
      entries.filter((c) => String(c.id) !== String(convId))
    );
    await group.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to delete conversation' });
  }
});

module.exports = router;
