const sanitizeHtml = require('sanitize-html');

const QUILL_FONT_CLASSES = [
  'ql-font-arial', 'ql-font-verdana', 'ql-font-georgia',
  'ql-font-times-new-roman', 'ql-font-tahoma', 'ql-font-trebuchet-ms',
];
const QUILL_SIZE_CLASSES = ['ql-size-small', 'ql-size-large', 'ql-size-huge'];
const QUILL_ALIGN_CLASSES = [
  'ql-align-left', 'ql-align-center', 'ql-align-right', 'ql-align-justify',
];

const EMAIL_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'img', 'span', 'div', 'pre', 'code', 'hr',
];

const SAFE_STYLE_RULES = [/.*/];

const EMAIL_ALLOWED_ATTRIBUTES = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'style'],
  span: ['style', 'class'],
  div: ['style'],
  p: ['style', 'class'],
  h1: ['style'], h2: ['style'], h3: ['style'],
  h4: ['style'], h5: ['style'], h6: ['style'],
  ul: ['style'], ol: ['style'], li: ['style'],
  strong: ['style'], b: ['style'], em: ['style'],
  i: ['style'], u: ['style'], s: ['style'],
  blockquote: ['style'],
};

const EMAIL_ALLOWED_STYLES = {
  '*': {
    'color': SAFE_STYLE_RULES,
    'background-color': SAFE_STYLE_RULES,
    'font-family': SAFE_STYLE_RULES,
    'font-size': SAFE_STYLE_RULES,
    'font-weight': SAFE_STYLE_RULES,
    'font-style': SAFE_STYLE_RULES,
    'text-decoration': SAFE_STYLE_RULES,
    'text-align': [/^(left|center|right|justify)$/],
    'line-height': SAFE_STYLE_RULES,
    'margin': SAFE_STYLE_RULES,
    'margin-top': SAFE_STYLE_RULES,
    'margin-bottom': SAFE_STYLE_RULES,
    'padding': SAFE_STYLE_RULES,
  },
};

const EMAIL_ALLOWED_CLASSES = {
  span: [...QUILL_FONT_CLASSES, ...QUILL_SIZE_CLASSES],
  p: QUILL_ALIGN_CLASSES,
};

function sanitizeEmailHtml(input) {
  return sanitizeHtml(String(input || ''), {
    allowedTags: EMAIL_ALLOWED_TAGS,
    allowedAttributes: EMAIL_ALLOWED_ATTRIBUTES,
    allowedStyles: EMAIL_ALLOWED_STYLES,
    allowedClasses: EMAIL_ALLOWED_CLASSES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonBooleanAttributes: ['href', 'src', 'alt', 'width', 'height', 'target', 'rel', 'style', 'class'],
  });
}

module.exports = { sanitizeEmailHtml };
