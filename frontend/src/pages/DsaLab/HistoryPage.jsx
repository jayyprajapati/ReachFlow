import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import {
  Loader, Trash2, ArrowLeft, Code2, Trophy, Clock, Binary,
} from 'lucide-react';
import { makeDsaApi } from '../../services/dsaApi.js';
import DsaResult from '../../components/dsa/DsaResult.jsx';

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HistoryPage() {
  const { authedFetch, setNotice } = useApp();
  const api = useMemo(() => makeDsaApi(authedFetch), [authedFetch]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);     // full doc being viewed
  const [activeLoading, setActiveLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAnalyses();
      setItems(data.analyses || []);
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to load history' });
    } finally {
      setLoading(false);
    }
  }, [api, setNotice]);

  useEffect(() => { load(); }, [load]);

  async function open(id) {
    setActiveLoading(true);
    try {
      const data = await api.getAnalysis(id);
      setActive(data);
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to open analysis' });
    } finally {
      setActiveLoading(false);
    }
  }

  async function remove(id, e) {
    e?.stopPropagation();
    try {
      await api.deleteAnalysis(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (active?.id === id) setActive(null);
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete' });
    }
  }

  async function clearAll() {
    if (!items.length) return;
    if (!window.confirm('Clear all DSA analyses? This cannot be undone.')) return;
    try {
      await api.clearHistory();
      setItems([]);
      setActive(null);
      setNotice({ type: 'success', message: 'DSA history cleared.' });
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to clear history' });
    }
  }

  // ── Detail view ──
  if (active) {
    return (
      <div className="dsa-history-detail">
        <div className="dsa-history-detail__bar">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setActive(null)}>
            <ArrowLeft size={13} /> Back to history
          </button>
        </div>
        {activeLoading
          ? <div className="dsa-loading"><Loader size={24} className="rf-spin" /></div>
          : <DsaResult result={active.result} problemStatement={active.problemStatement} userCode={active.userCode} />}
      </div>
    );
  }

  // ── List view ──
  if (loading) {
    return <div className="dsa-loading"><Loader size={24} className="rf-spin" style={{ color: 'var(--rf-accent)' }} /><p>Loading history…</p></div>;
  }

  if (!items.length) {
    return (
      <div className="rf-empty dsa-output__empty">
        <div className="dsa-output__empty-icon"><Clock size={22} /></div>
        <p className="rf-empty__title">No history yet</p>
        <p className="rf-empty__desc">Analyses you run will appear here so you can revisit them anytime.</p>
      </div>
    );
  }

  return (
    <div className="dsa-history">
      <div className="dsa-history__top">
        <span className="dsa-history__count">{items.length} {items.length === 1 ? 'analysis' : 'analyses'}</span>
        <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={clearAll}><Trash2 size={13} /> Clear all</button>
      </div>

      <div className="dsa-history__list">
        {items.map((it) => (
          <div key={it.id} className="dsa-history-item" onClick={() => open(it.id)} role="button" tabIndex={0}>
            <div className="dsa-history-item__icon"><Binary size={16} /></div>
            <div className="dsa-history-item__main">
              <div className="dsa-history-item__title">{it.problemTitle || 'Untitled problem'}</div>
              <div className="dsa-history-item__meta">
                <span>{fmt(it.createdAt)}</span>
                {it.hasUserCode && <span className="rf-badge rf-badge--neutral"><Code2 size={10} /> {it.language === 'python' ? 'Python' : 'Java'} reviewed</span>}
                {it.isOptimal === true && <span className="rf-badge rf-badge--success"><Trophy size={10} /> Optimal</span>}
              </div>
            </div>
            <button className="dsa-history-item__del" title="Delete" onClick={(e) => remove(it.id, e)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
