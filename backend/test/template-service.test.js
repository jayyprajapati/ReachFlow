const test = require('node:test');
const assert = require('node:assert/strict');

const { renderTemplate } = require('../src/services/templateService');

test('renderTemplate preserves full name for {{name}}', () => {
  const html = '<p>Hello {{name}}</p>';
  const out = renderTemplate(html, { name: 'Jane Doe' });
  assert.equal(out, '<p>Hello Jane Doe</p>');
});

test('renderTemplate keeps variable keys case-insensitive', () => {
  const html = '<p>Hello {{Name}}, role: {{ROLE}}</p>';
  const out = renderTemplate(html, { name: 'Alex', role: 'Engineer' });
  assert.equal(out, '<p>Hello Alex, role: Engineer</p>');
});
