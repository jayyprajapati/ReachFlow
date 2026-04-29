import React, { useEffect, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import { FileText, Trash2, Loader, Plus } from 'lucide-react';

const strip = h => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export default function TemplatesPage() {
  const { API_BASE, authedFetch, templates, templatesLoading, loadTemplates, setNotice, setWarningDialog } = useApp();
  const { navigateTo } = useRouter();
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadTemplates(); }, []);

  async function deleteTemplate(id) {
    setWarningDialog({ title: 'Delete template?', message: 'This cannot be undone.', confirmText: 'Delete', intent: 'danger', onConfirm: async () => {
      try {
        const r = await authedFetch(`${API_BASE}/api/templates/${id}`, { method: 'DELETE' });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
        setNotice({ type: 'info', message: 'Template deleted' }); loadTemplates(); setSelected(null);
      } catch (e) { setNotice({ type: 'error', message: e.message }); }
    }});
  }

  if (templatesLoading) return <div className="rf-empty"><div className="rf-spinner"><Loader size={24} /></div><p className="rf-text-muted">Loading templates…</p></div>;

  return (
    <div className="rf-templates">
      <div className="rf-page-header">
        <div><h1 className="rf-page-header__title">Templates</h1><p className="rf-page-header__subtitle">{templates.length} saved templates</p></div>
        <div className="rf-page-header__actions">
          <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => navigateTo('/')}><Plus size={14} />Create from Compose</button>
        </div>
      </div>
      {templates.length ? (
        <div className="rf-templates__grid">
          {templates.map(t => (
            <div key={t.id} className="rf-template-card" onClick={() => setSelected(t)}>
              <div className="rf-template-card__title">{t.title || t.subject || 'Untitled'}</div>
              <div className="rf-template-card__subject">Subject: {t.subject || '—'}</div>
              <div className="rf-template-card__preview">{strip(t.body_html || '').slice(0, 120) || 'Empty body'}</div>
              <div className="rf-template-card__actions">
                <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={e => { e.stopPropagation(); navigateTo('/'); }}>Use</button>
                <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={e => { e.stopPropagation(); deleteTemplate(t.id); }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rf-empty">
          <div className="rf-empty__icon"><FileText size={40} /></div>
          <div className="rf-empty__title">No templates yet</div>
          <div className="rf-empty__desc">Save your email compositions as templates from the Compose page.</div>
        </div>
      )}

      {selected && (
        <>
          <div className="rf-drawer-overlay" onClick={() => setSelected(null)} />
          <div className="rf-drawer">
            <div className="rf-drawer__header">
              <span className="rf-drawer__title">{selected.title || 'Template'}</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="rf-drawer__body">
              <div className="rf-label">Subject</div>
              <p style={{ fontSize: 'var(--rf-text-sm)', marginBottom: 'var(--rf-sp-4)' }}>{selected.subject || '—'}</p>
              <div className="rf-label">Body</div>
              <div className="rf-preview-frame" dangerouslySetInnerHTML={{ __html: selected.body_html || '' }} />
            </div>
            <div className="rf-drawer__footer">
              <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={() => deleteTemplate(selected.id)}><Trash2 size={13} />Delete</button>
              <button className="rf-btn rf-btn--primary" onClick={() => { setSelected(null); navigateTo('/'); }}>Use Template</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
