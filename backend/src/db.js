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
    key: { type: String, required: true, lowercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    required: { type: Boolean, default: false },
    description: { type: String, default: '', trim: true },
  },
  { timestamps: true, versionKey: false }
);

variableSchema.index({ userId: 1, key: 1 }, { unique: true });

const recipientSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  variables: { type: Map, of: String, default: {} },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
});

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, default: '', trim: true },
  linkedin: { type: String, default: '', trim: true },
  connectionStatus: { type: String, enum: ['', 'not_connected', 'pending', 'connected'], default: '' },
  leftCompany: { type: Boolean, default: false },
  email_status: { type: String, enum: ['verified', 'tentative', 'flagged'], default: 'tentative' },
  last_contacted_at: { type: Date, default: null },
  last_contacted_via: { type: String, enum: ['', 'linkedin', 'email'], default: '' },
  contact_count: { type: Number, default: 0, min: 0 },
});

const campaignSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    body_html: { type: String, required: true },
    sender_name: { type: String, default: '' },
    recipients: { type: [recipientSchema], default: [] },
    send_mode: { type: String, enum: ['single', 'individual'], required: true },
    scheduled_at: { type: Date, default: null },
    status: { type: String, enum: ['draft', 'scheduled', 'sent'], default: 'draft' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

campaignSchema.index({ status: 1, scheduled_at: 1 });
campaignSchema.index({ userId: 1, created_at: -1 });

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
                $mergeObjects: [
                  {
                    email_status: 'tentative',
                    last_contacted_at: null,
                    last_contacted_via: '',
                    contact_count: 0,
                  },
                  '$$contact',
                ],
              },
            },
          },
        },
      },
    ]
  );
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
};
