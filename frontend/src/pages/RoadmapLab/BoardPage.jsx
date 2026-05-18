import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Plus, MoreHorizontal, GripVertical, ExternalLink,
  Loader, Trash2, Pencil, X, Check, Clock, Tag, ChevronDown,
  Play, Code, BookOpen, FileText, Globe, ZoomIn, ZoomOut,
  LayoutGrid, GitBranch, Minus,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import { useRoadmap } from '../../contexts/RoadmapContext.jsx';
import ProgressRing from './ProgressRing.jsx';

// ── Shared constants ──────────────────────────────────────────────────────────

const RESOURCE_TYPES = [
  { value: 'youtube_playlist', label: 'YT Playlist', icon: Play },
  { value: 'youtube_video',    label: 'YT Video',    icon: Play },
  { value: 'course',           label: 'Course',      icon: BookOpen },
  { value: 'article',          label: 'Article',     icon: FileText },
  { value: 'book',             label: 'Book',        icon: BookOpen },
  { value: 'github',           label: 'GitHub',      icon: Code },
  { value: 'custom',           label: 'Custom',      icon: Globe },
];

const ITEM_STATUSES = [
  { value: 'planned',   label: 'Planned',   color: 'var(--rf-text-faint)' },
  { value: 'active',    label: 'Active',    color: 'var(--rf-info)' },
  { value: 'completed', label: 'Done',      color: 'var(--rf-success)' },
  { value: 'skipped',   label: 'Skipped',   color: 'var(--rf-text-faint)' },
];

const PRIORITIES = [
  { value: 'high',   label: 'High',   color: 'var(--rf-error)' },
  { value: 'medium', label: 'Med',    color: 'var(--rf-warning)' },
  { value: 'low',    label: 'Low',    color: 'var(--rf-success)' },
];

function detectFromUrl(raw) {
  try {
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes('youtube.com') || h.includes('youtu.be')) return { resourceType: 'youtube_video', platform: 'YouTube' };
    if (h.includes('coursera.org'))  return { resourceType: 'course',   platform: 'Coursera' };
    if (h.includes('udemy.com'))     return { resourceType: 'course',   platform: 'Udemy' };
    if (h.includes('github.com'))    return { resourceType: 'github',   platform: 'GitHub' };
    if (h.includes('medium.com') || h.includes('dev.to') || h.includes('substack.com'))
      return { resourceType: 'article', platform: 'Article' };
  } catch {}
  return { resourceType: 'custom', platform: '' };
}

function typeLabel(rt) {
  return RESOURCE_TYPES.find(t => t.value === rt)?.label || 'Resource';
}

function statusColor(s) { return ITEM_STATUSES.find(x => x.value === s)?.color || 'var(--rf-text-faint)'; }
function priorityColor(p) { return PRIORITIES.find(x => x.value === p)?.color || 'transparent'; }

function calcStageProgress(items) {
  const ns = items.filter(i => i.status !== 'skipped');
  if (!ns.length) return 0;
  return Math.round(ns.filter(i => i.status === 'completed').length / ns.length * 100);
}

function ringColor(pct) {
  if (pct === 100) return 'var(--rf-success)';
  if (pct > 0)     return 'var(--rf-info)';
  return 'var(--rf-text-faint)';
}

// ── Shared: Status indicator ──────────────────────────────────────────────────

function NodeStatus({ status, size = 14 }) {
  const color = statusColor(status);
  if (status === 'completed') {
    return (
      <span className="rml-node-status rml-node-status--done" style={{ background: color }}>
        <Check size={size * 0.65} color="#fff" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="rml-node-status rml-node-status--skipped" style={{ borderColor: color }}>
        <Minus size={size * 0.65} color={color} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span
      className={`rml-node-status${status === 'active' ? ' rml-node-status--active' : ' rml-node-status--planned'}`}
      style={status === 'active' ? { background: color } : { borderColor: color }}
    />
  );
}

// ── Shared: Item detail panel ─────────────────────────────────────────────────

function ItemPanel({ item, onClose }) {
  const { updateItem, deleteItem } = useRoadmap();
  const { setNotice, setWarningDialog } = useApp();
  const [form, setForm] = useState({ ...item });
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm({ ...item }); }, [item._id]);

  async function save(patch) {
    setSaving(true);
    try { await updateItem(item._id, patch); }
    catch (err) { setNotice({ type: 'error', message: err.message }); }
    finally { setSaving(false); }
  }

  function onBlur(field) {
    const cur = String(form[field] ?? '');
    const orig = String(item[field] ?? '');
    if (cur !== orig) save({ [field]: form[field] });
  }

  function onSelect(field, value) {
    setForm(p => ({ ...p, [field]: value }));
    save({ [field]: value });
  }

  function handleDelete() {
    setWarningDialog({
      title: 'Delete resource?',
      message: `"${item.title}" will be permanently removed.`,
      confirmText: 'Delete', intent: 'danger',
      onConfirm: async () => {
        try { await deleteItem(item._id); onClose(); setNotice({ type: 'success', message: 'Deleted' }); }
        catch (err) { setNotice({ type: 'error', message: err.message }); }
      },
    });
  }

  return (
    <div className="rml-panel">
      <div className="rml-panel__header">
        <div className="rml-panel__title">Resource Details</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving && <Loader size={12} className="rml-spin" style={{ color: 'var(--rf-text-faint)' }} />}
          <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={onClose}><X size={15} /></button>
        </div>
      </div>
      <div className="rml-panel__body">
        <div className="rml-field">
          <label className="rml-label">Title</label>
          <input className="rf-input" value={form.title || ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} onBlur={() => onBlur('title')} />
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
            <input className="rf-input" placeholder="https://…" value={form.url || ''} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} onBlur={() => onBlur('url')} />
            {form.url && (
              <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={() => window.open(form.url.startsWith('http') ? form.url : `https://${form.url}`, '_blank')} title="Open">
                <ExternalLink size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="rml-field-row">
          <div className="rml-field">
            <label className="rml-label"><Clock size={11} /> Est. Hours</label>
            <input className="rf-input" type="number" min="0" step="0.5" placeholder="—"
              value={form.estimatedHours ?? ''}
              onChange={e => setForm(p => ({ ...p, estimatedHours: e.target.value === '' ? null : Number(e.target.value) }))}
              onBlur={() => onBlur('estimatedHours')}
            />
          </div>
          <div className="rml-field">
            <label className="rml-label"><Tag size={11} /> Tags</label>
            <input className="rf-input"
              placeholder="tag1, tag2"
              value={Array.isArray(form.tags) ? form.tags.join(', ') : ''}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
              onBlur={() => {
                if (JSON.stringify(form.tags || []) !== JSON.stringify(item.tags || [])) save({ tags: form.tags || [] });
              }}
            />
          </div>
        </div>
        <div className="rml-field rml-field--grow">
          <label className="rml-label">Notes</label>
          <textarea className="rf-input rml-notes-textarea" placeholder="Notes, links, context…"
            value={form.notes || ''} rows={5}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            onBlur={() => onBlur('notes')}
          />
        </div>
      </div>
      <div className="rml-panel__footer">
        <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={handleDelete}>
          <Trash2 size={13} /> Delete
        </button>
        {item.completedAt && (
          <span className="rml-panel__done-label">
            <Check size={11} /> {new Date(item.completedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Shared: Add item form ─────────────────────────────────────────────────────

function AddItemForm({ stageId, roadmapId, onDone, onCancel }) {
  const { createItem } = useRoadmap();
  const { setNotice } = useApp();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [detected, setDetected] = useState(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  function handleUrlChange(val) {
    setUrl(val);
    const d = val.length > 6 ? detectFromUrl(val) : null;
    setDetected(d?.platform ? d : null);
  }

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
      setTitle(''); setUrl(''); setDetected(null);
      onDone?.();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally { setSaving(false); }
  }

  return (
    <form className="rml-add-form" onSubmit={handleSubmit}>
      <input className="rf-input rf-input--sm" placeholder="Paste a URL (optional)"
        value={url} onChange={e => handleUrlChange(e.target.value)} onBlur={handleUrlBlur} />
      {detected && <div className="rml-add-detected">{detected.platform} detected</div>}
      <input ref={titleRef} className="rf-input rf-input--sm" placeholder="Resource title *"
        value={title} onChange={e => setTitle(e.target.value)} autoFocus={!url}
        onKeyDown={e => e.key === 'Escape' && onCancel?.()} />
      <div className="rml-add-form__actions">
        <button type="submit" className="rf-btn rf-btn--primary rf-btn--sm" disabled={saving || !title.trim()}>
          {saving ? <Loader size={11} className="rml-spin" /> : <Plus size={11} />} Add
        </button>
        <button type="button" className="rf-btn rf-btn--ghost rf-btn--sm" onClick={onCancel}><X size={11} /></button>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TREE VIEW
// ══════════════════════════════════════════════════════════════════════════════

function ResourceNode({ item, onSelect }) {
  const rt = RESOURCE_TYPES.find(t => t.value === item.resourceType);
  const Icon = rt?.icon || Globe;
  const isSkipped = item.status === 'skipped';

  return (
    <div
      className={`rml-res-node${isSkipped ? ' rml-res-node--skipped' : ''}`}
      onClick={() => onSelect(item)}
    >
      <NodeStatus status={item.status} size={13} />
      <div className="rml-res-node__content">
        <div className="rml-res-node__title">{item.title}</div>
        <div className="rml-res-node__meta">
          <span className="rml-res-node__type"><Icon size={10} /> {rt?.label || 'Resource'}</span>
          {item.estimatedHours && (
            <span className="rml-res-node__hours"><Clock size={9} /> {item.estimatedHours}h</span>
          )}
          {item.priority && item.priority !== 'medium' && (
            <span className="rml-res-node__priority" style={{ background: priorityColor(item.priority) }} />
          )}
        </div>
      </div>
      {item.url && (
        <a
          href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
          target="_blank"
          rel="noreferrer"
          className="rml-res-node__link"
          onClick={e => e.stopPropagation()}
          title="Open resource"
        >
          <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

function StageBlock({ stage, stageNum, allItems, roadmapId, expanded, onToggle, onSelectItem }) {
  const { deleteStage, updateStage } = useRoadmap();
  const { setNotice, setWarningDialog } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stage?.title || '');
  const menuRef = useRef(null);

  const stageId = stage?._id || null;
  const items = allItems
    .filter(i => stageId ? String(i.stageId) === String(stageId) : !i.stageId)
    .sort((a, b) => a.order - b.order);
  const progress = calcStageProgress(items);
  const doneCount = items.filter(i => i.status === 'completed').length;
  const isComplete = items.length > 0 && progress === 100;

  useEffect(() => {
    if (!showMenu) return;
    const close = e => { if (!menuRef.current?.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  async function handleRename(e) {
    e?.preventDefault();
    setEditingTitle(false);
    if (!titleDraft.trim() || titleDraft === stage?.title) return;
    try { await updateStage(stage._id, { title: titleDraft.trim() }); }
    catch (err) { setNotice({ type: 'error', message: err.message }); setTitleDraft(stage.title); }
  }

  function handleDeleteStage() {
    setShowMenu(false);
    setWarningDialog({
      title: 'Delete stage?',
      message: `"${stage.title}" and all its resources will be permanently deleted.`,
      confirmText: 'Delete', intent: 'danger',
      onConfirm: async () => {
        try { await deleteStage(stage._id); setNotice({ type: 'success', message: 'Stage deleted' }); }
        catch (err) { setNotice({ type: 'error', message: err.message }); }
      },
    });
  }

  return (
    <div className="rml-stage-block">
      {/* Stage node */}
      <div
        className={`rml-stage-node${isComplete ? ' rml-stage-node--complete' : progress > 0 ? ' rml-stage-node--progress' : ''}`}
        onClick={onToggle}
      >
        <ProgressRing
          percent={progress}
          size={36}
          strokeWidth={3}
          color={ringColor(progress)}
          track="var(--rf-border)"
        >
          {isComplete
            ? <Check size={12} color="var(--rf-success)" strokeWidth={3} />
            : <span className="rml-stage-node__num">{stageNum}</span>
          }
        </ProgressRing>

        <div className="rml-stage-node__body">
          {editingTitle ? (
            <form onSubmit={handleRename} onClick={e => e.stopPropagation()}>
              <input
                className="rf-input rf-input--sm rml-stage-title-input"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleRename}
                autoFocus
              />
            </form>
          ) : (
            <span className="rml-stage-node__title">{stage?.title || 'Unsorted'}</span>
          )}
          <span className="rml-stage-node__count">{doneCount}/{items.length}</span>
        </div>

        <div className="rml-stage-node__actions" onClick={e => e.stopPropagation()}>
          {stage && (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button className="rml-stage-node__menu-btn" onClick={() => setShowMenu(v => !v)}>
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <div className="rml-col__menu">
                  <button className="rml-col__menu-item" onClick={() => { setShowMenu(false); setEditingTitle(true); setTitleDraft(stage.title); }}>
                    <Pencil size={12} /> Rename
                  </button>
                  <div className="rml-col__menu-divider" />
                  <button className="rml-col__menu-item rml-col__menu-item--danger" onClick={handleDeleteStage}>
                    <Trash2 size={12} /> Delete stage
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            className={`rml-stage-node__toggle${expanded ? ' rml-stage-node__toggle--open' : ''}`}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Items + add form */}
      {expanded && (
        <div className="rml-stage-items">
          {items.map(item => (
            <ResourceNode key={item._id} item={item} onSelect={onSelectItem} />
          ))}

          {showAdd ? (
            <div className="rml-tree-add-wrap">
              <AddItemForm
                stageId={stageId}
                roadmapId={roadmapId}
                onDone={() => setShowAdd(false)}
                onCancel={() => setShowAdd(false)}
              />
            </div>
          ) : (
            <button className="rml-tree-add-trigger" onClick={e => { e.stopPropagation(); setShowAdd(true); }}>
              <Plus size={11} /> Add resource
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TreeView({ stages, items, roadmapId, selectedItem, onSelectItem }) {
  const { createStage } = useRoadmap();
  const { setNotice } = useApp();
  const [expanded, setExpanded] = useState({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef(null);
  const containerRef = useRef(null);
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [savingStage, setSavingStage] = useState(false);

  // All stages expanded by default
  useEffect(() => {
    const init = {};
    stages.forEach(s => { init[s._id] = true; });
    init['__unsorted__'] = true;
    setExpanded(init);
  }, [stages.length]);

  function toggleStage(id) {
    setExpanded(p => ({ ...p, [id]: !p[id] }));
  }

  function handleWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * factor, 0.3), 2));
  }

  function handleMouseDown(e) {
    if (e.target.closest('.rml-stage-node, .rml-res-node, .rml-add-form, .rml-tree-add-trigger, .rml-tree-add-wrap')) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }

  const handleMouseMove = useCallback(e => {
    if (!isPanning || !panStart.current) return;
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  }, [isPanning]);

  function handleMouseUp() { setIsPanning(false); panStart.current = null; }

  async function handleAddStage(e) {
    e.preventDefault();
    if (!newStageName.trim()) return;
    setSavingStage(true);
    try {
      const stage = await createStage(roadmapId, { title: newStageName.trim() });
      setExpanded(p => ({ ...p, [stage._id]: true }));
      setNewStageName('');
      setShowAddStage(false);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally { setSavingStage(false); }
  }

  const unsortedItems = items.filter(i => !i.stageId);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  return (
    <div
      className={`rml-tree-viewport${isPanning ? ' rml-tree-viewport--panning' : ''}`}
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom controls */}
      <div className="rml-zoom-controls">
        <button className="rml-zoom-btn" onClick={() => setZoom(z => Math.min(z * 1.15, 2))} title="Zoom in (⌘+scroll)"><ZoomIn size={13} /></button>
        <button className="rml-zoom-btn rml-zoom-btn--pct" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset view">{Math.round(zoom * 100)}%</button>
        <button className="rml-zoom-btn" onClick={() => setZoom(z => Math.max(z * 0.87, 0.3))} title="Zoom out"><ZoomOut size={13} /></button>
      </div>

      {/* Tree canvas */}
      <div
        className="rml-tree-canvas"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'top center' }}
      >
        {unsortedItems.length > 0 && (
          <>
            <StageBlock
              stage={null} stageNum="·"
              allItems={items} roadmapId={roadmapId}
              expanded={!!expanded['__unsorted__']}
              onToggle={() => toggleStage('__unsorted__')}
              onSelectItem={onSelectItem}
            />
            {sortedStages.length > 0 && <div className="rml-tree-neck" />}
          </>
        )}

        {sortedStages.map((stage, i) => (
          <React.Fragment key={stage._id}>
            <StageBlock
              stage={stage} stageNum={String(i + 1).padStart(2, '0')}
              allItems={items} roadmapId={roadmapId}
              expanded={!!expanded[stage._id]}
              onToggle={() => toggleStage(stage._id)}
              onSelectItem={onSelectItem}
            />
            {i < sortedStages.length - 1 && <div className="rml-tree-neck" />}
          </React.Fragment>
        ))}

        {/* Add stage */}
        {sortedStages.length > 0 && <div className="rml-tree-neck" />}
        {showAddStage ? (
          <form onSubmit={handleAddStage} className="rml-tree-add-stage-form">
            <input className="rf-input rf-input--sm" placeholder="Stage name" value={newStageName}
              onChange={e => setNewStageName(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Escape' && (setShowAddStage(false), setNewStageName(''))} />
            <button type="submit" className="rf-btn rf-btn--primary rf-btn--sm" disabled={savingStage || !newStageName.trim()}>
              {savingStage ? <Loader size={11} className="rml-spin" /> : <Check size={12} />}
            </button>
            <button type="button" className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => { setShowAddStage(false); setNewStageName(''); }}><X size={12} /></button>
          </form>
        ) : (
          <button className="rml-tree-add-stage-btn" onClick={() => setShowAddStage(true)}>
            <Plus size={14} /> Add Stage
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TIMELINE VIEW
// ══════════════════════════════════════════════════════════════════════════════

function TimelineView({ stages, items, roadmapId, onSelectItem }) {
  const [showAdd, setShowAdd] = useState(null);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const unsorted = items.filter(i => !i.stageId);

  const allCols = [
    ...(unsorted.length > 0 ? [{ _id: '__unsorted__', title: 'Unsorted', isUnsorted: true }] : []),
    ...sortedStages,
  ];

  return (
    <div className="rml-timeline-viewport">
      <div className="rml-timeline">
        {/* The line */}
        <div className="rml-timeline-rail">
          {allCols.map((stage, i) => {
            const stageItems = stage.isUnsorted
              ? unsorted
              : items.filter(it => String(it.stageId) === String(stage._id));
            const pct = calcStageProgress(stageItems);
            const isActive = stageItems.some(it => it.status === 'active');
            const isDone = pct === 100 && stageItems.length > 0;

            return (
              <div key={stage._id} className="rml-timeline-col">
                <div className={`rml-timeline-node${isDone ? ' rml-timeline-node--done' : isActive ? ' rml-timeline-node--active' : ''}`}>
                  <ProgressRing percent={pct} size={44} strokeWidth={3.5} color={ringColor(pct)}>
                    {isDone ? <Check size={14} color="var(--rf-success)" strokeWidth={3} /> : <span className="rml-timeline-node__pct">{pct}%</span>}
                  </ProgressRing>
                  <div className="rml-timeline-node__title">{stage.title}</div>
                </div>
                {i < allCols.length - 1 && (
                  <div className={`rml-timeline-connector${isDone ? ' rml-timeline-connector--done' : ''}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Items per stage */}
        <div className="rml-timeline-items-row">
          {allCols.map(stage => {
            const stageItems = (stage.isUnsorted ? unsorted : items.filter(it => String(it.stageId) === String(stage._id))).sort((a, b) => a.order - b.order);
            const isAddingHere = showAdd === stage._id;

            return (
              <div key={stage._id} className="rml-timeline-items">
                {stageItems.map(item => (
                  <div
                    key={item._id}
                    className="rml-tl-item"
                    onClick={() => onSelectItem(item)}
                  >
                    <NodeStatus status={item.status} size={12} />
                    <span className="rml-tl-item__title">{item.title}</span>
                  </div>
                ))}
                {isAddingHere ? (
                  <AddItemForm
                    stageId={stage.isUnsorted ? null : stage._id}
                    roadmapId={roadmapId}
                    onDone={() => setShowAdd(null)}
                    onCancel={() => setShowAdd(null)}
                  />
                ) : (
                  <button className="rml-tl-add" onClick={() => setShowAdd(stage._id)}>
                    <Plus size={10} /> Add
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// KANBAN VIEW (Phase 2 preserved)
// ══════════════════════════════════════════════════════════════════════════════

function KanbanItemCard({ item, onSelect, dragging, onDragStart, onDragEnd }) {
  const rt = RESOURCE_TYPES.find(t => t.value === item.resourceType);
  const Icon = rt?.icon || Globe;
  return (
    <div className={`rml-item${dragging ? ' rml-item--dragging' : ''}`}
      draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(item._id); }}
      onDragEnd={onDragEnd} onClick={() => onSelect(item)}>
      <div className="rml-item__drag"><GripVertical size={13} /></div>
      <div className="rml-item__content">
        <div className="rml-item__title">{item.title}</div>
        <div className="rml-item__meta">
          <span className="rml-item__type"><Icon size={10} /></span>
          <span className="rml-item__status-dot" style={{ background: statusColor(item.status) }} />
          <span className="rml-item__priority-dot" style={{ background: priorityColor(item.priority) }} />
          {item.estimatedHours && <span className="rml-item__hours"><Clock size={9} /> {item.estimatedHours}h</span>}
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ stage, items, roadmapId, onSelectItem, draggingId, onDragStart, onDragEnd, onMove }) {
  const { deleteStage, updateStage } = useRoadmap();
  const { setNotice, setWarningDialog } = useApp();
  const [dragOver, setDragOver] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stage?.title || '');
  const menuRef = useRef(null);
  const stageId = stage?._id || null;
  const colItems = [...items].sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (!showMenu) return;
    const close = e => { if (!menuRef.current?.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  async function handleRename(e) {
    e?.preventDefault();
    setEditingTitle(false);
    if (!titleDraft.trim() || titleDraft === stage?.title) return;
    try { await updateStage(stage._id, { title: titleDraft.trim() }); }
    catch (err) { setNotice({ type: 'error', message: err.message }); setTitleDraft(stage.title); }
  }

  function handleDeleteStage() {
    setShowMenu(false);
    setWarningDialog({
      title: 'Delete stage?', message: `"${stage.title}" and all its items will be deleted.`,
      confirmText: 'Delete', intent: 'danger',
      onConfirm: async () => {
        try { await deleteStage(stage._id); setNotice({ type: 'success', message: 'Stage deleted' }); }
        catch (err) { setNotice({ type: 'error', message: err.message }); }
      },
    });
  }

  return (
    <div className={`rml-col${dragOver ? ' rml-col--dragover' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (draggingId) onMove(draggingId, stageId); }}>
      <div className="rml-col__header">
        {editingTitle && stage ? (
          <form onSubmit={handleRename} style={{ flex: 1 }}>
            <input className="rf-input rf-input--sm rml-col__title-input" value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)} onBlur={handleRename} autoFocus />
          </form>
        ) : (
          <div className="rml-col__title">
            {stage?.title || <span style={{ color: 'var(--rf-text-muted)' }}>Unsorted</span>}
            <span className="rml-col__count">{colItems.length}</span>
          </div>
        )}
        <div className="rml-col__actions">
          <button className="rf-btn rf-btn--ghost rf-btn--icon rml-col__add-btn" onClick={() => setShowAdd(v => !v)}><Plus size={14} /></button>
          {stage && (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={() => setShowMenu(v => !v)}><MoreHorizontal size={14} /></button>
              {showMenu && (
                <div className="rml-col__menu">
                  <button className="rml-col__menu-item" onClick={() => { setShowMenu(false); setEditingTitle(true); setTitleDraft(stage.title); }}><Pencil size={12} /> Rename</button>
                  <div className="rml-col__menu-divider" />
                  <button className="rml-col__menu-item rml-col__menu-item--danger" onClick={handleDeleteStage}><Trash2 size={12} /> Delete</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="rml-col__body">
        {colItems.length === 0 && !showAdd && <div className="rml-col__empty">Drop items here</div>}
        {colItems.map(item => (
          <KanbanItemCard key={item._id} item={item} onSelect={onSelectItem}
            dragging={draggingId === item._id} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
      </div>
      {showAdd ? (
        <div className="rml-col__add">
          <AddItemForm stageId={stageId} roadmapId={roadmapId} onDone={() => setShowAdd(false)} onCancel={() => setShowAdd(false)} />
        </div>
      ) : (
        <button className="rml-col__add-trigger" onClick={() => setShowAdd(true)}><Plus size={12} /> Add item</button>
      )}
    </div>
  );
}

function KanbanView({ stages, items, roadmapId, onSelectItem }) {
  const { moveItem } = useRoadmap();
  const [draggingId, setDraggingId] = useState(null);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  function handleMove(itemId, newStageId) { moveItem(itemId, newStageId, roadmapId); }

  return (
    <div className="rml-board-body">
      <div className="rml-board">
        {sortedStages.map(stage => (
          <KanbanColumn key={stage._id} stage={stage} items={items.filter(i => String(i.stageId) === String(stage._id))}
            roadmapId={roadmapId} onSelectItem={onSelectItem}
            draggingId={draggingId} onDragStart={setDraggingId} onDragEnd={() => setDraggingId(null)} onMove={handleMove} />
        ))}
        <KanbanColumn stage={null} items={items.filter(i => !i.stageId)}
          roadmapId={roadmapId} onSelectItem={onSelectItem}
          draggingId={draggingId} onDragStart={setDraggingId} onDragEnd={() => setDraggingId(null)} onMove={handleMove} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BOARD PAGE (main)
// ══════════════════════════════════════════════════════════════════════════════

const VIEW_MODES = [
  { key: 'tree',     label: 'Tree',     icon: GitBranch },
  { key: 'timeline', label: 'Timeline', icon: Minus },
  { key: 'kanban',   label: 'Kanban',   icon: LayoutGrid },
];

export default function BoardPage({ id }) {
  const { activeRoadmap, boardLoading, loadRoadmap, updateRoadmap, createStage } = useRoadmap();
  const { setNotice } = useApp();
  const { navigateTo } = useRouter();

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('rml-view') || 'tree');
  const [selectedItem, setSelectedItem] = useState(null);

  function switchView(mode) { setViewMode(mode); localStorage.setItem('rml-view', mode); }

  useEffect(() => {
    loadRoadmap(id);
    return () => setSelectedItem(null);
  }, [id]);

  useEffect(() => {
    if (!selectedItem || !activeRoadmap) return;
    const fresh = (activeRoadmap.items || []).find(i => i._id === selectedItem._id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedItem)) setSelectedItem(fresh);
    if (!fresh) setSelectedItem(null);
  }, [activeRoadmap?.items]);

  function cycleStatus() {
    if (!activeRoadmap) return;
    const cycle = ['active', 'paused', 'completed'];
    const next = cycle[(cycle.indexOf(activeRoadmap.status) + 1) % cycle.length];
    updateRoadmap(id, { status: next }).catch(err => setNotice({ type: 'error', message: err.message }));
  }

  if (boardLoading || !activeRoadmap) {
    return (
      <div className="rml-board-loader">
        <Loader size={24} className="rml-spin" />
        <span>Loading roadmap…</span>
      </div>
    );
  }

  const stages = activeRoadmap.stages || [];
  const items  = activeRoadmap.items  || [];
  const pct    = activeRoadmap.progressPercent || 0;

  return (
    <div className={`rml-board-page${selectedItem ? ' rml-board-page--panel-open' : ''}`}>
      {/* Header */}
      <div className="rml-board-header">
        <div className="rml-board-header__left">
          <button className="rf-btn rf-btn--ghost rf-btn--sm rml-back-btn" onClick={() => navigateTo('/roadmaps')}>
            <ArrowLeft size={15} /> Roadmaps
          </button>
          <div className="rml-board-title-wrap">
            <h1 className="rml-board-title">{activeRoadmap.title}</h1>
            {activeRoadmap.domain && <span className="rml-board-domain">{activeRoadmap.domain}</span>}
          </div>
          <button
            className={`rml-status-badge rml-status-badge--${activeRoadmap.status}`}
            onClick={cycleStatus}
            title="Click to cycle status"
          >
            {activeRoadmap.status}
          </button>
        </div>

        <div className="rml-board-header__right">
          {/* Progress */}
          <div className="rml-header-ring">
            <ProgressRing percent={pct} size={32} strokeWidth={3} color="var(--rf-accent)" track="var(--rf-border)">
              <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--rf-text-secondary)' }}>{pct}</span>
            </ProgressRing>
          </div>

          {/* View switcher */}
          <div className="rml-view-switcher">
            {VIEW_MODES.map(v => {
              const Icon = v.icon;
              return (
                <button
                  key={v.key}
                  className={`rml-view-btn${viewMode === v.key ? ' rml-view-btn--active' : ''}`}
                  onClick={() => switchView(v.key)}
                  title={v.label}
                >
                  <Icon size={13} />
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="rml-board-body-wrap">
        {viewMode === 'tree' && (
          <TreeView
            stages={stages}
            items={items}
            roadmapId={id}
            selectedItem={selectedItem}
            onSelectItem={setSelectedItem}
          />
        )}
        {viewMode === 'timeline' && (
          <TimelineView
            stages={stages}
            items={items}
            roadmapId={id}
            onSelectItem={setSelectedItem}
          />
        )}
        {viewMode === 'kanban' && (
          <KanbanView
            stages={stages}
            items={items}
            roadmapId={id}
            onSelectItem={setSelectedItem}
          />
        )}

        {/* Detail panel */}
        {selectedItem && (
          <ItemPanel
            key={selectedItem._id}
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </div>
    </div>
  );
}
