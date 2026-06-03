import React, { useMemo, useState } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  Binary, Loader, RotateCcw, Ban, ArrowUpRight, Sparkles, X,
} from 'lucide-react';
import { makeDsaApi } from '../../services/dsaApi.js';
import CodeEditor from '../../components/dsa/CodeEditor.jsx';
import DsaResult from '../../components/dsa/DsaResult.jsx';

const OUTPUT_LANGUAGES = [
  { value: 'both',   label: 'Java & Python' },
  { value: 'java',   label: 'Java only' },
  { value: 'python', label: 'Python only' },
];

const CODE_PLACEHOLDER = {
  java: '// Optional — paste your solution to have it reviewed\nclass Solution {\n    public int[] twoSum(int[] nums, int target) {\n\n    }\n}',
  python: '# Optional — paste your solution to have it reviewed\nclass Solution:\n    def twoSum(self, nums, target):\n        pass',
};

export default function AnalyzePage() {
  const { authedFetch, setNotice } = useApp();
  const { navigateTo } = useRouter();
  const api = useMemo(() => makeDsaApi(authedFetch), [authedFetch]);

  const [problem, setProblem] = useState('');
  const [code, setCode] = useState('');
  const [outputPref, setOutputPref] = useState('both'); // java | python | both
  const [codeLang, setCodeLang] = useState('java');      // language of the user's own code

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { kind: 'notDsa' | 'byok' | 'generic', message }

  // When a single output language is chosen, the user's code is in that language too.
  const editorLang = outputPref === 'both' ? codeLang : outputPref;
  const canAnalyze = problem.trim().length > 15 && !loading;
  const hasCode = code.trim().length > 0;

  async function handleAnalyze() {
    if (!canAnalyze) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = { problemStatement: problem.trim(), outputLanguage: outputPref };
      if (hasCode) {
        body.code = code;
        body.language = editorLang;
      }
      const data = await api.analyze(body);
      setResult(data);
    } catch (err) {
      if (err.code === 'NOT_DSA_PROBLEM' || err.status === 422) {
        setError({ kind: 'notDsa', message: err.message });
      } else if (err.status === 402 || err.code === 'LLM_NOT_CONFIGURED' || err.code === 'LLM_NOT_VALIDATED') {
        setError({ kind: 'byok', message: err.message });
      } else {
        setError({ kind: 'generic', message: err.message || 'Analysis failed. Please try again.' });
        setNotice({ type: 'error', message: err.message || 'DSA analysis failed.' });
      }
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  // ── Result view ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="dsa-resultview">
        <div className="dsa-resultview__bar">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={reset}>
            <RotateCcw size={13} /> New analysis
          </button>
        </div>
        <DsaResult result={result} problemStatement={problem} userCode={hasCode ? code : ''} />
      </div>
    );
  }

  // ── Loading view ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="dsa-loading">
        <Loader size={26} className="rf-spin" style={{ color: 'var(--rf-accent)' }} />
        <p>Working through approaches{hasCode ? ' and reviewing your code' : ''}…</p>
        <span className="dsa-loading__hint">Writing real, compilable solutions — this can take 30–60s.</span>
      </div>
    );
  }

  // ── Compose view (problem + code side by side) ─────────────────────────────
  return (
    <div className="dsa-compose">
      {error && <ErrorBanner error={error} onClose={() => setError(null)} navigateTo={navigateTo} />}

      <div className="dsa-compose__toolbar">
        <label className="dsa-prefs">
          <span className="dsa-prefs__label">Solution language</span>
          <div className="dsa-select">
            <select value={outputPref} onChange={(e) => setOutputPref(e.target.value)}>
              {OUTPUT_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </label>

        <button
          className="rf-btn rf-btn--primary"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
        >
          <Binary size={14} /> {hasCode ? 'Review & analyze' : 'Analyze problem'}
        </button>
      </div>

      <div className="dsa-compose__grid">
        {/* Problem statement */}
        <section className="dsa-pane">
          <div className="dsa-pane__head">
            <span className="dsa-pane__title">Problem statement</span>
          </div>
          <textarea
            className="dsa-pane__textarea"
            placeholder="Paste the full DSA problem — include constraints and examples for the sharpest analysis…"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
          />
        </section>

        {/* Optional solution */}
        <section className="dsa-pane">
          <div className="dsa-pane__head">
            <span className="dsa-pane__title">Your solution <span className="dsa-pane__opt">optional</span></span>
            {outputPref === 'both' && (
              <div className="dsa-seg" role="tablist" aria-label="Your code language">
                {['java', 'python'].map((l) => (
                  <button
                    key={l}
                    role="tab"
                    aria-selected={codeLang === l}
                    className={`dsa-seg__btn${codeLang === l ? ' dsa-seg__btn--active' : ''}`}
                    onClick={() => setCodeLang(l)}
                  >
                    {l === 'python' ? 'Python' : 'Java'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <CodeEditor
            value={code}
            onChange={setCode}
            language={editorLang}
          />
          {!code && (
            <p className="dsa-pane__hint">
              Paste your code to get it reviewed for correctness, bugs, and whether it's already optimal. Leave it empty for a fresh walkthrough.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

// Inline error banner (replaces the old full-card error states for a calmer layout).
function ErrorBanner({ error, onClose, navigateTo }) {
  if (error.kind === 'notDsa') {
    return (
      <div className="dsa-banner dsa-banner--warn">
        <Ban size={16} />
        <div>
          <strong>Not a DSA problem.</strong> {error.message}
        </div>
        <button className="dsa-banner__x" onClick={onClose} aria-label="Dismiss"><X size={14} /></button>
      </div>
    );
  }
  if (error.kind === 'byok') {
    return (
      <div className="dsa-banner dsa-banner--info">
        <Sparkles size={16} />
        <div><strong>AI provider not ready.</strong> {error.message}</div>
        <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => navigateTo('/settings')}>
          Settings <ArrowUpRight size={12} />
        </button>
      </div>
    );
  }
  return (
    <div className="dsa-banner dsa-banner--error">
      <X size={16} />
      <div><strong>Something went wrong.</strong> {error.message}</div>
      <button className="dsa-banner__x" onClick={onClose} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}
