const mongoose = require('mongoose');
const {
  encryptJson,
  isEncryptedEnvelope,
  normalizeEmail,
  computeEmailHash,
  normalizeCompanyKey,
  deriveCompanyKeyFromEmail,
} = require('./utils/dataSecurity');

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/jobhunt';

function connectMongo() {
  return mongoose.connect(uri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 5000,
  });
}

/* ── Schemas ── */

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    googleId: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    displayName: { type: String, default: '' },
    senderDisplayNameEnc: { type: mongoose.Schema.Types.Mixed },
    gmailEmailEnc: { type: mongoose.Schema.Types.Mixed },
    senderDisplayName: { type: String, default: '', trim: true },
    gmailEmail: { type: String, lowercase: true, trim: true },
    gmailConnected: { type: Boolean, default: false },
    encryptedRefreshToken: { type: String },
    gmailState: { type: String },
    gmailStateExpiresAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

const variableSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    variableNameKey: { type: String, lowercase: true, trim: true, index: true },
    encryptedPayload: { type: mongoose.Schema.Types.Mixed },
    variableName: { type: String, lowercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    key: { type: String, lowercase: true, trim: true },
    label: { type: String, trim: true },
    required: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

variableSchema.index({ userId: 1, variableNameKey: 1 }, { unique: true, sparse: true });

const recipientSchema = new mongoose.Schema({
  emailHash: { type: String, trim: true, index: true },
  encryptedPayload: { type: mongoose.Schema.Types.Mixed },
  email: { type: String, lowercase: true, trim: true },
  name: { type: String, trim: true },
  variables: { type: Map, of: String, default: {} },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
});

const groupImportSchema = new mongoose.Schema(
  {
    groupId: { type: String, trim: true },
    companyName: { type: String, trim: true },
    category: { type: String, trim: true },
    importedCount: { type: Number, default: 0, min: 0 },
    importedAt: { type: Date },
  },
  { _id: false }
);

const contactHistoryEntrySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['email', 'linkedin'], required: true },
    date: { type: Date, required: true },
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema({
  emailHash: { type: String, trim: true, index: true },
  companyKey: { type: String, trim: true, index: true },
  encryptedPayload: { type: mongoose.Schema.Types.Mixed },
  name: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  role: { type: String, default: '', trim: true },
  linkedin: { type: String, default: '', trim: true },
  connectionStatus: { type: String, enum: ['', 'not_connected', 'request_sent', 'connected'], default: '' },
  email_status: { type: String, enum: ['verified', 'tentative', 'not_valid'], default: 'tentative' },
  contactHistory: { type: [contactHistoryEntrySchema], default: [] },
  lastContactedDate: { type: Date, default: null },
  emailCount: { type: Number, default: 0, min: 0 },
  linkedInCount: { type: Number, default: 0, min: 0 },
});

const campaignSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    encryptedPayload: { type: mongoose.Schema.Types.Mixed },
    recipient_count: { type: Number, default: 0, min: 0 },
    variable_count: { type: Number, default: 0, min: 0 },
    subject: { type: String, trim: true },
    body_html: { type: String },
    sender_name: { type: String, default: '' },
    name_format: { type: String, enum: ['first', 'full'], default: 'first' },
    recipients: { type: [recipientSchema], default: [] },
    send_mode: { type: String, enum: ['individual'], default: 'individual' },
    variables: { type: [String], default: [] },
    group_imports: { type: [groupImportSchema], default: [] },
    status: { type: String, enum: ['draft', 'sent'], default: 'draft' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

campaignSchema.index({ status: 1, updated_at: -1 });
campaignSchema.index({ userId: 1, updated_at: -1 });

const sendLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

const groupSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    companyKey: { type: String, trim: true, index: true },
    contactCount: { type: Number, default: 0, min: 0 },
    companyName: { type: String, required: true, trim: true },
    logoUrl: { type: String, default: '', trim: true },
    contacts: { type: [contactSchema], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const templateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    encryptedPayload: { type: mongoose.Schema.Types.Mixed },
    title: { type: String, trim: true },
    subject: { type: String, trim: true },
    body_html: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const User = mongoose.model('User', userSchema);
const Variable = mongoose.model('Variable', variableSchema);
const Campaign = mongoose.model('Campaign', campaignSchema);
const SendLog = mongoose.model('SendLog', sendLogSchema);
const Group = mongoose.model('Group', groupSchema);
const Template = mongoose.model('Template', templateSchema);

async function migrateGroupContactFields() {
  const rows = await Group.find({});
  for (const group of rows) {
    let changed = false;
    const companyName = String(group.companyName || '').trim();
    const normalizedCompany = normalizeCompanyKey(companyName);
    if ((group.companyKey || '') !== normalizedCompany) {
      group.companyKey = normalizedCompany;
      changed = true;
    }

    const nextContacts = (group.contacts || []).map((contact) => {
      const plainEmail = normalizeEmail(contact.email || '');
      const payload = {
        name: contact.name || '',
        email: plainEmail,
        role: contact.role || '',
        linkedin: contact.linkedin || '',
        connectionStatus: contact.connectionStatus || '',
        email_status: contact.email_status || 'tentative',
        contactHistory: Array.isArray(contact.contactHistory) ? contact.contactHistory : [],
        lastContactedDate: contact.lastContactedDate || null,
        emailCount: Number.isFinite(Number(contact.emailCount)) ? Number(contact.emailCount) : 0,
        linkedInCount: Number.isFinite(Number(contact.linkedInCount)) ? Number(contact.linkedInCount) : 0,
      };

      const next = contact.toObject ? contact.toObject() : { ...contact };
      const nextHash = plainEmail ? computeEmailHash(plainEmail) : '';
      const nextCompanyKey = deriveCompanyKeyFromEmail(plainEmail) || normalizedCompany;

      if (!isEncryptedEnvelope(next.encryptedPayload)) {
        next.encryptedPayload = encryptJson(payload);
        changed = true;
      }
      if (next.emailHash !== nextHash) {
        next.emailHash = nextHash;
        changed = true;
      }
      if (next.companyKey !== nextCompanyKey) {
        next.companyKey = nextCompanyKey;
        changed = true;
      }

      next.name = undefined;
      next.email = undefined;
      next.linkedin = undefined;
      next.contactHistory = undefined;
      next.lastContactedDate = undefined;
      return next;
    });

    if ((group.contactCount || 0) !== nextContacts.length) {
      group.contactCount = nextContacts.length;
      changed = true;
    }
    if (changed) {
      group.contacts = nextContacts;
      await group.save();
    }
  }
}

function normalizeVariableName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

async function migrateVariableFields() {
  try {
    await Variable.collection.dropIndex('userId_1_variableName_1');
  } catch (err) {
    if (!/index not found|ns not found/i.test(err?.message || '')) {
      throw err;
    }
  }

  try {
    await Variable.collection.dropIndex('userId_1_key_1');
  } catch (err) {
    if (!/index not found|ns not found/i.test(err?.message || '')) {
      throw err;
    }
  }

  await Variable.collection.createIndex({ userId: 1, variableNameKey: 1 }, { unique: true, sparse: true });

  const legacyRows = await Variable.find({}).sort({ createdAt: 1 });

  for (const row of legacyRows) {
    const baseFromLegacy = normalizeVariableName(row.variableNameKey || row.variableName || row.key || row.label);
    if (!baseFromLegacy) continue;

    const base = baseFromLegacy === 'name' ? 'name_custom' : baseFromLegacy;
    let candidate = base;
    let suffix = 2;

    while (await Variable.exists({ userId: row.userId, variableNameKey: candidate, _id: { $ne: row._id } })) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }

    row.variableNameKey = candidate;
    if (!row.description && row.label && row.label !== row.key) {
      row.description = String(row.label || '').trim();
    }
    if (!isEncryptedEnvelope(row.encryptedPayload)) {
      row.encryptedPayload = encryptJson({
        variableName: candidate,
        description: row.description || '',
      });
    }
    row.variableName = undefined;
    row.description = undefined;
    row.key = undefined;
    row.label = undefined;
    await row.save({ validateBeforeSave: false });
  }
}

async function migrateUserSensitiveFields() {
  const users = await User.find({});
  for (const user of users) {
    let changed = false;
    if (!isEncryptedEnvelope(user.senderDisplayNameEnc) && user.senderDisplayName) {
      user.senderDisplayNameEnc = encryptJson({ value: String(user.senderDisplayName || '') });
      user.senderDisplayName = undefined;
      changed = true;
    }
    if (!isEncryptedEnvelope(user.gmailEmailEnc) && user.gmailEmail) {
      user.gmailEmailEnc = encryptJson({ value: normalizeEmail(user.gmailEmail) });
      user.gmailEmail = undefined;
      changed = true;
    }
    if (changed) await user.save({ validateBeforeSave: false });
  }
}

async function migrateTemplateSensitiveFields() {
  const templates = await Template.find({});
  for (const template of templates) {
    if (isEncryptedEnvelope(template.encryptedPayload)) continue;
    template.encryptedPayload = encryptJson({
      title: template.title || '',
      subject: template.subject || '',
      body_html: template.body_html || '',
    });
    template.title = undefined;
    template.subject = undefined;
    template.body_html = undefined;
    await template.save({ validateBeforeSave: false });
  }
}

async function migrateCampaignSensitiveFields() {
  const campaigns = await Campaign.find({});
  for (const campaign of campaigns) {
    if (isEncryptedEnvelope(campaign.encryptedPayload)) continue;
    const payload = {
      subject: campaign.subject || '',
      body_html: campaign.body_html || '',
      sender_name: campaign.sender_name || '',
      name_format: campaign.name_format || 'first',
      recipients: (campaign.recipients || []).map(r => ({
        _id: r._id,
        email: normalizeEmail(r.email || ''),
        name: r.name || '',
        variables: r.variables || {},
        status: r.status || 'pending',
      })),
      variables: Array.isArray(campaign.variables) ? campaign.variables : [],
      group_imports: Array.isArray(campaign.group_imports) ? campaign.group_imports : [],
    };
    campaign.encryptedPayload = encryptJson(payload);
    campaign.recipient_count = payload.recipients.length;
    campaign.variable_count = payload.variables.length;
    campaign.subject = undefined;
    campaign.body_html = undefined;
    campaign.sender_name = undefined;
    campaign.name_format = undefined;
    campaign.recipients = undefined;
    campaign.variables = undefined;
    campaign.group_imports = undefined;
    await campaign.save({ validateBeforeSave: false });
  }
}

module.exports = {
  connectMongo,
  User,
  Variable,
  Campaign,
  SendLog,
  Group,
  Template,
  migrateUserSensitiveFields,
  migrateTemplateSensitiveFields,
  migrateCampaignSensitiveFields,
  migrateGroupContactFields,
  migrateVariableFields,
};
