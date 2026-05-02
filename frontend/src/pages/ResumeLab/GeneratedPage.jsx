import React, { useEffect, useState } from 'react';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  FileOutput, Download, Trash2, Loader, Code2,
  ChevronDown, ChevronUp, TrendingUp, AlertCircle, Sparkles,
} from 'lucide-react';

const TEMPLATE_LABEL = { frontend: 'Frontend', backend: 'Backend', fullstack: 'Fullstack', custom: 'Custom' };

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Score delta display ───────────────────────────────────────────────────────

function ScoreDelta({ before, after }) {
  const gain = (after || 0) - (before || 0);
  return (
    <div className="rl-score-delta">
      <span className="rl-score-delta__before">{Math.round(before || 0)}%</span>
      <span className="rl-score-delta__arrow">→</span>
      <span className="rl-score-delta__after" style={{ fontWeight: 700, color: after >= 70 ? 'var(--rf-success-text)' : 'var(--rf-text)' }}>
        {Math.round(after || 0)}%
      </span>
      {gain !== 0 && (
        <span className={`rl-score-delta__gain rl-score-delta__gain--${gain > 0 ? 'pos' : 'neg'}`}>
          {gain > 0 ? '+' : ''}{Math.round(gain)}
        </span>
      )}
    </div>
  );
}

// ── List item skeleton ────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--rf-border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div className="rl-skeleton" style={{ height: 14, width: 60, borderRadius: 20 }} />
            <div className="rl-skeleton" style={{ height: 12, width: 80 }} />
          </div>
          <div className="rl-skeleton" style={{ height: 18, width: '70%' }} />
        </div>
      ))}
    </>
  );
}

// ── Detail skeleton ───────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="rl-gen-detail">
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--rf-border-subtle)', display: 'flex', gap: 12 }}>
        <div className="rl-skeleton" style={{ height: 20, width: 80, borderRadius: 20 }} />
        <div className="rl-skeleton" style={{ height: 20, width: 140 }} />
      </div>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rl-skeleton" style={{ height: 60, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  );
}

// ── Generated detail pane ─────────────────────────────────────────────────────

function GeneratedDetail({ item, loading, onDownload, onDelete, downloading }) {
  const [showLatex, setShowLatex] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (loading) return <DetailSkeleton />;
  if (!item) return null;

  const content = item.generatedContent;

  return (
    <div className="rl-gen-detail">
      <div className="rl-gen-detail__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className={`rl-badge rl-badge--${item.templateType}`}>{TEMPLATE_LABEL[item.templateType] || item.templateType}</span>
          <ScoreDelta before={item.matchScoreBefore} after={item.matchScoreAfter} />
          {item.pdfError && (
            <span className="rl-badge rl-badge--failed" title={item.pdfError}>
              <AlertCircle size={10} /> PDF Error
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="rf-btn rf-btn--primary rf-btn--sm"
            onClick={() => onDownload(item.id, `resume_${item.id}.pdf`)}
            disabled={!item.hasPdf || downloading}
            title={!item.hasPdf ? item.pdfError || 'PDF not available' : 'Download PDF'}
          >
            {downloading ? <Loader size={13} className="rf-spin" /> : <Download size={13} />}
            {downloading ? 'Downloading…' : 'Download PDF'}
          </button>
          <button
            className="rf-btn rf-btn--ghost rf-btn--sm"
            style={{ color: 'var(--rf-error-text)' }}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="rl-gen-detail__body">
        {/* Summary */}
        {content?.summary && (
          <div>
            <div className="rl-gen-detail__section-title">Summary</div>
            <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-secondary)', lineHeight: 1.6, margin: 0 }}>
              {content.summary}
            </p>
          </div>
        )}

        {/* Skills */}
        {content?.skills?.length > 0 && (
          <div>
            <div className="rl-gen-detail__section-title">Skills ({content.skills.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {content.skills.map((s, i) => (
                <span key={i} className="rl-tag">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Experience + Projects counts */}
        <div style={{ display: 'flex', gap: 12 }}>
          {content?.experience?.length > 0 && (
            <div className="rl-stat-card" style={{ flex: 'none', minWidth: 0 }}>
              <div className="rl-stat-card__value">{content.experience.length}</div>
              <div className="rl-stat-card__label">Positions</div>
            </div>
          )}
          {content?.projects?.length > 0 && (
            <div className="rl-stat-card" style={{ flex: 'none', minWidth: 0 }}>
              <div className="rl-stat-card__value">{content.projects.length}</div>
              <div className="rl-stat-card__label">Projects</div>
            </div>
          )}
          {content?.target_keywords_used?.length > 0 && (
            <div className="rl-stat-card" style={{ flex: 'none', minWidth: 0 }}>
              <div className="rl-stat-card__value">{content.target_keywords_used.length}</div>
              <div className="rl-stat-card__label">Keywords Used</div>
            </div>
          )}
        </div>

        {/* LaTeX preview toggle */}
        {item.latexPreview && (
          <div>
            <button
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rf-text-secondary)', fontSize: 'var(--rf-text-xs)', fontWeight: 600, padding: 0, marginBottom: showLatex ? 8 : 0 }}
              onClick={() => setShowLatex(v => !v)}
            >
              <Code2 size={13} />
              {showLatex ? 'Hide LaTeX Source' : 'View LaTeX Source'}
              {showLatex ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showLatex && (
              <pre className="rl-latex-preview">{item.latexPreview}</pre>
            )}
          </div>
        )}

        <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', margin: 0 }}>
          Generated {fmt(item.createdAt)}
        </p>
      </div>

      {confirmDelete && (
        <div className="rf-dialog-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()}>
            <div className="rf-dialog__title">Delete Generated Resume</div>
            <div className="rf-dialog__body">This version will be permanently deleted, including its PDF.</div>
            <div className="rf-dialog__actions">
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={() => { onDelete(item.id); setConfirmDelete(false); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Generate form (when no analysis selected yet) ─────────────────────────────

function GenerateForm({ analyses, analysesLoading, resumes, generateLoading, onGenerate }) {
  const [analysisId, setAnalysisId] = useState('');
  const [templateType, setTemplateType] = useState('fullstack');
  const [baseResumeId, setBaseResumeId] = useState('');

  const parsed = resumes.filter(r => r.status === 'parsed');
  const canGenerate = analysisId && !generateLoading;

  return (
    <div className="rl-panel" style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
      <p className="rl-panel__title"><Sparkles size={13} style={{ display: 'inline', marginRight: 5 }} />Generate Optimized Resume</p>

      <div className="rl-form-group">
        <label className="rl-form-label">Select Analysis</label>
        <select
          className="rl-form-select"
          value={analysisId}
          onChange={e => setAnalysisId(e.target.value)}
        >
          <option value="">Choose a JD analysis…</option>
          {(analyses || []).map(a => (
            <option key={a.id} value={a.id}>
              {a.jobTitle || a.company || 'Analysis'} — {Math.round(a.matchScore)}% match · {fmt(a.createdAt)}
            </option>
          ))}
        </select>
        {analyses?.length === 0 && !analysesLoading && (
          <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', margin: '4px 0 0' }}>
            No analyses yet. Run a JD analysis first.
          </p>
        )}
      </div>

      <div className="rl-form-group">
        <label className="rl-form-label">Template Type</label>
        <select className="rl-form-select" value={templateType} onChange={e => setTemplateType(e.target.value)}>
          {[
            { value: 'fullstack', label: 'Fullstack' },
            { value: 'frontend',  label: 'Frontend' },
            { value: 'backend',   label: 'Backend' },
            { value: 'custom',    label: 'Custom' },
          ].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {parsed.length > 0 && (
        <div className="rl-form-group">
          <label className="rl-form-label">Base Resume (optional)</label>
          <select className="rl-form-select" value={baseResumeId} onChange={e => setBaseResumeId(e.target.value)}>
            <option value="">Use canonical profile only</option>
            {parsed.map(r => <option key={r.id} value={r.id}>{r.title || r.fileName}</option>)}
          </select>
        </div>
      )}

      <button
        className="rf-btn rf-btn--primary"
        style={{ width: '100%' }}
        disabled={!canGenerate}
        onClick={() => onGenerate({ analysisId, templateType, baseResumeId: baseResumeId || undefined })}
      >
        {generateLoading
          ? <><Loader size={14} className="rf-spin" /> Generating…</>
          : <><Sparkles size={14} /> Generate Resume</>
        }
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GeneratedPage() {
  const {
    resumes, resumesLoading, loadResumes,
    analyses, analysesLoading, loadAnalyses,
    generatedResumes, generatedLoading,
    selectedGenerated, selectedGeneratedLoading,
    generateLoading,
    loadGenerated, loadGeneratedById, generateResume, deleteGenerated, downloadPdf,
    setSelectedGenerated,
  } = useResumeLab();

  const { navigateTo } = useRouter();
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadGenerated();
    loadResumes();
    loadAnalyses();
  }, [loadGenerated, loadResumes, loadAnalyses]);

  async function handleSelect(item) {
    if (selectedGenerated?.id === item.id) return;
    await loadGeneratedById(item.id);
  }

  async function handleDownload(id, filename) {
    setDownloading(true);
    try {
      await downloadPdf(id, filename);
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete(id) {
    await deleteGenerated(id);
  }

  async function handleGenerate(payload) {
    const result = await generateResume(payload);
    if (result?.generatedResumeId) {
      await loadGeneratedById(result.generatedResumeId);
    }
  }

  return (
    <div className="rl-page">
      <div className="rl-page__header">
        <div className="rl-page__header-left">
          <h1 className="rl-page__title">Generated Resumes</h1>
          <p className="rl-page__subtitle">Versioned ATS-optimized resumes, each tailored to a specific job description.</p>
        </div>
      </div>

      {/* Generate form when no generated resumes yet */}
      {!generatedLoading && generatedResumes.length === 0 && (
        <div style={{ marginBottom: 32 }}>
          <GenerateForm
            analyses={analyses}
            analysesLoading={analysesLoading}
            resumes={resumes}
            generateLoading={generateLoading}
            onGenerate={handleGenerate}
          />
        </div>
      )}

      {generatedLoading && generatedResumes.length === 0 ? (
        <div className="rl-gen-layout">
          <div className="rl-gen-list">
            <div className="rl-gen-list__header">History</div>
            <ListSkeleton />
          </div>
          <DetailSkeleton />
        </div>
      ) : generatedResumes.length > 0 ? (
        <div className="rl-gen-layout">

          {/* List column */}
          <div>
            <div className="rl-gen-list">
              <div className="rl-gen-list__header">
                Version History ({generatedResumes.length})
              </div>
              {generatedResumes.map(item => (
                <div
                  key={item.id}
                  className={`rl-gen-item${selectedGenerated?.id === item.id ? ' rl-gen-item--active' : ''}`}
                  onClick={() => handleSelect(item)}
                >
                  <div className="rl-gen-item__top">
                    <span className={`rl-badge rl-badge--${item.templateType}`}>
                      {TEMPLATE_LABEL[item.templateType] || item.templateType}
                    </span>
                    <span className="rl-gen-item__date">{fmt(item.createdAt)}</span>
                  </div>
                  <ScoreDelta before={item.matchScoreBefore} after={item.matchScoreAfter} />
                  {!item.hasPdf && item.status === 'generated' && (
                    <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-warning-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={10} /> No PDF
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Quick generate more */}
            <div style={{ marginTop: 12 }}>
              <GenerateForm
                analyses={analyses}
                analysesLoading={analysesLoading}
                resumes={resumes}
                generateLoading={generateLoading}
                onGenerate={handleGenerate}
              />
            </div>
          </div>

          {/* Detail column */}
          <div>
            {selectedGeneratedLoading ? (
              <DetailSkeleton />
            ) : selectedGenerated ? (
              <GeneratedDetail
                item={selectedGenerated}
                loading={selectedGeneratedLoading}
                onDownload={handleDownload}
                onDelete={handleDelete}
                downloading={downloading}
              />
            ) : (
              <div className="rl-empty" style={{ background: 'var(--rf-bg-canvas)', border: '1px solid var(--rf-border-subtle)', borderRadius: 'var(--rf-radius-lg)' }}>
                <div className="rl-empty__icon"><FileOutput size={22} /></div>
                <p className="rl-empty__title">Select a version</p>
                <p className="rl-empty__body">Click any generated resume on the left to see its details, download the PDF, or view the LaTeX source.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
