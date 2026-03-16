const express = require('express');
const { Types } = require('mongoose');
const { Template } = require('../db');
const { encryptJson, decryptJson, isEncryptedEnvelope } = require('../utils/dataSecurity');

const router = express.Router();

function decryptTemplateDoc(template) {
  if (isEncryptedEnvelope(template.encryptedPayload)) {
    const payload = decryptJson(template.encryptedPayload);
    return {
      title: String(payload.title || ''),
      subject: String(payload.subject || ''),
      body_html: String(payload.body_html || ''),
    };
  }
  return {
    title: String(template.title || ''),
    subject: String(template.subject || ''),
    body_html: String(template.body_html || ''),
  };
}

router.get('/', async (req, res) => {
  try {
    const templates = await Template.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    res.json(
      templates.map(t => ({
        id: t._id.toString(),
        ...decryptTemplateDoc(t),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load templates' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const template = await Template.findOne({ _id: id, userId: req.user._id });
    if (!template) return res.status(404).json({ error: 'Not found' });
    const payload = decryptTemplateDoc(template);
    res.json({
      id: template._id.toString(),
      ...payload,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load template' });
  }
});

router.post('/', async (req, res) => {
  const { title, subject, body_html } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
  if (!body_html || !body_html.trim()) return res.status(400).json({ error: 'Body is required' });
  try {
    const payload = {
      title: String(title || ''),
      subject: String(subject || ''),
      body_html: String(body_html || ''),
    };
    const doc = await Template.create({
      userId: req.user._id,
      encryptedPayload: encryptJson(payload),
      title: undefined,
      subject: undefined,
      body_html: undefined,
    });
    res.json({ id: doc._id.toString(), title: payload.title });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
});

module.exports = router;
