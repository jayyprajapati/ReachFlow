const express = require('express');
const { Variable } = require('../db');
const { encryptJson, decryptJson, isEncryptedEnvelope } = require('../utils/dataSecurity');

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
  if (isEncryptedEnvelope(variable?.encryptedPayload)) {
    try {
      const payload = decryptJson(variable.encryptedPayload);
      return normalizeVariableName(payload?.variableName || variable.variableNameKey);
    } catch (_err) {
      return normalizeVariableName(variable.variableNameKey || '');
    }
  }
  return normalizeVariableName(variable?.variableNameKey || variable?.variableName || variable?.key || variable?.label);
}

function getVariableDescription(variable) {
  if (isEncryptedEnvelope(variable?.encryptedPayload)) {
    try {
      const payload = decryptJson(variable.encryptedPayload);
      return String(payload?.description || '');
    } catch (_err) {
      return '';
    }
  }
  return String(variable?.description || '');
}

router.get('/', async (req, res) => {
  try {
    const vars = await Variable.find({ userId: req.user._id }).sort({ createdAt: 1 });
    const payload = vars
      .map(v => ({
        id: v._id.toString(),
        variableName: getVariableName(v),
        description: getVariableDescription(v),
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

    const normalizedDescription = description ? String(description).trim() : '';
    const doc = await Variable.create({
      userId: req.user._id,
      variableNameKey: normalizedName,
      encryptedPayload: encryptJson({
        variableName: normalizedName,
        description: normalizedDescription,
      }),
      variableName: undefined,
      description: undefined,
      key: undefined,
      label: undefined,
    });

    res.json({
      id: doc._id.toString(),
      variableName: normalizedName,
      description: normalizedDescription,
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
