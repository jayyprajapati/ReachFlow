const mongoose = require('mongoose');

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
    variableName: { type: String, lowercase: true, trim: true },
    description: { type: String, default: '', trim: true },
    key: { type: String, lowercase: true, trim: true },
    label: { type: String, trim: true },
    required: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

variableSchema.index({ userId: 1, variableName: 1 }, { unique: true, sparse: true });

const recipientSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
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
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
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
    subject: { type: String, required: true, trim: true },
    body_html: { type: String, required: true },
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
    title: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    body_html: { type: String, required: true },
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
  await Group.updateMany(
    {},
    [
      {
        $set: {
          contacts: {
            $map: {
              input: '$contacts',
              as: 'contact',
              in: {
                $let: {
                  vars: {
                    normalizedStatus: {
                      $switch: {
                        branches: [
                          {
                            case: { $in: ['$$contact.email_status', ['verified', 'tentative', 'not_valid']] },
                            then: '$$contact.email_status',
                          },
                          {
                            case: { $eq: ['$$contact.email_status', 'flagged'] },
                            then: 'not_valid',
                          },
                        ],
                        default: 'tentative',
                      },
                    },
                    normalizedConnectionStatus: {
                      $switch: {
                        branches: [
                          {
                            case: { $in: ['$$contact.connectionStatus', ['not_connected', 'request_sent', 'connected']] },
                            then: '$$contact.connectionStatus',
                          },
                          {
                            case: { $eq: ['$$contact.connectionStatus', 'pending'] },
                            then: 'request_sent',
                          },
                        ],
                        default: '',
                      },
                    },
                    baseContactDate: {
                      $cond: [
                        { $ifNull: ['$$contact.last_contacted_at', false] },
                        '$$contact.last_contacted_at',
                        '$$NOW',
                      ],
                    },
                    legacyContactCount: {
                      $max: [
                        0,
                        {
                          $convert: {
                            input: '$$contact.contact_count',
                            to: 'int',
                            onError: 0,
                            onNull: 0,
                          },
                        },
                      ],
                    },
                    legacyVia: {
                      $cond: [
                        { $eq: ['$$contact.last_contacted_via', 'linkedin'] },
                        'linkedin',
                        'email',
                      ],
                    },
                  },
                  in: {
                    $mergeObjects: [
                      '$$contact',
                      {
                        email_status: '$$normalizedStatus',
                        connectionStatus: '$$normalizedConnectionStatus',
                        contactHistory: {
                          $cond: [
                            {
                              $and: [
                                { $isArray: '$$contact.contactHistory' },
                                { $gt: [{ $size: '$$contact.contactHistory' }, 0] },
                              ],
                            },
                            '$$contact.contactHistory',
                            {
                              $cond: [
                                { $gt: ['$$legacyContactCount', 0] },
                                {
                                  $map: {
                                    input: { $range: [0, '$$legacyContactCount'] },
                                    as: 'i',
                                    in: {
                                      type: '$$legacyVia',
                                      date: '$$baseContactDate',
                                    },
                                  },
                                },
                                [],
                              ],
                            },
                          ],
                        },
                        lastContactedDate: {
                          $ifNull: ['$$contact.lastContactedDate', '$$baseContactDate'],
                        },
                        emailCount: {
                          $max: [
                            0,
                            {
                              $convert: {
                                input: '$$contact.emailCount',
                                to: 'int',
                                onError: '$$legacyContactCount',
                                onNull: '$$legacyContactCount',
                              },
                            },
                          ],
                        },
                        linkedInCount: {
                          $max: [
                            0,
                            {
                              $convert: {
                                input: '$$contact.linkedInCount',
                                to: 'int',
                                onError: 0,
                                onNull: 0,
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    ]
  );
}

function normalizeVariableName(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

async function migrateVariableFields() {
  const legacyRows = await Variable.find({
    $or: [
      { variableName: { $exists: false } },
      { variableName: null },
      { variableName: '' },
    ],
  }).sort({ createdAt: 1 });

  for (const row of legacyRows) {
    const baseFromLegacy = normalizeVariableName(row.variableName || row.key || row.label);
    if (!baseFromLegacy) continue;

    const base = baseFromLegacy === 'name' ? 'name_custom' : baseFromLegacy;
    let candidate = base;
    let suffix = 2;

    while (await Variable.exists({ userId: row.userId, variableName: candidate, _id: { $ne: row._id } })) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }

    row.variableName = candidate;
    if (!row.description && row.label && row.label !== row.key) {
      row.description = String(row.label || '').trim();
    }
    await row.save();
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
  migrateGroupContactFields,
  migrateVariableFields,
};
