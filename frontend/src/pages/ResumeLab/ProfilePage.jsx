import React, { useEffect, useState } from 'react';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import { useApp } from '../../contexts/AppContext.jsx';
import {
  RefreshCw, Loader, ChevronDown, Search, X,
  Cpu, Briefcase, FolderKanban, GraduationCap, Award, StickyNote, Check,
  Trash2, AlertTriangle,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

const SECTIONS = [
  { key: 'skills',         label: 'Skills',         icon: Cpu },
  { key: 'experience',     label: 'Experience',      icon: Briefcase },
  { key: 'projects',       label: 'Projects',        icon: FolderKanban },
  { key: 'education',      label: 'Education',       icon: GraduationCap },
  { key: 'certifications', label: 'Certifications',  icon: Award },
];

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Skill chips ───────────────────────────────────────────────────────────────

// Canonical skills are plain strings (see brainPrompts merge schema), but tolerate
// the object shape too in case the backend ever enriches them.
function skillLabel(skill) {
  if (typeof skill === 'string') return skill;
  return skill?.normalized_name || skill?.name || '';
}

function SkillsSection({ skills, query }) {
  const q = query.toLowerCase();
  const filtered = (skills || []).filter(s =>
    !q || skillLabel(s).toLowerCase().includes(q)
  );

  if (!filtered.length) return <p style={{ color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-sm)' }}>No skills found.</p>;

  return (
    <div className="rl-skills-grid">
      {filtered.map((skill, i) => {
        const label = skillLabel(skill);
        const proficiency = typeof skill === 'object' ? skill?.proficiency : null;
        return (
          <div key={skill?.canonical_key || label || i} className="rl-skill-chip">
            <span>{label}</span>
            {proficiency && (
              <span className={`rl-skill-chip__proficiency rl-skill-chip__proficiency--${proficiency.toLowerCase()}`}>
                {proficiency}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Showcase note editor (inline) ────────────────────────────────────────────

function ShowcaseNoteEditor({ section, canonicalKey, initialNote }) {
  const { authedFetch } = useApp();
  const [showEditor, setShowEditor] = useState(false);
  const [note, setNote] = useState(initialNote || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e) {
    e.stopPropagation();
    setSaving(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/resumelab/profile/item-note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, canonical_key: canonicalKey, showcase_prompt: note }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error silently ignored for now
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
      <button
        className="rf-btn rf-btn--ghost rf-btn--xs"
        style={{ fontSize: 11, color: note ? 'var(--rf-accent)' : 'var(--rf-text-muted)', gap: 4 }}
        onClick={() => setShowEditor(v => !v)}
      >
        <StickyNote size={11} /> {note ? 'Edit note' : 'Add showcase note'}
      </button>
      {showEditor && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            className="rf-input"
            rows={3}
            maxLength={800}
            placeholder="AI guidance for this item — e.g. 'Treat this as my flagship project; emphasize the A* path-finding algorithm.'"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ fontSize: 12, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="rf-btn rf-btn--primary rf-btn--xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader size={11} className="rf-spin" /> : saved ? <><Check size={11} /> Saved</> : 'Save note'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--rf-text-muted)' }}>{note.length}/800</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expandable experience row ─────────────────────────────────────────────────

function ExperienceItem({ item }) {
  const [open, setOpen] = useState(false);
  const company = item.company || '';
  const title = item.title || '';
  const dateRange = item.date_range || '';
  const bullets = item.bullets || [];

  return (
    <div className={`rl-profile-item${open ? ' rl-profile-item--expanded' : ''}`}>
      <div className="rl-profile-item__row" onClick={() => setOpen(v => !v)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rl-profile-item__name">{company}</div>
          <div className="rl-profile-item__meta">{title}{dateRange ? ` · ${dateRange}` : ''}</div>
        </div>
        <ChevronDown size={14} className="rl-profile-item__expand-icon" />
      </div>
      {open && (
        <div className="rl-profile-item__detail">
          {bullets.length > 0 && (
            <ul className="rl-profile-item__bullets">
              {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
          <ShowcaseNoteEditor section="experience" canonicalKey={item.canonical_key} initialNote={item.showcase_prompt} />
        </div>
      )}
    </div>
  );
}

// ── Expandable project row ────────────────────────────────────────────────────

function ProjectItem({ item }) {
  const [open, setOpen] = useState(false);
  const name = item.normalized_name || item.name || '';
  const techs = (item.technologies || []).join(', ');
  const desc = item.description || '';

  return (
    <div className={`rl-profile-item${open ? ' rl-profile-item--expanded' : ''}`}>
      <div className="rl-profile-item__row" onClick={() => setOpen(v => !v)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rl-profile-item__name">{name}</div>
          {techs && <div className="rl-profile-item__meta" style={{ fontFamily: 'var(--rf-font-mono)', fontSize: '11px' }}>{techs}</div>}
        </div>
        <ChevronDown size={14} className="rl-profile-item__expand-icon" />
      </div>
      {open && (
        <div className="rl-profile-item__detail">
          {desc && <p style={{ margin: '0 0 8px 0', fontSize: 'var(--rf-text-sm)' }}>{desc}</p>}
          <ShowcaseNoteEditor section="projects" canonicalKey={item.canonical_key} initialNote={item.showcase_prompt} />
        </div>
      )}
    </div>
  );
}

// ── Education row ─────────────────────────────────────────────────────────────

function EducationItem({ item }) {
  const institution = item.institution || '';
  const degree = [item.degree, item.field_of_study].filter(Boolean).join(', ');
  return (
    <div className="rl-profile-item">
      <div className="rl-profile-item__row" style={{ cursor: 'default' }}>
        <div style={{ flex: 1 }}>
          <div className="rl-profile-item__name">{institution}</div>
          <div className="rl-profile-item__meta">
            {degree}{item.date_range ? ` · ${item.date_range}` : ''}{item.gpa ? ` · GPA ${item.gpa}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cert row ──────────────────────────────────────────────────────────────────

function CertItem({ item }) {
  const name = item.normalized_name || item.name || String(item);
  return (
    <div className="rl-profile-item">
      <div className="rl-profile-item__row" style={{ cursor: 'default' }}>
        <div className="rl-profile-item__name">{name}</div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[100, 80, 110, 90, 70].map((w, i) => (
          <div key={i} className="rl-stat-card" style={{ minWidth: w }}>
            <div className="rl-skeleton" style={{ height: 28, width: '60%', marginBottom: 6 }} />
            <div className="rl-skeleton" style={{ height: 12, width: '80%' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[70, 90, 80, 90, 110].map((w, i) => (
          <div key={i} className="rl-skeleton" style={{ height: 30, width: w, borderRadius: 20 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rl-skeleton" style={{ height: 44, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const {
    profile, profileLoading, rebuildLoading, deleteProfileLoading,
    loadProfile, rebuildProfile, deleteProfile,
  } = useResumeLab();
  const [activeSection, setActiveSection] = useState('skills');
  const [search, setSearch] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function handleDeleteProfile() {
    try {
      await deleteProfile();
      setConfirmWipe(false);
    } catch {
      // notice already surfaced by context; keep dialog open so the user can retry
    }
  }

  const canonical = profile?.canonicalProfile;
  const stats = profile?.stats || {};

  function sectionCount(key) {
    if (key === 'skills')         return stats.skills ?? 0;
    if (key === 'experience')     return stats.experience ?? 0;
    if (key === 'projects')       return stats.projects ?? 0;
    if (key === 'education')      return stats.education ?? 0;
    if (key === 'certifications') return stats.certifications ?? 0;
    return 0;
  }

  function renderSection() {
    if (!canonical) return null;
    const q = search;
    switch (activeSection) {
      case 'skills':
        return <SkillsSection skills={canonical.skills} query={q} />;
      case 'experience': {
        const filtered = (canonical.experience || []).filter(e =>
          !q || (e.company + e.title).toLowerCase().includes(q.toLowerCase())
        );
        return filtered.length
          ? <div className="rl-profile-list">{filtered.map((e, i) => <ExperienceItem key={e.canonical_key || i} item={e} />)}</div>
          : <p style={{ color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-sm)' }}>No experience found.</p>;
      }
      case 'projects': {
        const filtered = (canonical.projects || []).filter(p =>
          !q || (p.normalized_name || p.name || '').toLowerCase().includes(q.toLowerCase())
        );
        return filtered.length
          ? <div className="rl-profile-list">{filtered.map((p, i) => <ProjectItem key={p.canonical_key || i} item={p} />)}</div>
          : <p style={{ color: 'var(--rf-text-muted)', fontSize: 'var(--rf-text-sm)' }}>No projects found.</p>;
      }
      case 'education':
        return (
          <div className="rl-profile-list">
            {(canonical.education || []).map((e, i) => <EducationItem key={i} item={e} />)}
          </div>
        );
      case 'certifications':
        return (
          <div className="rl-profile-list">
            {(canonical.certifications || []).map((c, i) => <CertItem key={i} item={c} />)}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="rl-page">
      <div className="rl-page__header">
        <div className="rl-page__header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="rl-page__title">Career Profile</h1>
          </div>
          <p className="rl-page__subtitle">
            Your merged professional intelligence — built from all uploaded resumes.
          </p>
        </div>
        <div className="rl-page__actions">
          <button
            className="rf-btn rf-btn--secondary rf-btn--sm"
            onClick={rebuildProfile}
            disabled={rebuildLoading || profileLoading || deleteProfileLoading}
          >
            {rebuildLoading
              ? <><Loader size={13} className="rf-spin" /> Rebuilding…</>
              : <><RefreshCw size={13} /> Rebuild Profile</>
            }
          </button>
          {profile?.exists && (
            <button
              className="rf-btn rf-btn--danger rf-btn--sm"
              onClick={() => setConfirmWipe(true)}
              disabled={rebuildLoading || deleteProfileLoading}
              title="Delete your entire Career Profile and all uploaded resumes"
            >
              <Trash2 size={13} /> Delete Profile
            </button>
          )}
        </div>
      </div>

      {profileLoading && !profile ? (
        <ProfileSkeleton />
      ) : !profile?.exists ? (
        <div className="rl-empty">
          <div className="rl-empty__icon">
            <Briefcase size={22} />
          </div>
          <p className="rl-empty__title">No career profile yet</p>
          <p className="rl-empty__body">
            Upload at least one resume in the Resume Vault and your profile will be built automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="rl-stat-row">
            {SECTIONS.map(s => (
              <div
                key={s.key}
                className="rl-stat-card"
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveSection(s.key)}
              >
                <div className="rl-stat-card__value">{sectionCount(s.key)}</div>
                <div className="rl-stat-card__label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Updated + sources */}
          <p style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', marginBottom: 20, marginTop: -8 }}>
            Last updated {fmt(profile.updatedAt)} · {(profile.sourceResumeIds || []).length} source resume{profile.sourceResumeIds?.length !== 1 ? 's' : ''}
          </p>

          {/* Section tabs + search */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="rl-tabs" style={{ marginBottom: 0, flex: 1 }}>
              {SECTIONS.map(s => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    className={`rl-tab${activeSection === s.key ? ' rl-tab--active' : ''}`}
                    onClick={() => { setActiveSection(s.key); setSearch(''); }}
                  >
                    <Icon size={13} />
                    {s.label}
                    <span className="rl-tab__count">{sectionCount(s.key)}</span>
                  </button>
                );
              })}
            </div>
            <div className="rl-search" style={{ marginBottom: 4, marginLeft: 12 }}>
              <Search size={13} style={{ color: 'var(--rf-text-faint)' }} />
              <input
                placeholder={`Search ${activeSection}…`}
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

          <div style={{ height: 1, background: 'var(--rf-border-subtle)', marginBottom: 20 }} />

          {/* Section content */}
          {renderSection()}
        </>
      )}

      {/* Delete-profile confirmation */}
      {confirmWipe && (
        <div className="rf-dialog-overlay" onClick={() => !deleteProfileLoading && setConfirmWipe(false)}>
          <div className="rf-dialog" onClick={e => e.stopPropagation()}>
            <div className="rf-dialog__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} style={{ color: 'var(--rf-error-text)' }} />
              Delete Career Profile?
            </div>
            <div className="rf-dialog__body">
              This permanently deletes <strong>all {profile?.sourceResumeIds?.length || 0} uploaded resume{profile?.sourceResumeIds?.length !== 1 ? 's' : ''}</strong> and the
              entire merged Career Profile built from them. Your stored resume files and the
              extracted data are wiped and cannot be recovered. You'll need to re-upload to start over.
            </div>
            <div className="rf-dialog__actions">
              <button
                className="rf-btn rf-btn--ghost rf-btn--sm"
                onClick={() => setConfirmWipe(false)}
                disabled={deleteProfileLoading}
              >
                Cancel
              </button>
              <button
                className="rf-btn rf-btn--danger rf-btn--sm"
                onClick={handleDeleteProfile}
                disabled={deleteProfileLoading}
              >
                {deleteProfileLoading
                  ? <><Loader size={13} className="rf-spin" /> Deleting…</>
                  : <><Trash2 size={13} /> Delete everything</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
