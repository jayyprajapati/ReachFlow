import React, { useState } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import Sidebar from './Sidebar.jsx';
import Toast from '../common/Toast.jsx';
import Dialog from '../common/Dialog.jsx';
import CommandPalette from './CommandPalette.jsx';
import { Menu } from 'lucide-react';

export default function AppShell({ children }) {
  const { notice, setNotice, warningDialog, setWarningDialog } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Global ⌘K shortcut
  React.useEffect(() => {
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
      {/* Mobile overlay */}
      {mobileOpen && <div className="rf-mobile-overlay" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`rf-shell__sidebar ${collapsed ? 'rf-shell__sidebar--collapsed' : ''} ${mobileOpen ? 'rf-shell__sidebar--mobile-open' : ''}`}>
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(v => !v)}
          onOpenCommand={() => setCommandOpen(true)}
        />
      </aside>

      {/* Main */}
      <div className="rf-shell__main">
        {/* Mobile header */}
        <div className="rf-mobile-header">
          <button className="rf-mobile-header__toggle" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <span style={{ fontFamily: 'var(--rf-font-display)', fontWeight: 700, fontSize: 'var(--rf-text-md)' }}>ReachFlow</span>
        </div>

        {/* Page content */}
        <div className="rf-shell__content">
          {children}
        </div>
      </div>

      {/* Toast */}
      <Toast notice={notice} onClose={() => setNotice(null)} />

      {/* Warning dialog */}
      <Dialog
        dialog={warningDialog}
        onCancel={() => setWarningDialog(null)}
        onConfirm={async () => {
          const action = warningDialog?.onConfirm;
          setWarningDialog(null);
          if (typeof action === 'function') await action();
        }}
      />

      {/* Command palette */}
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
    </div>
  );
}
