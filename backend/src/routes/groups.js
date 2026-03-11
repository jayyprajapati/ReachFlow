const express = require('express');
const { Types } = require('mongoose');
const { Group } = require('../db');

const router = express.Router();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── helpers ── */

function sanitizeContact(c) {
  return {
    name: (c.name || '').trim(),
    email: (c.email || '').toLowerCase().trim(),
    role: (c.role || '').trim(),
    linkedin: (c.linkedin || '').trim(),
    connectionStatus: ['', 'not_connected', 'pending', 'connected'].includes(c.connectionStatus) ? c.connectionStatus : '',
    leftCompany: !!c.leftCompany,
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
      contacts: group.contacts.map(c => ({
        id: c._id.toString(),
        name: c.name,
        email: c.email,
        role: c.role || '',
        linkedin: c.linkedin || '',
        connectionStatus: c.connectionStatus || '',
        leftCompany: !!c.leftCompany,
      })),
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
    group.contacts.push(clean);
    await group.save();
    const added = group.contacts[group.contacts.length - 1];
    res.json({
      id: added._id.toString(),
      name: added.name,
      email: added.email,
      role: added.role || '',
      linkedin: added.linkedin || '',
      connectionStatus: added.connectionStatus || '',
      leftCompany: !!added.leftCompany,
    });
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
    res.json({
      id: contact._id.toString(),
      name: contact.name,
      email: contact.email,
      role: contact.role || '',
      linkedin: contact.linkedin || '',
      connectionStatus: contact.connectionStatus || '',
      leftCompany: !!contact.leftCompany,
    });
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
