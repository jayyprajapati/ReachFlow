import React, { useState } from 'react';
import { ClipboardCopy, CheckCheck } from 'lucide-react';
import CodeEditor from './CodeEditor.jsx';

const LANG_LABELS = { java: 'Java', python: 'Python' };

function editorHeightFor(source) {
  const lines = String(source || '').split('\n').length;
  return Math.min(460, Math.max(220, lines * 20 + 32));
}

/**
 * CodeBlock — read-only Monaco output code with a tab switch and a copy button.
 * `code` is the analysis result's language-keyed code object.
 */
export default function CodeBlock({ code }) {
  const langs = ['java', 'python'].filter((l) => code && typeof code[l] === 'string' && code[l].trim());
  const [active, setActive] = useState(langs[0] || 'java');
  const [copied, setCopied] = useState(false);

  if (!langs.length) return null;
  const activeLang = langs.includes(active) ? active : langs[0];
  const current = code[activeLang] || '';
  const editorHeight = editorHeightFor(current);

  function copy() {
    navigator.clipboard?.writeText(current).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="dsa-codeblock">
      <div className="dsa-codeblock__bar">
        <div className="dsa-codeblock__tabs">
          {langs.map((l) => (
            <button
              key={l}
              type="button"
              className={`dsa-codeblock__tab${activeLang === l ? ' dsa-codeblock__tab--active' : ''}`}
              onClick={() => setActive(l)}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <button type="button" className="dsa-codeblock__copy" onClick={copy} title="Copy code">
          {copied ? <CheckCheck size={12} /> : <ClipboardCopy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <CodeEditor value={current} language={activeLang} height={editorHeight} readOnly />
    </div>
  );
}
