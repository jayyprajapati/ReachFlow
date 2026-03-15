const express = require('express');
const { Types } = require('mongoose');
const sanitizeHtml = require('sanitize-html');
const { Campaign, Group, SendLog, Variable } = require('../db');
const { renderTemplate, validateVariables } = require('../services/templateService');
const { sendMimeEmail } = require('../gmail');

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAILY_LIMIT = 350;
const MAX_RECIPIENTS = 50;

function firstNameFromFullName(fullName) {
  return String(fullName || '').trim().split(' ')[0] || 'There';
}

function normalizeVariableKey(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function getVariableKey(variable) {
  return normalizeVariableKey(variable?.variableName || variable?.key || variable?.label);
}

function normalizeNameFormat(value) {
  return String(value || '').toLowerCase() === 'full' ? 'full' : 'first';
}

function resolveNameValue(fullName, nameFormat) {
  const safeFullName = String(fullName || '').trim();
  if (!safeFullName) return 'There';
  return normalizeNameFormat(nameFormat) === 'full'
    ? safeFullName
    : firstNameFromFullName(safeFullName);
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
  return ['name', ...vars.map(getVariableKey).filter(Boolean)];
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

function validateRecipients(list) {
  const errors = [];
  if (!Array.isArray(list) || !list.length) return ['At least one recipient is required'];
  if (list.length > MAX_RECIPIENTS) return [`Max ${MAX_RECIPIENTS} recipients per campaign`];
  list.forEach(r => {
    if (!emailRegex.test(r.email || '')) errors.push(`Invalid email: ${r.email || ''}`);
    if (!r.name) errors.push(`Name missing for ${r.email}`);
  });
  return errors;
}

function normalizeVariablesUsed(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  raw.forEach(item => {
    const key = normalizeVariableKey(item);
    if (key) seen.add(key);
  });
  return Array.from(seen).filter(key => key !== 'name').slice(0, 2);
}

function mergeVariableKeys(...groups) {
  const merged = new Set();
  groups.flat().forEach(item => {
    const key = normalizeVariableKey(item);
    if (key) merged.add(key);
  });
  merged.add('name');
  return Array.from(merged);
}

function normalizeGroupImports(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    const importedAt = item?.importedAt ? new Date(item.importedAt) : null;
    const safeImportedAt = importedAt && !Number.isNaN(importedAt.getTime()) ? importedAt : undefined;
    return {
      groupId: item?.groupId ? String(item.groupId).trim() : '',
      companyName: item?.companyName ? String(item.companyName).trim() : '',
      category: item?.category ? String(item.category).trim() : '',
      importedCount: Number.isFinite(Number(item?.importedCount)) ? Math.max(0, Number(item.importedCount)) : 0,
      importedAt: safeImportedAt,
    };
  });
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
        $push: {
          'contacts.$[contact].contactHistory': {
            $each: Array.from({ length: Number(count) }, () => ({ type: 'email', date: touchedAt })),
          },
        },
        $inc: {
          'contacts.$[contact].emailCount': Number(count),
        },
        $set: {
          'contacts.$[contact].lastContactedDate': touchedAt,
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

  if (campaign.send_mode !== 'individual') {
    campaign.send_mode = 'individual';
  }

  for (const recipient of pending) {
    const html = renderTemplate(campaign.body_html, {
      name: resolveNameValue(recipient.name, campaign.name_format),
      ...(recipient.variables || {}),
    });
    try {
      await sendMimeEmail({ user, to: recipient.email, subject: campaign.subject, html, senderName: campaign.sender_name });
      const subdoc = campaign.recipients.id(recipient._id);
      if (subdoc) subdoc.status = 'sent';
      logs.push({ userId: user._id, sentAt: new Date() });
      sentEmailCounts[recipient.email] = (sentEmailCounts[recipient.email] || 0) + 1;
      sentCount++;
    } catch (err) {
      console.warn('[send] Email failed', { campaignId: campaign._id.toString(), userId: user._id.toString() });
      const subdoc = campaign.recipients.id(recipient._id);
      if (subdoc) subdoc.status = 'failed';
      failedCount++;
      lastError = err;
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
    const { subject, body_html, recipients, sender_name, variables, group_imports, name_format } = req.body || {};
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!body_html || !body_html.trim()) {
      return res.status(400).json({ error: 'Body is required' });
    }

    const snapshotVariables = normalizeVariablesUsed(variables);
    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), snapshotVariables);
    const normalizedRecipients = normalizeRecipients(recipients, allowedVars);
    const recErrors = validateRecipients(normalizedRecipients);
    if (recErrors.length) return res.status(400).json({ error: recErrors[0] });

    const validation = validateVariables(body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });
    if (validation.unknown.length) return res.status(400).json({ error: `Unknown variable {{${validation.unknown[0]}}} found.` });

    const doc = await Campaign.create({
      userId: req.user._id,
      subject,
      body_html: sanitizeBody(body_html),
      sender_name: sender_name || '',
      name_format: normalizeNameFormat(name_format),
      recipients: normalizedRecipients,
      send_mode: 'individual',
      variables: snapshotVariables,
      group_imports: normalizeGroupImports(group_imports),
      status: 'draft',
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
    const { subject, body_html, recipients, sender_name, variables, group_imports, name_format } = req.body || {};
    const existingCampaign = await Campaign.findOne({ _id: id, userId: req.user._id });
    if (!existingCampaign) return res.status(404).json({ error: 'Not found' });

    const update = {};
    if (subject !== undefined) update.subject = subject;
    if (body_html !== undefined) update.body_html = sanitizeBody(body_html);
    if (sender_name !== undefined) update.sender_name = sender_name;
    if (name_format !== undefined) update.name_format = normalizeNameFormat(name_format);
    const snapshotVariables = variables !== undefined
      ? normalizeVariablesUsed(variables)
      : normalizeVariablesUsed(existingCampaign.variables || []);
    if (variables !== undefined) update.variables = snapshotVariables;
    if (group_imports !== undefined) update.group_imports = normalizeGroupImports(group_imports);

    if (Array.isArray(recipients)) {
      const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), snapshotVariables);
      const normalizedRecipients = normalizeRecipients(recipients, allowedVars);
      const recErrors = validateRecipients(normalizedRecipients);
      if (recErrors.length) return res.status(400).json({ error: recErrors[0] });
      update.recipients = normalizedRecipients;
    }

    const doc = await Campaign.findOneAndUpdate({ _id: id, userId: req.user._id }, update, { new: true });
    return res.json({ id: doc._id.toString(), status: doc.status });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update campaign' });
  }
});

router.get('/', async (req, res) => {
  try {
    const view = String(req.query?.view || 'all').toLowerCase();
    const match = { userId: req.user._id };
    if (view === 'history') match.status = 'sent';
    if (view === 'drafts') match.status = 'draft';

    const rows = await Campaign.aggregate([
      { $match: match },
      {
        $project: {
          subject: 1,
          status: 1,
          body_html: 1,
          variables: 1,
          created_at: 1,
          updated_at: 1,
          recipient_count: { $size: '$recipients' },
          variable_count: { $size: { $ifNull: ['$variables', []] } },
        },
      },
      { $sort: { updated_at: -1 } },
    ]);
    res.json(rows.map(r => ({
      id: r._id.toString(),
      subject: r.subject,
      status: r.status === 'sent' ? 'sent' : 'draft',
      created_at: r.created_at,
      updated_at: r.updated_at,
      recipient_count: r.recipient_count || 0,
      variable_count: r.variable_count || 0,
      body_preview: String(r.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
    })));
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

    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), campaign.variables || []);
    const validation = validateVariables(campaign.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });

    const html = renderTemplate(campaign.body_html, {
      name: resolveNameValue(target.name, campaign.name_format),
      ...(target.variables || {}),
    });
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

    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), campaign.variables || []);
    const validation = validateVariables(campaign.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });
    if (validation.unknown.length) return res.status(400).json({ error: `Unknown variable {{${validation.unknown[0]}}} found.` });

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
