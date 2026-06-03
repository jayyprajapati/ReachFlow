import React, { useState } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Bug, Lightbulb,
  Clock, Database, Trophy, Sparkles, ChevronDown, FileText,
} from 'lucide-react';
import CodeBlock from './CodeBlock.jsx';

// Verdict → visual tone. The three states the user cares about:
//   error (red)    → won't work as written (incorrect / only partially correct)
//   warn  (yellow) → works, but can be optimized
//   success(green) → already optimal, no logic change needed
function verdictTone(review) {
  if (!review) return null;
  if (review.verdict !== 'correct') return 'error';
  return review.is_optimal ? 'success' : 'warn';
}

const TONE_META = {
  error:   { Icon: XCircle,      title: "This solution won't work as written", cls: 'dsa-verdict--error' },
  warn:    { Icon: AlertTriangle, title: 'Works — but it can be optimized',      cls: 'dsa-verdict--warn' },
  success: { Icon: CheckCircle2,  title: 'Optimal — no logic change needed. Nice work!', cls: 'dsa-verdict--success' },
};

const LANG_LABEL = { java: 'Java', python: 'Python' };

// ── Small building blocks ─────────────────────────────────────────────────────

function ComplexityBlock({ complexity, label }) {
  if (!complexity || (!complexity.time && !complexity.space)) return null;
  return (
    <div className="dsa-complexity">
      {label && <div className="dsa-complexity__label">{label}</div>}
      <div className="dsa-complexity__grid">
        <div className="dsa-complexity__cell">
          <span className="dsa-complexity__k"><Clock size={12} /> Time</span>
          <span className="dsa-complexity__v">{complexity.time || '—'}</span>
        </div>
        <div className="dsa-complexity__cell">
          <span className="dsa-complexity__k"><Database size={12} /> Space</span>
          <span className="dsa-complexity__v">{complexity.space || '—'}</span>
        </div>
      </div>
      {complexity.explanation && <p className="dsa-complexity__explain">{complexity.explanation}</p>}
    </div>
  );
}

// ── Collapsible problem statement (+ submitted code when present) ─────────────

function ProblemPanel({ title, summary, problemStatement, userCode, language }) {
  const [open, setOpen] = useState(false);
  const heading = title || 'Problem statement';
  return (
    <div className={`dsa-problempanel${open ? ' is-open' : ''}`}>
      <button className="dsa-problempanel__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="dsa-problempanel__lead">
          <FileText size={14} />
          <span className="dsa-problempanel__title">{heading}</span>
        </span>
        <ChevronDown size={16} className="dsa-problempanel__chev" />
      </button>

      {!open && summary && <p className="dsa-problempanel__preview">{summary}</p>}

      {open && (
        <div className="dsa-problempanel__body">
          {problemStatement
            ? <p className="dsa-prose dsa-prose--pre">{problemStatement}</p>
            : summary && <p className="dsa-prose">{summary}</p>}
          {userCode && (
            <div className="dsa-submitted">
              <div className="dsa-submitted__label">Your submitted solution{language ? ` · ${LANG_LABEL[language] || ''}` : ''}</div>
              <pre className="dsa-codeblock__pre"><code>{userCode}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Code review verdict (only when the user submitted a solution) ─────────────

function VerdictPanel({ review }) {
  const tone = verdictTone(review);
  if (!tone) return null;
  const meta = TONE_META[tone];
  const { Icon } = meta;
  const bugs = Array.isArray(review.bugs) ? review.bugs.filter(b => b && (b.issue || b.fix)) : [];
  const improvements = Array.isArray(review.improvements) ? review.improvements.filter(Boolean) : [];

  return (
    <section className={`dsa-verdict ${meta.cls}`}>
      <div className="dsa-verdict__head">
        <Icon size={20} className="dsa-verdict__icon" />
        <h3 className="dsa-verdict__title">{meta.title}</h3>
        {review.language && <span className="dsa-verdict__lang">{LANG_LABEL[review.language] || review.language}</span>}
      </div>

      {review.verdict_explanation && <p className="dsa-verdict__text">{review.verdict_explanation}</p>}
      {tone === 'success' && review.optimality_note && <p className="dsa-verdict__text">{review.optimality_note}</p>}

      <ComplexityBlock complexity={review.complexity} label="Your solution's complexity" />

      {tone === 'error' && bugs.length > 0 && (
        <div className="dsa-list-block">
          <div className="dsa-list-block__title"><Bug size={13} /> Why it fails</div>
          <ul className="dsa-list">
            {bugs.map((b, i) => (
              <li key={i}>
                <span className="dsa-list__lead">{b.issue}</span>
                {b.fix && <span className="dsa-list__sub">Fix: {b.fix}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tone === 'warn' && improvements.length > 0 && (
        <div className="dsa-list-block">
          <div className="dsa-list-block__title"><Lightbulb size={13} /> How to optimize</div>
          <ul className="dsa-list">
            {improvements.map((imp, i) => <li key={i}><span className="dsa-list__lead">{imp}</span></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── Approaches (brute force → optimal, side by side) ──────────────────────────

function ApproachCard({ approach, index }) {
  if (!approach) return null;
  return (
    <article className={`dsa-approach${approach.is_optimal ? ' dsa-approach--optimal' : ''}`}>
      <div className="dsa-approach__head">
        <h4 className="dsa-approach__name">{approach.name || `Approach ${index + 1}`}</h4>
        {approach.is_optimal && <span className="dsa-approach__tag"><Trophy size={11} /> Optimal</span>}
      </div>

      {approach.how_to_think && (
        <div className="dsa-approach__block">
          <div className="dsa-approach__label">How to think about it</div>
          <p className="dsa-prose">{approach.how_to_think}</p>
        </div>
      )}
      {approach.explanation && (
        <div className="dsa-approach__block">
          <div className="dsa-approach__label">Approach</div>
          <p className="dsa-prose">{approach.explanation}</p>
        </div>
      )}

      <ComplexityBlock complexity={approach.complexity} />
      <CodeBlock code={approach.code} />
    </article>
  );
}

// ── Top-level result renderer ─────────────────────────────────────────────────

export default function DsaResult({ result, problemStatement, userCode }) {
  if (!result) return null;
  const approaches = Array.isArray(result.approaches) ? result.approaches : [];
  const optimal = result.optimal_complexity;
  const reviewLang = result.review?.language;

  return (
    <div className="dsa-result">
      {/* Collapsed problem statement at the very top */}
      <ProblemPanel
        title={result.problem_title}
        summary={result.problem_summary}
        problemStatement={problemStatement}
        userCode={userCode}
        language={reviewLang}
      />

      {optimal && (optimal.time || optimal.space) && (
        <div className="dsa-optimal-chip">
          <Sparkles size={13} />
          Optimal target: <strong>{optimal.time || '—'}</strong> time · <strong>{optimal.space || '—'}</strong> space
        </div>
      )}

      {result.review && <VerdictPanel review={result.review} />}

      {approaches.length > 0 && (
        <div className="dsa-approaches">
          {approaches.map((a, i) => <ApproachCard key={i} approach={a} index={i} />)}
        </div>
      )}
    </div>
  );
}
