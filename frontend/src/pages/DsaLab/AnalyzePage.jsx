import React, { useMemo, useState } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  Binary, Loader, X, Code2, ChevronDown, ChevronUp,
  Ban, ArrowUpRight, Sparkles,
} from 'lucide-react';
import { makeDsaApi } from '../../services/dsaApi.js';
import CodeEditor from '../../components/dsa/CodeEditor.jsx';
import DsaResult from '../../components/dsa/DsaResult.jsx';

const LANGUAGES = [
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
];

const CODE_PLACEHOLDER = {
  java: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // your solution\n    }\n}',
  python: 'class Solution:\n    def twoSum(self, nums, target):\n        # your solution\n        pass',
};

export default function AnalyzePage() {
  const { authedFetch, setNotice } = useApp();
  const { navigateTo } = useRouter();
  const api = useMemo(() => makeDsaApi(authedFetch), [authedFetch]);

  const [problem, setProblem] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('java');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { kind: 'notDsa' | 'byok' | 'generic', message }

  const canAnalyze = problem.trim().length > 15 && !loading;
  const hasCode = showCode && code.trim().length > 0;

  async function handleAnalyze() {
    if (!canAnalyze) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = { problemStatement: problem.trim() };
      if (hasCode) {
        body.code = code;
        body.language = language;
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
    setProblem('');
    setCode('');
    setShowCode(false);
    setResult(null);
    setError(null);
  }

  return (
    <div className="dsa-analyze">
      {/* ── Input ── */}
      <div className="dsa-panel">
        <div className="dsa-panel__head">
          <p className="dsa-panel__title">Problem statement</p>
          {(problem || result) && (
            <button className="dsa-linkbtn" onClick={reset}><X size={12} /> Clear</button>
          )}
        </div>

        <textarea
          className="rf-textarea dsa-problem-input"
          placeholder="Paste the full DSA problem here — including constraints and examples for the best analysis…"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
        />

        {/* Optional code review */}
        <button
          type="button"
          className="dsa-disclosure"
          onClick={() => setShowCode((v) => !v)}
          aria-expanded={showCode}
        >
          <span><Code2 size={14} /> I have a solution to review <span className="dsa-disclosure__opt">(optional)</span></span>
          {showCode ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {showCode && (
          <div className="dsa-code-input">
            <div className="dsa-lang-toggle" role="tablist" aria-label="Solution language">
              {LANGUAGES.map((l) => (
                <button
                  key={l.value}
                  role="tab"
                  aria-selected={language === l.value}
                  className={`dsa-lang-toggle__btn${language === l.value ? ' dsa-lang-toggle__btn--active' : ''}`}
                  onClick={() => setLanguage(l.value)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <CodeEditor
              value={code}
              onChange={setCode}
              placeholder={CODE_PLACEHOLDER[language]}
              ariaLabel={`${language} solution`}
            />
          </div>
        )}

        <button
          className="rf-btn rf-btn--primary"
          style={{ width: '100%' }}
          onClick={handleAnalyze}
          disabled={!canAnalyze}
        >
          {loading
            ? <><Loader size={14} className="rf-spin" /> Analyzing…</>
            : <><Binary size={14} /> {hasCode ? 'Review & analyze' : 'Analyze problem'}</>}
        </button>
        {loading && (
          <p className="dsa-hint">Working through approaches and writing solutions in both languages — this can take 30–60s.</p>
        )}
      </div>

      {/* ── Output ── */}
      <div className="dsa-output">
        {loading && (
          <div className="dsa-loading">
            <Loader size={26} className="rf-spin" style={{ color: 'var(--rf-accent)' }} />
            <p>Analyzing the problem{hasCode ? ' and reviewing your code' : ''}…</p>
          </div>
        )}

        {!loading && error && error.kind === 'notDsa' && (
          <div className="dsa-error-card dsa-error-card--reject">
            <div className="dsa-error-card__icon"><Ban size={22} /></div>
            <h3>Not a DSA problem</h3>
            <p>{error.message}</p>
            <p className="dsa-error-card__hint">Paste an algorithmic or data-structures problem (arrays, strings, trees, graphs, dynamic programming, etc.) to get an analysis.</p>
          </div>
        )}

        {!loading && error && error.kind === 'byok' && (
          <div className="dsa-error-card">
            <div className="dsa-error-card__icon"><Sparkles size={22} /></div>
            <h3>AI provider not ready</h3>
            <p>{error.message}</p>
            <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => navigateTo('/settings')}>
              Open Settings <ArrowUpRight size={13} />
            </button>
          </div>
        )}

        {!loading && error && error.kind === 'generic' && (
          <div className="dsa-error-card">
            <div className="dsa-error-card__icon"><X size={22} /></div>
            <h3>Something went wrong</h3>
            <p>{error.message}</p>
          </div>
        )}

        {!loading && !error && !result && (
          <div className="rf-empty dsa-output__empty">
            <div className="dsa-output__empty-icon"><Binary size={22} /></div>
            <p className="rf-empty__title">No analysis yet</p>
            <p className="rf-empty__desc">Paste a problem (and optionally your solution) and run the analysis to see approaches, complexity, and code here.</p>
          </div>
        )}

        {!loading && !error && result && <DsaResult result={result} />}
      </div>
    </div>
  );
}
