import React from 'react';
import { ExternalLink, Copy, Pencil, Trash2, Check, X } from 'lucide-react';

function renderEmailStatus(status) {
  const safe = ['verified', 'tentative', 'not_valid'].includes(status) ? status : 'tentative';
  const label = safe === 'not_valid' ? 'Not Valid' : safe.charAt(0).toUpperCase() + safe.slice(1);
  return <span className={`gm-pill gm-pill--${safe}`}>{label}</span>;
}

function renderLinkedInStatus(status) {
  const safe = ['not_connected', 'request_sent', 'connected'].includes(status) ? status : 'not_connected';
  const label = safe === 'request_sent' ? 'Request Sent' : safe === 'not_connected' ? 'Not Connected' : 'Connected';
  return <span className={`gm-pill gm-pill--li-${safe}`}>{label}</span>;
}

function formatHistoryDate(contact) {
  const rawDate = contact?.lastContactedDate || contact?.lastContacted?.date;
  if (!rawDate) return '-';
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return '-';
  const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(d);
  const method = (contact?.lastContacted?.type || 'email') === 'linkedin' ? 'LinkedIn' : 'Email';
  return `${formatted} (${method})`;
}

export default function ContactsTable({
  contacts,
  editingContactId,
  contactForm,
  setContactForm,
  copiedField,
  onCopyClick,
  onStartEdit,
  onDelete,
  onSave,
  onCancel,
  roleOptions,
  connectionOptions,
}) {
  return (
    <table className="gm-ct-table">
      <colgroup>
        <col className="gm-col-name" />
        <col className="gm-col-email" />
        <col className="gm-col-status" />
        <col className="gm-col-history" />
        <col className="gm-col-left" />
        <col className="gm-col-actions" />
      </colgroup>
      <thead>
        <tr className="gm-ct-head">
          <th>Name</th>
          <th>Email + Role</th>
          <th>Status</th>
          <th>Contact History</th>
          <th>Left Co.</th>
          <th className="gm-th-right">Actions</th>
        </tr>
      </thead>

      <tbody className="gm-ct-body">
        {editingContactId === '__new__' && (
          <tr className="gm-ct-row gm-row--editing">
            <td className="gm-ct-cell">
              <div className="gm-ct-stack">
                <input
                  className="gm-inp"
                  value={contactForm.name}
                  onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Name"
                  autoFocus
                />
                <input
                  className="gm-inp"
                  value={contactForm.linkedin}
                  onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))}
                  placeholder="LinkedIn URL"
                />
              </div>
            </td>
            <td className="gm-ct-cell">
              <div className="gm-ct-stack">
                <input
                  className="gm-inp"
                  value={contactForm.email}
                  onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="Email"
                />
                <select
                  className="gm-select"
                  value={contactForm.role}
                  onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}
                >
                  {roleOptions.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                </select>
              </div>
            </td>
            <td className="gm-ct-cell">
              <div className="gm-ct-stack">
                <label className="gm-field-label">Email</label>
                <select
                  className="gm-select"
                  value={contactForm.email_status}
                  onChange={e => setContactForm(f => ({ ...f, email_status: e.target.value }))}
                >
                  <option value="verified">Verified</option>
                  <option value="tentative">Tentative</option>
                  <option value="not_valid">Not Valid</option>
                </select>
                <label className="gm-field-label">LI</label>
                <select
                  className="gm-select"
                  value={contactForm.connectionStatus}
                  onChange={e => setContactForm(f => ({ ...f, connectionStatus: e.target.value }))}
                >
                  {connectionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </td>
            <td className="gm-ct-cell">
              <div className="gm-ct-stack">
                <label className="gm-field-label">Last Contacted</label>
                <input
                  className="gm-inp"
                  type="date"
                  value={contactForm.lastContactedDate}
                  onChange={e => setContactForm(f => ({ ...f, lastContactedDate: e.target.value }))}
                />
                <div className="gm-history-count-edit">
                  <div className="gm-history-count-field">
                    <label className="gm-field-label">Email Count</label>
                    <input
                      className="gm-inp"
                      type="number"
                      min="0"
                      value={contactForm.emailCount}
                      onChange={e => setContactForm(f => ({ ...f, emailCount: e.target.value }))}
                    />
                  </div>
                  <div className="gm-history-count-field">
                    <label className="gm-field-label">LinkedIn Count</label>
                    <input
                      className="gm-inp"
                      type="number"
                      min="0"
                      value={contactForm.linkedInCount}
                      onChange={e => setContactForm(f => ({ ...f, linkedInCount: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </td>
            <td className="gm-ct-cell gm-left-cell">
              <input
                type="checkbox"
                checked={contactForm.leftCompany}
                onChange={e => setContactForm(f => ({ ...f, leftCompany: e.target.checked }))}
              />
            </td>
            <td className="gm-ct-cell gm-row-actions">
              <button className="gm-icon-btn gm-icon-btn--save" onClick={onSave} title="Save"><Check size={15} /></button>
              <button className="gm-icon-btn" onClick={onCancel} title="Cancel"><X size={15} /></button>
            </td>
          </tr>
        )}

        {contacts.map(c => (
          editingContactId === c.id ? (
            <tr key={c.id} className="gm-ct-row gm-row--editing">
              <td className="gm-ct-cell">
                <div className="gm-ct-stack">
                  <input className="gm-inp" value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} />
                  <input className="gm-inp" value={contactForm.linkedin} onChange={e => setContactForm(f => ({ ...f, linkedin: e.target.value }))} placeholder="LinkedIn URL" />
                </div>
              </td>
              <td className="gm-ct-cell">
                <div className="gm-ct-stack">
                  <input className="gm-inp" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                  <select className="gm-select" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))}>
                    {roleOptions.map(r => <option key={r} value={r}>{r || '—'}</option>)}
                  </select>
                </div>
              </td>
              <td className="gm-ct-cell">
                <div className="gm-ct-stack">
                  <label className="gm-field-label">Email</label>
                  <select className="gm-select" value={contactForm.email_status} onChange={e => setContactForm(f => ({ ...f, email_status: e.target.value }))}>
                    <option value="verified">Verified</option>
                    <option value="tentative">Tentative</option>
                    <option value="not_valid">Not Valid</option>
                  </select>
                  <label className="gm-field-label">LI</label>
                  <select className="gm-select" value={contactForm.connectionStatus} onChange={e => setContactForm(f => ({ ...f, connectionStatus: e.target.value }))}>
                    {connectionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </td>
              <td className="gm-ct-cell">
                <div className="gm-ct-stack">
                  <label className="gm-field-label">Last Contacted</label>
                  <input className="gm-inp" type="date" value={contactForm.lastContactedDate} onChange={e => setContactForm(f => ({ ...f, lastContactedDate: e.target.value }))} />
                  <div className="gm-history-count-edit">
                    <div className="gm-history-count-field">
                      <label className="gm-field-label">Email Count</label>
                      <input className="gm-inp" type="number" min="0" value={contactForm.emailCount} onChange={e => setContactForm(f => ({ ...f, emailCount: e.target.value }))} />
                    </div>
                    <div className="gm-history-count-field">
                      <label className="gm-field-label">LinkedIn Count</label>
                      <input className="gm-inp" type="number" min="0" value={contactForm.linkedInCount} onChange={e => setContactForm(f => ({ ...f, linkedInCount: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </td>
              <td className="gm-ct-cell gm-left-cell"><input type="checkbox" checked={contactForm.leftCompany} onChange={e => setContactForm(f => ({ ...f, leftCompany: e.target.checked }))} /></td>
              <td className="gm-ct-cell gm-row-actions">
                <button className="gm-icon-btn gm-icon-btn--save" onClick={onSave} title="Save"><Check size={15} /></button>
                <button className="gm-icon-btn" onClick={onCancel} title="Cancel"><X size={15} /></button>
              </td>
            </tr>
          ) : (
            <tr key={c.id} className="gm-ct-row">
              <td className="gm-ct-cell">
                <span className="gm-copy-wrap">
                  {c.linkedin ? (
                    <a className="gm-name-link" href={c.linkedin} target="_blank" rel="noreferrer" title={c.name}>
                      <span className="gm-cell-ellipsis">{c.name}</span>
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="gm-cell-ellipsis" title={c.name}>{c.name}</span>
                  )}
                  <button className="gm-copy-btn" onClick={e => onCopyClick(e, `name-${c.id}`, c.name)} aria-label="Copy name" title={copiedField === `name-${c.id}` ? 'Copied' : 'Copy'}>
                    <Copy size={12} />
                  </button>
                  {copiedField === `name-${c.id}` && <span className="gm-copy-tip">Copied</span>}
                </span>
              </td>
              <td className="gm-ct-cell">
                <div className="gm-email-cell">
                  <span className="gm-copy-wrap">
                    <span className="gm-cell-ellipsis" title={c.email}>{c.email}</span>
                    <button className="gm-copy-btn" onClick={e => onCopyClick(e, `email-${c.id}`, c.email)} aria-label="Copy email" title={copiedField === `email-${c.id}` ? 'Copied' : 'Copy'}>
                      <Copy size={12} />
                    </button>
                    {copiedField === `email-${c.id}` && <span className="gm-copy-tip">Copied</span>}
                  </span>
                  <span className="gm-role-chip">{c.role || '—'}</span>
                </div>
              </td>
              <td className="gm-ct-cell">
                <div className="gm-status-stack">
                  <div className="gm-status-line"><span className="gm-field-label">Email:</span> {renderEmailStatus(c.email_status)}</div>
                  <div className="gm-status-line"><span className="gm-field-label">LI:</span> {renderLinkedInStatus(c.connectionStatus)}</div>
                </div>
              </td>
              <td className="gm-ct-cell">
                <div className="gm-history-cell">
                  <span className="gm-history-latest">Latest: {formatHistoryDate(c)}</span>
                  <span className="gm-history-counts">{Number.isFinite(Number(c?.emailCount)) ? Number(c.emailCount) : 0} Emails • {Number.isFinite(Number(c?.linkedInCount)) ? Number(c.linkedInCount) : 0} LI</span>
                </div>
              </td>
              <td className="gm-ct-cell gm-left-cell"><input type="checkbox" checked={!!c.leftCompany} readOnly aria-label="Left company" /></td>
              <td className="gm-ct-cell gm-row-actions">
                <button className="gm-icon-btn" onClick={() => onStartEdit(c)} title="Edit"><Pencil size={14} /></button>
                <button className="gm-icon-btn gm-icon-btn--danger" onClick={() => onDelete(c.id)} title="Delete"><Trash2 size={14} /></button>
              </td>
            </tr>
          )
        ))}

        {!contacts.length && editingContactId !== '__new__' && (
          <tr>
            <td colSpan={6} className="gm-empty-row">No contacts yet. Click "+ Add Person" to add one.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
