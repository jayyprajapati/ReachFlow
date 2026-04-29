import React, { useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { Clock, Loader } from 'lucide-react';

export default function HistoryPage() {
  const { history, historyLoading, loadHistory, drafts, draftsLoading, loadDrafts } = useApp();

  useEffect(() => { loadHistory(); loadDrafts(); }, []);

  if (historyLoading && draftsLoading) return <div className="rf-empty"><div className="rf-spinner"><Loader size={24} /></div><p className="rf-text-muted">Loading…</p></div>;

  return (
    <div className="rf-history">
      <div className="rf-page-header">
        <div><h1 className="rf-page-header__title">History</h1><p className="rf-page-header__subtitle">Sent campaigns and drafts</p></div>
      </div>

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
