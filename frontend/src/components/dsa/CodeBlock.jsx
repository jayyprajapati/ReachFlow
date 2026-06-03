import React, { useState } from 'react';
import { ClipboardCopy, CheckCheck } from 'lucide-react';

const LANG_LABELS = { java: 'Java', python: 'Python' };

/**
 * CodeBlock — read-only output code with a Java/Python tab switch and a copy
 * button. `code` is the { java, python } object from the analysis result.
 */
export default function CodeBlock({ code }) {
  const langs = ['java', 'python'].filter((l) => code && typeof code[l] === 'string' && code[l].trim());
  const [active, setActive] = useState(langs[0] || 'java');
  const [copied, setCopied] = useState(false);

  if (!langs.length) return null;
  const current = code[active] || '';

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
              className={`dsa-codeblock__tab${active === l ? ' dsa-codeblock__tab--active' : ''}`}
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
      <pre className="dsa-codeblock__pre"><code>{current}</code></pre>
    </div>
  );
}
