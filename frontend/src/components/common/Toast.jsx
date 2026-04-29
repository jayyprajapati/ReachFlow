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
  const Icon = ICONS[notice.type] || Info;
  return (
    <div className="rf-toast-container">
      <div className={`rf-toast rf-toast--${notice.type || 'info'}`}>
        <Icon size={16} style={{ flexShrink: 0 }} />
        <span className="rf-toast__message">{notice.message}</span>
        <button className="rf-toast__close" onClick={onClose}><X size={14} /></button>
      </div>
    </div>
  );
}
