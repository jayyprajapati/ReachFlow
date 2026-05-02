import React, { useEffect, useState } from 'react';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import { Clock, Microscope, Sparkles, Loader, AlertCircle, TrendingUp } from 'lucide-react';

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ScoreBadge({ score }) {
  const color = score >= 70
    ? 'var(--rf-success-text)'
    : score >= 40
    ? 'var(--rf-warning-text)'
    : 'var(--rf-error-text)';
  return <span style={{ fontWeight: 700, color, fontSize: 'var(--rf-text-sm)' }}>{Math.round(score || 0)}%</span>;
}

function KindBadge({ kind }) {
  if (kind === 'analysis') {
    return (
      <span className="rl-badge" style={{ background: 'var(--rf-bg-overlay)', color: 'var(--rf-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Microscope size={10} /> Analysis
      </span>
    );
  }
  return (
    <span className="rl-badge" style={{ background: 'var(--rf-accent-faint)', color: 'var(--rf-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Sparkles size={10} /> Generated
    </span>
  );
}

function HistoryRow({ item }) {
  const score = item.kind === 'analysis' ? item.matchScore : item.matchScoreAfter;
  const label = item.jobTitle || item.company || (item.kind === 'analysis' ? 'Analysis' : 'Generated Resume');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '12px 16px',
      borderBottom: '1px solid var(--rf-border-subtle)',
      background: 'var(--rf-bg-canvas)',
    }}>
      <KindBadge kind={item.kind} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
        {item.kind === 'generated' && item.generationMode === 'modify_existing' && (
          <div style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', marginTop: 1 }}>Modified existing resume</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {item.kind === 'generated' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>
            <TrendingUp size={11} />
            <span>{Math.round(item.matchScoreBefore || 0)}% → <strong style={{ color: 'var(--rf-text)' }}>{Math.round(item.matchScoreAfter || 0)}%</strong></span>
          </div>
        )}
        {item.kind === 'analysis' && <ScoreBadge score={score} />}
        <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', minWidth: 70, textAlign: 'right' }}>{fmt(item.createdAt)}</span>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { history, historyLoading, loadHistory } = useResumeLab();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filtered = history.filter(item => filter === 'all' || item.kind === filter);

  return (
    <div className="rl-page">
      <div className="rl-page__header">
        <div className="rl-page__header-left">
          <h1 className="rl-page__title">History</h1>
          <p className="rl-page__subtitle">Past JD analyses and generated resumes, newest first.</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { value: 'all', label: 'All' },
          { value: 'analysis', label: 'Analyses' },
          { value: 'generated', label: 'Generated' },
        ].map(opt => (
          <button
            key={opt.value}
            className={`rf-btn rf-btn--sm ${filter === opt.value ? 'rf-btn--primary' : 'rf-btn--ghost'}`}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {historyLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 24px' }}>
          <Loader size={22} className="rf-spin" style={{ color: 'var(--rf-accent)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rl-empty" style={{ background: 'var(--rf-bg-canvas)', border: '1px solid var(--rf-border-subtle)', borderRadius: 'var(--rf-radius-lg)', padding: '60px 24px' }}>
          <div className="rl-empty__icon"><Clock size={22} /></div>
          <p className="rl-empty__title">No history yet</p>
          <p className="rl-empty__body">
            {filter === 'all'
              ? 'Run a JD analysis or generate a resume from the Workspace tab to see your history here.'
              : `No ${filter === 'analysis' ? 'analyses' : 'generated resumes'} found.`}
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--rf-border-subtle)', borderRadius: 'var(--rf-radius-lg)', overflow: 'hidden' }}>
          {filtered.map((item, i) => <HistoryRow key={`${item.kind}-${item.id}-${i}`} item={item} />)}
        </div>
      )}
    </div>
  );
}
