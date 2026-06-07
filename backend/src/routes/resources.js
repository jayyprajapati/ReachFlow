'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { Types } = require('mongoose');
const { Resource } = require('../db');
const {
  ALLOWED_RESOURCE_MIME,
  MAX_RESOURCES_PER_USER,
  MAX_RESOURCE_UPLOAD_MB,
  resourceDiskStorage,
  registerStoredResource,
  syncResumeResources,
  safeDeleteFile,
  toResourceResponse,
} = require('../services/resourceStorage');

const router = express.Router();
const upload = multer({
  storage: resourceDiskStorage,
  limits: { fileSize: MAX_RESOURCE_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg']);
    if (ALLOWED_RESOURCE_MIME.has(file.mimetype) || allowedExtensions.has(path.extname(file.originalname).toLowerCase())) {
      return cb(null, true);
    }
    const err = new Error('Only PDF, DOC, DOCX, TXT, PNG, and JPEG files are accepted');
    err.code = 'INVALID_FILE_TYPE';
    cb(err);
  },
});

function uploadMiddleware(req, res, next) {
  upload.single('resource')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Maximum allowed size is ${MAX_RESOURCE_UPLOAD_MB}MB.` });
    }
    if (err.code === 'INVALID_FILE_TYPE') return res.status(415).json({ error: err.message });
    return res.status(400).json({ error: err.message || 'File upload failed' });
  });
}

router.get('/', async (req, res) => {
  try {
    await syncResumeResources(req.user);
    const resources = await Resource.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    res.json({
      resources: resources.map(toResourceResponse),
      count: resources.length,
      limit: MAX_RESOURCES_PER_USER,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load resources' });
  }
});

router.post('/upload', uploadMiddleware, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Resource file is required' });
  const requestedSource = String(req.body?.source || 'manual');
  const source = ['compose', 'manual'].includes(requestedSource) ? requestedSource : 'manual';
  try {
    const result = await registerStoredResource({ userId: req.user._id, file: req.file, source });
    res.status(result.deduplicated ? 200 : 201).json({
      resource: toResourceResponse(result.resource),
      deduplicated: result.deduplicated,
      limit: MAX_RESOURCES_PER_USER,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to store resource', code: err.code });
  }
});

router.get('/:id/download', async (req, res) => {
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const resource = await Resource.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    await fs.promises.access(resource.storagePath, fs.constants.R_OK);
    res.download(resource.storagePath, resource.name);
  } catch (err) {
    res.status(err.code === 'ENOENT' ? 410 : 500).json({ error: err.code === 'ENOENT' ? 'Resource file is unavailable' : err.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const resource = await Resource.findOne({ _id: req.params.id, userId: req.user._id });
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    if (resource.resumeIds?.length) {
      return res.status(409).json({ error: 'This file is still used by Resume Vault. Remove the resume there first.' });
    }
    await Resource.deleteOne({ _id: resource._id, userId: req.user._id });
    await safeDeleteFile(resource.storagePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete resource' });
  }
});

module.exports = router;
