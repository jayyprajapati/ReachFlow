import React, { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Loader } from 'lucide-react';

/**
 * CodeEditor — the official VS Code Monaco editor for entering a solution.
 *
 * Theme follows the app's `data-theme` attribute (light ↔ vs-dark) so the editor
 * blends into ReachFlow's surface instead of being a hard-bordered box. Chrome is
 * stripped back (no minimap, no line glyphs) to keep it calm and uncluttered.
 */
function resolveTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'light';
}

export default function CodeEditor({
  value,
  onChange,
  language = 'java',
  height = 320,
}) {
  const [theme, setTheme] = useState(resolveTheme);

  // Track app theme changes so the editor recolors with the rest of the UI.
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(resolveTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="dsa-editor">
      <Editor
        height={height}
        language={language === 'python' ? 'python' : 'java'}
        theme={theme}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        loading={<div className="dsa-editor__loading"><Loader size={16} className="rf-spin" /> Loading editor…</div>}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbersMinChars: 3,
          folding: false,
          glyphMargin: false,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          padding: { top: 12, bottom: 12 },
          tabSize: 4,
          automaticLayout: true,
          fontFamily: 'var(--rf-font-mono), ui-monospace, monospace',
          smoothScrolling: true,
        }}
      />
    </div>
  );
}
