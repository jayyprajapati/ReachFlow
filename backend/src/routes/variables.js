const express = require('express');
const { Variable } = require('../db');

const router = express.Router();
const MAX_CUSTOM_VARIABLES = 2;

function normalizeVariableName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function getVariableName(variable) {
  return normalizeVariableName(variable?.variableName || variable?.key || variable?.label);
}

router.get('/', async (req, res) => {
  try {
    const vars = await Variable.find({ userId: req.user._id }).sort({ createdAt: 1 });
    const payload = vars
      .map(v => ({
        id: v._id.toString(),
        variableName: getVariableName(v),
        description: v.description || '',
        createdAt: v.createdAt,
      }))
      .filter(v => !!v.variableName && v.variableName !== 'name');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load variables' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { variableName, description } = req.body || {};
    const normalizedName = normalizeVariableName(variableName);

    if (!normalizedName || !/^[a-z0-9_]+$/.test(normalizedName)) {
      return res.status(400).json({ error: 'Variable name must be lowercase letters, numbers, or underscore' });
    }
    if (normalizedName === 'name') {
      return res.status(400).json({ error: 'The default variable {{name}} is built-in and cannot be created' });
    }

    const existing = await Variable.find({ userId: req.user._id });
    const customNames = existing
      .map(getVariableName)
      .filter(name => !!name && name !== 'name');

    if (customNames.includes(normalizedName)) {
      return res.status(409).json({ error: 'Variable name must be unique per user' });
    }
    if (customNames.length >= MAX_CUSTOM_VARIABLES) {
      return res.status(400).json({ error: 'Only up to 2 custom variables are allowed' });
    }

    const doc = await Variable.create({
      userId: req.user._id,
      variableName: normalizedName,
      description: description ? String(description).trim() : '',
    });

    res.json({
      id: doc._id.toString(),
      variableName: doc.variableName,
      description: doc.description,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Variable name must be unique per user' });
    }
    res.status(500).json({ error: err.message || 'Failed to create variable' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const variable = await Variable.findOne({ _id: req.params.id, userId: req.user._id });
    if (!variable) {
      return res.status(404).json({ error: 'Variable not found' });
    }

    const variableName = getVariableName(variable);
    if (variableName === 'name') {
      return res.status(400).json({ error: 'The default variable {{name}} cannot be deleted' });
    }

    await Variable.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete variable' });
  }
});

module.exports = router;
