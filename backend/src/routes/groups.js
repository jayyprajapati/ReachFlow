const express = require('express');
const { Types } = require('mongoose');
const { Group } = require('../db');
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

function sanitizeHistoryEntry(entry) {
  const type = ['email', 'linkedin'].includes(entry?.type) ? entry.type : null;
  const parsedDate = entry?.date ? new Date(entry.date) : null;
  if (!type || !parsedDate || Number.isNaN(parsedDate.getTime())) return null;
  return { type, date: parsedDate };
}

function sanitizeContactHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map(sanitizeHistoryEntry)
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function deriveContactMetrics(contactHistory) {
  const history = sanitizeContactHistory(contactHistory);
  const emailCount = history.filter(h => h.type === 'email').length;
  const linkedinCount = history.filter(h => h.type === 'linkedin').length;
  const last = history.length ? history[history.length - 1] : null;
  return {
    lastContacted: last ? { type: last.type, date: last.date } : null,
    emailCount,
    linkedinCount,
  };
}

function decryptContactPayload(contact) {
  if (isEncryptedEnvelope(contact.encryptedPayload)) {
    return decryptJson(contact.encryptedPayload);
  }
  return {
    name: contact.name || '',
    email: normalizeEmail(contact.email || ''),
    linkedin: contact.linkedin || '',
    contactHistory: sanitizeContactHistory(contact.contactHistory || []),
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

  const history = sanitizeContactHistory(raw.contactHistory || []);
  const lastDate = raw.lastContactedDate ? new Date(raw.lastContactedDate) : null;
  const metrics = deriveContactMetrics(history);

  return {
    name: String(raw.name || '').trim(),
    email: normalizeEmail(raw.email || ''),
    role: String(raw.role || '').trim(),
    linkedin: String(raw.linkedin || '').trim(),
    connectionStatus: normalizedConnectionStatus,
    email_status: normalizedEmailStatus,
    contactHistory: history,
    lastContactedDate: lastDate && !Number.isNaN(lastDate.getTime()) ? lastDate : (metrics.lastContacted?.date || null),
    emailCount: Number.isFinite(Number(raw.emailCount)) ? Math.max(0, Number(raw.emailCount)) : metrics.emailCount,
    linkedInCount: Number.isFinite(Number(raw.linkedInCount)) ? Math.max(0, Number(raw.linkedInCount)) : metrics.linkedinCount,
  };
}

function validateContact(contact) {
  if (!contact.name) return 'Name is required';
  if (!emailRegex.test(contact.email)) return 'Invalid email';
  return null;
}

function toContactPayload(contact) {
  const decrypted = decryptContactPayload(contact);
  const history = sanitizeContactHistory(decrypted.contactHistory || []);
  const metrics = deriveContactMetrics(history);

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
    connectionStatus: contact.connectionStatus === 'pending' ? 'request_sent' : (contact.connectionStatus || ''),
    email_status: normalizedEmailStatus,
    contactHistory: history.map(h => ({ type: h.type, date: h.date })),
    lastContacted,
    lastContactedDate: lastContacted?.date || null,
    emailCount: Number.isFinite(Number(contact.emailCount)) ? Number(contact.emailCount) : metrics.emailCount,
    linkedInCount: Number.isFinite(Number(contact.linkedInCount)) ? Number(contact.linkedInCount) : metrics.linkedinCount,
  };
}

function toEncryptedContact(input) {
  const clean = sanitizeContactInput(input);
  const companyKey = deriveCompanyKeyFromEmail(clean.email);

  return {
    emailHash: computeEmailHash(clean.email),
    companyKey,
    encryptedPayload: encryptJson({
      name: clean.name,
      email: clean.email,
      linkedin: clean.linkedin,
      contactHistory: clean.contactHistory,
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

router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    const payload = groups.map(g => ({
      id: g._id.toString(),
      companyName: g.companyName,
      logoUrl: g.logoUrl || '',
      contactCount: Number.isFinite(Number(g.contactCount)) ? Number(g.contactCount) : (g.contacts || []).length,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
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
      contacts: (group.contacts || []).map(toContactPayload),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load group' });
  }
});

router.post('/', async (req, res) => {
  const { companyName, logoUrl } = req.body || {};
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
      contacts: [],
      contactCount: 0,
    });
    res.json({ id: doc._id.toString(), companyName: doc.companyName, logoUrl: doc.logoUrl || '' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create group' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const { companyName, logoUrl } = req.body || {};
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Not found' });
    if (companyName !== undefined) {
      if (!companyName.trim()) return res.status(400).json({ error: 'Company name is required' });
      group.companyName = companyName.trim();
      group.companyKey = normalizeCompanyKey(companyName);
    }
    if (logoUrl !== undefined) group.logoUrl = (logoUrl || '').trim();
    await group.save();
    res.json({ id: group._id.toString(), companyName: group.companyName, logoUrl: group.logoUrl || '' });
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

    const incomingHash = computeEmailHash(clean.email);
    if ((group.contacts || []).some(c => c.emailHash === incomingHash)) {
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

    const incomingHash = computeEmailHash(merged.email);
    const hasDuplicate = (group.contacts || []).some(c => String(c._id) !== String(contactId) && c.emailHash === incomingHash);
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

module.exports = router;
