const test = require('node:test');
const assert = require('node:assert/strict');

const { _private } = require('../src/gmail');

function decodePart(raw, contentType) {
  const marker = `Content-Type: ${contentType}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
  const start = raw.indexOf(marker);
  assert.notEqual(start, -1, `${contentType} part should exist`);
  const bodyStart = start + marker.length;
  const bodyEnd = raw.indexOf('\r\n--', bodyStart);
  assert.notEqual(bodyEnd, -1, `${contentType} part should be bounded`);
  return Buffer.from(raw.slice(bodyStart, bodyEnd).replace(/\s+/g, ''), 'base64').toString('utf8');
}

test('attachment MIME keeps the message body as nested alternative part', () => {
  const raw = _private.buildRawMimeMessage({
    from: 'ReachFlow <sender@example.com>',
    to: 'lead@example.com',
    subject: 'Hello',
    html: '<p>Hello <strong>there</strong></p>',
    attachments: [{
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from('pdf bytes').toString('base64'),
      size: 9,
    }],
  });

  assert.match(raw, /Content-Type: multipart\/mixed; boundary="/);
  assert.match(raw, /Content-Type: multipart\/alternative; boundary="/);
  assert.match(raw, /Content-Disposition: attachment; filename="resume\.pdf"/);

  const html = decodePart(raw, 'text/html');
  const plain = decodePart(raw, 'text/plain');

  assert.match(html, /Hello <strong>there<\/strong>/);
  assert.match(html, /<p style="margin:0 0 6px 0; padding:0; line-height:1\.45">/);
  assert.doesNotMatch(html, /<body|background:#ffffff|max-width:600px|padding:20px/);
  assert.match(plain, /Hello there/);
  assert.ok(raw.indexOf('Content-Type: multipart/alternative') < raw.indexOf('Content-Disposition: attachment'));
});
