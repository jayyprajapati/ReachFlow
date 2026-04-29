const express = require('express');
const { Types } = require('mongoose');
const { Campaign, Group, SendLog, Variable } = require('../db');
const { renderTemplate, validateVariables } = require('../services/templateService');
const { sendMimeEmail, validateAttachments } = require('../gmail');
const { encryptJson, decryptJson, isEncryptedEnvelope, normalizeEmail, computeEmailHash } = require('../utils/dataSecurity');
const { sanitizeEmailHtml } = require('../utils/sanitizeEmailHtml');

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PER_MINUTE_LIMIT = 15;
const PER_DAY_LIMIT = 100;
const ROLLING_MINUTE_MS = 60 * 1000;
const ROLLING_DAY_MS = 24 * 60 * 60 * 1000;
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
  return sanitizeEmailHtml(html || '');
}

function parseBypassEmailAllowlist() {
  return new Set(
    String(process.env.RATE_LIMIT_BYPASS_EMAILS || '')
      .split(',')
      .map(value => normalizeEmail(value))
      .filter(Boolean)
  );
}

function getConnectedGmailEmail(user) {
  if (!user) return '';
  if (isEncryptedEnvelope(user.gmailEmailEnc)) {
    try {
      return normalizeEmail(decryptJson(user.gmailEmailEnc)?.value || '');
    } catch (_err) {
      return normalizeEmail(user.gmailEmail || user.email || '');
    }
  }
  return normalizeEmail(user.gmailEmail || user.email || '');
}

function isRateLimitBypassed(user) {
  const allowlist = parseBypassEmailAllowlist();
  if (!allowlist.size) return false;
  const candidates = [
    normalizeEmail(user?.email || ''),
    getConnectedGmailEmail(user),
  ].filter(Boolean);
  return candidates.some(email => allowlist.has(email));
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

function normalizeAttachment(att) {
  return {
    name: String(att.name || 'attachment').slice(0, 255).replace(/[^\w.\-\s]/g, '_'),
    mimeType: String(att.mimeType || 'application/octet-stream'),
    data: String(att.data || ''),
    size: Number.isFinite(Number(att.size)) ? Math.max(0, Number(att.size)) : 0,
  };
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
    attachments: Array.isArray(input.attachments) ? input.attachments.map(normalizeAttachment) : [],
  };
}

function decryptCampaignPayload(doc) {
  if (isEncryptedEnvelope(doc.encryptedPayload)) {
    const payload = decryptJson(doc.encryptedPayload);
    return {
      ...payload,
      body_html: sanitizeBody(payload.body_html || ''),
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    };
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
    attachments: [],
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

// Uses rolling windows based on persisted send logs:
// - rolling 60 seconds for burst control
// - rolling 24 hours for daily control
async function ensureSendAllowance(user, requested) {
  if (isRateLimitBypassed(user)) return;

  const userId = user._id;
  const now = Date.now();
  const minuteWindowStart = new Date(now - ROLLING_MINUTE_MS);
  const dayWindowStart = new Date(now - ROLLING_DAY_MS);

  const [sentLastMinute, sentLast24h] = await Promise.all([
    SendLog.countDocuments({ userId, sentAt: { $gte: minuteWindowStart } }),
    SendLog.countDocuments({ userId, sentAt: { $gte: dayWindowStart } }),
  ]);

  if (sentLastMinute + requested > PER_MINUTE_LIMIT) {
    const err = new Error('Too many emails sent in a short period. Please wait a minute and try again.');
    err.code = 'MINUTE_LIMIT';
    err.retryAfterSeconds = 60;
    throw err;
  }

  if (sentLast24h + requested > PER_DAY_LIMIT) {
    const err = new Error('Daily sending limit reached. Try again tomorrow.');
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
  console.log(`[campaign] sendCampaign — campaignId: ${campaignId}, userId: ${user._id}`);
  const campaign = await Campaign.findOne({ _id: campaignId, userId: user._id });
  if (!campaign) {
    console.error(`[campaign] Campaign not found — campaignId: ${campaignId}`);
    throw new Error('Campaign not found');
  }

  if (!user.gmailConnected || !user.encryptedRefreshToken) {
    console.error(`[campaign] Gmail not connected — gmailConnected: ${user.gmailConnected}, hasRefreshToken: ${!!user.encryptedRefreshToken}`);
    const err = new Error('Gmail not connected. Please connect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const payload = decryptCampaignPayload(campaign);
  const pending = (payload.recipients || []).filter(r => r.status === 'pending');
  console.log(`[campaign] Campaign decrypted — subject: "${payload.subject}", totalRecipients: ${payload.recipients.length}, pendingRecipients: ${pending.length}`);

  if (!pending.length) {
    console.log('[campaign] No pending recipients — nothing to send');
    return { status: campaign.status, sentCount: 0, failedCount: 0 };
  }

  console.log(`[campaign] Checking rate limits for ${pending.length} recipients…`);
  await ensureSendAllowance(user, pending.length);
  console.log('[campaign] Rate limit check passed');

  let sentCount = 0;
  let failedCount = 0;
  let lastError = null;
  const logs = [];
  const sentByHash = {};
  const safeTemplateHtml = sanitizeBody(payload.body_html);

  if (campaign.send_mode !== 'individual') {
    campaign.send_mode = 'individual';
  }

  for (let i = 0; i < pending.length; i++) {
    const recipient = pending[i];
    console.log(`[campaign] Sending ${i + 1}/${pending.length} — to: ${recipient.email}, name: "${recipient.name}"`);
    const renderedHtml = renderTemplate(safeTemplateHtml, {
      name: resolveNameValue(recipient.name, payload.name_format),
      ...(recipient.variables || {}),
    });
    const html = sanitizeBody(renderedHtml);
    try {
      await sendMimeEmail({ user, to: recipient.email, subject: payload.subject, html, senderName: payload.sender_name, attachments: payload.attachments || [] });
      const target = payload.recipients.find(r => String(r._id) === String(recipient._id));
      if (target) target.status = 'sent';
      logs.push({ userId: user._id, sentAt: new Date() });
      sentByHash[recipient.emailHash] = (sentByHash[recipient.emailHash] || 0) + 1;
      sentCount += 1;
      console.log(`[campaign] ✓ Sent successfully — to: ${recipient.email}`);
    } catch (err) {
      const target = payload.recipients.find(r => String(r._id) === String(recipient._id));
      if (target) target.status = 'failed';
      failedCount += 1;
      lastError = err;
      console.error(`[campaign] ✗ Send FAILED — to: ${recipient.email}, error: ${err.message}, code: ${err.code || '(none)'}`);
      if (err?.response?.data) {
        console.error('[campaign] Google API error payload:', JSON.stringify(err.response.data, null, 2));
      }
    }
  }

  console.log(`[campaign] Send loop complete — sent: ${sentCount}, failed: ${failedCount}`);

  if (logs.length) await SendLog.insertMany(logs);
  await bumpContactTracking(user._id, sentByHash);

  if (sentCount === 0 && lastError) {
    console.error(`[campaign] ALL emails failed — reverting campaign to draft. Last error: ${lastError.message}`);
    campaign.status = 'draft';
    await persistCampaignPayload(campaign, payload);
    throw new Error(`All emails failed: ${lastError.message}`);
  }

  campaign.status = 'sent';
  payload.attachments = []; // strip attachment data after sending
  await persistCampaignPayload(campaign, payload);
  console.log(`[campaign] Campaign marked as sent — campaignId: ${campaignId}, sent: ${sentCount}, failed: ${failedCount}`);
  return { status: 'sent', sentCount, failedCount };
}

router.post('/', async (req, res) => {
  try {
    const { subject, body_html, recipients, sender_name, variables, group_imports, name_format, attachments } = req.body || {};
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!body_html || !body_html.trim()) {
      return res.status(400).json({ error: 'Body is required' });
    }

    if (attachments && attachments.length) {
      const attErr = validateAttachments(attachments);
      if (attErr) return res.status(400).json({ error: attErr });
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
      attachments: attachments || [],
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
    if (view === 'scheduled') match.status = 'scheduled';

    const rows = await Campaign.find(match).sort({ updated_at: -1 });
    const payload = rows.map((row) => {
      const decrypted = decryptCampaignPayload(row);
      return {
        id: row._id.toString(),
        subject: decrypted.subject,
        status: row.status || 'draft',
        scheduledAt: row.scheduledAt || null,
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

router.post('/preview', async (req, res) => {
  const { recipient_id } = req.body || {};
  try {
    if (!req.user.gmailConnected || !req.user.encryptedRefreshToken) {
      return res.status(401).json({ error: 'Connect Gmail to send', authError: true });
    }

    const { subject, body_html, recipients, sender_name, variables, group_imports, name_format } = req.body || {};
    if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!body_html || !String(body_html).trim()) return res.status(400).json({ error: 'Body is required' });

    const snapshotVariables = normalizeVariablesUsed(variables);
    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), snapshotVariables);
    const normalizedRecipients = normalizeRecipients(recipients, allowedVars);
    const recErrors = validateRecipients(normalizedRecipients);
    if (recErrors.length) return res.status(400).json({ error: recErrors[0] });

    const payload = buildCampaignPayload({
      subject,
      body_html,
      sender_name: sender_name || '',
      name_format,
      recipients: normalizedRecipients,
      variables: snapshotVariables,
      group_imports: normalizeGroupImports(group_imports),
    });

    const validation = validateVariables(payload.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });

    const target = recipient_id
      ? payload.recipients.find(r => String(r._id) === String(recipient_id))
      : payload.recipients[0];
    if (!target) return res.status(404).json({ error: 'No recipients' });

    const safeTemplateHtml = sanitizeBody(payload.body_html);
    const renderedHtml = renderTemplate(safeTemplateHtml, {
      name: resolveNameValue(target.name, payload.name_format),
      ...(target.variables || {}),
    });
    const html = sanitizeBody(renderedHtml);

    return res.json({ html, warnings: validation.unknown.length ? validation.unknown.map(k => `Unknown variable {{${k}}} found.`) : [] });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to render preview' });
  }
});

router.post('/schedule-send', async (req, res) => {
  try {
    if (!req.user.gmailConnected || !req.user.encryptedRefreshToken) {
      return res.status(401).json({ error: 'Gmail not connected. Please connect your Gmail account.', authError: true });
    }

    const { subject, body_html, recipients, sender_name, variables, group_imports, name_format, attachments, scheduledAt } = req.body || {};

    if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!body_html || !String(body_html).trim()) return res.status(400).json({ error: 'Body is required' });
    if (!scheduledAt) return res.status(400).json({ error: 'Scheduled time is required' });

    const schedDate = new Date(scheduledAt);
    if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    if (attachments && attachments.length) {
      const attErr = validateAttachments(attachments);
      if (attErr) return res.status(400).json({ error: attErr });
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
      subject, body_html, sender_name: sender_name || '', name_format,
      recipients: normalizedRecipients,
      variables: snapshotVariables,
      group_imports: normalizeGroupImports(group_imports),
      attachments: attachments || [],
    });

    const doc = await Campaign.create({
      userId: req.user._id,
      encryptedPayload: encryptJson(payload),
      recipient_count: payload.recipients.length,
      variable_count: payload.variables.length,
      send_mode: 'individual',
      status: 'scheduled',
      scheduledAt: schedDate,
    });

    return res.json({ id: doc._id.toString(), status: 'scheduled', scheduledAt: schedDate });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to schedule campaign' });
  }
});

router.delete('/:id/cancel-schedule', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const campaign = await Campaign.findOne({ _id: id, userId: req.user._id, status: 'scheduled' });
    if (!campaign) return res.status(404).json({ error: 'Scheduled campaign not found' });
    const payload = decryptCampaignPayload(campaign);
    payload.attachments = [];
    campaign.status = 'draft';
    campaign.scheduledAt = null;
    await persistCampaignPayload(campaign, payload);
    return res.json({ id: campaign._id.toString(), status: 'draft' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to cancel scheduled send' });
  }
});

router.post('/send-now', async (req, res) => {
  const { confirm_bulk_send } = req.body || {};

  try {
    if (!req.user.gmailConnected || !req.user.encryptedRefreshToken) {
      const authErr = new Error('Gmail not connected. Please connect your Gmail account.');
      authErr.code = 'AUTH_REQUIRED';
      throw authErr;
    }

    const { subject, body_html, recipients, sender_name, variables, group_imports, name_format, attachments } = req.body || {};
    if (!subject || !String(subject).trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!body_html || !String(body_html).trim()) return res.status(400).json({ error: 'Body is required' });

    const snapshotVariables = normalizeVariablesUsed(variables);
    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), snapshotVariables);
    const normalizedRecipients = normalizeRecipients(recipients, allowedVars);
    const recErrors = validateRecipients(normalizedRecipients);
    if (recErrors.length) return res.status(400).json({ error: recErrors[0] });

    if (attachments && attachments.length) {
      const attErr = validateAttachments(attachments);
      if (attErr) return res.status(400).json({ error: attErr });
    }

    const payload = buildCampaignPayload({
      subject,
      body_html,
      sender_name: sender_name || '',
      name_format,
      recipients: normalizedRecipients,
      variables: snapshotVariables,
      group_imports: normalizeGroupImports(group_imports),
      attachments: attachments || [],
    });

    const recipientCount = payload.recipients.length;
    if (recipientCount > 5 && !confirm_bulk_send) {
      return res.status(400).json({ error: 'Bulk send confirmation required' });
    }
    if (recipientCount > MAX_RECIPIENTS) {
      return res.status(400).json({ error: `Max ${MAX_RECIPIENTS} recipients per campaign` });
    }

    const validation = validateVariables(payload.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });
    if (validation.unknown.length) return res.status(400).json({ error: `Unknown variable {{${validation.unknown[0]}}} found.` });

    const pending = (payload.recipients || []).filter(r => r.status === 'pending');
    if (!pending.length) {
      return res.json({ status: 'sent', sentCount: 0, failedCount: 0 });
    }

    await ensureSendAllowance(req.user, pending.length);

    let sentCount = 0;
    let failedCount = 0;
    let lastError = null;
    const logs = [];
    const sentByHash = {};
    const safeTemplateHtml = sanitizeBody(payload.body_html);

    for (let i = 0; i < pending.length; i++) {
      const recipient = pending[i];
      const renderedHtml = renderTemplate(safeTemplateHtml, {
        name: resolveNameValue(recipient.name, payload.name_format),
        ...(recipient.variables || {}),
      });
      const html = sanitizeBody(renderedHtml);
      try {
        await sendMimeEmail({ user: req.user, to: recipient.email, subject: payload.subject, html, senderName: payload.sender_name, attachments: payload.attachments || [] });
        const target = payload.recipients.find(r => String(r._id) === String(recipient._id));
        if (target) target.status = 'sent';
        logs.push({ userId: req.user._id, sentAt: new Date() });
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
    await bumpContactTracking(req.user._id, sentByHash);

    if (sentCount === 0 && lastError) {
      throw new Error(`All emails failed: ${lastError.message}`);
    }

    payload.attachments = []; // strip attachment data before storing
    const doc = await Campaign.create({
      userId: req.user._id,
      encryptedPayload: encryptJson(payload),
      recipient_count: payload.recipients.length,
      variable_count: payload.variables.length,
      send_mode: 'individual',
      status: 'sent',
    });

    return res.json({ status: 'sent', sentCount, failedCount, id: doc._id.toString() });
  } catch (err) {
    const isAuthErr = err.code === 'AUTH_REQUIRED' || err.code === 'AUTH_EXPIRED'
      || /invalid_grant|Token has been expired|revoked|reconnect/i.test(err.message || '');

    if (err.code === 'MINUTE_LIMIT') {
      return res.status(429).json({
        error: 'Too many emails sent in a short period. Please wait a minute and try again.',
        code: 'RATE_LIMIT_MINUTE',
        retryAfterSeconds: err.retryAfterSeconds || 60,
      });
    }
    if (err.code === 'DAILY_LIMIT') {
      return res.status(429).json({
        error: 'Daily sending limit reached. Try again tomorrow.',
        code: 'RATE_LIMIT_DAILY',
      });
    }

    const status = isAuthErr ? 401 : 500;
    return res.status(status).json({ error: err.message || 'Failed to send', authError: isAuthErr });
  }
});

router.post('/:id/preview', async (req, res) => {
  const { id } = req.params;
  const { recipient_id } = req.body || {};
  console.log(`[campaign] POST /:id/preview — campaignId: ${id}, recipientId: ${recipient_id || '(first)'}`);
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const campaign = await Campaign.findOne({ _id: id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    if (!req.user.gmailConnected || !req.user.encryptedRefreshToken) {
      console.warn('[campaign] Preview blocked — Gmail not connected');
      return res.status(401).json({ error: 'Connect Gmail to send', authError: true });
    }

    const payload = decryptCampaignPayload(campaign);
    const target = recipient_id
      ? payload.recipients.find(r => String(r._id) === String(recipient_id))
      : payload.recipients[0];
    if (!target) return res.status(404).json({ error: 'No recipients' });

    console.log(`[campaign] Preview target — email: ${target.email}, name: "${target.name}"`);

    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), payload.variables || []);
    const validation = validateVariables(payload.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });

    const safeTemplateHtml = sanitizeBody(payload.body_html);
    const renderedHtml = renderTemplate(safeTemplateHtml, {
      name: resolveNameValue(target.name, payload.name_format),
      ...(target.variables || {}),
    });
    const html = sanitizeBody(renderedHtml);
    console.log(`[campaign] Preview rendered successfully for ${target.email}`);
    res.json({ html, warnings: validation.unknown.length ? validation.unknown.map(k => `Unknown variable {{${k}}} found.`) : [] });
  } catch (err) {
    console.error('[campaign] Preview error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to render preview' });
  }
});

router.post('/:id/send', async (req, res) => {
  const { id } = req.params;
  const { confirm_bulk_send } = req.body || {};
  console.log(`[campaign] POST /:id/send — campaignId: ${id}, userId: ${req.user._id}, confirm_bulk_send: ${!!confirm_bulk_send}`);
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const campaign = await Campaign.findOne({ _id: id, userId: req.user._id });
    if (!campaign) {
      console.warn(`[campaign] Campaign not found for send — id: ${id}`);
      return res.status(404).json({ error: 'Not found' });
    }

    const payload = decryptCampaignPayload(campaign);
    const recipientCount = payload.recipients.length;
    console.log(`[campaign] Send request — recipientCount: ${recipientCount}, subject: "${payload.subject}"`);

    if (recipientCount > 5 && !confirm_bulk_send) {
      console.log('[campaign] Bulk send confirmation required but not provided');
      return res.status(400).json({ error: 'Bulk send confirmation required' });
    }
    if (recipientCount > MAX_RECIPIENTS) {
      console.warn(`[campaign] Recipient count ${recipientCount} exceeds max ${MAX_RECIPIENTS}`);
      return res.status(400).json({ error: `Max ${MAX_RECIPIENTS} recipients per campaign` });
    }

    const allowedVars = mergeVariableKeys(await getAllowedVariables(req.user._id), payload.variables || []);
    const validation = validateVariables(payload.body_html, allowedVars);
    if (validation.unmatched) return res.status(400).json({ error: 'Invalid variable syntax detected.' });
    if (validation.unknown.length) return res.status(400).json({ error: `Unknown variable {{${validation.unknown[0]}}} found.` });

    const result = await sendCampaign(id, req.user);
    console.log(`[campaign] Send complete — result:`, JSON.stringify(result));
    return res.json(result);
  } catch (err) {
    console.error(`[campaign] Send route error — campaignId: ${id}, error: ${err.message}, code: ${err.code || '(none)'}`);
    if (err?.response?.data) {
      console.error('[campaign] Google API error payload:', JSON.stringify(err.response.data, null, 2));
    }
    const isAuthErr = err.code === 'AUTH_REQUIRED' || err.code === 'AUTH_EXPIRED'
      || /invalid_grant|Token has been expired|revoked|reconnect/i.test(err.message || '');
    if (err.code === 'MINUTE_LIMIT') {
      console.warn('[campaign] Rate limit hit — MINUTE_LIMIT');
      return res.status(429).json({
        error: 'Too many emails sent in a short period. Please wait a minute and try again.',
        code: 'RATE_LIMIT_MINUTE',
        retryAfterSeconds: err.retryAfterSeconds || 60,
      });
    }
    if (err.code === 'DAILY_LIMIT') {
      console.warn('[campaign] Rate limit hit — DAILY_LIMIT');
      return res.status(429).json({
        error: 'Daily sending limit reached. Try again tomorrow.',
        code: 'RATE_LIMIT_DAILY',
      });
    }
    if (isAuthErr) {
      console.error('[campaign] Auth error during send — returning 401');
    }
    const status = isAuthErr ? 401 : 500;
    return res.status(status).json({ error: err.message || 'Failed to send', authError: isAuthErr });
  }
});

async function processScheduledCampaigns(User) {
  try {
    const now = new Date();
    const due = await Campaign.find({ status: 'scheduled', scheduledAt: { $lte: now } });
    if (!due.length) return;
    console.log(`[scheduler] Found ${due.length} scheduled campaign(s) due for sending`);
    for (const campaign of due) {
      try {
        const user = await User.findById(campaign.userId);
        if (!user || !user.gmailConnected || !user.encryptedRefreshToken) {
          console.warn(`[scheduler] Campaign ${campaign._id} skipped — user not connected`);
          campaign.status = 'failed';
          await campaign.save();
          continue;
        }
        await sendCampaign(campaign._id.toString(), user);
        console.log(`[scheduler] Campaign ${campaign._id} sent successfully`);
      } catch (err) {
        console.error(`[scheduler] Campaign ${campaign._id} failed:`, err.message);
        campaign.status = 'failed';
        await campaign.save();
      }
    }
  } catch (err) {
    console.error('[scheduler] Worker error:', err.message);
  }
}

module.exports = {
  router,
  sendCampaign,
  processScheduledCampaigns,
};
