const sanitizeHtml = require('sanitize-html');

// Quill-style rich email formatting allowlist with dangerous vectors removed.
const EMAIL_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'img', 'span', 'div', 'pre', 'code', 'hr',
];

const EMAIL_ALLOWED_ATTRIBUTES = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  span: [],
  div: [],
  p: [],
};

function sanitizeEmailHtml(input) {
  return sanitizeHtml(String(input || ''), {
    allowedTags: EMAIL_ALLOWED_TAGS,
    allowedAttributes: EMAIL_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    // Explicitly block tags we never want even if they appear in malformed HTML.
    disallowedTagsMode: 'discard',
    nonBooleanAttributes: ['href', 'src', 'alt', 'width', 'height', 'target', 'rel'],
  });
}

module.exports = {
  sanitizeEmailHtml,
};
