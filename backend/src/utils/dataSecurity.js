const crypto = require('crypto');

const ENC_ALGO = 'aes-256-gcm';
const ENC_VERSION = 1;
const IV_BYTES = 12;

function parseKey(raw, name) {
  if (!raw) throw new Error(`${name} env var is required`);
  let key;
  try {
    key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  } catch (_err) {
    throw new Error(`${name} must be hex or base64`);
  }
  if (key.length !== 32) {
    throw new Error(`${name} must be 32 bytes (256-bit)`);
  }
  return key;
}

function getEncKey() {
  return parseKey(process.env.DATA_ENC_KEY, 'DATA_ENC_KEY');
}

function getHashKey() {
  const raw = process.env.DATA_HASH_KEY;
  if (!raw) throw new Error('DATA_HASH_KEY env var is required');
  return Buffer.from(raw, 'utf8');
}

function getEncKeyId() {
  const kid = String(process.env.DATA_ENC_KEY_ID || '').trim();
  if (!kid) throw new Error('DATA_ENC_KEY_ID env var is required');
  return kid;
}

function assertDataSecurityConfig() {
  getEncKey();
  getHashKey();
  getEncKeyId();
}

function isEncryptedEnvelope(value) {
  return !!(
    value
    && typeof value === 'object'
    && Number(value.v) === ENC_VERSION
    && typeof value.alg === 'string'
    && typeof value.kid === 'string'
    && typeof value.iv === 'string'
    && typeof value.tag === 'string'
    && typeof value.ct === 'string'
  );
}

function encryptString(plaintext) {
  const key = getEncKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: ENC_VERSION,
    alg: ENC_ALGO,
    kid: getEncKeyId(),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
}

function decryptString(envelope) {
  if (!isEncryptedEnvelope(envelope)) {
    throw new Error('Corrupt encrypted payload');
  }
  const key = getEncKey();
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ct = Buffer.from(envelope.ct, 'base64');
  const decipher = crypto.createDecipheriv(ENC_ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

function encryptJson(value) {
  return encryptString(JSON.stringify(value));
}

function decryptJson(envelope) {
  const text = decryptString(envelope);
  return JSON.parse(text);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function computeEmailHash(email) {
  const normalized = normalizeEmail(email);
  return crypto.createHmac('sha256', getHashKey()).update(normalized).digest('hex');
}

function normalizeCompanyKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function deriveCompanyKeyFromEmail(email) {
  const normalized = normalizeEmail(email);
  const domain = normalized.split('@')[1] || '';
  const companyPart = domain.split('.')[0] || '';
  return normalizeCompanyKey(companyPart);
}

module.exports = {
  assertDataSecurityConfig,
  encryptString,
  decryptString,
  encryptJson,
  decryptJson,
  isEncryptedEnvelope,
  normalizeEmail,
  computeEmailHash,
  normalizeCompanyKey,
  deriveCompanyKeyFromEmail,
};
