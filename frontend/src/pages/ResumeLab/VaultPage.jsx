import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import {
  UploadCloud, FileText, Trash2, Star, StarOff, Tag,
  RefreshCw, Loader, CheckCircle, AlertCircle, X, Search,
  Pencil, ChevronDown,
} from 'lucide-react';

const TYPE_OPTIONS = ['frontend', 'backend', 'fullstack', 'custom'];
const STATUS_LABEL = { parsed: 'Parsed', uploaded: 'Processing', failed: 'Failed' };
const TYPE_LABEL = { frontend: 'Frontend', backend: 'Backend', fullstack: 'Fullstack', custom: 'Custom' };

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Upload Banner ─────────────────────────────────────────────────────────────

function UploadBanner({ state, onDismiss }) {
  if (state.status === 'idle') return null;
  const uploading = state.status === 'uploading';
  const done = state.status === 'done';
  const error = state.status === 'error';

  return (
    <div className={`rl-upload-banner rl-upload-banner--${state.status}`}>
      <div className="rl-upload-banner__icon">
        {uploading && <Loader size={18} className="rf-spin" style={{ color: 'var(--rf-info-text)' }} />}
        {done && <CheckCircle size={18} style={{ color: 'var(--rf-success-text)' }} />}
        {error && <AlertCircle size={18} style={{ color: 'var(--rf-error-text)' }} />}
      </div>
      <div className="rl-upload-banner__text">
        <p className="rl-upload-banner__title">
          {uploading && 'Uploading and parsing resume…'}
          {done && 'Resume parsed and merged into your profile.'}
          {error && 'Upload failed'}
        </p>
        {done && state.result && (
          <p className="rl-upload-banner__body">
            {state.result.extract_summary?.skills ?? 0} skills ·{' '}
            {state.result.extract_summary?.experience ?? 0} positions ·{' '}
            Profile v{state.result.profileVersion}
          </p>
        )}
        {error && (
          <p className="rl-upload-banner__body">{state.error}</p>
        )}
      </div>
      {!uploading && (
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rf-text-muted)', padding: '4px' }}
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ── Resume Card ───────────────────────────────────────────────────────────────

function ResumeCard({ resume, onDelete, onUpdate }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(resume.title || '');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const fn = (e) => { if (!actionsRef.current?.contains(e.target)) setActionsOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [actionsOpen]);

  function commitTitle() {
    const t = titleVal.trim();
    if (t && t !== resume.title) onUpdate(resume.id, { title: t });
    setEditingTitle(false);
  }

  function toggleBase() {
    onUpdate(resume.id, { isBaseResume: !resume.isBaseResume });
  }

  return (
    <div className={`rl-resume-card${resume.isBaseResume ? ' rl-resume-card--base' : ''}`}>
      <div className="rl-resume-card__header">
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              className="rl-inline-input rl-resume-card__title"
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              autoFocus
            />
          ) : (
            <div
              className="rl-resume-card__title"
              title="Click to rename"
              style={{ cursor: 'text' }}
              onClick={() => { setEditingTitle(true); setTitleVal(resume.title || ''); }}
            >
              {resume.title || resume.fileName || 'Untitled'}
            </div>
          )}
        </div>
        {resume.isBaseResume && (
          <Star size={13} style={{ color: 'var(--rf-accent)', flexShrink: 0 }} />
        )}
      </div>

      <div className="rl-resume-card__badges">
        <span className={`rl-badge rl-badge--${resume.type}`}>{TYPE_LABEL[resume.type] || resume.type}</span>
        <span className={`rl-badge rl-badge--${resume.status}`}>{STATUS_LABEL[resume.status] || resume.status}</span>
      </div>

      <div className="rl-resume-card__tags">
        {(resume.tags || []).map(t => (
          <span key={t} className="rl-tag">{t}</span>
        ))}
      </div>

      <div className="rl-resume-card__meta">
        <span>{fmt(resume.uploadedAt)}</span>
        {resume.fileSize > 0 && (
          <><span>·</span><span>{(resume.fileSize / 1024).toFixed(0)} KB</span></>
        )}
      </div>

      <div className="rl-resume-card__actions">
        <button
          className={`rl-card-btn${resume.isBaseResume ? ' rl-card-btn--primary' : ''}`}
          onClick={toggleBase}
          title={resume.isBaseResume ? 'Unset as base resume' : 'Set as base resume'}
        >
          {resume.isBaseResume ? <StarOff size={11} /> : <Star size={11} />}
          {resume.isBaseResume ? 'Unset Base' : 'Set Base'}
        </button>
        <button
          className="rl-card-btn"
          onClick={() => { setEditingTitle(true); setTitleVal(resume.title || ''); }}
          title="Rename"
        >
          <Pencil size={11} />
        </button>
        <button
          className="rl-card-btn rl-card-btn--danger"
          onClick={() => onDelete(resume.id, resume.title)}
          title="Delete resume"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Skeleton cards ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rl-resume-card">
      <div className="rl-skeleton" style={{ height: 18, width: '70%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <div className="rl-skeleton" style={{ height: 18, width: 64, borderRadius: 20 }} />
        <div className="rl-skeleton" style={{ height: 18, width: 52, borderRadius: 20 }} />
      </div>
      <div className="rl-skeleton" style={{ height: 12, width: '45%', marginTop: 6 }} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const {
    resumes, resumesLoading, uploadState,
    loadResumes, uploadResume, resetUploadState, updateResume, deleteResume,
  } = useResumeLab();

  const [isDragging, setIsDragging] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadResumes(); }, [loadResumes]);

  const handleFiles = useCallback((files) => {
    const file = files[0];
    if (!file) return;
    uploadResume(file);
  }, [uploadResume]);

  function onDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function onDragOver(e) { e.preventDefault(); setIsDragging(true); }
  function onDragLeave() { setIsDragging(false); }
  function onFileInput(e) { handleFiles(e.target.files); e.target.value = ''; }

  function requestDelete(id, title) {
    setConfirmDelete({ id, title });
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    await deleteResume(confirmDelete.id);
    setConfirmDelete(null);
  }

  const filtered = resumes.filter(r => {
    const matchType = typeFilter === 'all' || r.type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.title?.toLowerCase().includes(q)
      || r.fileName?.toLowerCase().includes(q)
      || (r.tags || []).some(t => t.includes(q));
    return matchType && matchSearch;
  });

  const isUploading = uploadState.status === 'uploading';

  return (
    <div className="rl-page">
      <div className="rl-page__header">
        <div className="rl-page__header-left">
          <h1 className="rl-page__title">Resume Vault</h1>
          <p className="rl-page__subtitle">Upload and manage your resumes — each one builds your Career Profile.</p>
        </div>
        <div className="rl-page__actions">
          <button
            className="rf-btn rf-btn--primary rf-btn--sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <UploadCloud size={14} />
            Upload Resume
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            style={{ display: 'none' }}
            onChange={onFileInput}
          />
        </div>
      </div>

      <UploadBanner state={uploadState} onDismiss={resetUploadState} />

      {/* Drop zone — collapsed when resumes exist and not uploading */}
      {(resumes.length === 0 || isUploading) && (
        <div
          className={`rl-drop-zone${isDragging ? ' rl-drop-zone--active' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <div className="rl-drop-zone__icon">
            {isUploading
              ? <Loader size={20} className="rf-spin" />
              : <UploadCloud size={20} />
            }
          </div>
          <p className="rl-drop-zone__title">
            {isUploading ? 'Parsing resume…' : 'Drop your resume here'}
          </p>
          {!isUploading && (
            <p className="rl-drop-zone__sub">
              PDF, DOC, or DOCX &nbsp;·&nbsp; max {import.meta.env.VITE_MAX_RESUME_MB || 10}MB
              &nbsp;·&nbsp; <span className="rl-drop-zone__browse">browse</span>
            </p>
          )}
        </div>
      )}

      {/* Small upload trigger row when resumes already exist */}
      {resumes.length > 0 && !isUploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div
            className={`rl-drop-zone${isDragging ? ' rl-drop-zone--active' : ''}`}
            style={{ padding: '14px 20px', flexDirection: 'row', marginBottom: 0, flex: 1 }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud size={16} style={{ color: 'var(--rf-accent)' }} />
            <span style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-muted)' }}>
              Drop another resume here or <span className="rl-drop-zone__browse">browse</span>
            </span>
          </div>
        </div>
      )}

      {/* Filters + search */}
      {resumes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="rl-filter-bar" style={{ marginBottom: 0 }}>
            {['all', ...TYPE_OPTIONS].map(t => (
              <button
                key={t}
                className={`rl-filter-btn${typeFilter === t ? ' rl-filter-btn--active' : ''}`}
                onClick={() => setTypeFilter(t)}
              >
                {t === 'all' ? 'All' : TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="rl-search">
            <Search size={13} style={{ color: 'var(--rf-text-faint)', flexShrink: 0 }} />
            <input
              placeholder="Search resumes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--rf-text-faint)', lineHeight: 1 }} onClick={() => setSearch('')}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Resume grid */}
      {resumesLoading && resumes.length === 0 ? (
        <div className="rl-resumes-grid">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 && resumes.length > 0 ? (
        <div className="rl-empty">
          <div className="rl-empty__icon"><FileText size={22} /></div>
          <p className="rl-empty__title">No resumes match your filter</p>
          <p className="rl-empty__body">Try clearing the search or selecting a different type.</p>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setSearch(''); setTypeFilter('all'); }}>
            Clear filters
          </button>
        </div>
      ) : resumes.length === 0 && !resumesLoading ? (
        <div className="rl-empty" style={{ paddingTop: 12 }}>
          <p className="rl-empty__title">Your vault is empty</p>
          <p className="rl-empty__body">Upload your first resume above to start building your Career Profile.</p>
        </div>
      ) : (
        <div className="rl-resumes-grid">
          {filtered.map(r => (
            <ResumeCard
              key={r.id}
              resume={r}
              onDelete={requestDelete}
              onUpdate={updateResume}
            />
          ))}
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="rf-dialog-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()}>
            <div className="rf-dialog__title">Delete Resume</div>
            <div className="rf-dialog__body">
              Delete <strong>{confirmDelete.title || 'this resume'}</strong>? The file and metadata will be permanently removed.
            </div>
            <div className="rf-dialog__actions">
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={confirmDeleteAction}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
