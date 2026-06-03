import React from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

export default function Toast({ notice, onClose }) {
  if (!notice) return null;
  const kind = notice.type || 'info';
  const Icon = ICONS[kind] || Info;
  return (
    <div className="rf-toast-mount" role="status" aria-live="polite">
      <div className={`rf-toast rf-toast--${kind}`}>
        <span className="rf-toast__icon"><Icon size={14} strokeWidth={2.2} /></span>
        <span className="rf-toast__message">{notice.message}</span>
        <button
          type="button"
          className="rf-toast__close"
          onClick={onClose}
          aria-label="Dismiss notification"
        >
          <X size={12} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
