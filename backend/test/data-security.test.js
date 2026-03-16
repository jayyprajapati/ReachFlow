const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATA_ENC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.DATA_ENC_KEY_ID = 'test-key-v1';
process.env.DATA_HASH_KEY = 'test-hash-secret';

const {
  encryptJson,
  decryptJson,
  encryptString,
  decryptString,
  computeEmailHash,
  normalizeEmail,
} = require('../src/utils/dataSecurity');

function parseSimpleCsv(csvText) {
  const rows = csvText.trim().split(/\r?\n/).map(line => line.split(','));
  const header = rows[0].map(h => h.trim().toLowerCase());
  const nameIndex = header.indexOf('name');
  const emailIndex = header.indexOf('email');
  if (nameIndex < 0 || emailIndex < 0) throw new Error('Invalid CSV');
  return rows.slice(1).map(row => ({
    name: row[nameIndex].trim(),
    email: normalizeEmail(row[emailIndex]),
  }));
}

function exportSimpleCsv(rows) {
  const lines = ['name,email'];
  for (const row of rows) {
    lines.push(`${row.name},${row.email}`);
  }
  return lines.join('\n');
}

test('draft round-trip preserves payload exactly', () => {
  const draft = {
    subject: 'Draft Subject',
    body_html: '<p>Hello {{name}}</p>',
    recipients: [{ _id: '1', email: 'a@example.com', name: 'A', variables: { role: 'Eng' }, status: 'pending' }],
    variables: ['role'],
    name_format: 'first',
    group_imports: [{ groupId: 'g1', companyName: 'Acme', importedCount: 1 }],
  };
  const roundTrip = decryptJson(encryptJson(draft));
  assert.deepEqual(roundTrip, draft);
});

test('template round-trip preserves payload exactly', () => {
  const template = { title: 'Intro', subject: 'Hi', body_html: '<div><b>World</b></div>' };
  const roundTrip = decryptJson(encryptJson(template));
  assert.deepEqual(roundTrip, template);
});

test('group contact round-trip preserves payload exactly', () => {
  const contact = {
    name: 'Jane Smith',
    email: 'jane@acme.com',
    linkedin: 'https://linkedin.com/in/jane',
    contactHistory: [{ type: 'email', date: '2026-03-16T10:00:00.000Z' }],
  };
  const roundTrip = decryptJson(encryptJson(contact));
  assert.deepEqual(roundTrip, contact);
});

test('unicode round-trip is exact', () => {
  const payload = {
    name: 'Łukasz 東京',
    body_html: '<p>Привет 👋 مرحبا</p>',
    description: 'Café résumé naïve',
  };
  const roundTrip = decryptJson(encryptJson(payload));
  assert.deepEqual(roundTrip, payload);
});

test('html round-trip is exact', () => {
  const html = '<div><p style="color:red">Hi&nbsp;there</p><img src="https://x/y.png" /></div>';
  const roundTrip = decryptJson(encryptJson({ html })).html;
  assert.equal(roundTrip, html);
});

test('null and empty values are preserved', () => {
  const payload = { a: null, b: '', c: [], d: {}, e: false, f: 0 };
  const roundTrip = decryptJson(encryptJson(payload));
  assert.deepEqual(roundTrip, payload);
});

test('dedupe hash is stable for normalized email', () => {
  const a = computeEmailHash('  USER@Example.com ');
  const b = computeEmailHash('user@example.com');
  assert.equal(a, b);

  const seen = new Set([a]);
  const incoming = computeEmailHash('user@example.com');
  assert.equal(seen.has(incoming), true);
});

test('csv import/export compatibility with encrypted storage', () => {
  const csv = 'name,email\nJane Doe,JANE@Example.com\nJohn Roe,john@example.com';
  const parsed = parseSimpleCsv(csv);

  const stored = parsed.map(row => ({
    emailHash: computeEmailHash(row.email),
    encryptedPayload: encryptJson(row),
  }));

  const decryptedRows = stored.map(row => decryptJson(row.encryptedPayload));
  const exported = exportSimpleCsv(decryptedRows);

  assert.equal(exported, 'name,email\nJane Doe,jane@example.com\nJohn Roe,john@example.com');
});

test('corrupted ciphertext fails safely', () => {
  const encrypted = encryptString('hello');
  const broken = { ...encrypted, ct: `${encrypted.ct.slice(0, -2)}xx` };
  assert.throws(() => decryptString(broken));
});
