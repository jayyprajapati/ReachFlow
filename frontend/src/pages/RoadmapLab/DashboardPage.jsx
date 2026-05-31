import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Trash2, BookMarked, Loader, Search, ChevronDown, ChevronRight as ChevronRt,
  Check, Pencil, ExternalLink, X, Clock, Tag, Play, BookOpen, FileText, Code, Globe,
  GripVertical, FolderOpen, Folder, Minus, MoreHorizontal, Map, Bookmark,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRoadmap } from '../../contexts/RoadmapContext.jsx';

// ── Constants ────────────────────────────────────────────────────────────────

const RESOURCE_TYPES = [
  { value: 'youtube_playlist', label: 'YT Playlist', icon: Play,     color: '#DC2626' },
  { value: 'youtube_video',    label: 'Video',        icon: Play,     color: '#DC2626' },
  { value: 'course',           label: 'Course',       icon: BookOpen, color: '#0052FF' },
  { value: 'article',          label: 'Article',      icon: FileText, color: '#6B7280' },
  { value: 'book',             label: 'Book',         icon: BookOpen, color: '#D97706' },
  { value: 'github',           label: 'GitHub',       icon: Code,     color: '#1A1815' },
  { value: 'custom',           label: 'Custom',       icon: Globe,    color: '#6B7280' },
];

const ITEM_STATUSES = [
  { value: 'planned',   label: 'Planned'  },
  { value: 'active',    label: 'Active'   },
  { value: 'completed', label: 'Done'     },
  { value: 'skipped',   label: 'Skipped'  },
];

const PRIORITIES = [
  { value: 'high',   label: 'High'   },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low'    },
];

const STATUS_CYCLE = ['planned', 'active', 'completed'];

const TEMPLATES = [
  { label: 'AI Engineer',   domain: 'AI & Machine Learning',        stages: ['Python & Math', 'Core ML', 'Deep Learning', 'LLMs & Agents', 'MLOps'] },
  { label: 'Backend',       domain: 'Backend Engineering',          stages: ['Language Basics', 'Databases', 'APIs & Auth', 'Architecture', 'DevOps'] },
  { label: 'System Design', domain: 'System Design',                stages: ['Fundamentals', 'Scalability', 'Distributed Systems', 'Case Studies'] },
  { label: 'Flutter Dev',   domain: 'Flutter & Mobile',             stages: ['Dart Basics', 'Flutter Core', 'State Management', 'Advanced Topics'] },
  { label: 'DSA Mastery',   domain: 'Data Structures & Algorithms', stages: ['Arrays & Strings', 'Trees & Graphs', 'DP & Backtrack', 'Mock Interviews'] },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const PALETTE = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2', '#6B7280'];

function domainColor(domain) {
  const k = (domain || '').toLowerCase();
  if (/ai|ml|machine|deep|llm|neural/.test(k))         return '#2563EB';
  if (/backend|server|api|node|python|go|rust/.test(k)) return '#6B7280';
  if (/frontend|react|vue|css|ui|ux/.test(k))           return '#7C3AED';
  if (/flutter|mobile|ios|android/.test(k))             return '#0891B2';
  if (/dsa|algorithm|leetcode|structure/.test(k))       return '#D97706';
  if (/system|design|architect/.test(k))                return '#DC2626';
  if (/devops|cloud|aws|docker|k8s/.test(k))            return '#059669';
  let h = 0;
  for (let i = 0; i < k.length; i++) h = k.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function statusColor(s) {
  if (s === 'active')    return 'var(--rf-accent)';
  if (s === 'completed') return 'var(--rf-success)';
  if (s === 'paused')    return 'var(--rf-warning)';
  return 'var(--rf-text-faint)';
}

function detectFromUrl(raw) {
  try {
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    const h   = new URL(url).hostname.toLowerCase();
    if (h.includes('youtube.com') || h.includes('youtu.be')) return { resourceType: 'youtube_video', platform: 'YouTube' };
    if (h.includes('coursera.org'))   return { resourceType: 'course',   platform: 'Coursera' };
    if (h.includes('udemy.com'))      return { resourceType: 'course',   platform: 'Udemy' };
    if (h.includes('github.com'))     return { resourceType: 'github',   platform: 'GitHub' };
    if (h.includes('medium.com') || h.includes('dev.to') || h.includes('substack.com'))
      return { resourceType: 'article', platform: 'Article' };
  } catch {}
  return { resourceType: 'custom', platform: '' };
}

function getModeKey(id) { return `rml-mode-${id}`; }

// ── Status Bullet ────────────────────────────────────────────────────────────

function StatusBullet({ status, onClick }) {
  const base = { width: 14, height: 14 };
  if (status === 'completed')
    return <button className="rml-bullet rml-bullet--done"   style={base} onClick={onClick}><Check size={8} strokeWidth={3} /></button>;
  if (status === 'active')
    return <button className="rml-bullet rml-bullet--active" style={base} onClick={onClick} />;
  if (status === 'skipped')
    return <button className="rml-bullet rml-bullet--skip"   style={base} onClick={onClick}><Minus size={8} strokeWidth={2.5} /></button>;
  return   <button className="rml-bullet rml-bullet--plan"   style={base} onClick={onClick} />;
}

// ── Resource Edit Drawer ─────────────────────────────────────────────────────

function ResourceDrawer({ item, onClose }) {
  const { updateItem, deleteItem }      = useRoadmap();
  const { setNotice, setWarningDialog } = useApp();
  const [form, setForm]   = useState({ ...item });
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm({ ...item }); }, [item._id]);

  async function save(patch) {
    setSaving(true);
    try { await updateItem(item._id, patch); }
    catch (err) { setNotice({ type: 'error', message: err.message }); }
    finally { setSaving(false); }
  }

  function onBlur(field) {
    const cur  = String(form[field] ?? '');
    const orig = String(item[field]  ?? '');
    if (cur !== orig) save({ [field]: form[field] });
  }

  function onSelect(field, val) {
    setForm(p => ({ ...p, [field]: val }));
    save({ [field]: val });
  }

  function handleDelete() {
    setWarningDialog({
      title: 'Delete resource?',
      message: `"${item.title}" will be permanently removed.`,
      confirmText: 'Delete',
      intent: 'danger',
      onConfirm: async () => {
        try { await deleteItem(item._id); onClose(); setNotice({ type: 'success', message: 'Deleted' }); }
        catch (err) { setNotice({ type: 'error', message: err.message }); }
      },
    });
  }

  const rt = RESOURCE_TYPES.find(t => t.value === form.resourceType);

  return (
    <aside className="rml-drawer">
      <div className="rml-drawer__hd">
        <div className="rml-drawer__hd-title">
          {rt && <rt.icon size={13} color={rt.color} />}
          <span>Edit Resource</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving && <Loader size={12} className="rml-spin" style={{ color: 'var(--rf-text-faint)' }} />}
          <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={onClose}><X size={15} /></button>
        </div>
      </div>

      <div className="rml-drawer__body">
        <div className="rml-field">
          <label className="rml-label">Title</label>
          <input
            className="rf-input"
            value={form.title || ''}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            onBlur={() => onBlur('title')}
          />
        </div>

        <div className="rml-field-row">
          <div className="rml-field">
            <label className="rml-label">Status</label>
            <select className="rf-select" value={form.status || 'planned'} onChange={e => onSelect('status', e.target.value)}>
              {ITEM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="rml-field">
            <label className="rml-label">Priority</label>
            <select className="rf-select" value={form.priority || 'medium'} onChange={e => onSelect('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div className="rml-field">
          <label className="rml-label">Type</label>
          <select className="rf-select" value={form.resourceType || 'custom'} onChange={e => onSelect('resourceType', e.target.value)}>
            {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="rml-field">
          <label className="rml-label">URL</label>
          <div className="rml-url-row">
            <input
              className="rf-input"
              placeholder="https://…"
              value={form.url || ''}
              onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
              onBlur={() => onBlur('url')}
            />
            {form.url && (
              <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={() => window.open(form.url.startsWith('http') ? form.url : `https://${form.url}`, '_blank')}>
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="rml-field-row">
          <div className="rml-field">
            <label className="rml-label"><Clock size={10} /> Hours</label>
            <input
              className="rf-input"
              type="number" min="0" step="0.5" placeholder="—"
              value={form.estimatedHours ?? ''}
              onChange={e => setForm(p => ({ ...p, estimatedHours: e.target.value === '' ? null : Number(e.target.value) }))}
              onBlur={() => onBlur('estimatedHours')}
            />
          </div>
          <div className="rml-field">
            <label className="rml-label"><Tag size={10} /> Tags</label>
            <input
              className="rf-input"
              placeholder="tag1, tag2"
              value={Array.isArray(form.tags) ? form.tags.join(', ') : ''}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
              onBlur={() => {
                if (JSON.stringify(form.tags || []) !== JSON.stringify(item.tags || [])) save({ tags: form.tags || [] });
              }}
            />
          </div>
        </div>

        <div className="rml-field">
          <label className="rml-label">Notes</label>
          <textarea
            className="rf-input rml-notes-ta"
            placeholder="Notes, links, context…"
            rows={5}
            value={form.notes || ''}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            onBlur={() => onBlur('notes')}
          />
        </div>
      </div>

      <div className="rml-drawer__ft">
        <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={handleDelete}>
          <Trash2 size={13} /> Delete resource
        </button>
        {item.completedAt && (
          <span className="rml-drawer__done">
            <Check size={10} /> {new Date(item.completedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </aside>
  );
}

// ── Inline Add Resource Form ─────────────────────────────────────────────────

function InlineAddForm({ stageId, roadmapId, onDone, onCancel }) {
  const { createItem } = useRoadmap();
  const { setNotice }  = useApp();
  const [url, setUrl]     = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  function handleUrlBlur() {
    if (url && !title) {
      try {
        const parts = new URL(url.startsWith('http') ? url : `https://${url}`).pathname.split('/').filter(Boolean);
        if (parts.length) setTitle(parts[parts.length - 1].replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase()));
      } catch {}
      titleRef.current?.focus();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const { resourceType, platform } = detectFromUrl(url);
    try {
      await createItem(roadmapId, { stageId: stageId || null, title: title.trim(), url: url.trim(), resourceType, platform });
      setUrl(''); setTitle('');
      onDone?.();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="rml-inline-form" onSubmit={handleSubmit} onKeyDown={e => e.key === 'Escape' && onCancel?.()}>
      <input className="rf-input rf-input--sm" placeholder="URL (optional)" value={url} onChange={e => setUrl(e.target.value)} onBlur={handleUrlBlur} autoFocus />
      <input ref={titleRef} className="rf-input rf-input--sm" placeholder="Resource title *" value={title} onChange={e => setTitle(e.target.value)} />
      <div className="rml-inline-form__btns">
        <button type="submit" className="rf-btn rf-btn--primary rf-btn--sm" disabled={saving || !title.trim()}>
          {saving ? <Loader size={11} className="rml-spin" /> : <Plus size={11} />} Add
        </button>
        <button type="button" className="rf-btn rf-btn--ghost rf-btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Resource Row ─────────────────────────────────────────────────────────────

function ResourceRow({ item, onEdit, isRoadmapMode }) {
  const { updateItem } = useRoadmap();
  const { setNotice }  = useApp();
  const rt   = RESOURCE_TYPES.find(t => t.value === item.resourceType);
  const href = item.url ? (item.url.startsWith('http') ? item.url : `https://${item.url}`) : null;

  function cycleStatus(e) {
    e.stopPropagation();
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.status) + 1) % STATUS_CYCLE.length];
    updateItem(item._id, { status: next }).catch(err => setNotice({ type: 'error', message: err.message }));
  }

  return (
    <div className={`rml-rrow rml-rrow--${item.status}`}>
      {isRoadmapMode && <StatusBullet status={item.status} onClick={cycleStatus} />}
      {rt && <rt.icon size={11} style={{ color: rt.color, flexShrink: 0 }} />}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="rml-rrow__title">{item.title}</a>
      ) : (
        <span className="rml-rrow__title rml-rrow__title--nolink">{item.title}</span>
      )}
      <div className="rml-rrow__actions">
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="rml-rrow__ext" tabIndex={-1}>
            <ExternalLink size={10} />
          </a>
        )}
        <button className="rml-rrow__edit" onClick={() => onEdit(item)} title="Edit">
          <Pencil size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Folder Section ────────────────────────────────────────────────────────────

function FolderSection({
  stage, index, allItems, roadmapId, isRoadmapMode,
  onEditItem, onDeleteFolder,
  dragIndex, dragOverIndex, onDragStart, onDragOver, onDrop, onDragEnd,
  forceClose,
}) {
  const { updateStage } = useRoadmap();
  const { setNotice }   = useApp();

  const cards   = allItems.filter(i => String(i.stageId) === String(stage._id)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const done    = cards.filter(i => i.status === 'completed').length;
  const nonSkip = cards.filter(i => i.status !== 'skipped').length;
  const pct     = nonSkip > 0 ? Math.round(done / nonSkip * 100) : 0;
  const done100 = pct === 100 && cards.length > 0;

  const [open, setOpen]           = useState(cards.length > 0);
  const [showAdd, setShowAdd]     = useState(false);
  const [showMenu, setShowMenu]   = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(stage.title);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const menuRef    = useRef(null);
  const menuBtnRef = useRef(null);

  useEffect(() => { if (forceClose > 0) setOpen(false); }, [forceClose]);

  function handleMenuToggle() {
    if (!showMenu && menuBtnRef.current) {
      const r = menuBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setShowMenu(v => !v);
  }

  useEffect(() => {
    if (!showMenu) return;
    const close = e => { if (!menuRef.current?.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  async function handleRename(e) {
    e?.preventDefault();
    setEditingName(false);
    if (!nameDraft.trim() || nameDraft === stage.title) return;
    try { await updateStage(stage._id, { title: nameDraft.trim() }); }
    catch (err) { setNotice({ type: 'error', message: err.message }); setNameDraft(stage.title); }
  }

  const isDragOver = dragOverIndex === index;
  const isDragging = dragIndex === index;

  return (
    <div
      className={`rml-folder${isDragOver ? ' rml-folder--dragover' : ''}${isDragging ? ' rml-folder--dragging' : ''}`}
      draggable={isRoadmapMode}
      onDragStart={isRoadmapMode ? e => onDragStart(e, index) : undefined}
      onDragOver={isRoadmapMode ? e => onDragOver(e, index) : undefined}
      onDrop={isRoadmapMode ? e => onDrop(e, index) : undefined}
      onDragEnd={isRoadmapMode ? onDragEnd : undefined}
    >
      {/* Folder header */}
      <div className="rml-folder__hd">
        {isRoadmapMode && (
          <span className="rml-folder__grip" title="Drag to reorder">
            <GripVertical size={13} />
          </span>
        )}

        <button
          className="rml-folder__toggle"
          onClick={() => setOpen(v => !v)}
          type="button"
        >
          {open ? <ChevronDown size={15} /> : <ChevronRt size={15} />}

          {isRoadmapMode ? (
            <span
              className="rml-folder__num"
              style={done100 ? { background: 'var(--rf-success)', color: '#fff', border: 'none' } : {}}
            >
              {done100 ? <Check size={9} strokeWidth={3} /> : index + 1}
            </span>
          ) : (
            <span className="rml-folder__icon">
              {open ? <FolderOpen size={18} /> : <Folder size={18} />}
            </span>
          )}

          {editingName ? (
            <form
              onSubmit={handleRename}
              onClick={e => e.stopPropagation()}
              style={{ flex: 1, minWidth: 0 }}
            >
              <input
                className="rf-input rf-input--sm rml-folder__rename"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={handleRename}
                autoFocus
              />
            </form>
          ) : (
            <span className="rml-folder__name">{stage.title}</span>
          )}
          {cards.length > 0 && (
            <span className="rml-folder__rcount">{cards.length}</span>
          )}
        </button>

        <div className="rml-folder__meta">
          {isRoadmapMode && cards.length > 0 && (
            <>
              <div className="rml-folder__bar">
                <div
                  className="rml-folder__bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: done100 ? 'var(--rf-success)' : pct > 0 ? 'var(--rf-accent)' : 'var(--rf-border-subtle)',
                  }}
                />
              </div>
              <span className="rml-folder__count">{done}/{cards.length}</span>
            </>
          )}
        </div>

        <button
          className="rml-folder__add-btn"
          onClick={() => { setOpen(true); setShowAdd(true); }}
          title="Add resource"
          type="button"
        >
          <Plus size={15} />
        </button>

        <div style={{ position: 'relative' }}>
          <button ref={menuBtnRef} className="rml-folder__menu-btn" onClick={handleMenuToggle} type="button">
            <MoreHorizontal size={16} />
          </button>
          {showMenu && createPortal(
            <div
              ref={menuRef}
              className="rml-dropdown"
              style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
            >
              <button
                className="rml-dropdown__item"
                onClick={() => { setShowMenu(false); setEditingName(true); setNameDraft(stage.title); }}
              >
                <Pencil size={13} /> Rename
              </button>
              <div className="rml-dropdown__div" />
              <button
                className="rml-dropdown__item rml-dropdown__item--danger"
                onClick={() => { setShowMenu(false); onDeleteFolder(stage); }}
              >
                <Trash2 size={13} /> Delete folder
              </button>
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Resources */}
      {open && (
        <div className="rml-folder__body rml-folder__body--wired">
          {cards.length === 0 && !showAdd ? (
            <button className="rml-folder__empty-btn" onClick={() => setShowAdd(true)} type="button">
              <Plus size={13} /> Add first resource
            </button>
          ) : (
            <>
              {cards.map(item => (
                <ResourceRow key={item._id} item={item} onEdit={onEditItem} isRoadmapMode={isRoadmapMode} />
              ))}
              {showAdd && (
                <div className="rml-folder__add-wrap">
                  <InlineAddForm
                    stageId={stage._id}
                    roadmapId={roadmapId}
                    onDone={() => setShowAdd(false)}
                    onCancel={() => setShowAdd(false)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Roadmap Modal ──────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }) {
  const { createRoadmap, createStage } = useRoadmap();
  const { setNotice } = useApp();
  const [form, setForm]     = useState({ title: '', description: '', domain: '', folders: '' });
  const [saving, setSaving] = useState(false);

  function applyTemplate(tpl) {
    setForm({ title: tpl.domain, description: '', domain: tpl.domain, folders: tpl.stages.join('\n') });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const roadmap = await createRoadmap({ title: form.title.trim(), description: form.description.trim(), domain: form.domain.trim() });
      const names   = form.folders.split('\n').map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < names.length; i++) await createStage(roadmap._id, { title: names[i], order: i });
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
      <div className="rml-cmodal" onClick={e => e.stopPropagation()}>
        <div className="rml-cmodal__header">
          <span className="rml-cmodal__title">New Roadmap</span>
          <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={onClose}>✕</button>
        </div>
        <div className="rml-cmodal__tpls">
          <span className="rml-cmodal__tpl-label">Start from a template</span>
          <div className="rml-tpl-row">
            {TEMPLATES.map(t => (
              <button key={t.label} className="rml-tpl-chip" onClick={() => applyTemplate(t)}>{t.label}</button>
            ))}
          </div>
        </div>
        <form className="rml-cmodal__form" onSubmit={handleSubmit}>
          <div className="rml-field">
            <label className="rml-label">Title <span className="rml-req">*</span></label>
            <input className="rf-input" placeholder="e.g. Backend Engineering Mastery" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} autoFocus />
          </div>
          <div className="rml-field">
            <label className="rml-label">Domain</label>
            <input className="rf-input" placeholder="e.g. AI & Machine Learning" value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))} />
          </div>
          <div className="rml-field">
            <label className="rml-label">Description</label>
            <input className="rf-input" placeholder="What will you learn?" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="rml-field">
            <label className="rml-label">Folders <span className="rml-hint">(one per line)</span></label>
            <textarea className="rf-input rml-stages-ta" placeholder={"Foundations\nCore Topics\nProjects"} rows={4} value={form.folders} onChange={e => setForm(p => ({ ...p, folders: e.target.value }))} />
          </div>
          <div className="rml-cmodal__actions">
            <button type="button" className="rf-btn rf-btn--secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="rf-btn rf-btn--primary" disabled={saving || !form.title.trim()}>
              {saving && <Loader size={13} className="rml-spin" />} Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sidebar Row ───────────────────────────────────────────────────────────────

function SidebarRow({ roadmap, isSelected, onSelect }) {
  const color     = domainColor(roadmap.domain);
  const pct       = roadmap.progressPercent || 0;
  const isRmMode  = (localStorage.getItem(getModeKey(roadmap._id)) || 'bookmarks') === 'roadmap';
  return (
    <button className={`rml-srow${isSelected ? ' rml-srow--sel' : ''}`} onClick={() => onSelect(roadmap._id)}>
      <span className="rml-srow__accent" style={{ background: color }} />
      <div className="rml-srow__body">
        <span className="rml-srow__name">{roadmap.title}</span>
        <div className="rml-srow__foot">
          <span className={`rml-srow__badge rml-srow__badge--${isRmMode ? 'rm' : 'bm'}`}>
            {isRmMode ? 'Roadmap' : 'Bookmark'}
          </span>
          {isRmMode && (
            <>
              <div className="rml-srow__track">
                <div className="rml-srow__fill" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="rml-srow__pct">{pct}%</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    roadmaps, dashboardLoading, activeRoadmap, boardLoading,
    loadRoadmaps, loadRoadmap, deleteRoadmap, createStage, updateStage, deleteStage,
  } = useRoadmap();
  const { setNotice, setWarningDialog } = useApp();

  const [selectedId, setSelectedId]     = useState(null);
  const [search, setSearch]             = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [mode, setMode]                 = useState('bookmarks');
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderName, setFolderName]     = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [dragIndex, setDragIndex]       = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [collapseAll, setCollapseAll]   = useState(0);

  useEffect(() => { loadRoadmaps(); }, []);

  useEffect(() => {
    if (roadmaps.length > 0 && !selectedId) setSelectedId(roadmaps[0]._id);
  }, [roadmaps]);

  useEffect(() => {
    if (!selectedId) return;
    loadRoadmap(selectedId);
    setMode(localStorage.getItem(getModeKey(selectedId)) || 'bookmarks');
    setEditItem(null);
  }, [selectedId]);

  // Keep editItem in sync with live context data
  useEffect(() => {
    if (!editItem || !activeRoadmap) return;
    const fresh = (activeRoadmap.items || []).find(i => i._id === editItem._id);
    if (!fresh) { setEditItem(null); return; }
    if (JSON.stringify(fresh) !== JSON.stringify(editItem)) setEditItem(fresh);
  }, [activeRoadmap?.items]);

  function selectRoadmap(id) {
    setSelectedId(id);
    setEditItem(null);
    setAddingFolder(false);
  }

  function applyMode(next) {
    setMode(next);
    if (selectedId) localStorage.setItem(getModeKey(selectedId), next);
  }

  function confirmModeSwitch(next) {
    setWarningDialog({
      title: next === 'roadmap' ? 'Switch to Roadmap mode?' : 'Switch to Bookmark mode?',
      message: next === 'roadmap'
        ? 'Roadmap mode connects folders in sequence and tracks progress. Folders will be numbered and linked.'
        : 'Bookmark mode treats folders as independent collections. Progress tracking will be hidden.',
      confirmText: 'Switch',
      intent: 'danger',
      onConfirm: () => applyMode(next),
    });
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return roadmaps;
    const q = search.toLowerCase();
    return roadmaps.filter(r => r.title.toLowerCase().includes(q) || (r.domain || '').toLowerCase().includes(q));
  }, [roadmaps, search]);

  const rm     = activeRoadmap?._id === selectedId ? activeRoadmap : null;
  const stages = rm ? [...(rm.stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
  const items  = rm?.items || [];
  const pct    = rm?.progressPercent || 0;
  const color  = domainColor(rm?.domain);

  // Drag handlers for folder reorder in roadmap mode
  function handleDragStart(e, index) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragIndex) setDragOverIndex(index);
  }
  async function handleDrop(e, index) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) { setDragIndex(null); setDragOverIndex(null); return; }
    const reordered = [...stages];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    setDragIndex(null);
    setDragOverIndex(null);
    try {
      await Promise.all(reordered.map((s, i) => updateStage(s._id, { order: i })));
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    }
  }
  function handleDragEnd() { setDragIndex(null); setDragOverIndex(null); }

  async function handleAddFolder(e) {
    e.preventDefault();
    if (!folderName.trim() || !selectedId) return;
    setSavingFolder(true);
    try {
      await createStage(selectedId, { title: folderName.trim(), order: stages.length });
      setFolderName('');
      setAddingFolder(false);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSavingFolder(false);
    }
  }

  function handleDeleteFolder(stage) {
    setWarningDialog({
      title: 'Delete folder?',
      message: `"${stage.title}" and all its resources will be permanently deleted.`,
      confirmText: 'Delete',
      intent: 'danger',
      onConfirm: async () => {
        try { await deleteStage(stage._id); setNotice({ type: 'success', message: 'Folder deleted' }); }
        catch (err) { setNotice({ type: 'error', message: err.message }); }
      },
    });
  }

  function handleDeleteRoadmap(roadmap) {
    setWarningDialog({
      title: 'Delete roadmap?',
      message: `"${roadmap.title}" and all its folders and resources will be permanently deleted.`,
      confirmText: 'Delete',
      intent: 'danger',
      onConfirm: async () => {
        try {
          await deleteRoadmap(roadmap._id);
          if (selectedId === roadmap._id) setSelectedId(null);
          setNotice({ type: 'success', message: 'Roadmap deleted' });
        } catch (err) {
          setNotice({ type: 'error', message: err.message });
        }
      },
    });
  }

  const isRoadmapMode = mode === 'roadmap';

  return (
    <div className="rml-workspace">

      {/* ── Sidebar ── */}
      <aside className="rml-sidebar">
        <div className="rml-sidebar__top">
          <div className="rml-sidebar__search-wrap">
            <Search size={12} className="rml-sidebar__search-ico" />
            <input className="rml-sidebar__search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="rml-sidebar__list">
          {dashboardLoading ? (
            <div className="rml-sidebar__spinner"><Loader size={15} className="rml-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="rml-sidebar__nil">{search ? 'No matches' : 'No roadmaps yet'}</div>
          ) : (
            filtered.map(r => (
              <SidebarRow key={r._id} roadmap={r} isSelected={r._id === selectedId} onSelect={selectRoadmap} />
            ))
          )}
        </div>

        <div className="rml-sidebar__footer">
          <button className="rml-sidebar__new-btn" onClick={() => setShowCreate(true)} type="button">
            <Plus size={13} /> New Roadmap
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="rml-main">
        {roadmaps.length === 0 && !dashboardLoading ? (
          <div className="rml-preview-empty rml-preview-empty--center">
            <BookMarked size={32} strokeWidth={1.5} />
            <div className="rml-preview-empty__title">No roadmaps yet</div>
            <p className="rml-preview-empty__sub">
              Organize links and resources into folders. Switch to roadmap mode to connect folders into a learning sequence.
            </p>
            <button className="rf-btn rf-btn--primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create your first roadmap
            </button>
          </div>
        ) : !selectedId ? (
          <div className="rml-preview-empty">
            <span>Select a roadmap to view folders</span>
          </div>
        ) : (
          <div className="rml-main__inner">

            {/* Top bar */}
            <div className="rml-topbar">
              <div className="rml-topbar__left">
                {rm ? (
                  <>
                    <h2 className="rml-topbar__title">{rm.title}</h2>
                    {rm.domain && rm.domain !== rm.title && <span className="rml-topbar__domain">{rm.domain}</span>}
                    {isRoadmapMode && pct > 0 && (
                      <div className="rml-topbar__progress">
                        <div className="rml-topbar__prog-bar">
                          <div className="rml-topbar__prog-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="rml-topbar__prog-pct" style={{ color }}>{pct}%</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rml-topbar__skel" />
                )}
              </div>
              <div className="rml-topbar__right">
                <div className="rml-mode-toggle" role="group" aria-label="View mode">
                  <button
                    className={`rml-mode-seg${!isRoadmapMode ? ' rml-mode-seg--active' : ''}`}
                    onClick={() => isRoadmapMode && confirmModeSwitch('bookmarks')}
                    type="button"
                    title="Bookmarks — independent folders for saving links"
                  >
                    <Bookmark size={13} />
                    <span>Bookmarks</span>
                  </button>
                  <button
                    className={`rml-mode-seg${isRoadmapMode ? ' rml-mode-seg--active' : ''}`}
                    onClick={() => !isRoadmapMode && confirmModeSwitch('roadmap')}
                    type="button"
                    title="Roadmap — folders connected in sequence with progress tracking"
                  >
                    <Map size={13} />
                    <span>Roadmap</span>
                  </button>
                </div>
                {rm && (
                  <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={() => handleDeleteRoadmap(rm)} title="Delete roadmap" type="button">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Action bar */}
            <div className="rml-actionbar">
              {addingFolder ? (
                <form className="rml-actionbar__form" onSubmit={handleAddFolder}>
                  <input
                    className="rf-input rf-input--sm"
                    placeholder="Folder name…"
                    value={folderName}
                    onChange={e => setFolderName(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Escape') { setAddingFolder(false); setFolderName(''); } }}
                  />
                  <button type="submit" className="rf-btn rf-btn--primary rf-btn--sm" disabled={savingFolder || !folderName.trim()}>
                    {savingFolder ? <Loader size={11} className="rml-spin" /> : <Check size={11} />} Add
                  </button>
                  <button type="button" className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setAddingFolder(false); setFolderName(''); }}>
                    <X size={11} />
                  </button>
                </form>
              ) : (
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setAddingFolder(true)} type="button">
                  <Plus size={13} /> New Folder
                </button>
              )}
              {stages.length > 0 && (
                <button className="rf-btn rf-btn--ghost rf-btn--sm rml-actionbar__collapse" onClick={() => setCollapseAll(v => v + 1)} type="button" title="Collapse all folders">
                  <Minus size={13} /> Collapse all
                </button>
              )}
              {isRoadmapMode && stages.length > 1 && (
                <span className="rml-actionbar__hint">Drag folders to reorder the sequence</span>
              )}
            </div>

            {/* Folder list */}
            <div className="rml-folders">
              {boardLoading && !rm ? (
                <div className="rml-folders__loading"><Loader size={16} className="rml-spin" /> Loading…</div>
              ) : stages.length === 0 ? (
                <div className="rml-folders__empty">
                  <p>No folders yet.</p>
                  <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setAddingFolder(true)} type="button">
                    <Plus size={13} /> Add a folder
                  </button>
                </div>
              ) : (
                stages.map((stage, i) => (
                  <React.Fragment key={stage._id}>
                    <FolderSection
                      stage={stage}
                      index={i}
                      allItems={items}
                      roadmapId={selectedId}
                      isRoadmapMode={isRoadmapMode}
                      onEditItem={setEditItem}
                      onDeleteFolder={handleDeleteFolder}
                      dragIndex={dragIndex}
                      dragOverIndex={dragOverIndex}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                      forceClose={collapseAll}
                    />
                    {isRoadmapMode && i < stages.length - 1 && (
                      <div className="rml-connector" />
                    )}
                  </React.Fragment>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Resource edit drawer ── */}
      {editItem && (
        <ResourceDrawer key={editItem._id} item={editItem} onClose={() => setEditItem(null)} />
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={r => { setShowCreate(false); setSelectedId(r._id); }}
        />
      )}
    </div>
  );
}
