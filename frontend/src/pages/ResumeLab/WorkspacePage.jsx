import React, { useEffect, useRef, useState } from 'react';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import {
  Microscope, Loader, X, TrendingUp, AlertCircle, Info, MinusCircle,
  Lightbulb, ChevronDown, ChevronUp, Sparkles, Download, CheckCheck,
  CheckCircle2, Code2, Copy, FileText, Zap,
} from 'lucide-react';

const OUTPUT_FORMAT_OPTIONS = [
  { value: 'fullstack', label: 'Fullstack' },
  { value: 'frontend',  label: 'Frontend' },
  { value: 'backend',   label: 'Backend' },
  { value: 'custom',    label: 'Custom' },
];

const AGGRESSIVENESS_OPTIONS = [
  { value: 'conservative', label: 'Conservative', desc: 'Minimal changes, preserves original voice' },
  { value: 'balanced',     label: 'Balanced',     desc: 'Recommended — good keyword coverage without over-optimizing' },
  { value: 'aggressive',   label: 'Aggressive',   desc: 'Maximum keyword insertion, stronger ATS optimization' },
];

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 110 }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(score / 100, 1) * circ;
  const color = score >= 70 ? 'var(--rf-success)' : score >= 40 ? 'var(--rf-warning)' : 'var(--rf-error)';
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rf-bg-overlay)" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--rf-font-display)', fontWeight: 700, fontSize: size * 0.22, lineHeight: 1, color: 'var(--rf-text)' }}>
          {Math.round(score)}
        </span>
        <span style={{ fontSize: size * 0.13, color: 'var(--rf-text-muted)', fontWeight: 600 }}>/ 100</span>
      </div>
    </div>
  );
}

// ── Keyword chips ─────────────────────────────────────────────────────────────

function KwChips({ items, variant, label, icon: Icon }) {
  const [copied, setCopied] = useState('');
  if (!items?.length) return null;
  function copy(w) {
    navigator.clipboard?.writeText(w).catch(() => {});
    setCopied(w);
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
          <span key={i} className={`rl-kw-chip rl-kw-chip--${variant} rl-kw-chip--copy`} title="Click to copy" onClick={() => copy(kw)}>
            {copied === kw ? <CheckCheck size={10} /> : null}{kw}
          </span>
        ))}
      </div>
    </div>
  );
}

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

// ── Score delta ───────────────────────────────────────────────────────────────

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

// ── Strategy Modal ────────────────────────────────────────────────────────────

function StrategyModal({ resumes, analysisId, onGenerate, onClose, loading }) {
  const [mode, setMode] = useState('canonical_only');
  const [startingResumeId, setStartingResumeId] = useState('');
  const [outputFormat, setOutputFormat] = useState('fullstack');
  const [aggressiveness, setAggressiveness] = useState('balanced');
  const [userPrompt, setUserPrompt] = useState('');

  const parsedResumes = resumes.filter(r => r.status === 'parsed');
  const canGenerate = !loading && (mode === 'canonical_only' || startingResumeId);

  function handleSubmit() {
    onGenerate({
      analysisId,
      outputFormat,
      generationMode: mode,
      startingResumeId: startingResumeId || undefined,
      aggressiveness,
      userPrompt: userPrompt.trim() || undefined,
    });
  }

  return (
    // Outside click only closes when NOT loading
    <div className="rf-dialog-overlay" onClick={loading ? undefined : onClose}>
      <div className="rf-dialog" style={{ maxWidth: 520, width: '90vw' }} onClick={e => e.stopPropagation()}>
        <div className="rf-dialog__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} /> Generation Strategy
          {loading && <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', fontWeight: 400, marginLeft: 'auto' }}>Generating — please wait…</span>}
        </div>
        <div className="rf-dialog__body" style={{ display: 'flex', flexDirection: 'column', gap: 20, opacity: loading ? 0.6 : 1, pointerEvents: loading ? 'none' : undefined }}>

          {/* Mode */}
          <div>
            <div className="rl-form-label" style={{ marginBottom: 8 }}>Generation Mode</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { value: 'canonical_only', label: 'From Profile', desc: 'Build from your full canonical profile — most comprehensive coverage' },
                { value: 'modify_existing', label: 'Modify Existing', desc: 'Rewrite and optimize a specific resume you already have' },
              ].map(opt => (
                <label key={opt.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: loading ? 'default' : 'pointer', padding: '10px 12px', borderRadius: 'var(--rf-radius-md)', border: `1px solid ${mode === opt.value ? 'var(--rf-accent)' : 'var(--rf-border-subtle)'}`, background: mode === opt.value ? 'var(--rf-accent-faint)' : 'transparent' }}>
                  <input type="radio" name="mode" value={opt.value} checked={mode === opt.value} onChange={() => setMode(opt.value)} style={{ marginTop: 2 }} disabled={loading} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text)' }}>{opt.label}</div>
                    <div style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Starting resume — only for modify_existing */}
          {mode === 'modify_existing' && (
            <div className="rl-form-group">
              <label className="rl-form-label">Starting Resume *</label>
              <select className="rl-form-select" value={startingResumeId} onChange={e => setStartingResumeId(e.target.value)} disabled={loading}>
                <option value="">Select a resume to rewrite…</option>
                {parsedResumes.map(r => (
                  <option key={r.id} value={r.id}>{r.title || r.fileName}</option>
                ))}
              </select>
              {parsedResumes.length === 0 && (
                <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', margin: '4px 0 0' }}>
                  No parsed resumes available. Upload a resume first.
                </p>
              )}
            </div>
          )}

          {/* Output format */}
          <div className="rl-form-group">
            <label className="rl-form-label">Output Format</label>
            <select className="rl-form-select" value={outputFormat} onChange={e => setOutputFormat(e.target.value)} disabled={loading}>
              {OUTPUT_FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Aggressiveness */}
          <div>
            <div className="rl-form-label" style={{ marginBottom: 8 }}>Optimization Level</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {AGGRESSIVENESS_OPTIONS.map(opt => (
                <label key={opt.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: loading ? 'default' : 'pointer' }}>
                  <input type="radio" name="aggressiveness" value={opt.value} checked={aggressiveness === opt.value} onChange={() => setAggressiveness(opt.value)} style={{ marginTop: 2 }} disabled={loading} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text)' }}>{opt.label}</span>
                    <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', marginLeft: 8 }}>{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* User prompt */}
          <div className="rl-form-group">
            <label className="rl-form-label">Additional Instructions (optional)</label>
            <textarea
              className="rl-form-input"
              style={{ minHeight: 72, resize: 'vertical' }}
              placeholder="e.g. Emphasize leadership experience, include open-source work…"
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
              maxLength={1000}
              disabled={loading}
            />
          </div>
        </div>

        <div className="rf-dialog__actions">
          {/* Cancel always enabled — user can abort the generation */}
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={onClose}>Cancel</button>
          <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={handleSubmit} disabled={!canGenerate}>
            {loading ? <><Loader size={13} className="rf-spin" /> Generating…</> : <><Sparkles size={13} /> Generate Resume</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LaTeX + PDF split panel ───────────────────────────────────────────────────

function LatexPreviewSection({ result, compileLatex, fetchPdfBlob }) {
  const [latexCode, setLatexCode] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [compiling, setCompiling] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevIdRef = useRef(null);
  const blobUrlRef = useRef(null);

  // Sync editor content when a new generation loads
  useEffect(() => {
    const newId = result?.id ?? null;
    if (prevIdRef.current === newId) return;
    prevIdRef.current = newId;
    setLatexCode(result?.latexSource || '');
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    setPdfBlobUrl(null);
  }, [result?.id, result?.latexSource]);

  // Auto-load PDF blob if the generate step already compiled successfully
  useEffect(() => {
    if (!result?.id || !(result.pdfUrl || result.hasPdf)) return;
    fetchPdfBlob(result.id)
      .then(blob => {
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setPdfBlobUrl(url);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.id, result?.pdfUrl, result?.hasPdf]);

  useEffect(() => {
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); };
  }, []);

  function copy() {
    if (!latexCode) return;
    navigator.clipboard?.writeText(latexCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleCompile() {
    if (!latexCode.trim()) return;
    setCompiling(true);
    try {
      // If there's a generated resume record, compile against it (saves updated source + PDF).
      // Otherwise use the stateless route (custom pasted LaTeX — no DB record needed).
      const { pdfBase64 } = await compileLatex(result?.id || null, latexCode);
      if (pdfBase64) {
        const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setPdfBlobUrl(url);
      }
    } catch {
      // error toast handled by context
    } finally {
      setCompiling(false);
    }
  }

  const PANEL_HEIGHT = 620;
  const canCompile = latexCode.trim().length > 0;

  return (
    <div className="rl-panel" style={{ padding: 0, overflow: 'hidden', marginTop: 20 }}>
      <div style={{ display: 'flex', height: PANEL_HEIGHT }}>

        {/* ── Left: LaTeX editor ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rf-border-subtle)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--rf-border-subtle)', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--rf-text)' }}>
              <Code2 size={14} /> LaTeX Source
            </span>
            <button
              style={{ background: 'none', border: 'none', cursor: latexCode ? 'pointer' : 'default', color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-xs)', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 'var(--rf-radius-sm)', opacity: latexCode ? 1 : 0.4 }}
              onClick={copy}
              disabled={!latexCode}
            >
              {copied ? <><CheckCheck size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <textarea
            value={latexCode}
            onChange={e => setLatexCode(e.target.value)}
            placeholder="Generate a resume above to populate the LaTeX source…"
            style={{
              flex: 1,
              fontFamily: 'var(--rf-font-mono)',
              fontSize: 11,
              lineHeight: 1.6,
              color: 'var(--rf-text-secondary)',
              background: 'var(--rf-bg-root)',
              border: 'none',
              resize: 'none',
              padding: '12px 14px',
              outline: 'none',
            }}
            spellCheck={false}
          />
        </div>

        {/* ── Right: PDF preview ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--rf-border-subtle)', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--rf-text)' }}>
              <FileText size={14} /> PDF Preview
            </span>
            <button
              className="rf-btn rf-btn--primary rf-btn--sm"
              onClick={handleCompile}
              disabled={!canCompile || compiling}
            >
              {compiling
                ? <><Loader size={13} className="rf-spin" /> Compiling…</>
                : <><Zap size={13} /> Compile</>
              }
            </button>
          </div>
          <div style={{ flex: 1, background: 'var(--rf-bg-root)', position: 'relative', overflow: 'hidden' }}>
            {pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title="Resume PDF Preview"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--rf-text-muted)', padding: 24 }}>
                <FileText size={36} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 'var(--rf-text-sm)', margin: 0, textAlign: 'center' }}>
                  {!result?.id
                    ? 'Generate a resume above, then click Compile to preview the PDF'
                    : result?.pdfError
                    ? <><span style={{ color: 'var(--rf-error)', fontWeight: 600 }}>Compile failed:</span> {result.pdfError}</>
                    : 'Edit the LaTeX source, then click Compile to preview'
                  }
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const {
    resumes, loadResumes,
    activeAnalysis, analyzeLoading,
    analyzeJD, setActiveAnalysis,
    generateLoading, generateResume, loadGeneratedById, downloadPdf,
    fetchPdfBlob, compileLatex,
    jdText, setJdText,
    activeGenerated, setActiveGenerated,
  } = useResumeLab();

  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [baseResumeId, setBaseResumeId] = useState('');
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  async function handleAnalyze() {
    if (!jdText.trim()) return;
    setActiveGenerated(null);
    await analyzeJD({ jobDescription: jdText, baseResumeId: baseResumeId || undefined, jobTitle, company });
  }

  async function handleGenerate(payload) {
    const result = await generateResume(payload);
    if (result?.generatedResumeId) {
      const full = await loadGeneratedById(result.generatedResumeId);
      setActiveGenerated(full || result);
      setShowStrategyModal(false);
    }
  }

  async function handleDownload(id, filename) {
    setDownloading(true);
    try { await downloadPdf(id, filename); } finally { setDownloading(false); }
  }

  const canAnalyze = jdText.trim().length > 20 && !analyzeLoading;
  const hasResult = !analyzeLoading && activeAnalysis;
  const parsedResumes = resumes.filter(r => r.status === 'parsed');

  return (
    <div className="rl-page">
      <div className="rl-page__header">
        <div className="rl-page__header-left">
          <h1 className="rl-page__title">Workspace</h1>
          <p className="rl-page__subtitle">Paste a job description, analyze your match, then generate an optimized resume.</p>
        </div>
        {hasResult && (
          <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={() => { setActiveAnalysis(null); setActiveGenerated(null); }}>
            <X size={13} /> New Analysis
          </button>
        )}
      </div>

      {/* ── Input row ── */}
      {!hasResult && (
        <div className="rl-panel" style={{ marginBottom: 24 }}>
          <div className="rl-form-group">
            <label className="rl-form-label">Job Description</label>
            <div style={{ position: 'relative' }}>
              <textarea
                className="rl-jd-textarea"
                placeholder="Paste the full job description here…"
                value={jdText}
                onChange={e => setJdText(e.target.value)}
                style={{ minHeight: 180 }}
              />
              {jdText && (
                <button
                  style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rf-text-faint)', fontSize: 'var(--rf-text-xs)', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setJdText('')}
                >
                  <X size={11} /> Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="rl-form-group" style={{ flex: 1, minWidth: 160 }}>
              <label className="rl-form-label">Job Title (optional)</label>
              <input className="rl-form-input" placeholder="e.g. Senior Frontend Engineer" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
            </div>
            <div className="rl-form-group" style={{ flex: 1, minWidth: 160 }}>
              <label className="rl-form-label">Company (optional)</label>
              <input className="rl-form-input" placeholder="e.g. Acme Corp" value={company} onChange={e => setCompany(e.target.value)} />
            </div>
            {parsedResumes.length > 0 && (
              <div className="rl-form-group" style={{ flex: 1, minWidth: 180 }}>
                <label className="rl-form-label">Base Resume</label>
                <select className="rl-form-select" value={baseResumeId} onChange={e => setBaseResumeId(e.target.value)}>
                  <option value="">Use canonical profile</option>
                  {parsedResumes.map(r => <option key={r.id} value={r.id}>{r.title || r.fileName}</option>)}
                </select>
              </div>
            )}
          </div>

          <button className="rf-btn rf-btn--primary" style={{ alignSelf: 'flex-start' }} onClick={handleAnalyze} disabled={!canAnalyze}>
            {analyzeLoading
              ? <><Loader size={14} className="rf-spin" /> Analyzing…</>
              : <><Microscope size={14} /> Analyze Match</>
            }
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {analyzeLoading && (
        <div className="rl-panel" style={{ alignItems: 'center', padding: '48px 24px' }}>
          <Loader size={28} className="rf-spin" style={{ color: 'var(--rf-accent)' }} />
          <p style={{ color: 'var(--rf-text-muted)', margin: 0, fontSize: 'var(--rf-text-sm)' }}>
            Analyzing your profile against the JD…
          </p>
        </div>
      )}

      {/* ── Results: keywords + score row ── */}
      {hasResult && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Left: keyword insights */}
          <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(activeAnalysis.seniority || activeAnalysis.domain) && (
              <div className="rl-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {activeAnalysis.seniority && <span className="rl-badge" style={{ background: 'var(--rf-bg-overlay)', color: 'var(--rf-text-secondary)' }}>{activeAnalysis.seniority}</span>}
                {activeAnalysis.domain && <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', fontStyle: 'italic' }}>{activeAnalysis.domain}</span>}
              </div>
            )}
            <div className="rl-panel" style={{ gap: 18 }}>
              <KwChips items={activeAnalysis.missingKeywords}               variant="missing"  label="Missing Keywords"         icon={AlertCircle} />
              <KwChips items={activeAnalysis.existingButMissingFromResume}  variant="omitted"  label="In Profile, Not in Resume" icon={Info} />
              <KwChips items={activeAnalysis.recommendedAdditions}          variant="add"      label="Recommended Additions"     icon={TrendingUp} />
              <KwChips items={activeAnalysis.recommendedRemovals}           variant="remove"   label="Recommended Removals"      icon={MinusCircle} />
              <SectionRewrites rewrites={activeAnalysis.sectionRewrites} />
            </div>
          </div>

          {/* Right: score + generate actions */}
          <div style={{ flex: '0 1 260px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="rl-panel" style={{ alignItems: 'center', gap: 8 }}>
              <ScoreRing score={activeAnalysis.matchScore || 0} size={120} />
              <div className="rl-score-label">ATS Match Score</div>
            </div>

            {!activeGenerated && (
              <button
                className="rf-btn rf-btn--primary"
                style={{ width: '100%' }}
                onClick={() => setShowStrategyModal(true)}
                disabled={generateLoading}
              >
                {generateLoading
                  ? <><Loader size={14} className="rf-spin" /> Generating…</>
                  : <><Sparkles size={14} /> Generate Resume</>
                }
              </button>
            )}

            {activeGenerated && (
              <div className="rl-panel" style={{ gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} style={{ color: 'var(--rf-success)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text)' }}>Generated</span>
                </div>
                <ScoreDelta before={activeGenerated.matchScoreBefore} after={activeGenerated.matchScoreAfter} />
                <button
                  className="rf-btn rf-btn--primary rf-btn--sm"
                  style={{ width: '100%' }}
                  onClick={() => handleDownload(activeGenerated.id, `resume_${activeGenerated.id}.pdf`)}
                  disabled={!(activeGenerated.pdfUrl || activeGenerated.hasPdf) || downloading}
                  title={!(activeGenerated.pdfUrl || activeGenerated.hasPdf) ? 'Compile first to enable download' : 'Download PDF'}
                >
                  {downloading ? <><Loader size={13} className="rf-spin" /> Downloading…</> : <><Download size={13} /> Download PDF</>}
                </button>
              </div>
            )}

            {activeGenerated && (
              <button
                className="rf-btn rf-btn--secondary"
                style={{ width: '100%' }}
                onClick={() => setShowStrategyModal(true)}
                disabled={generateLoading}
              >
                <Sparkles size={14} /> Regenerate
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Full-width LaTeX editor + PDF preview — always visible ── */}
      <LatexPreviewSection
        result={activeGenerated}
        compileLatex={compileLatex}
        fetchPdfBlob={fetchPdfBlob}
      />

      {/* ── Strategy Modal ── */}
      {showStrategyModal && (
        <StrategyModal
          resumes={resumes}
          analysisId={activeAnalysis?.analysisId}
          onGenerate={handleGenerate}
          onClose={() => setShowStrategyModal(false)}
          loading={generateLoading}
        />
      )}
    </div>
  );
}
