import React, { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import Sidebar from './Sidebar.jsx';
import Toast from '../common/Toast.jsx';
import Dialog from '../common/Dialog.jsx';
import CommandPalette from './CommandPalette.jsx';
import { Menu, Sparkles } from 'lucide-react';

export default function AppShell({ children }) {
  const { notice, setNotice, warningDialog, setWarningDialog } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(v => !v);
      }
      if (e.key === 'Escape' && commandOpen) {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandOpen]);

  return (
    <div className="rf-shell">
      {mobileOpen && <div className="rf-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      <aside
        className={[
          'rf-shell__sidebar',
          collapsed ? 'rf-shell__sidebar--collapsed' : '',
          mobileOpen ? 'rf-shell__sidebar--mobile-open' : '',
        ].filter(Boolean).join(' ')}
      >
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(v => !v)}
          onOpenCommand={() => setCommandOpen(true)}
          onNavigate={() => setMobileOpen(false)}
        />
      </aside>

      <div className="rf-shell__main">
        <div className="rf-mobile-header">
          <button className="rf-mobile-header__toggle" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <span className="rf-mobile-header__brand">
            <Sparkles size={16} />
            ReachFlow
          </span>
        </div>

        <div className="rf-shell__content">
          {children}
        </div>
      </div>

      <Toast notice={notice} onClose={() => setNotice(null)} />

      <Dialog
        dialog={warningDialog}
        onCancel={() => setWarningDialog(null)}
        onConfirm={async () => {
          const action = warningDialog?.onConfirm;
          setWarningDialog(null);
          if (typeof action === 'function') await action();
        }}
      />

      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
    </div>
  );
}
