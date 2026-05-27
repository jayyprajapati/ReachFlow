import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Plus, Mail, Linkedin, Calendar, Tag, Briefcase, Pencil, Trash2, Check, Loader, Search, ExternalLink,
} from 'lucide-react';

const PURPOSE_MAX = 100;

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(d);
}

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function emptyForm() {
  return { date: todayISO(), platform: 'gmail', purpose: '', note: '', applicationIds: [] };
}

function PlatformIcon({ platform, size = 13 }) {
  if (platform === 'linkedin') return <Linkedin size={size} />;
  return <Mail size={size} />;
}

function PlatformLabel({ platform }) {
  return platform === 'linkedin' ? 'LinkedIn DM' : 'Gmail';
}

export default function ConversationsDrawer({
  contact,
  groupId,
  companyName,
  applications,
  authedFetch,
  apiBase,
  onClose,
  onContactUpdated,
  setNotice,
  setWarningDialog,
  onNavigate,
}) {
  const [form, setForm] = useState(null); // null = closed, object = open form (new or edit)
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [appPickerOpen, setAppPickerOpen] = useState(false);
  const [appQuery, setAppQuery] = useState('');
  const drawerRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !form) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form, onClose]);

  const conversations = useMemo(() => {
    const list = Array.isArray(contact.conversations) ? [...contact.conversations] : [];
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [contact.conversations]);

  const totalTouches = conversations.length;
  const lastDate = conversations[0]?.date || null;

  const appById = useMemo(() => {
    const map = new Map();
    (applications || []).forEach(a => map.set(a.id, a));
    return map;
  }, [applications]);

  const companyApps = useMemo(() => {
    return (applications || []).filter(a => a.companyGroupId === groupId);
  }, [applications, groupId]);
  const otherApps = useMemo(() => {
    return (applications || []).filter(a => a.companyGroupId !== groupId);
  }, [applications, groupId]);

  const filteredOther = useMemo(() => {
    const q = appQuery.trim().toLowerCase();
    if (!q) return otherApps;
    return otherApps.filter(a => `${a.jobTitle || ''} ${a.companyNameSnapshot || ''}`.toLowerCase().includes(q));
  }, [otherApps, appQuery]);

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEditConv(conv) {
    setEditingId(conv.id);
    setForm({
      date: String(conv.date || '').slice(0, 10) || todayISO(),
      platform: conv.platform || 'gmail',
      purpose: conv.purpose || '',
      note: conv.note || '',
      applicationIds: Array.isArray(conv.applicationIds) ? [...conv.applicationIds] : [],
    });
  }

  function cancelForm() {
    setForm(null);
    setEditingId(null);
    setAppPickerOpen(false);
    setAppQuery('');
  }

  function toggleAppId(id) {
    setForm(f => {
      const set = new Set(f.applicationIds || []);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...f, applicationIds: [...set] };
    });
  }

  async function submitForm() {
    if (!form || saving) return;
    setSaving(true);
    try {
      const body = {
        date: new Date(form.date).toISOString(),
        platform: form.platform,
        purpose: form.purpose.slice(0, PURPOSE_MAX),
        note: form.note,
        applicationIds: form.applicationIds || [],
      };
      const url = editingId
        ? `${apiBase}/api/groups/${groupId}/contacts/${contact.id}/conversations/${editingId}`
        : `${apiBase}/api/groups/${groupId}/contacts/${contact.id}/conversations`;
      const r = await authedFetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to save');
      // Optimistically merge: update the contact's conversations array.
      const nextConversations = editingId
        ? conversations.map(c => c.id === editingId ? d : c)
        : [d, ...conversations];
      onContactUpdated({
        ...contact,
        conversations: nextConversations,
        emailCount: nextConversations.filter(c => c.platform === 'gmail').length,
        linkedInCount: nextConversations.filter(c => c.platform === 'linkedin').length,
        lastContactedDate: nextConversations.length ? nextConversations[0].date : null,
      });
      cancelForm();
      setNotice?.({ type: 'success', message: editingId ? 'Conversation updated' : 'Conversation added' });
    } catch (e) {
      setNotice?.({ type: 'error', message: e.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }

  function deleteConv(conv) {
    setWarningDialog?.({
      title: 'Delete conversation record?',
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      intent: 'danger',
      onConfirm: async () => {
        try {
          const r = await authedFetch(`${apiBase}/api/groups/${groupId}/contacts/${contact.id}/conversations/${conv.id}`, { method: 'DELETE' });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || 'Failed to delete');
          const nextConversations = conversations.filter(c => c.id !== conv.id);
          onContactUpdated({
            ...contact,
            conversations: nextConversations,
            emailCount: nextConversations.filter(c => c.platform === 'gmail').length,
            linkedInCount: nextConversations.filter(c => c.platform === 'linkedin').length,
            lastContactedDate: nextConversations.length ? nextConversations[0].date : null,
          });
          setNotice?.({ type: 'info', message: 'Conversation removed' });
        } catch (e) {
          setNotice?.({ type: 'error', message: e.message || 'Failed to delete' });
        }
      },
    });
  }

  const purposeRemaining = PURPOSE_MAX - (form?.purpose?.length || 0);

  return (
    <div className="rf-drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="rf-drawer" ref={drawerRef} role="dialog" aria-label="Conversations">
        <header className="rf-drawer__head">
          <div className="rf-drawer__head-main">
            <div className="rf-drawer__title">Conversations</div>
            <div className="rf-drawer__subtitle">
              {contact.name || 'Unnamed'} <span className="rf-drawer__sep">·</span> {companyName}
            </div>
            <div className="rf-drawer__meta">
              <span className="rf-num">{totalTouches}</span> touch{totalTouches === 1 ? '' : 'es'}
              {lastDate && <> <span className="rf-drawer__sep">·</span> last {formatDate(lastDate)}</>}
            </div>
          </div>
          <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </header>

        <div className="rf-drawer__body">
          {!form ? (
            <button className="rf-btn rf-btn--primary rf-btn--sm rf-drawer__add" onClick={startAdd}>
              <Plus size={14} /> Add record
            </button>
          ) : (
            <div className="rf-drawer__form">
              <div className="rf-drawer__form-title">{editingId ? 'Edit conversation' : 'New conversation'}</div>

              <label className="rf-drawer__field">
                <span className="rf-drawer__field-label"><Calendar size={11} /> Date</span>
                <input
                  type="date"
                  className="rf-input rf-input--sm"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                />
              </label>

              <div className="rf-drawer__field">
                <span className="rf-drawer__field-label">Platform</span>
                <div className="rf-drawer__platform">
                  {[
                    { value: 'gmail', label: 'Gmail via ReachFlow', icon: <Mail size={12} /> },
                    { value: 'linkedin', label: 'LinkedIn DM', icon: <Linkedin size={12} /> },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`rf-drawer__platform-opt${form.platform === opt.value ? ' rf-drawer__platform-opt--active' : ''}`}
                      onClick={() => setForm(f => ({ ...f, platform: opt.value }))}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="rf-drawer__field">
                <span className="rf-drawer__field-label">
                  Purpose <span className="rf-drawer__counter" data-low={purposeRemaining < 15 ? '1' : '0'}>{form.purpose.length} / {PURPOSE_MAX}</span>
                </span>
                <input
                  className="rf-input rf-input--sm"
                  maxLength={PURPOSE_MAX}
                  value={form.purpose}
                  onChange={e => setForm(f => ({ ...f, purpose: e.target.value.slice(0, PURPOSE_MAX) }))}
                  placeholder="Why did you reach out? (e.g. Followed up on application)"
                />
              </label>

              <label className="rf-drawer__field">
                <span className="rf-drawer__field-label">Note (optional)</span>
                <textarea
                  className="rf-textarea"
                  rows={3}
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Anything worth remembering — what they said, next steps, etc."
                />
              </label>

              <div className="rf-drawer__field">
                <span className="rf-drawer__field-label"><Briefcase size={11} /> Linked applications</span>
                <div className="rf-drawer__apps">
                  {(form.applicationIds || []).map(id => {
                    const a = appById.get(id);
                    return (
                      <span key={id} className="rf-chip">
                        {a ? (a.jobTitle || a.companyNameSnapshot || 'Untitled') : 'Deleted application'}
                        <button type="button" className="rf-chip__remove" onClick={() => toggleAppId(id)} aria-label="Remove">
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    className="rf-btn rf-btn--ghost rf-btn--sm rf-drawer__add-app"
                    onClick={() => setAppPickerOpen(v => !v)}
                  >
                    <Tag size={12} /> {appPickerOpen ? 'Done' : 'Attach application'}
                  </button>
                </div>
                {appPickerOpen && (
                  <div className="rf-drawer__app-picker">
                    {companyApps.length > 0 && (
                      <>
                        <div className="rf-drawer__app-section">This company</div>
                        {companyApps.map(a => {
                          const selected = (form.applicationIds || []).includes(a.id);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              className={`rf-drawer__app-row${selected ? ' rf-drawer__app-row--selected' : ''}`}
                              onClick={() => toggleAppId(a.id)}
                            >
                              <span className="rf-drawer__app-title">{a.jobTitle || 'Untitled role'}</span>
                              <span className="rf-drawer__app-meta">{a.status || 'applied'}</span>
                              {selected && <Check size={12} />}
                            </button>
                          );
                        })}
                      </>
                    )}
                    <div className="rf-drawer__app-search">
                      <Search size={11} />
                      <input
                        className="rf-input rf-input--sm"
                        placeholder="Search all applications…"
                        value={appQuery}
                        onChange={e => setAppQuery(e.target.value)}
                      />
                    </div>
                    {filteredOther.slice(0, 25).map(a => {
                      const selected = (form.applicationIds || []).includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className={`rf-drawer__app-row${selected ? ' rf-drawer__app-row--selected' : ''}`}
                          onClick={() => toggleAppId(a.id)}
                        >
                          <span className="rf-drawer__app-title">{a.jobTitle || 'Untitled role'}</span>
                          <span className="rf-drawer__app-meta">{a.companyNameSnapshot || 'No company'}</span>
                          {selected && <Check size={12} />}
                        </button>
                      );
                    })}
                    {!companyApps.length && !filteredOther.length && (
                      <div className="rf-drawer__app-empty">No applications match.</div>
                    )}
                  </div>
                )}
              </div>

              <div className="rf-drawer__form-actions">
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={cancelForm} disabled={saving}>Cancel</button>
                <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={submitForm} disabled={saving}>
                  {saving ? <Loader size={13} className="rf-spin" /> : <Check size={13} />}
                  {editingId ? 'Save' : 'Add record'}
                </button>
              </div>
            </div>
          )}

          {conversations.length === 0 ? (
            <div className="rf-drawer__empty">
              No conversations logged yet. Add your first record to start tracking outreach.
            </div>
          ) : (
            <ol className="rf-timeline">
              {conversations.map(conv => {
                const isAuto = conv.source !== 'manual';
                return (
                  <li key={conv.id} className={`rf-timeline__item${isAuto ? ' rf-timeline__item--auto' : ''}`}>
                    <span className="rf-timeline__dot"><PlatformIcon platform={conv.platform} /></span>
                    <div className="rf-timeline__body">
                      <div className="rf-timeline__head">
                        <span className="rf-timeline__date">{formatDate(conv.date)}</span>
                        <span className="rf-timeline__platform"><PlatformLabel platform={conv.platform} /></span>
                        {isAuto && <span className="rf-badge rf-badge--neutral rf-timeline__auto-tag">auto</span>}
                        {!isAuto && (
                          <span className="rf-timeline__actions">
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => startEditConv(conv)} title="Edit"><Pencil size={11} /></button>
                            <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => deleteConv(conv)} title="Delete"><Trash2 size={11} /></button>
                          </span>
                        )}
                      </div>
                      {conv.purpose ? (
                        <div className="rf-timeline__purpose">{conv.purpose}</div>
                      ) : (
                        isAuto && <div className="rf-timeline__purpose rf-timeline__purpose--muted">Sent via ReachFlow</div>
                      )}
                      {conv.note && <div className="rf-timeline__note">{conv.note}</div>}
                      {(conv.applicationIds || []).length > 0 && (
                        <div className="rf-timeline__apps">
                          {(conv.applicationIds || []).map(id => {
                            const a = appById.get(id);
                            return (
                              <button
                                key={id}
                                type="button"
                                className="rf-chip rf-chip--link"
                                onClick={() => a && onNavigate?.(`/pipeline?company=${encodeURIComponent(a.companyNameSnapshot || '')}`)}
                                disabled={!a}
                                title={a ? 'Open in pipeline' : 'Application deleted'}
                              >
                                <Briefcase size={10} />
                                {a ? (a.jobTitle || a.companyNameSnapshot || 'Untitled') : 'Deleted application'}
                                {a && <ExternalLink size={9} />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
