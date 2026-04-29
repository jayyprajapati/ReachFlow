import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { Clock, Loader, Calendar, X } from 'lucide-react';

export default function HistoryPage() {
  const { API_BASE, authedFetch, setNotice, history, historyLoading, loadHistory, drafts, draftsLoading, loadDrafts, scheduled, scheduledLoading, loadScheduled } = useApp();
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => { loadHistory(); loadDrafts(); loadScheduled(); }, []);

  async function cancelScheduled(id) {
    if (cancellingId) return;
    setCancellingId(id);
    try {
      const r = await authedFetch(`${API_BASE}/api/campaigns/${id}/cancel-schedule`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to cancel');
      setNotice({ type: 'info', message: 'Scheduled send cancelled' });
      loadScheduled(); loadDrafts();
    } catch (e) {
      setNotice({ type: 'error', message: e.message || 'Failed to cancel scheduled send' });
    } finally { setCancellingId(null); }
  }

  const isLoading = historyLoading && draftsLoading && scheduledLoading;
  if (isLoading) return <div className="rf-empty"><div className="rf-spinner"><Loader size={24} /></div><p className="rf-text-muted">Loading…</p></div>;

  return (
    <div className="rf-history">
      <div className="rf-page-header">
        <div><h1 className="rf-page-header__title">History</h1><p className="rf-page-header__subtitle">Sent campaigns, scheduled sends, and drafts</p></div>
      </div>

      {/* Scheduled */}
      {scheduled.length > 0 && (
        <>
          <h3 style={{ fontSize: 'var(--rf-text-md)', fontWeight: 600, color: 'var(--rf-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--rf-sp-2)' }}>
            <Calendar size={15} />Scheduled
          </h3>
          <div className="rf-history__list">
            {scheduled.map(s => (
              <div key={s.id} className="rf-history-item">
                <div className="rf-history-item__info">
                  <div className="rf-history-item__subject">{s.subject || '(No subject)'}</div>
                  <div className="rf-history-item__date">
                    Sends at: {s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : '—'}
                  </div>
                </div>
                <div className="rf-history-item__meta">
                  <span className="rf-badge rf-badge--scheduled">scheduled</span>
                  <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>{s.recipient_count} recipients</span>
                  <button
                    className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm"
                    title="Cancel scheduled send"
                    onClick={() => cancelScheduled(s.id)}
                    disabled={cancellingId === s.id}
                  >
                    {cancellingId === s.id ? <Loader size={13} style={{ animation: 'rf-spin 1s linear infinite' }} /> : <X size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <>
          <h3 style={{ fontSize: 'var(--rf-text-md)', fontWeight: 600, color: 'var(--rf-text-secondary)' }}>Drafts</h3>
          <div className="rf-history__list">
            {drafts.map(d => (
              <div key={d.id} className="rf-history-item">
                <div className="rf-history-item__info">
                  <div className="rf-history-item__subject">{d.subject || '(No subject)'}</div>
                  <div className="rf-history-item__date">Last edited: {new Date(d.updated_at || d.created_at).toLocaleString()}</div>
                </div>
                <div className="rf-history-item__meta">
                  <span className="rf-badge rf-badge--draft">draft</span>
                  <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>{d.recipient_count} recipients</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Sent */}
      <h3 style={{ fontSize: 'var(--rf-text-md)', fontWeight: 600, color: 'var(--rf-text-secondary)' }}>Sent</h3>
      {history.length ? (
        <div className="rf-history__list">
          {history.map(h => (
            <div key={h.id} className="rf-history-item">
              <div className="rf-history-item__info">
                <div className="rf-history-item__subject">{h.subject}</div>
                <div className="rf-history-item__date">{new Date(h.updated_at || h.created_at).toLocaleString()}</div>
              </div>
              <div className="rf-history-item__meta">
                <span className={`rf-badge rf-badge--${h.status}`}>{h.status}</span>
                <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-muted)' }}>{h.recipient_count} recipients</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rf-empty">
          <div className="rf-empty__icon"><Clock size={40} /></div>
          <div className="rf-empty__title">No sent campaigns yet</div>
          <div className="rf-empty__desc">Send your first campaign from the Compose page.</div>
        </div>
      )}
    </div>
  );
}
