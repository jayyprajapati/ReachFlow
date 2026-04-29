import React from 'react';

export default function Dialog({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null;
  return (
    <div className="rf-dialog-overlay" onClick={onCancel}>
      <div className="rf-dialog" onClick={e => e.stopPropagation()}>
        <div className="rf-dialog__title">{dialog.title || 'Are you sure?'}</div>
        <div className="rf-dialog__body">{dialog.message || ''}</div>
        <div className="rf-dialog__actions">
          <button className="rf-btn rf-btn--ghost" onClick={onCancel}>Cancel</button>
          <button
            className={`rf-btn ${dialog.intent === 'danger' ? 'rf-btn--danger' : 'rf-btn--primary'}`}
            onClick={onConfirm}
          >
            {dialog.confirmText || 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
