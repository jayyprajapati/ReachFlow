const Handlebars = require('handlebars');

const VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function normalizeVariables(html) {
  if (!html) return '';
  return html.replace(VAR_REGEX, (_m, token) => `{{${String(token || '').trim().toLowerCase()}}}`);
}

function toLowerData(data) {
  const result = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    const normalizedKey = String(key).toLowerCase();
    if (normalizedKey === 'name') {
      const firstName = String(value || '').trim().split(' ')[0] || 'There';
      result[normalizedKey] = firstName;
      return;
    }
    result[normalizedKey] = value;
  });
  return result;
}

function extractVariables(html) {
  const set = new Set();
  const normalized = normalizeVariables(html || '');
  let m;
  while ((m = VAR_REGEX.exec(normalized)) !== null) {
    set.add(m[1]);
  }
  return Array.from(set);
}

function hasUnmatchedDelimiters(html) {
  if (!html) return false;
  const open = (html.match(/\{\{/g) || []).length;
  const close = (html.match(/\}\}/g) || []).length;
  return open !== close;
}

function validateVariables(html, allowedKeys) {
  const normalized = normalizeVariables(html || '');
  const allowed = new Set((allowedKeys || []).map(k => String(k).toLowerCase()));
  const unknown = [];
  let m;
  while ((m = VAR_REGEX.exec(normalized)) !== null) {
    const key = m[1];
    if (!allowed.has(key) && !unknown.includes(key)) unknown.push(key);
  }
  return { unknown, unmatched: hasUnmatchedDelimiters(html) };
}

function renderTemplate(html, data) {
  const normalized = normalizeVariables(html || '');
  const template = Handlebars.compile(normalized, { noEscape: true });
  return template(toLowerData(data));
}

module.exports = {
  renderTemplate,
  normalizeVariables,
  extractVariables,
  validateVariables,
  hasUnmatchedDelimiters,
};
