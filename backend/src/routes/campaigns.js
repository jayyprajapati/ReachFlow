const express = require('express');
const { Types } = require('mongoose');
const sanitizeHtml = require('sanitize-html');
const { Campaign, Group, SendLog, Variable } = require('../db');
const { renderTemplate, validateVariables, extractVariables } = require('../services/templateService');
const { sendMimeEmail } = require('../gmail');

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAILY_LIMIT = 350;
const MAX_RECIPIENTS = 50;

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sanitizeBody(html) {
  return sanitizeHtml(html || '', {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'span', 'br']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height', 'style'],
      span: ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

async function getAllowedVariables(userId) {
  const vars = await Variable.find({ userId });
  return ['name', ...vars.map(v => v.key)];
}

function normalizeRecipients(raw, allowedVars) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(allowedVars.map(v => v.toLowerCase()));
  return raw.map(r => {
    const variables = {};
    Object.entries(r.variables || {}).forEach(([k, v]) => {
      const key = String(k).toLowerCase();
      if (allowed.has(key)) variables[key] = String(v || '').trim();
    });
    return {
      _id: r._id || new Types.ObjectId(),
      email: (r.email || '').toLowerCase().trim(),
      name: (r.name || '').trim() || 'There',
      variables,
      status: r.status || 'pending',
    };
  });
}

function validateRecipients(list, requiredKeys) {
  const errors = [];
  const required = new Set(requiredKeys.map(k => k.toLowerCase()));
  if (!Array.isArray(list) || !list.length) return ['At least one recipient is required'];
  if (list.length > MAX_RECIPIENTS) return [`Max ${MAX_RECIPIENTS} recipients per campaign`];
  list.forEach(r => {
    if (!emailRegex.test(r.email || '')) errors.push(`Invalid email: ${r.email || ''}`);
    if (!r.name) errors.push(`Name missing for ${r.email}`);
    required.forEach(k => {
      const val = r.variables?.[k];
      if (!val) errors.push(`Missing required variable ${k} for ${r.email}`);
    });
  });
  return errors;
}

async function ensureSendAllowance(userId, requested) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await SendLog.countDocuments({ userId, sentAt: { $gte: startOfDay } });
  if (sentToday + requested > DAILY_LIMIT) {
    const err = new Error('Daily send limit reached. Try again tomorrow.');
    err.code = 'DAILY_LIMIT';
    throw err;
  }
}

async function bumpContactTracking(userId, emailToCount) {
  const updates = Object.entries(emailToCount || {}).filter(([email, count]) => !!email && Number(count) > 0);
  if (!updates.length) return;

  const touchedAt = new Date();
  await Promise.all(updates.map(([email, count]) => (
    Group.updateMany(
      { userId, 'contacts.email': email },
      {
        $inc: { 'contacts.$[contact].contact_count': Number(count) },
        $set: {
          'contacts.$[contact].last_contacted_at': touchedAt,
          'contacts.$[contact].last_contacted_via': 'email',
        },
      },
      { arrayFilters: [{ 'contact.email': email }] }
    )
  )));
}

async function sendCampaign(campaignId, user) {
  const campaign = await Campaign.findOne({ _id: campaignId, userId: user._id });
  if (!campaign) throw new Error('Campaign not found');

  if (!user.gmailConnected || !user.encryptedRefreshToken) {
    const err = new Error('Gmail not connected. Please connect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const pending = campaign.recipients.filter(r => r.status === 'pending');
  if (!pending.length) {
    return { status: campaign.status, sentCount: 0, failedCount: 0 };
  }

  await ensureSendAllowance(user._id, pending.length);

  let sentCount = 0;
  let failedCount = 0;
  let lastError = null;
  const logs = [];
  const sentEmailCounts = {};

  if (campaign.send_mode === 'single') {
    const first = pending[0];
    const html = renderTemplate(campaign.body_html, { name: first?.name || 'There', ...(first.variables || {}) });
    const toList = pending.map(r => r.email);
    await sendMimeEmail({ user, to: toList, subject: campaign.subject, html, senderName: campaign.sender_name });
    pending.forEach(r => {
      const subdoc = campaign.recipients.id(r._id);
      if (subdoc) subdoc.status = 'sent';
      logs.push({ userId: user._id, sentAt: new Date() });
      sentEmailCounts[r.email] = (sentEmailCounts[r.email] || 0) + 1;
    });
    sentCount = pending.length;
  } else {
    for (const recipient of pending) {
      const html = renderTemplate(campaign.body_html, { name: recipient.name, ...(recipient.variables || {}) });
      try {
        await sendMimeEmail({ user, to: recipient.email, subject: campaign.subject, html, senderName: campaign.sender_name });
        const subdoc = campaign.recipients.id(recipient._id);
        if (subdoc) subdoc.status = 'sent';
        logs.push({ userId: user._id, sentAt: new Date() });
        sentEmailCounts[recipient.email] = (sentEmailCounts[recipient.email] || 0) + 1;
        sentCount++;
      } catch (err) {
        console.error(`[send] Failed to send to ${recipient.email}:`, err.message);
        const subdoc = campaign.recipients.id(recipient._id);
        if (subdoc) subdoc.status = 'failed';
        failedCount++;
        lastError = err;
      }
    }
  }

  if (logs.length) await SendLog.insertMany(logs);
  await bumpContactTracking(user._id, sentEmailCounts);

  if (sentCount === 0 && lastError) {
    campaign.status = 'draft';
    await campaign.save();
    throw new Error(`All emails failed: ${lastError.message}`);
  }

  campaign.status = 'sent';
  await campaign.save();
  return { status: 'sent', sentCount, failedCount };
}

router.post('/', async (req, res) => {
  try {
    const { subject, body_html, send_mode, recipients, scheduled_at, status, sender_name } = req.body || {};
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!body_html || !body_html.trim()) {
      return res.status(400).json({ error: 'Body is required' });
    }
    if (!send_mode || !['single', 'individual'].includes(send_mode)) {
      return res.status(400).json({ error: 'send_mode must be single or individual' });
    }

    const allowedVars = await getAllowedVariables(req.user._id);
    const requiredVars = (await Variable.find({ userId: req.user._id, required: true })).map(v => v.key);
    const normalizedRecipients = normalizeRecipients(recipients, allowedVars);
    const recErrors = validateRecipients(normalizedRecipients, requiredVars.filter(k => extractVariables(body_html).includes(k)));
    if (recErrors.length) return res.status(400).json({ error: recErrors[0] });

    const validation = validateVariables(body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });
    if (validation.unknown.length) return res.status(400).json({ error: `Unknown variable {{${validation.unknown[0]}}} found.` });

    const when = normalizeDate(scheduled_at);
    const initialStatus = status && ['draft', 'scheduled'].includes(status)
      ? status
      : when && when.getTime() > Date.now()
        ? 'scheduled'
        : 'draft';

    const doc = await Campaign.create({
      userId: req.user._id,
      subject,
      body_html: sanitizeBody(body_html),
      sender_name: sender_name || '',
      send_mode,
      recipients: normalizedRecipients,
      scheduled_at: when,
      status: initialStatus,
    });

    return res.json({ id: doc._id.toString(), status: doc.status });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to create campaign' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const { subject, body_html, send_mode, recipients, scheduled_at, status, sender_name } = req.body || {};
    const update = {};
    if (subject !== undefined) update.subject = subject;
    if (body_html !== undefined) update.body_html = sanitizeBody(body_html);
    if (sender_name !== undefined) update.sender_name = sender_name;
    if (send_mode && ['single', 'individual'].includes(send_mode)) update.send_mode = send_mode;
    if (status && ['draft', 'scheduled', 'sent'].includes(status)) update.status = status;
    if (scheduled_at !== undefined) update.scheduled_at = normalizeDate(scheduled_at);

    if (Array.isArray(recipients)) {
      const allowedVars = await getAllowedVariables(req.user._id);
      const requiredVars = (await Variable.find({ userId: req.user._id, required: true })).map(v => v.key);
      const normalizedRecipients = normalizeRecipients(recipients, allowedVars);
      const recErrors = validateRecipients(normalizedRecipients, requiredVars.filter(k => extractVariables(body_html || '').includes(k)));
      if (recErrors.length) return res.status(400).json({ error: recErrors[0] });
      update.recipients = normalizedRecipients;
    }

    const doc = await Campaign.findOneAndUpdate({ _id: id, userId: req.user._id }, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json({ id: doc._id.toString(), status: doc.status });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update campaign' });
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await Campaign.aggregate([
      { $match: { userId: req.user._id } },
      {
        $project: {
          subject: 1,
          status: 1,
          scheduled_at: 1,
          created_at: 1,
          recipient_count: { $size: '$recipients' },
        },
      },
      { $sort: { created_at: -1 } },
    ]);
    res.json(rows.map(r => ({ ...r, id: r._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load campaigns' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const doc = await Campaign.findOne({ _id: id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const payload = doc.toObject({ versionKey: false });
    payload.id = payload._id.toString();
    delete payload._id;
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load campaign' });
  }
});

router.post('/:id/preview', async (req, res) => {
  const { id } = req.params;
  const { recipient_id } = req.body || {};
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const campaign = await Campaign.findOne({ _id: id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    if (!req.user.gmailConnected || !req.user.encryptedRefreshToken) {
      return res.status(401).json({ error: 'Connect Gmail to send', authError: true });
    }
    const target = recipient_id
      ? campaign.recipients.id(recipient_id)
      : campaign.recipients[0];
    if (!target) return res.status(404).json({ error: 'No recipients' });

    const allowedVars = await getAllowedVariables(req.user._id);
    const validation = validateVariables(campaign.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });

    const html = renderTemplate(campaign.body_html, { name: target.name || 'There', ...(target.variables || {}) });
    res.json({ html, warnings: validation.unknown.length ? validation.unknown.map(k => `Unknown variable {{${k}}} found.`) : [] });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to render preview' });
  }
});

router.post('/:id/send', async (req, res) => {
  const { id } = req.params;
  const { confirm_bulk_send } = req.body || {};
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const campaign = await Campaign.findOne({ _id: id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    const recipientCount = campaign.recipients.length;
    if (recipientCount > 5 && !confirm_bulk_send) {
      return res.status(400).json({ error: 'Bulk send confirmation required' });
    }
    if (recipientCount > MAX_RECIPIENTS) {
      return res.status(400).json({ error: `Max ${MAX_RECIPIENTS} recipients per campaign` });
    }

    const allowedVars = await getAllowedVariables(req.user._id);
    const validation = validateVariables(campaign.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });
    if (validation.unknown.length) return res.status(400).json({ error: `Unknown variable {{${validation.unknown[0]}}} found.` });

    const scheduledAt = campaign.scheduled_at ? new Date(campaign.scheduled_at) : null;
    const isFuture = scheduledAt && !Number.isNaN(scheduledAt) && scheduledAt.getTime() > Date.now();

    if (isFuture) {
      campaign.status = 'scheduled';
      await campaign.save();
      return res.json({ status: 'scheduled' });
    }

    const result = await sendCampaign(id, req.user);
    return res.json(result);
  } catch (err) {
    const isAuthErr = err.code === 'AUTH_REQUIRED' || err.code === 'AUTH_EXPIRED'
      || /invalid_grant|Token has been expired|revoked|reconnect/i.test(err.message || '');
    if (err.code === 'DAILY_LIMIT') {
      return res.status(429).json({ error: 'Daily send limit reached. Try again tomorrow.' });
    }
    const status = isAuthErr ? 401 : 500;
    return res.status(status).json({ error: err.message || 'Failed to send', authError: isAuthErr });
  }
});

module.exports = {
  router,
  sendCampaign,
};
