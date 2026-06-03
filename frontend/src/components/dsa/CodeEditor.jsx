import React, { useRef } from 'react';

/**
 * CodeEditor — a lightweight, dependency-free code input.
 *
 * A monospace <textarea> paired with a synced line-number gutter and Tab-key
 * handling (inserts spaces instead of moving focus). No syntax highlighting —
 * intentionally minimal to keep the bundle lean.
 */
export default function CodeEditor({
  value,
  onChange,
  placeholder = '',
  minRows = 12,
  ariaLabel = 'Code editor',
}) {
  const taRef = useRef(null);
  const gutterRef = useRef(null);

  const lineCount = Math.max(value.split('\n').length, minRows);

  function syncScroll() {
    if (gutterRef.current && taRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop;
    }
  }

  function handleKeyDown(e) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const ta = e.target;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const indent = '    '; // 4 spaces
    const next = value.slice(0, start) + indent + value.slice(end);
    onChange(next);
    // Restore caret just after the inserted indent.
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + indent.length;
    });
  }

  return (
    <div className="dsa-editor">
      <div className="dsa-editor__gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="dsa-editor__lineno">{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={taRef}
        className="dsa-editor__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={ariaLabel}
        rows={minRows}
      />
    </div>
  );
}
