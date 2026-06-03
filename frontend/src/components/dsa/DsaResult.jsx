import React, { useState } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Bug, Lightbulb,
  Clock, Database, Trophy, Sparkles, ChevronDown, FileText,
} from 'lucide-react';
import CodeBlock from './CodeBlock.jsx';
import CodeEditor from './CodeEditor.jsx';

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

function editorHeightFor(source) {
  const lines = String(source || '').split('\n').length;
  return Math.min(360, Math.max(180, lines * 20 + 32));
}

function asBulletItems(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
  return lines.length > 1 ? lines : [text];
}

function ExplainText({ value }) {
  const items = asBulletItems(value);
  if (!items.length) return null;
  if (!Array.isArray(value) && items.length === 1) {
    return <p className="dsa-prose">{items[0]}</p>;
  }
  return (
    <ul className="dsa-explain-list">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((step, index) => {
    if (typeof step === 'string') {
      return { step: `Step ${index + 1}`, state: step.trim(), why: '' };
    }
    if (!step || typeof step !== 'object') return null;
    return {
      step: String(step.step || `Step ${index + 1}`).trim(),
      state: String(step.state || step.what_happens || '').trim(),
      why: String(step.why || step.why_it_matters || step.reason || '').trim(),
    };
  }).filter((step) => step && (step.step || step.state || step.why));
}

function isBruteForceApproach(approach) {
  return /brute\s*force|naive|exhaustive/i.test(String(approach?.name || ''));
}

function orderedApproaches(approaches) {
  return approaches
    .map((approach, index) => ({ approach, index }))
    .sort((a, b) => {
      const rank = ({ approach }) => {
        if (approach?.is_optimal) return 0;
        if (isBruteForceApproach(approach)) return 2;
        return 1;
      };
      return rank(a) - rank(b) || a.index - b.index;
    })
    .map(({ approach }) => approach);
}

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

function LearningBreakdown({ result }) {
  const breakdown = result?.problem_breakdown || {};
  const plain = String(breakdown.plain_english || '').trim();
  const keyPoints = asBulletItems(breakdown.key_points);
  const watchOut = asBulletItems(breakdown.watch_out_for);
  const walkthrough = result?.example_walkthrough || {};
  const example = String(walkthrough.example || '').trim();
  const steps = normalizeSteps(walkthrough.steps);
  const takeaway = String(walkthrough.takeaway || '').trim();

  if (!plain && !keyPoints.length && !watchOut.length && !example && !steps.length && !takeaway) return null;

  return (
    <section className="dsa-teach">
      <div className="dsa-teach__head">
        <h3 className="dsa-teach__title">Understand the problem</h3>
      </div>

      {plain && <p className="dsa-prose">{plain}</p>}

      {(keyPoints.length > 0 || watchOut.length > 0) && (
        <div className="dsa-teach__grid">
          {keyPoints.length > 0 && (
            <div className="dsa-teach__block">
              <div className="dsa-teach__label">What matters</div>
              <ul className="dsa-explain-list">
                {keyPoints.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}

          {watchOut.length > 0 && (
            <div className="dsa-teach__block">
              <div className="dsa-teach__label">Watch out for</div>
              <ul className="dsa-explain-list">
                {watchOut.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {(example || steps.length > 0 || takeaway) && (
        <div className="dsa-walkthrough">
          <div className="dsa-teach__label">Example breakdown</div>
          {example && <div className="dsa-walkthrough__example">{example}</div>}
          {steps.length > 0 && (
            <ol className="dsa-steps">
              {steps.map((step, i) => (
                <li key={i}>
                  <span className="dsa-steps__num">{i + 1}</span>
                  <div className="dsa-steps__body">
                    {step.step && <div className="dsa-steps__title">{step.step}</div>}
                    {step.state && <div className="dsa-steps__state">{step.state}</div>}
                    {step.why && <div className="dsa-steps__why">{step.why}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {takeaway && <p className="dsa-walkthrough__takeaway">{takeaway}</p>}
        </div>
      )}
    </section>
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
              <CodeEditor value={userCode} language={language || 'java'} height={editorHeightFor(userCode)} readOnly />
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
  const hasHowToThink = asBulletItems(approach.how_to_think).length > 0;
  const hasExplanation = asBulletItems(approach.explanation).length > 0;

  return (
    <article className={`dsa-approach${approach.is_optimal ? ' dsa-approach--optimal' : ''}`}>
      <div className="dsa-approach__head">
        <h4 className="dsa-approach__name">{approach.name || `Approach ${index + 1}`}</h4>
        {approach.is_optimal && <span className="dsa-approach__tag"><Trophy size={11} /> Optimal</span>}
      </div>

      {hasHowToThink && (
        <div className="dsa-approach__block">
          <div className="dsa-approach__label">How to think about it</div>
          <ExplainText value={approach.how_to_think} />
        </div>
      )}
      {hasExplanation && (
        <div className="dsa-approach__block">
          <div className="dsa-approach__label">Approach</div>
          <ExplainText value={approach.explanation} />
        </div>
      )}

      <ComplexityBlock complexity={approach.complexity} />
      <CodeBlock code={approach.code} />
    </article>
  );
}

function ApproachTabs({ approaches }) {
  const ordered = orderedApproaches(approaches);
  const [active, setActive] = useState(0);
  const activeIndex = Math.min(active, ordered.length - 1);
  const activeApproach = ordered[activeIndex];

  if (!ordered.length) return null;

  return (
    <section className="dsa-approaches">
      <div className="dsa-approaches__tabs" role="tablist" aria-label="Solution approaches">
        {ordered.map((approach, index) => {
          const selected = index === activeIndex;
          const brute = isBruteForceApproach(approach);
          const label = approach.name || `Approach ${index + 1}`;

          return (
            <button
              key={`${label}-${index}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`dsa-approach-panel-${index}`}
              id={`dsa-approach-tab-${index}`}
              className={`dsa-approaches__tab${selected ? ' dsa-approaches__tab--active' : ''}`}
              onClick={() => setActive(index)}
            >
              <span className="dsa-approaches__tab-title">{label}</span>
              <span className="dsa-approaches__tab-meta">
                {approach.is_optimal ? 'Optimal' : brute ? 'Brute force' : 'Alternative'}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`dsa-approach-panel-${activeIndex}`}
        aria-labelledby={`dsa-approach-tab-${activeIndex}`}
      >
        <ApproachCard approach={activeApproach} index={activeIndex} />
      </div>
    </section>
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

      <LearningBreakdown result={result} />

      {optimal && (optimal.time || optimal.space) && (
        <div className="dsa-optimal-chip">
          <Sparkles size={13} />
          Optimal target: <strong>{optimal.time || '—'}</strong> time · <strong>{optimal.space || '—'}</strong> space
        </div>
      )}

      {result.review && <VerdictPanel review={result.review} />}

      {approaches.length > 0 && <ApproachTabs approaches={approaches} />}
    </div>
  );
}
