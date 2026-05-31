import React, { useEffect, useRef, useState } from 'react';
import {
  X, Plus, MoreHorizontal, ExternalLink, Loader, Trash2, Pencil,
  Check, Clock, Tag, Play, Code, BookOpen, FileText, Globe, Minus,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRoadmap } from '../../contexts/RoadmapContext.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────

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
  { value: 'planned',   label: 'Planned'   },
  { value: 'active',    label: 'Active'    },
  { value: 'completed', label: 'Done'      },
  { value: 'skipped',   label: 'Skipped'   },
];

const PRIORITIES = [
  { value: 'high',   label: 'High'   },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low'    },
];

const STATUS_CYCLE = ['planned', 'active', 'completed'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectFromUrl(raw) {
  try {
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes('youtube.com') || h.includes('youtu.be')) return { resourceType: 'youtube_video', platform: 'YouTube' };
    if (h.includes('coursera.org'))   return { resourceType: 'course',   platform: 'Coursera' };
    if (h.includes('udemy.com'))      return { resourceType: 'course',   platform: 'Udemy' };
    if (h.includes('github.com'))     return { resourceType: 'github',   platform: 'GitHub' };
    if (h.includes('medium.com') || h.includes('dev.to') || h.includes('substack.com'))
      return { resourceType: 'article', platform: 'Article' };
  } catch {}
  return { resourceType: 'custom', platform: '' };
}

function stageProgress(items, stageId) {
  const si        = stageId
    ? items.filter(i => String(i.stageId) === String(stageId))
    : items.filter(i => !i.stageId);
  const countable = si.filter(i => i.status !== 'skipped');
  const done      = countable.filter(i => i.status === 'completed');
  return {
    pct:   countable.length ? Math.round(done.length / countable.length * 100) : 0,
    done:  done.length,
    total: si.length,
  };
}

// ── Status bullet ─────────────────────────────────────────────────────────────

function Bullet({ status, onClick }) {
  const base = { width: 14, height: 14 };
  if (status === 'completed') {
    return (
      <button className="rml-bullet rml-bullet--done" style={base} onClick={onClick} title="Done — click to cycle">
        <Check size={8} strokeWidth={3} />
      </button>
    );
  }
  if (status === 'active') {
    return (
      <button className="rml-bullet rml-bullet--active" style={base} onClick={onClick} title="In progress — click to cycle" />
    );
  }
  if (status === 'skipped') {
    return (
      <button className="rml-bullet rml-bullet--skip" style={base} onClick={onClick} title="Skipped — click to cycle">
        <Minus size={8} strokeWidth={2.5} />
      </button>
    );
  }
  return (
    <button className="rml-bullet rml-bullet--plan" style={base} onClick={onClick} title="Planned — click to mark active" />
  );
}

// ── Resource card in kanban column ────────────────────────────────────────────

function KanbanCard({ item, isSelected, onSelect }) {
  const { updateItem } = useRoadmap();
  const { setNotice }  = useApp();
  const rt = RESOURCE_TYPES.find(t => t.value === item.resourceType);

  function cycleStatus(e) {
    e.stopPropagation();
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(item.status) + 1) % STATUS_CYCLE.length];
    updateItem(item._id, { status: next }).catch(err =>
      setNotice({ type: 'error', message: err.message })
    );
  }

  return (
    <div
      className={`rml-kcard rml-kcard--${item.status}${isSelected ? ' rml-kcard--sel' : ''}`}
      onClick={() => onSelect(item)}
    >
      <div className="rml-kcard__top">
        <Bullet status={item.status} onClick={cycleStatus} />
        <span className="rml-kcard__title">{item.title}</span>
      </div>
      <div className="rml-kcard__foot">
        {rt && (
          <span className="rml-kcard__type" style={{ color: rt.color }}>
            <rt.icon size={10} /> {rt.label}
          </span>
        )}
        {item.estimatedHours ? (
          <span className="rml-kcard__hrs">
            <Clock size={9} /> {item.estimatedHours}h
          </span>
        ) : null}
        {item.url && (
          <a
            href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
            target="_blank"
            rel="noreferrer"
            className="rml-kcard__link"
            onClick={e => e.stopPropagation()}
            title="Open resource"
          >
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Inline add-item form ──────────────────────────────────────────────────────

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
        const parts = new URL(url.startsWith('http') ? url : `https://${url}`)
          .pathname.split('/').filter(Boolean);
        if (parts.length) {
          setTitle(parts[parts.length - 1].replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase()));
        }
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
      await createItem(roadmapId, {
        stageId:      stageId || null,
        title:        title.trim(),
        url:          url.trim(),
        resourceType,
        platform,
      });
      onDone?.();
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="rml-inline-form"
      onSubmit={handleSubmit}
      onKeyDown={e => e.key === 'Escape' && onCancel?.()}
    >
      <input
        className="rf-input rf-input--sm"
        placeholder="URL (optional)"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onBlur={handleUrlBlur}
      />
      <input
        ref={titleRef}
        className="rf-input rf-input--sm"
        placeholder="Resource title *"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus={!url}
      />
      <div className="rml-inline-form__btns">
        <button
          type="submit"
          className="rf-btn rf-btn--primary rf-btn--sm"
          disabled={saving || !title.trim()}
        >
          {saving ? <Loader size={11} className="rml-spin" /> : <Plus size={11} />}
          Add
        </button>
        <button type="button" className="rf-btn rf-btn--ghost rf-btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Kanban column (one stage) ─────────────────────────────────────────────────

function KanbanColumn({ stage, stageNum, allItems, roadmapId, selectedItemId, onSelectItem }) {
  const { deleteStage, updateStage } = useRoadmap();
  const { setNotice, setWarningDialog } = useApp();
  const [showAdd, setShowAdd]           = useState(false);
  const [showMenu, setShowMenu]         = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft]     = useState(stage?.title || '');
  const menuRef = useRef(null);

  const stageId = stage?._id || null;
  const cards   = allItems
    .filter(i => stageId ? String(i.stageId) === String(stageId) : !i.stageId)
    .sort((a, b) => a.order - b.order);

  const { pct, done, total } = stageProgress(allItems, stageId);
  const isComplete = total > 0 && pct === 100;
  const barColor   = isComplete ? 'var(--rf-success)' : pct > 0 ? 'var(--rf-accent)' : 'var(--rf-border)';

  useEffect(() => {
    if (!showMenu) return;
    const close = e => {
      if (!menuRef.current?.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  async function handleRename(e) {
    e?.preventDefault();
    setEditingTitle(false);
    if (!titleDraft.trim() || titleDraft === stage?.title) return;
    try { await updateStage(stage._id, { title: titleDraft.trim() }); }
    catch (err) {
      setNotice({ type: 'error', message: err.message });
      setTitleDraft(stage.title);
    }
  }

  function handleDelete() {
    setShowMenu(false);
    setWarningDialog({
      title:       'Delete stage?',
      message:     `"${stage.title}" and all its resources will be permanently deleted.`,
      confirmText: 'Delete',
      intent:      'danger',
      onConfirm: async () => {
        try {
          await deleteStage(stage._id);
          setNotice({ type: 'success', message: 'Stage deleted' });
        } catch (err) {
          setNotice({ type: 'error', message: err.message });
        }
      },
    });
  }

  return (
    <div className={`rml-kcol${isComplete ? ' rml-kcol--done' : ''}`}>
      {/* Column header */}
      <div className="rml-kcol__hd">
        <div className="rml-kcol__hd-row">
          <span
            className="rml-kcol__num"
            style={isComplete ? { background: 'var(--rf-success)', color: '#fff' } : {}}
          >
            {isComplete ? <Check size={9} strokeWidth={3} /> : stageNum}
          </span>

          {editingTitle ? (
            <form onSubmit={handleRename} style={{ flex: 1, minWidth: 0 }}>
              <input
                className="rf-input rf-input--sm rml-kcol__rename"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleRename}
                autoFocus
              />
            </form>
          ) : (
            <span className="rml-kcol__title">{stage?.title || 'Unsorted'}</span>
          )}

          <span className="rml-kcol__count">{done}/{total}</span>

          {stage && (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                className="rml-kcol__menu"
                onClick={() => setShowMenu(v => !v)}
              >
                <MoreHorizontal size={13} />
              </button>
              {showMenu && (
                <div className="rml-dropdown">
                  <button
                    className="rml-dropdown__item"
                    onClick={() => {
                      setShowMenu(false);
                      setEditingTitle(true);
                      setTitleDraft(stage.title);
                    }}
                  >
                    <Pencil size={12} /> Rename
                  </button>
                  <div className="rml-dropdown__div" />
                  <button
                    className="rml-dropdown__item rml-dropdown__item--danger"
                    onClick={handleDelete}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Column progress bar */}
        <div className="rml-kcol__prog">
          <div className="rml-kcol__prog-fill" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      </div>

      {/* Cards */}
      <div className="rml-kcol__cards">
        {cards.map(item => (
          <KanbanCard
            key={item._id}
            item={item}
            isSelected={selectedItemId === item._id}
            onSelect={onSelectItem}
          />
        ))}

        {showAdd ? (
          <InlineAddForm
            stageId={stageId}
            roadmapId={roadmapId}
            onDone={() => setShowAdd(false)}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <button className="rml-kcol__add" onClick={() => setShowAdd(true)}>
            <Plus size={11} /> Add resource
          </button>
        )}
      </div>
    </div>
  );
}

// ── Resource detail panel ─────────────────────────────────────────────────────

function DetailPanel({ item, onClose }) {
  const { updateItem, deleteItem } = useRoadmap();
  const { setNotice, setWarningDialog } = useApp();
  const [form, setForm]     = useState({ ...item });
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
    const orig = String(item[field] ?? '');
    if (cur !== orig) save({ [field]: form[field] });
  }

  function onSelect(field, val) {
    setForm(p => ({ ...p, [field]: val }));
    save({ [field]: val });
  }

  function handleDelete() {
    setWarningDialog({
      title:       'Delete resource?',
      message:     `"${item.title}" will be permanently removed.`,
      confirmText: 'Delete',
      intent:      'danger',
      onConfirm: async () => {
        try {
          await deleteItem(item._id);
          onClose();
          setNotice({ type: 'success', message: 'Deleted' });
        } catch (err) {
          setNotice({ type: 'error', message: err.message });
        }
      },
    });
  }

  const rt = RESOURCE_TYPES.find(t => t.value === form.resourceType);

  return (
    <aside className="rml-detail">
      <div className="rml-detail__hd">
        <div className="rml-detail__hd-title">
          {rt && <rt.icon size={13} color={rt.color} />}
          <span>Resource</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving && <Loader size={12} className="rml-spin" style={{ color: 'var(--rf-text-faint)' }} />}
          <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="rml-detail__body">
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
            <select
              className="rf-select"
              value={form.status || 'planned'}
              onChange={e => onSelect('status', e.target.value)}
            >
              {ITEM_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="rml-field">
            <label className="rml-label">Priority</label>
            <select
              className="rf-select"
              value={form.priority || 'medium'}
              onChange={e => onSelect('priority', e.target.value)}
            >
              {PRIORITIES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rml-field">
          <label className="rml-label">Type</label>
          <select
            className="rf-select"
            value={form.resourceType || 'custom'}
            onChange={e => onSelect('resourceType', e.target.value)}
          >
            {RESOURCE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
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
              <button
                className="rf-btn rf-btn--ghost rf-btn--icon"
                onClick={() => window.open(form.url.startsWith('http') ? form.url : `https://${form.url}`, '_blank')}
                title="Open"
              >
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
              type="number"
              min="0"
              step="0.5"
              placeholder="—"
              value={form.estimatedHours ?? ''}
              onChange={e => setForm(p => ({
                ...p,
                estimatedHours: e.target.value === '' ? null : Number(e.target.value),
              }))}
              onBlur={() => onBlur('estimatedHours')}
            />
          </div>
          <div className="rml-field">
            <label className="rml-label"><Tag size={10} /> Tags</label>
            <input
              className="rf-input"
              placeholder="tag1, tag2"
              value={Array.isArray(form.tags) ? form.tags.join(', ') : ''}
              onChange={e => setForm(p => ({
                ...p,
                tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
              }))}
              onBlur={() => {
                if (JSON.stringify(form.tags || []) !== JSON.stringify(item.tags || []))
                  save({ tags: form.tags || [] });
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

      <div className="rml-detail__ft">
        <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={handleDelete}>
          <Trash2 size={13} /> Delete
        </button>
        {item.completedAt && (
          <span className="rml-detail__done">
            <Check size={10} /> {new Date(item.completedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </aside>
  );
}

// ── Board Modal ───────────────────────────────────────────────────────────────

export default function BoardPage({ id, onClose }) {
  const { activeRoadmap, boardLoading, loadRoadmap, updateRoadmap, createStage } = useRoadmap();
  const { setNotice } = useApp();
  const [selectedItem, setSelectedItem] = useState(null);
  const [addingStage, setAddingStage]   = useState(false);
  const [stageName, setStageName]       = useState('');
  const [savingStage, setSavingStage]   = useState(false);

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

  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') {
        if (selectedItem) setSelectedItem(null);
        else onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedItem, onClose]);

  function cycleStatus() {
    if (!activeRoadmap) return;
    const cycle = ['active', 'paused', 'completed'];
    const next  = cycle[(cycle.indexOf(activeRoadmap.status) + 1) % cycle.length];
    updateRoadmap(id, { status: next }).catch(err =>
      setNotice({ type: 'error', message: err.message })
    );
  }

  async function handleAddStage(e) {
    e.preventDefault();
    if (!stageName.trim()) return;
    setSavingStage(true);
    try {
      await createStage(id, { title: stageName.trim() });
      setStageName('');
      setAddingStage(false);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setSavingStage(false);
    }
  }

  const rm           = activeRoadmap;
  const stages       = rm?.stages || [];
  const items        = rm?.items  || [];
  const pct          = rm?.progressPercent || 0;
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  const hasUnsorted  = items.some(i => !i.stageId);

  const STATUS_META = {
    active:    { label: 'Active',    cls: 'rml-spill--active' },
    paused:    { label: 'Paused',    cls: 'rml-spill--paused' },
    completed: { label: 'Completed', cls: 'rml-spill--done' },
  };
  const { label: stLabel, cls: stCls } =
    STATUS_META[rm?.status] || { label: rm?.status || '', cls: '' };

  return (
    <div
      className="rml-board-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rml-board" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="rml-board-hd">
          <button
            className="rf-btn rf-btn--ghost rf-btn--icon"
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={17} />
          </button>

          <div className="rml-board-hd__info">
            {rm ? (
              <>
                <h2 className="rml-board-hd__title">{rm.title}</h2>
                <div className="rml-board-hd__meta">
                  {rm.domain && (
                    <span className="rml-board-domain">{rm.domain}</span>
                  )}
                  <button
                    className={`rml-spill ${stCls}`}
                    onClick={cycleStatus}
                    title="Click to cycle status"
                  >
                    {stLabel}
                  </button>
                </div>
              </>
            ) : (
              <div className="rml-board-hd__skel" />
            )}
          </div>

          <div className="rml-board-hd__right">
            {rm && (
              <div className="rml-board-progress">
                <span className="rml-board-progress__num">{pct}</span>
                <span className="rml-board-progress__pct">%</span>
                <span className="rml-board-progress__lbl">complete</span>
              </div>
            )}
          </div>
        </div>

        {/* Thin accent bar */}
        {rm && (
          <div className="rml-board-bar">
            <div className="rml-board-bar__fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Body */}
        <div className="rml-board-body">

          {/* Kanban area */}
          <div className="rml-kanban">
            {boardLoading || !rm ? (
              <div className="rml-board-loading">
                <Loader size={20} className="rml-spin" />
                <span>Loading board…</span>
              </div>
            ) : (
              <>
                {hasUnsorted && (
                  <KanbanColumn
                    stage={null}
                    stageNum="·"
                    allItems={items}
                    roadmapId={id}
                    selectedItemId={selectedItem?._id}
                    onSelectItem={setSelectedItem}
                  />
                )}

                {sortedStages.map((stage, i) => (
                  <KanbanColumn
                    key={stage._id}
                    stage={stage}
                    stageNum={i + 1}
                    allItems={items}
                    roadmapId={id}
                    selectedItemId={selectedItem?._id}
                    onSelectItem={setSelectedItem}
                  />
                ))}

                {/* Add stage */}
                {addingStage ? (
                  <div className="rml-kcol rml-kcol--form">
                    <form onSubmit={handleAddStage} style={{ padding: 14 }}>
                      <input
                        className="rf-input rf-input--sm"
                        placeholder="Stage name…"
                        value={stageName}
                        onChange={e => setStageName(e.target.value)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            setAddingStage(false);
                            setStageName('');
                          }
                        }}
                      />
                      <div className="rml-inline-form__btns" style={{ marginTop: 8 }}>
                        <button
                          type="submit"
                          className="rf-btn rf-btn--primary rf-btn--sm"
                          disabled={savingStage || !stageName.trim()}
                        >
                          {savingStage ? <Loader size={11} className="rml-spin" /> : <Check size={12} />}
                          Add
                        </button>
                        <button
                          type="button"
                          className="rf-btn rf-btn--ghost rf-btn--sm"
                          onClick={() => { setAddingStage(false); setStageName(''); }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <button
                    className="rml-kcol-new"
                    onClick={() => setAddingStage(true)}
                  >
                    <Plus size={15} />
                    <span>Add Stage</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Detail panel */}
          {selectedItem && (
            <DetailPanel
              key={selectedItem._id}
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
