import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export default function ImportGroupModal({ open, onClose, authedFetch, groups = [], onImport }) {
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [groupDetail, setGroupDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  // Reset state whenever the modal closes
  useEffect(() => {
    if (!open) {
      setSelectedGroupId('');
      setSelectedCategory('');
      setCategories([]);
      setGroupDetail(null);
      setImporting(false);
      setError('');
    }
  }, [open]);

  // Load selected group details to populate categories
  useEffect(() => {
    if (!open || !selectedGroupId) return;
    let cancelled = false;

    const fetchDetail = async () => {
      setLoading(true);
      setError('');
      try {
        const r = await authedFetch(`${API_BASE}/api/groups/${selectedGroupId}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to load group');
        if (cancelled) return;
        setGroupDetail(d);
        const uniqueRoles = [...new Set((d.contacts || []).map(c => (c.role || '').trim()).filter(Boolean))];
        setCategories(uniqueRoles);
        setSelectedCategory(uniqueRoles[0] || '');
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load group');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDetail();
    return () => { cancelled = true; };
  }, [open, selectedGroupId, authedFetch]);

  async function handleImport() {
    if (importing) return;
    if (!groupDetail || !selectedGroupId) {
      setError('Select a group to import');
      return;
    }
    if (!selectedCategory) {
      setError('Select a category');
      return;
    }

    const contacts = (groupDetail.contacts || []).filter(c => {
      const role = (c.role || '').trim();
      return role && role.toLowerCase() === selectedCategory.toLowerCase();
    });

    if (!contacts.length) {
      setError('No contacts found for that category');
      return;
    }

    setImporting(true);
    try {
      await Promise.resolve(onImport?.(contacts, groupDetail, selectedCategory));
      onClose();
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="gm-overlay" onClick={onClose}>
      <div className="gm-popup gm-popup--sm" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="gm-topbar">
          <span className="gm-title">Import Contacts From Group</span>
          <button className="gm-text-btn" onClick={onClose}>Close</button>
        </div>

        {error && (
          <div className="gm-error">
            {error}
            <button className="gm-text-btn" onClick={() => setError('')} aria-label="Dismiss">✕</button>
          </div>
        )}

        <div className="field">
          <label className="lbl">Group</label>
          <select
            className="inp"
            value={selectedGroupId}
            onChange={e => {
              setSelectedGroupId(e.target.value);
              setSelectedCategory('');
              setCategories([]);
              setError('');
            }}
            disabled={importing}
          >
            <option value="" disabled>Select a group</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.companyName}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="lbl">Category</label>
          <select
            className="inp"
            value={selectedCategory}
            onChange={e => { setSelectedCategory(e.target.value); setError(''); }}
            disabled={!selectedGroupId || loading || importing || !categories.length}
          >
            <option value="" disabled>{loading ? 'Loading…' : 'Select a category'}</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          {!categories.length && selectedGroupId && !loading && <small className="gm-muted">No categories found in this group.</small>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn--primary" onClick={handleImport} disabled={loading || importing}>{importing ? 'Importing…' : 'Import Contacts'}</button>
        </div>
      </div>
    </div>
  );
}
