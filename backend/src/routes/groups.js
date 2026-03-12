const express = require('express');
const { Types } = require('mongoose');
const { Group } = require('../db');

const router = express.Router();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GROUP_CONTACTS = 300;

/* ── helpers ── */

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

function sanitizeContact(c) {
  const emailStatus = ['verified', 'tentative', 'not_valid', 'flagged'].includes(c.email_status)
    ? c.email_status
    : 'tentative';
  const contactHistory = sanitizeContactHistory(c.contactHistory || []);
  const lastContactedDate = c.lastContactedDate ? new Date(c.lastContactedDate) : null;
  const emailCount = Number.isFinite(Number(c.emailCount)) ? Math.max(0, Math.floor(Number(c.emailCount))) : null;
  const linkedInCount = Number.isFinite(Number(c.linkedInCount)) ? Math.max(0, Math.floor(Number(c.linkedInCount))) : null;

  const derived = deriveContactMetrics(contactHistory);
  const normalizedEmailStatus = emailStatus === 'flagged' ? 'not_valid' : emailStatus;
  return {
    name: (c.name || '').trim(),
    email: (c.email || '').toLowerCase().trim(),
    role: (c.role || '').trim(),
    linkedin: (c.linkedin || '').trim(),
    connectionStatus: ['', 'not_connected', 'request_sent', 'connected', 'pending'].includes(c.connectionStatus)
      ? (c.connectionStatus === 'pending' ? 'request_sent' : c.connectionStatus)
      : '',
    leftCompany: !!c.leftCompany,
    email_status: normalizedEmailStatus,
    contactHistory,
    lastContactedDate: lastContactedDate && !Number.isNaN(lastContactedDate.getTime())
      ? lastContactedDate
      : (derived.lastContacted?.date || null),
    emailCount: emailCount === null ? derived.emailCount : emailCount,
    linkedInCount: linkedInCount === null ? derived.linkedinCount : linkedInCount,
  };
}

function toContactPayload(contact) {
  const history = sanitizeContactHistory(contact.contactHistory || []);
  const metrics = deriveContactMetrics(history);
  const manualLastContacted = contact.lastContactedDate ? new Date(contact.lastContactedDate) : null;
  const safeManualLast = manualLastContacted && !Number.isNaN(manualLastContacted.getTime()) ? manualLastContacted : null;
  const manualEmailCount = Number.isFinite(Number(contact.emailCount)) ? Math.max(0, Math.floor(Number(contact.emailCount))) : null;
  const manualLinkedInCount = Number.isFinite(Number(contact.linkedInCount)) ? Math.max(0, Math.floor(Number(contact.linkedInCount))) : null;
  const effectiveLastContacted = safeManualLast
    ? { type: metrics.lastContacted?.type || 'email', date: safeManualLast }
    : metrics.lastContacted;
  const effectiveEmailCount = manualEmailCount === null ? metrics.emailCount : manualEmailCount;
  const effectiveLinkedInCount = manualLinkedInCount === null ? metrics.linkedinCount : manualLinkedInCount;
  const normalizedEmailStatus = contact.email_status === 'flagged' ? 'not_valid' : (contact.email_status || 'tentative');
  return {
    id: contact._id.toString(),
    name: contact.name,
    email: contact.email,
    role: contact.role || '',
    linkedin: contact.linkedin || '',
    connectionStatus: contact.connectionStatus === 'pending' ? 'request_sent' : (contact.connectionStatus || ''),
    leftCompany: !!contact.leftCompany,
    email_status: normalizedEmailStatus,
    contactHistory: history.map(h => ({ type: h.type, date: h.date })),
    lastContacted: effectiveLastContacted,
    lastContactedDate: effectiveLastContacted?.date || null,
    emailCount: effectiveEmailCount,
    linkedInCount: effectiveLinkedInCount,
  };
}

function validateContact(c) {
  if (!c.name) return 'Name is required';
  if (!emailRegex.test(c.email)) return 'Invalid email';
  return null;
}

/* ── group CRUD ── */

// List all groups
router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    const payload = groups.map(g => ({
      id: g._id.toString(),
      companyName: g.companyName,
      logoUrl: g.logoUrl || '',
      contactCount: g.contacts.length,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load groups' });
  }
});

// Get group detail
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
      contacts: group.contacts.map(toContactPayload),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load group' });
  }
});

// Create group
router.post('/', async (req, res) => {
  const { companyName, logoUrl } = req.body || {};
  if (!companyName || !companyName.trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  try {
    const doc = await Group.create({
      userId: req.user._id,
      companyName: companyName.trim(),
      logoUrl: (logoUrl || '').trim(),
      contacts: [],
    });
    res.json({ id: doc._id.toString(), companyName: doc.companyName, logoUrl: doc.logoUrl || '' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create group' });
  }
});

// Update group info (companyName, logoUrl)
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
    }
    if (logoUrl !== undefined) group.logoUrl = (logoUrl || '').trim();
    await group.save();
    res.json({ id: group._id.toString(), companyName: group.companyName, logoUrl: group.logoUrl || '' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update group' });
  }
});

// Delete group
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

/* ── contact CRUD (within a group) ── */

// Add contact
router.post('/:id/contacts', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid group id' });
  const clean = sanitizeContact(req.body || {});
  const err = validateContact(clean);
  if (err) return res.status(400).json({ error: err });
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.contacts.length >= MAX_GROUP_CONTACTS) {
      return res.status(400).json({ error: 'Group contact limit reached (300).' });
    }
    group.contacts.push(clean);
    await group.save();
    const added = group.contacts[group.contacts.length - 1];
    res.json(toContactPayload(added));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to add contact' });
  }
});

// Update contact
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
    const updates = sanitizeContact({ ...contact.toObject(), ...req.body });
    const err = validateContact(updates);
    if (err) return res.status(400).json({ error: err });
    Object.assign(contact, updates);
    await group.save();
    res.json(toContactPayload(contact));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to update contact' });
  }
});

// Delete contact
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
    await group.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to delete contact' });
  }
});

module.exports = router;
