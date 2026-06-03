import React from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Bug, Lightbulb,
  Clock, Database, Trophy, Sparkles, Layers,
} from 'lucide-react';
import CodeBlock from './CodeBlock.jsx';

const VERDICT_META = {
  correct:           { label: 'Correct',           badge: 'rf-badge--success', Icon: CheckCircle2 },
  incorrect:         { label: 'Incorrect',         badge: 'rf-badge--error',   Icon: XCircle },
  partially_correct: { label: 'Partially correct', badge: 'rf-badge--warning', Icon: AlertTriangle },
};

// ── Small building blocks ─────────────────────────────────────────────────────

function ComplexityBlock({ complexity, label }) {
  if (!complexity) return null;
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
      {complexity.explanation && (
        <p className="dsa-complexity__explain">{complexity.explanation}</p>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="dsa-section">
      <h3 className="dsa-section__title">{Icon && <Icon size={15} />} {title}</h3>
      {children}
    </section>
  );
}

// ── Code review (only when the user submitted a solution) ─────────────────────

function ReviewSection({ review }) {
  if (!review) return null;
  const meta = VERDICT_META[review.verdict] || VERDICT_META.partially_correct;
  const { Icon } = meta;
  const bugs = Array.isArray(review.bugs) ? review.bugs.filter(b => b && (b.issue || b.fix)) : [];
  const improvements = Array.isArray(review.improvements) ? review.improvements.filter(Boolean) : [];

  return (
    <Section icon={Icon} title="Your code review">
      <div className="dsa-verdict">
        <span className={`rf-badge ${meta.badge}`}><Icon size={12} /> {meta.label}</span>
        {review.language && <span className="rf-badge rf-badge--neutral">{review.language === 'python' ? 'Python' : 'Java'}</span>}
      </div>
      {review.verdict_explanation && <p className="dsa-prose">{review.verdict_explanation}</p>}

      <ComplexityBlock complexity={review.complexity} label="Your solution's complexity" />

      {bugs.length > 0 && (
        <div className="dsa-list-block">
          <div className="dsa-list-block__title"><Bug size={13} /> Bugs & edge cases</div>
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

      {improvements.length > 0 && (
        <div className="dsa-list-block">
          <div className="dsa-list-block__title"><Lightbulb size={13} /> Improvements</div>
          <ul className="dsa-list">
            {improvements.map((imp, i) => <li key={i}><span className="dsa-list__lead">{imp}</span></li>)}
          </ul>
        </div>
      )}

      {review.is_optimal && (
        <div className="dsa-optimal-banner">
          <Trophy size={18} />
          <div>
            <strong>Already optimal — no changes needed.</strong>
            {review.optimality_note && <p>{review.optimality_note}</p>}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Approaches (brute force → optimal) ────────────────────────────────────────

function ApproachCard({ approach, index }) {
  if (!approach) return null;
  return (
    <article className={`dsa-approach${approach.is_optimal ? ' dsa-approach--optimal' : ''}`}>
      <div className="dsa-approach__head">
        <span className="dsa-approach__num">{index + 1}</span>
        <h4 className="dsa-approach__name">{approach.name || `Approach ${index + 1}`}</h4>
        {approach.is_optimal && <span className="rf-badge rf-badge--success"><Trophy size={11} /> Optimal</span>}
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

export default function DsaResult({ result }) {
  if (!result) return null;
  const approaches = Array.isArray(result.approaches) ? result.approaches : [];
  const optimal = result.optimal_complexity;

  return (
    <div className="dsa-result">
      <header className="dsa-result__header">
        {result.problem_title && <h2 className="dsa-result__title">{result.problem_title}</h2>}
        {result.problem_summary && <p className="dsa-result__summary">{result.problem_summary}</p>}
        {optimal && (optimal.time || optimal.space) && (
          <div className="dsa-result__optimal-chip">
            <Sparkles size={13} />
            Optimal: <strong>{optimal.time || '—'}</strong> time · <strong>{optimal.space || '—'}</strong> space
          </div>
        )}
      </header>

      {result.review && <ReviewSection review={result.review} />}

      {approaches.length > 0 && (
        <Section icon={Layers} title={result.review ? 'Approaches & optimal solution' : 'Approaches'}>
          <div className="dsa-approaches">
            {approaches.map((a, i) => <ApproachCard key={i} approach={a} index={i} />)}
          </div>
        </Section>
      )}
    </div>
  );
}
