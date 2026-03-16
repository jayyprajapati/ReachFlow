const express = require('express');
const { Types } = require('mongoose');
const sanitizeHtml = require('sanitize-html');
const { Campaign, Group, SendLog, Variable } = require('../db');
const { renderTemplate, validateVariables } = require('../services/templateService');
const { sendMimeEmail } = require('../gmail');
const { encryptJson, decryptJson, isEncryptedEnvelope, normalizeEmail, computeEmailHash } = require('../utils/dataSecurity');

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
  return normalizeVariableKey(variable?.variableNameKey || variable?.variableName || variable?.key || variable?.label);
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

function normalizeRecipients(raw, allowedVars) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(allowedVars.map(v => v.toLowerCase()));
  return raw.map(r => {
    const variables = {};
    Object.entries(r.variables || {}).forEach(([k, v]) => {
      const key = String(k).toLowerCase();
      if (allowed.has(key)) variables[key] = String(v || '').trim();
    });

    const email = normalizeEmail(r.email || '');
    return {
      _id: r._id || new Types.ObjectId().toString(),
      email,
      emailHash: computeEmailHash(email),
      name: (r.name || '').trim() || 'There',
      variables,
      status: r.status || 'pending',
    };
  });
}

function validateRecipients(list) {
  if (!Array.isArray(list) || !list.length) return ['At least one recipient is required'];
  if (list.length > MAX_RECIPIENTS) return [`Max ${MAX_RECIPIENTS} recipients per campaign`];
  for (const r of list) {
    if (!emailRegex.test(r.email || '')) return ['Invalid recipient data'];
    if (!r.name) return ['Invalid recipient data'];
  }
  return [];
}

function buildCampaignPayload(input) {
  return {
    subject: String(input.subject || ''),
    body_html: sanitizeBody(input.body_html || ''),
    sender_name: String(input.sender_name || ''),
    name_format: normalizeNameFormat(input.name_format),
    recipients: Array.isArray(input.recipients) ? input.recipients : [],
    variables: Array.isArray(input.variables) ? input.variables : [],
    group_imports: Array.isArray(input.group_imports) ? input.group_imports : [],
  };
}

function decryptCampaignPayload(doc) {
  if (isEncryptedEnvelope(doc.encryptedPayload)) {
    return decryptJson(doc.encryptedPayload);
  }
  return buildCampaignPayload({
    subject: doc.subject,
    body_html: doc.body_html,
    sender_name: doc.sender_name,
    name_format: doc.name_format,
    recipients: (doc.recipients || []).map(r => ({
      _id: r._id?.toString?.() || String(r._id || ''),
      email: normalizeEmail(r.email || ''),
      emailHash: r.emailHash || computeEmailHash(r.email || ''),
      name: r.name || '',
      variables: r.variables || {},
      status: r.status || 'pending',
    })),
    variables: doc.variables || [],
    group_imports: doc.group_imports || [],
  });
}

async function persistCampaignPayload(doc, payload) {
  doc.encryptedPayload = encryptJson(payload);
  doc.recipient_count = payload.recipients.length;
  doc.variable_count = payload.variables.length;
  doc.subject = undefined;
  doc.body_html = undefined;
  doc.sender_name = undefined;
  doc.name_format = undefined;
  doc.recipients = undefined;
  doc.variables = undefined;
  doc.group_imports = undefined;
  await doc.save();
}

async function getAllowedVariables(userId) {
  const vars = await Variable.find({ userId });
  return ['name', ...vars.map(getVariableKey).filter(Boolean)];
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

async function bumpContactTracking(userId, emailHashToCount) {
  const updates = Object.entries(emailHashToCount || {}).filter(([hash, count]) => !!hash && Number(count) > 0);
  if (!updates.length) return;

  const touchedAt = new Date();
  await Promise.all(updates.map(([emailHash, count]) => (
    Group.updateMany(
      { userId, 'contacts.emailHash': emailHash },
      {
        $inc: {
          'contacts.$[contact].emailCount': Number(count),
        },
      },
      { arrayFilters: [{ 'contact.emailHash': emailHash }] }
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

  const payload = decryptCampaignPayload(campaign);
  const pending = (payload.recipients || []).filter(r => r.status === 'pending');
  if (!pending.length) {
    return { status: campaign.status, sentCount: 0, failedCount: 0 };
  }

  await ensureSendAllowance(user._id, pending.length);

  let sentCount = 0;
  let failedCount = 0;
  let lastError = null;
  const logs = [];
  const sentByHash = {};

  if (campaign.send_mode !== 'individual') {
    campaign.send_mode = 'individual';
  }

  for (const recipient of pending) {
    const html = renderTemplate(payload.body_html, {
      name: resolveNameValue(recipient.name, payload.name_format),
      ...(recipient.variables || {}),
    });
    try {
      await sendMimeEmail({ user, to: recipient.email, subject: payload.subject, html, senderName: payload.sender_name });
      const target = payload.recipients.find(r => String(r._id) === String(recipient._id));
      if (target) target.status = 'sent';
      logs.push({ userId: user._id, sentAt: new Date() });
      sentByHash[recipient.emailHash] = (sentByHash[recipient.emailHash] || 0) + 1;
      sentCount += 1;
    } catch (err) {
      const target = payload.recipients.find(r => String(r._id) === String(recipient._id));
      if (target) target.status = 'failed';
      failedCount += 1;
      lastError = err;
    }
  }

  if (logs.length) await SendLog.insertMany(logs);
  await bumpContactTracking(user._id, sentByHash);

  if (sentCount === 0 && lastError) {
    campaign.status = 'draft';
    await persistCampaignPayload(campaign, payload);
    throw new Error(`All emails failed: ${lastError.message}`);
  }

  campaign.status = 'sent';
  await persistCampaignPayload(campaign, payload);
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

    const payload = buildCampaignPayload({
      subject,
      body_html,
      sender_name: sender_name || '',
      name_format,
      recipients: normalizedRecipients,
      variables: snapshotVariables,
      group_imports: normalizeGroupImports(group_imports),
    });

    const doc = await Campaign.create({
      userId: req.user._id,
      encryptedPayload: encryptJson(payload),
      recipient_count: payload.recipients.length,
      variable_count: payload.variables.length,
      send_mode: 'individual',
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
    const existingCampaign = await Campaign.findOne({ _id: id, userId: req.user._id });
    if (!existingCampaign) return res.status(404).json({ error: 'Not found' });

    const incoming = req.body || {};
    const payload = decryptCampaignPayload(existingCampaign);
    const snapshotVariables = incoming.variables !== undefined
      ? normalizeVariablesUsed(incoming.variables)
      : normalizeVariablesUsed(payload.variables || []);

    if (incoming.subject !== undefined) payload.subject = String(incoming.subject || '');
    if (incoming.body_html !== undefined) payload.body_html = sanitizeBody(incoming.body_html || '');
    if (incoming.sender_name !== undefined) payload.sender_name = String(incoming.sender_name || '');
    if (incoming.name_format !== undefined) payload.name_format = normalizeNameFormat(incoming.name_format);
    if (incoming.variables !== undefined) payload.variables = snapshotVariables;
    if (incoming.group_imports !== undefined) payload.group_imports = normalizeGroupImports(incoming.group_imports);

    if (Array.isArray(incoming.recipients)) {
      const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), snapshotVariables);
      const normalizedRecipients = normalizeRecipients(incoming.recipients, allowedVars);
      const recErrors = validateRecipients(normalizedRecipients);
      if (recErrors.length) return res.status(400).json({ error: recErrors[0] });
      payload.recipients = normalizedRecipients;
    }

    await persistCampaignPayload(existingCampaign, payload);
    return res.json({ id: existingCampaign._id.toString(), status: existingCampaign.status });
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

    const rows = await Campaign.find(match).sort({ updated_at: -1 });
    const payload = rows.map((row) => {
      const decrypted = decryptCampaignPayload(row);
      return {
        id: row._id.toString(),
        subject: decrypted.subject,
        status: row.status === 'sent' ? 'sent' : 'draft',
        created_at: row.created_at,
        updated_at: row.updated_at,
        recipient_count: row.recipient_count || decrypted.recipients.length || 0,
        variable_count: row.variable_count || decrypted.variables.length || 0,
        body_preview: String(decrypted.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
      };
    });
    res.json(payload);
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
    const decrypted = decryptCampaignPayload(doc);
    res.json({
      id: doc._id.toString(),
      subject: decrypted.subject,
      body_html: decrypted.body_html,
      sender_name: decrypted.sender_name,
      name_format: decrypted.name_format,
      recipients: decrypted.recipients,
      send_mode: doc.send_mode || 'individual',
      variables: decrypted.variables,
      group_imports: decrypted.group_imports,
      status: doc.status,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    });
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

    const payload = decryptCampaignPayload(campaign);
    const target = recipient_id
      ? payload.recipients.find(r => String(r._id) === String(recipient_id))
      : payload.recipients[0];
    if (!target) return res.status(404).json({ error: 'No recipients' });

    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), payload.variables || []);
    const validation = validateVariables(payload.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });

    const html = renderTemplate(payload.body_html, {
      name: resolveNameValue(target.name, payload.name_format),
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

    const payload = decryptCampaignPayload(campaign);
    const recipientCount = payload.recipients.length;
    if (recipientCount > 5 && !confirm_bulk_send) {
      return res.status(400).json({ error: 'Bulk send confirmation required' });
    }
    if (recipientCount > MAX_RECIPIENTS) {
      return res.status(400).json({ error: `Max ${MAX_RECIPIENTS} recipients per campaign` });
    }

    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), payload.variables || []);
    const validation = validateVariables(payload.body_html, allowedVars);
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
