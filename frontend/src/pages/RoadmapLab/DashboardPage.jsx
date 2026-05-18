import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Loader, Trash2, ChevronRight, Map, Zap } from 'lucide-react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import { useRoadmap } from '../../contexts/RoadmapContext.jsx';
import ProgressRing from './ProgressRing.jsx';

// ── Domain palette ────────────────────────────────────────────────────────────

const PALETTE = ['#8b5cf6','#3b82f6','#10b981','#06b6d4','#f59e0b','#ef4444','#f97316','#6366f1','#14b8a6','#84cc16'];

function getDomainColor(domain) {
  const k = (domain || '').toLowerCase();
  if (/ai|ml|machine|deep|llm|neural/.test(k))  return '#8b5cf6';
  if (/backend|server|api|node|python|go|rust/.test(k)) return '#3b82f6';
  if (/frontend|react|vue|css|ui|ux/.test(k))   return '#10b981';
  if (/flutter|mobile|ios|android/.test(k))      return '#06b6d4';
  if (/dsa|algorithm|leetcode|structure/.test(k)) return '#f59e0b';
  if (/system|design|architect/.test(k))         return '#ef4444';
  if (/devops|cloud|aws|docker|k8s/.test(k))     return '#f97316';
  let h = 0;
  for (let i = 0; i < k.length; i++) h = k.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ── Templates ─────────────────────────────────────────────────────────────────

const TEMPLATES = [
  { label: 'AI Engineer',      domain: 'AI & Machine Learning',         stages: ['Python & Math', 'Core ML', 'Deep Learning', 'LLMs & Agents', 'MLOps'] },
  { label: 'Backend',          domain: 'Backend Engineering',           stages: ['Language Basics', 'Databases', 'APIs & Auth', 'Architecture', 'DevOps'] },
  { label: 'System Design',    domain: 'System Design',                 stages: ['Fundamentals', 'Scalability', 'Distributed Systems', 'Case Studies'] },
  { label: 'Flutter Dev',      domain: 'Flutter & Mobile',             stages: ['Dart Basics', 'Flutter Core', 'State Management', 'Advanced Topics'] },
  { label: 'DSA Mastery',      domain: 'Data Structures & Algorithms', stages: ['Arrays & Strings', 'Trees & Graphs', 'DP & Backtrack', 'Mock Interviews'] },
];

const STATUS_FILTERS = ['all', 'active', 'paused', 'completed'];

// ── Journey Lane ──────────────────────────────────────────────────────────────

function JourneyLane({ roadmap, navigateTo, onDelete }) {
  const color = getDomainColor(roadmap.domain);
  const pct = roadmap.progressPercent || 0;

  const statusColors = { active: '#22c55e', paused: '#f59e0b', completed: '#3b82f6' };
  const statusDot = statusColors[roadmap.status] || '#6b7280';

  return (
    <div className="rml-lane" onClick={() => navigateTo(`/roadmaps/${roadmap._id}`)}>
      <div className="rml-lane__stripe" style={{ background: color }} />

      <div className="rml-lane__body">
        <div className="rml-lane__top">
          <div className="rml-lane__head">
            <span className="rml-lane__domain" style={{ color }}>{roadmap.domain || 'General'}</span>
            <h3 className="rml-lane__title">{roadmap.title}</h3>
            {roadmap.description && (
              <p className="rml-lane__desc">{roadmap.description}</p>
            )}
          </div>
          <div className="rml-lane__right">
            <div className="rml-lane__status">
              <span className="rml-lane__dot" style={{ background: statusDot }} />
              <span className="rml-lane__status-label">{roadmap.status}</span>
            </div>
            <ProgressRing percent={pct} size={52} strokeWidth={4} color={color} track="var(--rf-border)">
              <span className="rml-lane__pct">{pct}%</span>
            </ProgressRing>
          </div>
        </div>

        <div className="rml-lane__track-wrap">
          <div className="rml-lane__track" style={{ '--c': color }}>
            <div className="rml-lane__track-fill" style={{ width: `${pct}%`, background: color }} />
            <div className="rml-lane__track-dot rml-lane__track-dot--start" style={{ background: color }} />
            <div
              className="rml-lane__track-cursor"
              style={{ left: `${Math.max(pct, 1)}%`, background: color }}
              title={`${pct}% complete`}
            />
            <div className="rml-lane__track-dot rml-lane__track-dot--end" />
          </div>
        </div>
      </div>

      <div className="rml-lane__actions" onClick={e => e.stopPropagation()}>
        <button
          className="rml-lane__delete"
          onClick={() => onDelete(roadmap)}
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
        <button
          className="rml-lane__enter"
          onClick={() => navigateTo(`/roadmaps/${roadmap._id}`)}
        >
          Open <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }) {
  const { createRoadmap, createStage } = useRoadmap();
  const { setNotice } = useApp();
  const [form, setForm] = useState({ title: '', description: '', domain: '', stages: '' });
  const [saving, setSaving] = useState(false);

  function applyTemplate(tpl) {
    setForm({ title: tpl.domain, description: '', domain: tpl.domain, stages: tpl.stages.join('\n') });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const roadmap = await createRoadmap({
        title: form.title.trim(),
        description: form.description.trim(),
        domain: form.domain.trim(),
      });
      const names = form.stages.split('\n').map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < names.length; i++) {
        await createStage(roadmap._id, { title: names[i], order: i });
      }
      setNotice({ type: 'success', message: 'Roadmap created' });
      onCreated(roadmap);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rf-dialog-overlay" onClick={onClose}>
      <div className="rml-create-modal" onClick={e => e.stopPropagation()}>
        <div className="rml-create-modal__header">
          <div className="rml-create-modal__title">New Roadmap</div>
          <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={onClose}>✕</button>
        </div>

        <div className="rml-create-modal__templates">
          <div className="rml-create-modal__templates-label">Start from template</div>
          <div className="rml-templates-row">
            {TEMPLATES.map(tpl => (
              <button key={tpl.label} className="rml-template-chip" onClick={() => applyTemplate(tpl)}>
                {tpl.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rml-create-modal__form">
          <div className="rml-field">
            <label className="rml-label">Title <span className="rml-required">*</span></label>
            <input
              className="rf-input"
              placeholder="e.g. Backend Engineering Mastery"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="rml-field">
            <label className="rml-label">Domain</label>
            <input
              className="rf-input"
              placeholder="e.g. AI & Machine Learning"
              value={form.domain}
              onChange={e => setForm(p => ({ ...p, domain: e.target.value }))}
            />
          </div>
          <div className="rml-field">
            <label className="rml-label">Description</label>
            <input
              className="rf-input"
              placeholder="What will you learn?"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="rml-field">
            <label className="rml-label">
              Stages <span className="rml-hint">(one per line)</span>
            </label>
            <textarea
              className="rf-input rml-stages-textarea"
              placeholder={"Foundations\nCore Topics\nProjects"}
              value={form.stages}
              onChange={e => setForm(p => ({ ...p, stages: e.target.value }))}
              rows={4}
            />
          </div>
          <div className="rml-create-modal__actions">
            <button type="button" className="rf-btn rf-btn--secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="rf-btn rf-btn--primary" disabled={saving || !form.title.trim()}>
              {saving && <Loader size={13} className="rml-spin" />}
              Create Roadmap
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { roadmaps, dashboardLoading, loadRoadmaps, deleteRoadmap } = useRoadmap();
  const { setNotice, setWarningDialog } = useApp();
  const { navigateTo } = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { loadRoadmaps(); }, []);

  const filtered = useMemo(() => {
    let list = roadmaps;
    if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) || (r.domain || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [roadmaps, statusFilter, search]);

  const stats = useMemo(() => ({
    total: roadmaps.length,
    active: roadmaps.filter(r => r.status === 'active').length,
    avgProgress: roadmaps.length
      ? Math.round(roadmaps.reduce((s, r) => s + (r.progressPercent || 0), 0) / roadmaps.length)
      : 0,
  }), [roadmaps]);

  function handleDelete(roadmap) {
    setWarningDialog({
      title: 'Delete roadmap?',
      message: `"${roadmap.title}" and all its stages and items will be permanently deleted.`,
      confirmText: 'Delete',
      intent: 'danger',
      onConfirm: async () => {
        try {
          await deleteRoadmap(roadmap._id);
          setNotice({ type: 'success', message: 'Roadmap deleted' });
        } catch (err) {
          setNotice({ type: 'error', message: err.message });
        }
      },
    });
  }

  return (
    <div className="rml-dashboard">
      {/* Hero header */}
      <div className="rml-dashboard__hero">
        <div className="rml-dashboard__hero-left">
          {/* <div className="rml-hero-icon">
            <Map size={22} />
          </div> */}
          <div>
            <h1 className="rml-hero-title">Roadmap</h1>
            <p className="rml-hero-sub">Your personal skill progression system</p>
          </div>
        </div>
        <div className="rml-dashboard__hero-right">
          {roadmaps.length > 0 && (
            <div className="rml-hero-stats">
              <div className="rml-hero-stat">
                <span className="rml-hero-stat__num">{stats.total}</span>
                <span className="rml-hero-stat__label">Roadmaps</span>
              </div>
              <div className="rml-hero-stat-divider" />
              <div className="rml-hero-stat">
                <span className="rml-hero-stat__num" style={{ color: 'var(--rf-success)' }}>{stats.active}</span>
                <span className="rml-hero-stat__label">Active</span>
              </div>
              <div className="rml-hero-stat-divider" />
              <div className="rml-hero-stat">
                <span className="rml-hero-stat__num" style={{ color: 'var(--rf-accent)' }}>{stats.avgProgress}%</span>
                <span className="rml-hero-stat__label">Avg Progress</span>
              </div>
            </div>
          )}
          <button className="rf-btn rf-btn--primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New Roadmap
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="rml-controls">
        <div className="rml-search-wrap">
          <Search size={14} className="rml-search-icon" />
          <input
            className="rf-input rml-search"
            placeholder="Search roadmaps…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="rml-filter-tabs">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              className={`rml-filter-tab${statusFilter === s ? ' rml-filter-tab--active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {dashboardLoading ? (
        <div className="rml-loader">
          <Loader size={22} className="rml-spin" />
          <span>Loading your roadmaps…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rml-empty">
          <div className="rml-empty__visual">
            <Zap size={36} />
          </div>
          <div className="rml-empty__title">
            {search || statusFilter !== 'all' ? 'No roadmaps match' : 'Start your first journey'}
          </div>
          <p className="rml-empty__sub">
            {search || statusFilter !== 'all'
              ? 'Try a different search or filter'
              : 'Build a structured learning path — from foundations to mastery'}
          </p>
          {!search && statusFilter === 'all' && (
            <button className="rf-btn rf-btn--primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Create Roadmap
            </button>
          )}
        </div>
      ) : (
        <div className="rml-lanes">
          {filtered.map(r => (
            <JourneyLane
              key={r._id}
              roadmap={r}
              navigateTo={navigateTo}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={r => { setShowCreate(false); navigateTo(`/roadmaps/${r._id}`); }}
        />
      )}
    </div>
  );
}
