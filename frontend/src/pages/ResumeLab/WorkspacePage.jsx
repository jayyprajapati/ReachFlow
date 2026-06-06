import React, { useEffect, useRef, useState } from 'react';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  Microscope, Loader, X, TrendingUp, AlertCircle, Info, MinusCircle,
  Sparkles, Download, CheckCheck,
  CheckCircle2, Code2, Copy, FileText, Zap, Mail, ExternalLink, Briefcase,
  Vault, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';

const RESUME_GENERATION_ENABLED = true;

const INTENSITY_OPTIONS = [
  { value: 'minor',    label: 'Minor',    desc: 'Tweak phrasing and slot in missing keywords. Preserve structure and voice.' },
  { value: 'balanced', label: 'Balanced', desc: 'Rewrite bullets and summary where it materially improves alignment.' },
  { value: 'major',    label: 'Major',    desc: 'Restructure sections and rebuild around the JD\'s priority skills.' },
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

// ── Experience match chip ─────────────────────────────────────────────────────

function ExperienceMatchChip({ mentionsYears, requiredMin, requiredMax, candidate }) {
  if (!mentionsYears || !requiredMin) return null;
  const have = Number(candidate) || 0;
  const min = Number(requiredMin) || 0;
  const max = Number(requiredMax) || 0;
  const required = max ? `${min}–${max}` : `${min}+`;

  let tone, verdict;
  if (have >= min && (!max || have <= max + 2)) { tone = 'ok'; verdict = 'Strong match'; }
  else if (max && have > max + 2)               { tone = 'warn'; verdict = 'Likely overqualified'; }
  else if (have >= min - 1)                     { tone = 'warn'; verdict = 'Borderline match'; }
  else if (have < Math.max(1, Math.floor(min / 2))) { tone = 'err'; verdict = 'Significant gap'; }
  else                                          { tone = 'warn'; verdict = 'Below required'; }

  const bg = tone === 'ok' ? 'var(--rf-success-muted)'
           : tone === 'warn' ? 'var(--rf-warning-muted)'
           : 'var(--rf-error-muted)';
  const color = tone === 'ok' ? 'var(--rf-success-text)'
              : tone === 'warn' ? 'var(--rf-warning-text)'
              : 'var(--rf-error-text)';
  const border = tone === 'ok' ? 'rgba(64, 160, 96, 0.32)'
               : tone === 'warn' ? 'rgba(232, 146, 68, 0.32)'
               : 'rgba(207, 76, 76, 0.32)';

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px 4px 8px', borderRadius: 20,
      background: bg, border: `1px solid ${border}`, color,
      fontSize: 'var(--rf-text-xs)', fontWeight: 500, alignSelf: 'flex-start',
    }}>
      <Briefcase size={12} style={{ flexShrink: 0 }} />
      <strong style={{ fontWeight: 700 }}>{verdict}</strong>
      <span style={{ opacity: 0.7 }}>·</span>
      <span>JD {required} yrs · ~{have} yr{have === 1 ? '' : 's'}</span>
    </div>
  );
}

// ── Generate Resume Modal (Modify Existing | From Scratch) ───────────────────

function GenerateModal({ analysisId, onGenerate, onClose, loading, vaultResumes }) {
  const [mode, setMode] = useState('scratch');          // 'modify' | 'scratch'
  const vaultWithLatexInit = (vaultResumes || []).filter(r => r.hasLatex);
  const [modifySource, setModifySource] = useState(vaultWithLatexInit.length > 0 ? 'vault' : 'temp');
  const [selectedResumeId, setSelectedResumeId] = useState(vaultWithLatexInit[0]?.id || '');
  const [latexSource, setLatexSource] = useState('');
  const [intensity, setIntensity] = useState('balanced');
  const [userPrompt, setUserPrompt] = useState('');

  const vaultWithLatex = vaultWithLatexInit;

  const resolvedLatex = mode === 'modify'
    ? (modifySource === 'vault'
        ? (vaultResumes || []).find(r => r.id === selectedResumeId)?.latexSource || ''
        : latexSource)
    : '';

  const canGenerate =
    !loading &&
    !!analysisId &&
    (mode === 'scratch' || resolvedLatex.trim().length > 0);

  function handleSubmit() {
    onGenerate({
      analysisId,
      mode,
      latexSource: mode === 'modify' ? resolvedLatex : undefined,
      intensity,
      userPrompt: userPrompt.trim() || undefined,
    });
  }

  return (
    <div className="rf-dialog-overlay" onClick={loading ? undefined : onClose}>
      <div className="rf-dialog" style={{ maxWidth: 620, width: '92vw' }} onClick={e => e.stopPropagation()}>
        <div className="rf-dialog__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} /> Generate Resume
          {loading && <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', fontWeight: 400, marginLeft: 'auto' }}>Generating — please wait…</span>}
        </div>
        <div className="rf-dialog__body" style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: loading ? 0.6 : 1, pointerEvents: loading ? 'none' : undefined }}>

          {/* Mode tab switch */}
          <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--rf-bg-overlay)', borderRadius: 'var(--rf-radius-md)' }}>
            {[
              { value: 'modify',  label: 'Modify Existing', desc: 'Edit your current LaTeX with JD-driven suggestions' },
              { value: 'scratch', label: 'From Scratch',    desc: 'Build a new resume from your Career Profile' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                disabled={loading}
                className={`rf-btn ${mode === opt.value ? 'rf-btn--primary' : 'rf-btn--ghost'} rf-btn--sm`}
                style={{ flex: 1, justifyContent: 'center' }}
                title={opt.desc}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* LaTeX source — only for modify */}
          {mode === 'modify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Sub-mode: vault vs temp */}
              <div style={{ display: 'flex', gap: 12 }}>
                {vaultWithLatex.length > 0 && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: loading ? 'default' : 'pointer', fontSize: 'var(--rf-text-sm)', fontWeight: 500, color: 'var(--rf-text)' }}>
                    <input type="radio" name="modifySource" value="vault" checked={modifySource === 'vault'} onChange={() => setModifySource('vault')} disabled={loading} />
                    <Vault size={13} /> Pick from Vault
                  </label>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: loading ? 'default' : 'pointer', fontSize: 'var(--rf-text-sm)', fontWeight: 500, color: 'var(--rf-text)' }}>
                  <input type="radio" name="modifySource" value="temp" checked={modifySource === 'temp'} onChange={() => setModifySource('temp')} disabled={loading} />
                  <Code2 size={13} /> Paste temporarily
                </label>
              </div>

              {modifySource === 'vault' && vaultWithLatex.length > 0 && (
                <div className="rl-form-group">
                  <label className="rl-form-label">Resume with LaTeX attached</label>
                  <select
                    className="rl-form-select"
                    value={selectedResumeId}
                    onChange={e => setSelectedResumeId(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Select a resume…</option>
                    {vaultWithLatex.map(r => (
                      <option key={r.id} value={r.id}>{r.title || r.fileName}</option>
                    ))}
                  </select>
                </div>
              )}

              {modifySource === 'temp' && (
                <div className="rl-form-group">
                  <label className="rl-form-label">Paste your current LaTeX source</label>
                  <textarea
                    className="rl-form-input"
                    style={{
                      minHeight: 160, resize: 'vertical',
                      fontFamily: 'var(--rf-font-mono)', fontSize: 12, lineHeight: 1.5,
                    }}
                    placeholder={'\\documentclass{article}\n…'}
                    value={latexSource}
                    onChange={e => setLatexSource(e.target.value)}
                    disabled={loading}
                    spellCheck={false}
                  />
                  <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', margin: '4px 0 0' }}>
                    This LaTeX won't be saved. To store it permanently, attach it to a resume in the <strong>Vault</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Intensity */}
          <div>
            <div className="rl-form-label" style={{ marginBottom: 8 }}>How much should the AI change?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {INTENSITY_OPTIONS.map(opt => (
                <label key={opt.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: loading ? 'default' : 'pointer' }}>
                  <input type="radio" name="intensity" value={opt.value} checked={intensity === opt.value} onChange={() => setIntensity(opt.value)} style={{ marginTop: 2 }} disabled={loading} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text)' }}>{opt.label}</span>
                    <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', marginLeft: 8 }}>{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Free-form prompt */}
          <div className="rl-form-group">
            <label className="rl-form-label">Extra instructions for the AI (optional)</label>
            <textarea
              className="rl-form-input"
              style={{ minHeight: 72, resize: 'vertical' }}
              placeholder="e.g. Emphasize backend infra work, drop the freelance section, keep it one page."
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
              maxLength={1000}
              disabled={loading}
            />
          </div>
        </div>

        <div className="rf-dialog__actions">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={onClose}>Cancel</button>
          <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={handleSubmit} disabled={!canGenerate}>
            {loading ? <><Loader size={13} className="rf-spin" /> Generating…</> : <><Sparkles size={13} /> Generate</>}
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
  const prevKeyRef = useRef(undefined);
  const blobUrlRef = useRef(null);

  // Sync editor content when a new generation loads.
  // Use _genKey (set for each new generation) so even two scratch generations
  // with id=null correctly update the editor.
  useEffect(() => {
    const newKey = result?._genKey ?? result?.id ?? null;
    if (prevKeyRef.current === newKey) return;
    prevKeyRef.current = newKey;
    setLatexCode(result?.latexSource || '');
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    setPdfBlobUrl(null);
  }, [result?._genKey, result?.id, result?.latexSource]);

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
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const {
    api,
    resumes, loadResumes,
    activeAnalysis, analyzeLoading,
    analyzeJD, cancelAnalyze, setActiveAnalysis,
    generateLoading, generateFromLatex, downloadPdf,
    fetchPdfBlob, compileLatex,
    jdText, setJdText,
    activeGenerated, setActiveGenerated,
  } = useResumeLab();
  const { API_BASE, authedFetch, setNotice } = useApp();
  const { navigateTo } = useRouter();

  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [baseResumeId, setBaseResumeId] = useState('');
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmNewAnalysis, setConfirmNewAnalysis] = useState(false);
  const [latexOpen, setLatexOpen] = useState(false);
  const [coverLetterText, setCoverLetterText] = useState('');
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [hrEmailDraft, setHrEmailDraft] = useState(null);
  const [hrEmailLoading, setHrEmailLoading] = useState(false);
  const [flowRestoring, setFlowRestoring] = useState(false);

  // Prefill workspace from a history flow when ?flow=<id> is in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flowId = params.get('flow');
    if (!flowId || !api) return;

    setFlowRestoring(true);
    api.getFlow(flowId)
      .then(data => {
        if (data.analysis?.jobDescriptionRaw) setJdText(data.analysis.jobDescriptionRaw);
        if (data.analysis) {
          setActiveAnalysis({
            analysisId: data.analysis.id,
            matchScore: data.analysis.matchScore,
            jobTitle: data.analysis.jobTitle || '',
            company: data.analysis.company || '',
            missingKeywords: data.analysis.missingKeywords || [],
            existingButMissingFromResume: data.analysis.existingButMissingFromResume || [],
            recommendedAdditions: data.analysis.recommendedAdditions || [],
            recommendedRemovals: data.analysis.recommendedRemovals || [],
            atsKeywordClusters: data.analysis.atsKeywordClusters || {},
            mentionsYears: !!data.analysis.mentionsYears,
            requiredYearsMin: data.analysis.requiredYearsMin || 0,
            requiredYearsMax: data.analysis.requiredYearsMax || 0,
            candidateYearsEstimate: data.analysis.candidateYearsEstimate || 0,
          });
        }
        if (data.generation?.generatedContent) {
          setActiveGenerated(data.generation);
        }
        // Clear the flow param from the URL without reloading
        const clean = window.location.pathname;
        window.history.replaceState({}, '', clean);
      })
      .catch(err => {
        console.warn('[workspace] Flow restore failed:', err.message);
      })
      .finally(() => setFlowRestoring(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  useEffect(() => {
    setCoverLetterText('');
    setHrEmailDraft(null);
  }, [activeAnalysis?.analysisId]);

  useEffect(() => {
    if (activeGenerated?.latexSource) setLatexOpen(true);
  }, [activeGenerated?.latexSource]);

  async function handleAnalyze() {
    if (!jdText.trim()) return;
    setActiveGenerated(null);
    await analyzeJD({ jobDescription: jdText, baseResumeId: baseResumeId || undefined, jobTitle, company });
  }

  async function handleGenerate(payload) {
    try {
      const result = await generateFromLatex(payload);
      if (result?.latex) {
        setActiveGenerated({
          id: null,
          _genKey: Date.now(),  // unique key per generation to force editor sync
          latexSource: result.latex,
          pdfUrl: null,
          hasPdf: false,
          matchScoreBefore: activeAnalysis?.matchScore || 0,
          matchScoreAfter:  activeAnalysis?.matchScore || 0,
        });
        setShowStrategyModal(false);
      } else if (result !== null) {
        // result was returned but has no latex — context already showed error toast
      }
    } catch {
      /* toast handled by context */
    }
  }

  async function handleDownload(id, filename) {
    setDownloading(true);
    try { await downloadPdf(id, filename); } finally { setDownloading(false); }
  }

  async function handleGenerateCoverLetter() {
    if (!activeAnalysis?.analysisId) return;
    setCoverLetterLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/resumelab/generate-cover-letter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: activeAnalysis.analysisId }),
      });
      const d = await res.json();
      if (!res.ok) { setNotice({ type: 'error', message: d.error || 'Cover letter generation failed' }); return; }
      setCoverLetterText(d.coverLetterText || '');
    } catch (e) {
      setNotice({ type: 'error', message: e.message });
    } finally {
      setCoverLetterLoading(false);
    }
  }

  async function handleGenerateHrEmail() {
    if (!activeAnalysis?.analysisId) return;
    setHrEmailLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/resumelab/generate-hr-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: activeAnalysis.analysisId }),
      });
      const d = await res.json();
      if (!res.ok) { setNotice({ type: 'error', message: d.error || 'HR email generation failed' }); return; }
      setHrEmailDraft({ subject: d.subject || '', body: d.body || '' });
    } catch (e) {
      setNotice({ type: 'error', message: e.message });
    } finally {
      setHrEmailLoading(false);
    }
  }

  function handleOpenInCompose() {
    if (!hrEmailDraft) return;
    try {
      sessionStorage.setItem('rf_compose_prefill', JSON.stringify({
        subject: hrEmailDraft.subject,
        body_html: `<p>${hrEmailDraft.body.replace(/\n/g, '</p><p>')}</p>`,
      }));
    } catch {}
    navigateTo('/');
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
          <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => setConfirmNewAnalysis(true)}>
            <RefreshCw size={13} /> New Analysis
          </button>
        )}
      </div>

      {/* ── Input row — hidden while loading or results are shown ── */}
      {!hasResult && !analyzeLoading && (
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
        <div className="rl-panel" style={{ alignItems: 'center', padding: '48px 24px', gap: 16 }}>
          <Loader size={28} className="rf-spin" style={{ color: 'var(--rf-accent)' }} />
          <p style={{ color: 'var(--rf-text-muted)', margin: 0, fontSize: 'var(--rf-text-sm)' }}>
            Analyzing your profile against the JD…
          </p>
          <button
            className="rf-btn rf-btn--ghost rf-btn--sm"
            onClick={() => { cancelAnalyze(); }}
          >
            <X size={13} /> Cancel
          </button>
        </div>
      )}

      {/* ── Results: keywords + score row ── */}
      {hasResult && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Left: keyword insights */}
          <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(activeAnalysis.seniority || activeAnalysis.domain) && (
              <div className="rl-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'nowrap', padding: '10px 16px' }}>
                {activeAnalysis.seniority && <span className="rl-badge" style={{ background: 'var(--rf-bg-overlay)', color: 'var(--rf-text-secondary)', flexShrink: 0 }}>{activeAnalysis.seniority}</span>}
                {activeAnalysis.domain && <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeAnalysis.domain}</span>}
              </div>
            )}
            <ExperienceMatchChip
              mentionsYears={activeAnalysis.mentionsYears}
              requiredMin={activeAnalysis.requiredYearsMin}
              requiredMax={activeAnalysis.requiredYearsMax}
              candidate={activeAnalysis.candidateYearsEstimate}
            />
            <div className="rl-panel" style={{ gap: 18 }}>
              <KwChips items={activeAnalysis.existingButMissingFromResume}  variant="omitted"  label="Suggested Keywords"          icon={Info} />
              <KwChips items={activeAnalysis.missingKeywords}               variant="missing"  label="Missing Keywords (Skill Gap)" icon={AlertCircle} />
              <KwChips items={activeAnalysis.recommendedAdditions}          variant="add"      label="Recommended Additions"       icon={TrendingUp} />
              <KwChips items={activeAnalysis.recommendedRemovals}           variant="remove"   label="Recommended Removals"        icon={MinusCircle} />
            </div>
          </div>

          {/* Right: score + generate actions */}
          <div style={{ flex: '0 1 260px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="rl-panel" style={{ alignItems: 'center', gap: 8 }}>
              <ScoreRing score={activeAnalysis.matchScore || 0} size={120} />
              <div className="rl-score-label">ATS Match Score</div>
            </div>

            {RESUME_GENERATION_ENABLED && !activeGenerated && (
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

            {RESUME_GENERATION_ENABLED && activeGenerated && (
              <div className="rl-panel" style={{ gap: 10 }}>
                <div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 12px', borderRadius: 20,
                    background: 'var(--rf-accent)', color: '#fff',
                    fontWeight: 600, fontSize: 'var(--rf-text-xs)',
                  }}>
                    <CheckCircle2 size={12} /> Generated
                  </span>
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

            {RESUME_GENERATION_ENABLED && activeGenerated && (
              <button
                className="rf-btn rf-btn--secondary"
                style={{ width: '100%' }}
                onClick={() => setShowStrategyModal(true)}
                disabled={generateLoading}
              >
                <Sparkles size={14} /> Regenerate
              </button>
            )}

            {/* Cover Letter + HR Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                className="rf-btn rf-btn--ghost rf-btn--sm"
                style={{ width: '100%' }}
                onClick={handleGenerateCoverLetter}
                disabled={coverLetterLoading}
              >
                {coverLetterLoading ? <><Loader size={13} className="rf-spin" /> Generating…</> : <><FileText size={13} /> Generate Cover Letter</>}
              </button>
              <button
                className="rf-btn rf-btn--ghost rf-btn--sm"
                style={{ width: '100%' }}
                onClick={handleGenerateHrEmail}
                disabled={hrEmailLoading}
              >
                {hrEmailLoading ? <><Loader size={13} className="rf-spin" /> Generating…</> : <><Mail size={13} /> Generate HR Email</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cover letter result */}
      {coverLetterText && (
        <div className="rl-panel" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)' }}>Cover Letter</span>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => navigator.clipboard?.writeText(coverLetterText)}><Copy size={12} /> Copy</button>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--rf-font-body)', fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-secondary)', lineHeight: 1.6, margin: 0 }}>{coverLetterText}</pre>
        </div>
      )}

      {/* HR email result */}
      {hrEmailDraft && (
        <div className="rl-panel" style={{ marginTop: coverLetterText ? 0 : 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)' }}>HR Outreach Email</span>
            <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={handleOpenInCompose}><ExternalLink size={12} /> Open in Compose</button>
          </div>
          <div style={{ marginBottom: 4 }}>
            <span className="rf-label">Subject</span>
            <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-secondary)', margin: '4px 0 12px' }}>{hrEmailDraft.subject}</p>
          </div>
          <div>
            <span className="rf-label">Body</span>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--rf-font-body)', fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-secondary)', lineHeight: 1.6, margin: '4px 0 0' }}>{hrEmailDraft.body}</pre>
          </div>
        </div>
      )}

      {/* ── LaTeX editor + PDF preview — always visible, collapsible ── */}
      {RESUME_GENERATION_ENABLED && (
        <div style={{
          marginTop: 20,
          borderRadius: 'var(--rf-radius-lg)',
          border: '1px solid var(--rf-border-subtle)',
          overflow: 'hidden',
        }}>
          <button
            onClick={() => setLatexOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '10px 14px',
              background: 'var(--rf-bg-root)',
              border: 'none',
              borderBottom: latexOpen ? '1px solid var(--rf-border-subtle)' : 'none',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: 6,
                background: 'var(--rf-accent-muted)', color: 'var(--rf-accent)',
              }}>
                <Code2 size={13} />
              </span>
              <span style={{
                fontFamily: 'var(--rf-font-mono)', fontSize: 12, fontWeight: 600,
                color: 'var(--rf-text)', letterSpacing: '0.02em',
              }}>
                LaTeX Editor &amp; PDF Preview
              </span>
              {activeGenerated?.latexSource ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 7px', borderRadius: 20,
                  background: 'var(--rf-success-muted)', color: 'var(--rf-success-text)',
                  fontSize: 10, fontWeight: 700,
                }}>
                  ● ready
                </span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--rf-text-faint)', fontFamily: 'var(--rf-font-mono)' }}>
                  // no code yet
                </span>
              )}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: 'var(--rf-text-faint)', fontFamily: 'var(--rf-font-mono)',
            }}>
              {latexOpen ? <><ChevronUp size={13} /> collapse</> : <><ChevronDown size={13} /> expand</>}
            </span>
          </button>
          {latexOpen && (
            <LatexPreviewSection
              result={activeGenerated}
              compileLatex={compileLatex}
              fetchPdfBlob={fetchPdfBlob}
            />
          )}
        </div>
      )}

      {/* ── New Analysis confirmation ── */}
      {confirmNewAnalysis && (
        <div className="rf-dialog-overlay" onClick={() => setConfirmNewAnalysis(false)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()}>
            <div className="rf-dialog__title">Start New Analysis?</div>
            <div className="rf-dialog__body">
              This will clear the current results, generated resume, and cover letter. Are you sure?
            </div>
            <div className="rf-dialog__actions">
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setConfirmNewAnalysis(false)}>Cancel</button>
              <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => {
                setActiveAnalysis(null); setActiveGenerated(null);
                setJdText(''); setJobTitle(''); setCompany(''); setBaseResumeId('');
                setCoverLetterText(''); setHrEmailDraft(null);
                setLatexOpen(false); setConfirmNewAnalysis(false);
              }}>
                <RefreshCw size={13} /> Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate Modal ── */}
      {RESUME_GENERATION_ENABLED && showStrategyModal && (
        <GenerateModal
          analysisId={activeAnalysis?.analysisId}
          onGenerate={handleGenerate}
          onClose={() => setShowStrategyModal(false)}
          loading={generateLoading}
          vaultResumes={parsedResumes}
        />
      )}
    </div>
  );
}
