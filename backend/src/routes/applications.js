const express = require('express');
const { Types } = require('mongoose');
const { Application, Group } = require('../db');
const { encryptJson, decryptJson, isEncryptedEnvelope } = require('../utils/dataSecurity');

const router = express.Router();

const STATUS_VALUES = new Set([
  'applied',
  'oa',
  'interviewing',
  'rejected',
  'offer',
  'ghosted',
  'on_hold',
]);

function normalizeStatus(value) {
  const raw = String(value || '').toLowerCase().trim();
  return STATUS_VALUES.has(raw) ? raw : 'applied';
}

function sanitizeText(value, maxLen) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function parseAppliedDate(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function decryptApplicationPayload(doc) {
  const fallback = {
    jobTitle: String(doc.jobTitle || ''),
    jobId: String(doc.jobId || ''),
    rawSourceText: String(doc.rawSourceText || ''),
    companyNameSnapshot: String(doc.companyNameSnapshot || ''),
  };

  if (isEncryptedEnvelope(doc.encryptedPayload)) {
    const payload = decryptJson(doc.encryptedPayload);
    return {
      jobTitle: String(payload?.jobTitle || fallback.jobTitle || ''),
      jobId: String(payload?.jobId || fallback.jobId || ''),
      rawSourceText: String(payload?.rawSourceText || fallback.rawSourceText || ''),
      companyNameSnapshot: String(payload?.companyNameSnapshot || fallback.companyNameSnapshot || ''),
    };
  }

  return fallback;
}

function toApplicationResponse(doc) {
  const payload = decryptApplicationPayload(doc);
  return {
    id: doc._id.toString(),
    appliedDate: doc.appliedDate,
    status: doc.status || 'applied',
    companyGroupId: doc.companyGroupId ? doc.companyGroupId.toString() : null,
    companyNameSnapshot: doc.companyNameSnapshot || payload.companyNameSnapshot || '',
    jobTitle: payload.jobTitle || '',
    jobId: payload.jobId || '',
    rawSourceText: payload.rawSourceText || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

router.get('/', async (req, res) => {
  try {
    console.log('[applications] GET /api/applications', { userId: req.user._id.toString() });
    const apps = await Application.find({ userId: req.user._id }).sort({ appliedDate: -1, createdAt: -1 });
    console.log('[applications] GET /api/applications result', { userId: req.user._id.toString(), count: apps.length });
    res.json(apps.map(toApplicationResponse));
  } catch (err) {
    console.error('[applications] Failed to load applications:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load applications' });
  }
});

router.post('/', async (req, res) => {
  try {
    console.log('[applications] POST /api/applications received', { userId: req.user._id.toString() });
    const jobTitle = sanitizeText(req.body?.jobTitle, 180);
    const jobId = sanitizeText(req.body?.jobId, 120);
    const rawSourceText = sanitizeText(req.body?.rawSourceText, 12000);
    const appliedDate = parseAppliedDate(req.body?.appliedDate);
    const status = normalizeStatus(req.body?.status);
    let companyNameSnapshot = sanitizeText(req.body?.companyNameSnapshot || req.body?.companyName, 180);
    let companyGroupId = req.body?.companyGroupId;

    const validation = {
      hasJobTitle: !!jobTitle,
      hasJobId: !!jobId,
      hasCompany: !!companyNameSnapshot,
      hasRawSource: !!rawSourceText,
    };
    console.log('[applications] Validation', { userId: req.user._id.toString(), ...validation });
    if (!jobTitle && !jobId && !companyNameSnapshot && !rawSourceText) {
      return res.status(400).json({ error: 'Application requires job title, job id, or company.' });
    }

    if (companyGroupId && Types.ObjectId.isValid(companyGroupId)) {
      const group = await Group.findOne({ _id: companyGroupId, userId: req.user._id });
      if (group) {
        companyGroupId = group._id;
        companyNameSnapshot = group.companyName;
      } else {
        companyGroupId = null;
      }
    } else {
      companyGroupId = null;
    }

    const payload = {
      jobTitle,
      jobId,
      rawSourceText,
      companyNameSnapshot,
    };

    const doc = await Application.create({
      userId: req.user._id,
      jobTitle,
      jobId,
      rawSourceText,
      appliedDate,
      status,
      companyGroupId,
      companyNameSnapshot,
      encryptedPayload: encryptJson(payload),
    });
    console.log('[applications] Application created', { userId: req.user._id.toString(), id: doc._id.toString() });
    res.json(toApplicationResponse(doc));
  } catch (err) {
    console.error('[applications] Failed to create application:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create application' });
  }
});

router.post('/bulk', async (req, res) => {
  const incoming = Array.isArray(req.body?.applications) ? req.body.applications : [];
  if (!incoming.length) return res.status(400).json({ error: 'No applications provided' });

  try {
    console.log('[applications] POST /api/applications/bulk received', { userId: req.user._id.toString(), count: incoming.length });
    const prepared = incoming.map(item => ({
      jobTitle: sanitizeText(item?.jobTitle, 180),
      jobId: sanitizeText(item?.jobId, 120),
      rawSourceText: sanitizeText(item?.rawSourceText, 12000),
      appliedDate: parseAppliedDate(item?.appliedDate),
      status: normalizeStatus(item?.status),
      companyNameSnapshot: sanitizeText(item?.companyNameSnapshot || item?.companyName, 180),
      companyGroupId: item?.companyGroupId && Types.ObjectId.isValid(item.companyGroupId) ? item.companyGroupId : null,
    })).filter(item => item.jobTitle || item.jobId || item.companyNameSnapshot);

    if (!prepared.length) return res.status(400).json({ error: 'No valid applications provided' });
    console.log('[applications] Bulk validation', { userId: req.user._id.toString(), prepared: prepared.length });

    const groupIds = Array.from(new Set(prepared.map(item => item.companyGroupId).filter(Boolean)));
    let groupMap = new Map();

    if (groupIds.length) {
      const groups = await Group.find({ _id: { $in: groupIds }, userId: req.user._id });
      groupMap = new Map(groups.map(g => [g._id.toString(), g]));
    }

    const docs = prepared.map(item => {
      let companyGroupId = item.companyGroupId;
      let companyNameSnapshot = item.companyNameSnapshot;
      const group = companyGroupId ? groupMap.get(String(companyGroupId)) : null;
      if (group) {
        companyGroupId = group._id;
        companyNameSnapshot = group.companyName;
      } else {
        companyGroupId = null;
      }

      return {
        userId: req.user._id,
        jobTitle: item.jobTitle,
        jobId: item.jobId,
        rawSourceText: item.rawSourceText,
        appliedDate: item.appliedDate,
        status: item.status,
        companyGroupId,
        companyNameSnapshot,
        encryptedPayload: encryptJson({
          jobTitle: item.jobTitle,
          jobId: item.jobId,
          rawSourceText: item.rawSourceText,
          companyNameSnapshot,
        }),
      };
    });

    const created = await Application.insertMany(docs, { ordered: true });
    console.log('[applications] Bulk insert complete', { userId: req.user._id.toString(), created: created.length });
    res.json(created.map(toApplicationResponse));
  } catch (err) {
    console.error('[applications] Failed to create applications:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create applications' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    console.log('[applications] PATCH /api/applications/:id', { userId: req.user._id.toString(), id });
    const app = await Application.findOne({ _id: id, userId: req.user._id });
    if (!app) return res.status(404).json({ error: 'Not found' });

    const payload = decryptApplicationPayload(app);
    const incoming = req.body || {};

    if (Object.prototype.hasOwnProperty.call(incoming, 'jobTitle')) {
      payload.jobTitle = sanitizeText(incoming.jobTitle, 180);
      app.jobTitle = payload.jobTitle;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'jobId')) {
      payload.jobId = sanitizeText(incoming.jobId, 120);
      app.jobId = payload.jobId;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'rawSourceText')) {
      payload.rawSourceText = sanitizeText(incoming.rawSourceText, 12000);
      app.rawSourceText = payload.rawSourceText;
    }

    let nextCompanyNameSnapshot = app.companyNameSnapshot || payload.companyNameSnapshot || '';
    if (
      Object.prototype.hasOwnProperty.call(incoming, 'companyNameSnapshot')
      || Object.prototype.hasOwnProperty.call(incoming, 'companyName')
    ) {
      nextCompanyNameSnapshot = sanitizeText(incoming.companyNameSnapshot || incoming.companyName, 180);
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'status')) {
      app.status = normalizeStatus(incoming.status);
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'appliedDate')) {
      app.appliedDate = parseAppliedDate(incoming.appliedDate);
    }

    if (Object.prototype.hasOwnProperty.call(incoming, 'companyGroupId')) {
      const requestedGroupId = incoming.companyGroupId;
      if (requestedGroupId && Types.ObjectId.isValid(requestedGroupId)) {
        const group = await Group.findOne({ _id: requestedGroupId, userId: req.user._id });
        if (group) {
          app.companyGroupId = group._id;
          nextCompanyNameSnapshot = group.companyName;
        } else {
          app.companyGroupId = null;
        }
      } else {
        app.companyGroupId = null;
      }
    }

    app.companyNameSnapshot = nextCompanyNameSnapshot;
    payload.companyNameSnapshot = nextCompanyNameSnapshot;
    app.encryptedPayload = encryptJson(payload);

    await app.save();
    console.log('[applications] Application updated', { userId: req.user._id.toString(), id: app._id.toString() });
    res.json(toApplicationResponse(app));
  } catch (err) {
    console.error('[applications] Failed to update application:', err.message);
    res.status(500).json({ error: err.message || 'Failed to update application' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    console.log('[applications] DELETE /api/applications/:id', { userId: req.user._id.toString(), id });
    const result = await Application.deleteOne({ _id: id, userId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
    console.log('[applications] Application deleted', { userId: req.user._id.toString(), id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[applications] Failed to delete application:', err.message);
    res.status(500).json({ error: err.message || 'Failed to delete application' });
  }
});

module.exports = router;
