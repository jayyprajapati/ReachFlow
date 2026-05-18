import React, { useEffect, useState } from 'react';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  Clock, Microscope, Sparkles, Loader, TrendingUp, Link2, BarChart2,
} from 'lucide-react';

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

// A single row for a history entry (flow, analysis-only, or generation-only)
function FlowRow({ row, onRestore, restoring }) {
  const isFlow = row.kind === 'flow';
  const isAnalysisOnly = row.kind === 'analysis-only';
  const isGenerationOnly = row.kind === 'generation-only';

  const analysis = row.analysis;
  const generations = row.generations || [];
  const latestGen = generations[0];

  const label = analysis?.jobTitle || analysis?.company
    ? [analysis.jobTitle, analysis.company].filter(Boolean).join(' · ')
    : latestGen?.outputFormat
    ? `Generated (${latestGen.outputFormat})`
    : 'History entry';

  const matchScore = isFlow
    ? (analysis?.matchScore || latestGen?.matchScoreAfter || 0)
    : isAnalysisOnly
    ? (analysis?.matchScore || 0)
    : (latestGen?.matchScoreAfter || 0);

  const isRestoring = restoring === (row.flowId || row.analysis?.id || latestGen?.id);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 16px',
        borderBottom: '1px solid var(--rf-border-subtle)',
        background: 'var(--rf-bg-canvas)',
        cursor: 'pointer',
        transition: 'background var(--rf-duration-fast)',
      }}
      onClick={() => onRestore(row)}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--rf-bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--rf-bg-canvas)'}
      title={row.flowId ? 'Click to restore full workspace' : 'Click to restore in Workspace'}
    >
      {/* Kind indicator */}
      {isFlow ? (
        <span className="rl-badge" style={{ background: 'var(--rf-accent-faint)', color: 'var(--rf-accent)', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Link2 size={10} /> Flow
        </span>
      ) : isAnalysisOnly ? (
        <span className="rl-badge" style={{ background: 'var(--rf-bg-overlay)', color: 'var(--rf-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Microscope size={10} /> Analysis
        </span>
      ) : (
        <span className="rl-badge" style={{ background: 'var(--rf-bg-overlay)', color: 'var(--rf-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Sparkles size={10} /> Generated
        </span>
      )}

      {/* Label + sub-info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </div>
        {isFlow && generations.length > 0 && (
          <div style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', marginTop: 1 }}>
            {generations.length} generation{generations.length !== 1 ? 's' : ''}
          </div>
        )}
        {isGenerationOnly && latestGen?.generationMode === 'modify_existing' && (
          <div style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', marginTop: 1 }}>Modified existing</div>
        )}
      </div>

      {/* Score + arrows + date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {isFlow && latestGen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>
            <TrendingUp size={11} />
            <span>{Math.round(latestGen.matchScoreBefore || 0)}% → <strong style={{ color: 'var(--rf-text)' }}>{Math.round(latestGen.matchScoreAfter || 0)}%</strong></span>
          </div>
        )}
        {!isFlow && <ScoreBadge score={matchScore} />}
        <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', minWidth: 70, textAlign: 'right' }}>{fmt(row.createdAt)}</span>
        {isRestoring && <Loader size={13} className="rf-spin" style={{ color: 'var(--rf-accent)' }} />}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { history, historyLoading, loadHistory, loadAnalysis, loadGeneratedById, setActiveGenerated, api } = useResumeLab();
  const { navigateTo } = useRouter();
  const [filter, setFilter] = useState('all');
  const [restoring, setRestoring] = useState(null);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const filtered = history.filter(row => {
    if (filter === 'all') return true;
    if (filter === 'flow') return row.kind === 'flow';
    if (filter === 'analysis') return row.kind === 'analysis-only' || (row.kind === 'flow' && row.analysis);
    if (filter === 'generated') return row.kind === 'generation-only' || (row.kind === 'flow' && (row.generations || []).length > 0);
    return true;
  });

  async function handleRestore(row) {
    if (restoring) return;
    const key = row.flowId || row.analysis?.id || (row.generations || [])[0]?.id;
    setRestoring(key);
    try {
      if (row.flowId) {
        // Navigate to workspace with flow= param; WorkspacePage will prefill from API
        navigateTo(`/resume-lab/workspace?flow=${encodeURIComponent(row.flowId)}`);
        return;
      }
      // Standalone analysis or generation
      if (row.kind === 'analysis-only' && row.analysis?.id) {
        await loadAnalysis(row.analysis.id);
        navigateTo('/resume-lab/workspace');
      } else if (row.kind === 'generation-only' && row.generations?.[0]?.id) {
        const data = await loadGeneratedById(row.generations[0].id);
        if (data) setActiveGenerated(data);
        navigateTo('/resume-lab/workspace');
      }
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="rl-page">
      <div className="rl-page__header">
        <div className="rl-page__header-left">
          <h1 className="rl-page__title">History</h1>
          <p className="rl-page__subtitle">Past JD analyses and generated resumes — linked by flow.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { value: 'all', label: 'All' },
          { value: 'flow', label: 'Flows' },
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
            Run a JD analysis or generate a resume from the Workspace tab to see history here.
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--rf-border-subtle)', borderRadius: 'var(--rf-radius-lg)', overflow: 'hidden' }}>
          {filtered.map((row, i) => (
            <FlowRow
              key={row.flowId || `${row.kind}-${row.analysis?.id || ''}-${i}`}
              row={row}
              onRestore={handleRestore}
              restoring={restoring}
            />
          ))}
        </div>
      )}
    </div>
  );
}
