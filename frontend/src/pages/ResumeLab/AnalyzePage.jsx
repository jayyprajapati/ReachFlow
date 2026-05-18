import React, { useEffect, useState, useCallback } from 'react';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  Microscope, Loader, X, ClipboardCopy, CheckCheck,
  TrendingUp, AlertCircle, Lightbulb, MinusCircle, Info,
  ChevronDown, ChevronUp, History,
} from 'lucide-react';

const TEMPLATE_OPTIONS = [
  { value: 'fullstack', label: 'Fullstack' },
  { value: 'frontend',  label: 'Frontend' },
  { value: 'backend',   label: 'Backend' },
  { value: 'custom',    label: 'Custom' },
];

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 120 }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(score / 100, 1) * circ;
  const color = score >= 70
    ? 'var(--rf-success)'
    : score >= 40
    ? 'var(--rf-warning)'
    : 'var(--rf-error)';

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--rf-bg-overlay)" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'var(--rf-font-display)', fontWeight: 700, fontSize: size * 0.22, lineHeight: 1, color: 'var(--rf-text)' }}>
          {Math.round(score)}
        </span>
        <span style={{ fontSize: size * 0.12, color: 'var(--rf-text-muted)', fontWeight: 600 }}>/ 100</span>
      </div>
    </div>
  );
}

// ── Keyword chips ─────────────────────────────────────────────────────────────

function KwChips({ items, variant, label, icon: Icon }) {
  const [copied, setCopied] = useState('');
  if (!items || !items.length) return null;

  function copy(word) {
    navigator.clipboard?.writeText(word).catch(() => {});
    setCopied(word);
    setTimeout(() => setCopied(''), 1500);
  }

  return (
    <div className="rl-kw-section">
      <div className="rl-kw-section__title">
        {Icon && <Icon size={12} />}
        {label} <span style={{ fontWeight: 400, color: 'var(--rf-text-faint)' }}>({items.length})</span>
      </div>
      <div className="rl-kw-chips">
        {items.map((kw, i) => (
          <span
            key={i}
            className={`rl-kw-chip rl-kw-chip--${variant} rl-kw-chip--copy`}
            title="Click to copy"
            onClick={() => copy(kw)}
          >
            {copied === kw ? <CheckCheck size={10} /> : null}
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Section rewrites ──────────────────────────────────────────────────────────

function SectionRewrites({ rewrites }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(rewrites || {}).filter(k => rewrites[k]);
  if (!keys.length) return null;

  return (
    <div className="rl-kw-section">
      <div className="rl-kw-section__title" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => setOpen(v => !v)}>
        <span><Lightbulb size={12} /> Section Rewrites ({keys.length})</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>
      {open && keys.map(k => (
        <div key={k} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 'var(--rf-text-xs)', fontWeight: 700, color: 'var(--rf-text-secondary)', textTransform: 'capitalize', marginBottom: 4 }}>{k}</div>
          <div style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text)', background: 'var(--rf-bg-root)', borderRadius: 'var(--rf-radius-md)', padding: '10px 12px', lineHeight: 1.6 }}>
            {typeof rewrites[k] === 'string' ? rewrites[k] : JSON.stringify(rewrites[k])}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── History sidebar item ──────────────────────────────────────────────────────

function HistoryItem({ item, active, onClick }) {
  const score = item.matchScore || 0;
  const color = score >= 70 ? 'var(--rf-success-text)' : score >= 40 ? 'var(--rf-warning-text)' : 'var(--rf-error-text)';
  return (
    <div className={`rl-history-item${active ? ' rl-history-item--active' : ''}`} onClick={onClick}>
      <div className="rl-history-item__score" style={{ color }}>{Math.round(score)}%</div>
      <div className="rl-history-item__info">
        <div className="rl-history-item__title">{item.jobTitle || item.company || 'Analysis'}</div>
        <div className="rl-history-item__date">{fmt(item.createdAt)}</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const {
    resumes, resumesLoading, loadResumes,
    analyses, analysesLoading, activeAnalysis, analyzeLoading,
    loadAnalyses, analyzeJD, loadAnalysis, setActiveAnalysis,
    generateLoading,
  } = useResumeLab();

  const { navigateTo } = useRouter();

  const [jd, setJd] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [baseResumeId, setBaseResumeId] = useState('');
  const [templateType, setTemplateType] = useState('fullstack');

  useEffect(() => {
    loadResumes();
    loadAnalyses();
  }, [loadResumes, loadAnalyses]);

  async function handleAnalyze() {
    if (!jd.trim()) return;
    await analyzeJD({ jobDescription: jd, baseResumeId: baseResumeId || undefined, jobTitle, company, templateType });
  }

  async function handleHistoryClick(item) {
    await loadAnalysis(item.id);
  }

  const result = activeAnalysis;
  const canAnalyze = jd.trim().length > 20 && !analyzeLoading;

  const parsedResumes = resumes.filter(r => r.status === 'parsed');

  return (
    <div className="rl-page">
      <div className="rl-page__header">
        <div className="rl-page__header-left">
          <h1 className="rl-page__title">JD Analyzer</h1>
          <p className="rl-page__subtitle">Paste a job description to see your match score and exactly what's missing.</p>
        </div>
      </div>

      <div className="rl-analyze-layout">

        {/* ── Left: Input ── */}
        <div className="rl-panel">
          <p className="rl-panel__title">Job Description</p>

          <div className="rl-form-group">
            <textarea
              className="rl-jd-textarea"
              placeholder="Paste the full job description here…"
              value={jd}
              onChange={e => setJd(e.target.value)}
            />
            {jd && (
              <button
                style={{ alignSelf: 'flex-end', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rf-text-faint)', fontSize: 'var(--rf-text-xs)', display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => setJd('')}
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>

          <div className="rl-form-group">
            <label className="rl-form-label">Job Title (optional)</label>
            <input className="rl-form-input" placeholder="e.g. Senior Frontend Engineer" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
          </div>

          <div className="rl-form-group">
            <label className="rl-form-label">Company (optional)</label>
            <input className="rl-form-input" placeholder="e.g. Acme Corp" value={company} onChange={e => setCompany(e.target.value)} />
          </div>

          {parsedResumes.length > 0 && (
            <div className="rl-form-group">
              <label className="rl-form-label">Base Resume</label>
              <select className="rl-form-select" value={baseResumeId} onChange={e => setBaseResumeId(e.target.value)}>
                <option value="">Use canonical profile only</option>
                {parsedResumes.map(r => (
                  <option key={r.id} value={r.id}>{r.title || r.fileName}</option>
                ))}
              </select>
            </div>
          )}

          <div className="rl-form-group">
            <label className="rl-form-label">Template Type</label>
            <select className="rl-form-select" value={templateType} onChange={e => setTemplateType(e.target.value)}>
              {TEMPLATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <button
            className="rf-btn rf-btn--primary"
            style={{ width: '100%' }}
            onClick={handleAnalyze}
            disabled={!canAnalyze}
          >
            {analyzeLoading
              ? <><Loader size={14} className="rf-spin" /> Analyzing…</>
              : <><Microscope size={14} /> Analyze Match</>
            }
          </button>
        </div>

        {/* ── Center: Results ── */}
        <div>
          {analyzeLoading && (
            <div className="rl-panel" style={{ alignItems: 'center', padding: '40px 20px' }}>
              <Loader size={28} className="rf-spin" style={{ color: 'var(--rf-accent)' }} />
              <p style={{ color: 'var(--rf-text-muted)', margin: 0, fontSize: 'var(--rf-text-sm)' }}>Analyzing your profile against the JD…</p>
            </div>
          )}

          {!analyzeLoading && !result && (
            <div className="rl-empty" style={{ background: 'var(--rf-bg-canvas)', border: '1px solid var(--rf-border-subtle)', borderRadius: 'var(--rf-radius-lg)', padding: '60px 24px' }}>
              <div className="rl-empty__icon"><Microscope size={22} /></div>
              <p className="rl-empty__title">No analysis yet</p>
              <p className="rl-empty__body">Paste a job description and click Analyze Match to see your score and keyword gaps.</p>
            </div>
          )}

          {!analyzeLoading && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Score ring */}
              <div className="rl-panel">
                <div className="rl-score-wrap">
                  <ScoreRing score={result.matchScore || 0} size={130} />
                  <div className="rl-score-label">ATS Match Score</div>
                  {result.seniority && (
                    <span className="rl-badge" style={{ background: 'var(--rf-bg-overlay)', color: 'var(--rf-text-secondary)' }}>
                      {result.seniority}
                    </span>
                  )}
                </div>
                {result.domain && (
                  <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', textAlign: 'center', margin: '0 0 4px', fontStyle: 'italic' }}>
                    {result.domain}
                  </p>
                )}
              </div>

              {/* Keywords panel */}
              <div className="rl-panel" style={{ gap: 18 }}>
                <KwChips items={result.missingKeywords} variant="missing"  label="Missing Keywords"       icon={AlertCircle} />
                <KwChips items={result.existingButMissingFromResume} variant="omitted" label="In Profile, Not in Resume" icon={Info} />
                <KwChips items={result.recommendedAdditions} variant="add"     label="Recommended Additions"  icon={TrendingUp} />
                <KwChips items={result.recommendedRemovals}  variant="remove"  label="Recommended Removals"   icon={MinusCircle} />
                <SectionRewrites rewrites={result.sectionRewrites} />
              </div>

              {/* Generate CTA */}
              <button
                className="rf-btn rf-btn--primary"
                style={{ width: '100%' }}
                onClick={() => navigateTo('/resume-lab/generated')}
                disabled={generateLoading}
              >
                {generateLoading
                  ? <><Loader size={14} className="rf-spin" /> Generating…</>
                  : 'Generate Optimized Resume →'
                }
              </button>

            </div>
          )}
        </div>

        {/* ── Right: Actions + History ── */}
        <div className="rl-analyze-actions">
          <div className="rl-panel" style={{ gap: 12 }}>
            <p className="rl-panel__title"><History size={13} style={{ display: 'inline', marginRight: 5 }} />Analysis History</p>

            {analysesLoading ? (
              <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                {[...Array(3)].map((_, i) => <div key={i} className="rl-skeleton" style={{ height: 44, borderRadius: 8 }} />)}
              </div>
            ) : analyses.length === 0 ? (
              <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', margin: 0 }}>
                No analyses yet. Run your first analysis to see history here.
              </p>
            ) : (
              <div className="rl-history-list">
                {analyses.map(item => (
                  <HistoryItem
                    key={item.id}
                    item={item}
                    active={result?.analysisId === item.id}
                    onClick={() => handleHistoryClick(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
