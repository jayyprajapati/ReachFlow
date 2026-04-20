import React from 'react';
import { Copy, Pencil, Trash2, Check, X, Mail, Linkedin } from 'lucide-react';

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
  const isLinkedIn = (contact?.lastContacted?.type || 'email') === 'linkedin';
  const method = isLinkedIn ? 'LI' : 'Email';
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
  alwaysShowNewRow = false,
  newContactForm,
  setNewContactForm,
  onSaveNewEntry,
  onResetNewEntry,
  busyState = {},
}) {
  const emailStatusOptions = [
    { value: 'verified', label: 'Valid' },
    { value: 'tentative', label: 'Tentative' },
    { value: 'not_valid', label: 'Invalid' },
  ];

  const linkedInStatusOptions = [
    { value: 'connected', label: 'Connected' },
    { value: 'request_sent', label: 'Pending' },
    { value: 'not_connected', label: 'Not Connected' },
  ];

  function renderStatusSegments(options, value, onChange, name, disabled = false) {
    return (
      <div className="gm-segments" role="radiogroup" aria-label={name}>
        {options.map(opt => (
          <label key={opt.value} className={`gm-segment ${value === opt.value ? 'gm-segment--active' : ''}`}>
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    );
  }

  function renderEditableRow(form, setForm, opts = {}) {
    const isNewRow = !!opts.isNewRow;
    const saving = !!opts.saving;
    const disableInputs = !!opts.disableInputs;
    const onSaveRow = opts.onSaveRow;
    const onSecondaryAction = opts.onSecondaryAction;
    const secondaryTitle = opts.secondaryTitle || 'Cancel';

    return (
      <tr className="gm-ct-row gm-row--editing">
        <td className="gm-ct-cell">
          <div className="gm-ct-stack">
            <input
              className="gm-inp"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              autoFocus={isNewRow}
              disabled={disableInputs}
            />
            <input
              className="gm-inp"
              value={form.linkedin}
              onChange={e => setForm(f => ({ ...f, linkedin: e.target.value }))}
              placeholder="LinkedIn URL"
              disabled={disableInputs}
            />
          </div>
        </td>
        <td className="gm-ct-cell">
          <input
            className="gm-inp"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            disabled={disableInputs}
          />
        </td>
        <td className="gm-ct-cell">
          <select
            className="gm-select"
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            disabled={disableInputs}
          >
            {roleOptions.map(r => <option key={r} value={r}>{r || '—'}</option>)}
          </select>
        </td>
        <td className="gm-ct-cell">
          <div className="gm-ct-stack gm-ct-stack--status-edit">
            <label className="gm-field-label"><Mail size={10} /> Email Status</label>
            {renderStatusSegments(
              emailStatusOptions,
              form.email_status,
              next => setForm(f => ({ ...f, email_status: next })),
              `${isNewRow ? 'new' : 'edit'}-email-status`,
              disableInputs,
            )}

            <label className="gm-field-label"><Linkedin size={10} /> LinkedIn Status</label>
            {renderStatusSegments(
              linkedInStatusOptions,
              form.connectionStatus,
              next => setForm(f => ({ ...f, connectionStatus: next })),
              `${isNewRow ? 'new' : 'edit'}-linkedin-status`,
              disableInputs,
            )}
          </div>
        </td>
        <td className="gm-ct-cell">
          <div className="gm-ct-stack">
            <label className="gm-field-label">Last Contacted</label>
            <input
              className="gm-inp"
              type="date"
              value={form.lastContactedDate}
              onChange={e => setForm(f => ({ ...f, lastContactedDate: e.target.value }))}
              disabled={disableInputs}
            />
            <div className="gm-history-count-edit">
              <div className="gm-history-count-field">
                <label className="gm-field-label"><Mail size={10} /> Count</label>
                <input
                  className="gm-inp"
                  type="number"
                  min="0"
                  value={form.emailCount}
                  onChange={e => setForm(f => ({ ...f, emailCount: e.target.value }))}
                  disabled={disableInputs}
                />
              </div>
              <div className="gm-history-count-field">
                <label className="gm-field-label"><Linkedin size={10} /> Count</label>
                <input
                  className="gm-inp"
                  type="number"
                  min="0"
                  value={form.linkedInCount}
                  onChange={e => setForm(f => ({ ...f, linkedInCount: e.target.value }))}
                  disabled={disableInputs}
                />
              </div>
            </div>
          </div>
        </td>
        <td className="gm-ct-cell gm-row-actions">
          <button
            className="gm-icon-btn gm-icon-btn--save"
            onClick={onSaveRow}
            title="Save"
            disabled={saving || disableInputs}
          >
            <Check size={15} />
          </button>
          <button
            className="gm-icon-btn"
            onClick={onSecondaryAction}
            title={secondaryTitle}
            disabled={saving}
          >
            <X size={15} />
          </button>
        </td>
      </tr>
    );
  }

  const tableBusy = !!busyState.tableBusy;
  const savingExistingId = busyState.savingContactId || null;
  const deletingId = busyState.deletingContactId || null;
  const savingNewEntry = !!busyState.savingNewEntry;

  const showTopNewRow = alwaysShowNewRow || editingContactId === '__new__';
  const topRowForm = alwaysShowNewRow ? newContactForm : contactForm;
  const setTopRowForm = alwaysShowNewRow ? setNewContactForm : setContactForm;

  return (
    <table className="gm-ct-table">
      <colgroup>
        <col className="gm-col-name" />
        <col className="gm-col-email" />
        <col className="gm-col-role" />
        <col className="gm-col-status" />
        <col className="gm-col-history" />
        <col className="gm-col-actions" />
      </colgroup>
      <thead>
        <tr className="gm-ct-head">
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Contact History</th>
          <th className="gm-th-right">Actions</th>
        </tr>
      </thead>

      <tbody className="gm-ct-body">
        {showTopNewRow && topRowForm && setTopRowForm && renderEditableRow(topRowForm, setTopRowForm, {
          isNewRow: true,
          saving: savingNewEntry,
          disableInputs: tableBusy,
          onSaveRow: alwaysShowNewRow ? onSaveNewEntry : onSave,
          onSecondaryAction: alwaysShowNewRow ? onResetNewEntry : onCancel,
          secondaryTitle: alwaysShowNewRow ? 'Clear' : 'Cancel',
        })}

        {contacts.map(c => (
          editingContactId === c.id ? (
            <React.Fragment key={c.id}>
              {renderEditableRow(contactForm, setContactForm, {
                saving: savingExistingId === c.id,
                disableInputs: tableBusy,
                onSaveRow: onSave,
                onSecondaryAction: onCancel,
              })}
            </React.Fragment>
          ) : (
            <tr key={c.id} className="gm-ct-row">
              <td className="gm-ct-cell">
                <span className="gm-copy-wrap">
                  {c.linkedin ? (
                    <a className="gm-name-link" href={c.linkedin} target="_blank" rel="noreferrer" title={c.name}>
                      <span className="gm-cell-ellipsis">{c.name}</span>
                      <Linkedin size={12} />
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
                <span className="gm-copy-wrap">
                  <span className="gm-cell-ellipsis" title={c.email}>{c.email}</span>
                  <button className="gm-copy-btn" onClick={e => onCopyClick(e, `email-${c.id}`, c.email)} aria-label="Copy email" title={copiedField === `email-${c.id}` ? 'Copied' : 'Copy'}>
                    <Copy size={12} />
                  </button>
                  {copiedField === `email-${c.id}` && <span className="gm-copy-tip">Copied</span>}
                </span>
              </td>
              <td className="gm-ct-cell">
                <span className="gm-role-chip">{c.role || '—'}</span>
              </td>
              <td className="gm-ct-cell">
                <div className="gm-status-stack">
                  <div className="gm-status-line"><span className="gm-status-icon"><Mail size={12} /></span>{renderEmailStatus(c.email_status)}</div>
                  <div className="gm-status-line"><span className="gm-status-icon"><Linkedin size={12} /></span>{renderLinkedInStatus(c.connectionStatus)}</div>
                </div>
              </td>
              <td className="gm-ct-cell">
                <div className="gm-history-cell">
                  <span className="gm-history-latest">Latest: {formatHistoryDate(c)}</span>
                  <span className="gm-history-counts">{Number.isFinite(Number(c?.emailCount)) ? Number(c.emailCount) : 0} <Mail size={11} /> {' • '} {Number.isFinite(Number(c?.linkedInCount)) ? Number(c.linkedInCount) : 0} <Linkedin size={11} /></span>
                </div>
              </td>
              <td className="gm-ct-cell gm-row-actions">
                <button className="gm-icon-btn" onClick={() => onStartEdit(c)} title="Edit" disabled={tableBusy}><Pencil size={14} /></button>
                <button className="gm-icon-btn gm-icon-btn--danger" onClick={() => onDelete(c.id)} title="Delete" disabled={tableBusy || deletingId === c.id}><Trash2 size={14} /></button>
              </td>
            </tr>
          )
        ))}

        {!contacts.length && editingContactId !== '__new__' && !alwaysShowNewRow && (
          <tr>
            <td colSpan={6} className="gm-empty-row">No contacts yet. Click &quot;+ Add Person&quot; to add one.</td>
          </tr>
        )}

        {!contacts.length && alwaysShowNewRow && (
          <tr>
            <td colSpan={6} className="gm-empty-row">No saved contacts yet. Use the top row to add your first contact.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
