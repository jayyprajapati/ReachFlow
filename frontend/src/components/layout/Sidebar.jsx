import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  Send, Users, Kanban, Settings, Search,
  ChevronsLeft, ChevronsRight, LogOut, XCircle, CheckCircle2,
  Waypoints, Sun, Moon, Brain,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Compose', icon: Send },
  { path: '/pipeline', label: 'Applications', icon: Kanban },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/resume-lab', label: 'Resume Lab', icon: Brain },
];

const LEGAL_ITEMS = [
  { path: '/about', label: 'About' },
  { path: '/privacy-policy', label: 'Privacy' },
  { path: '/terms-of-use', label: 'Terms' },
];

export default function Sidebar({ collapsed, onToggleCollapse, onOpenCommand }) {
  const { appUser, gmailConnected, confirmLogout, confirmDisconnectGmail, connectGmail, gmailActionLoading, theme, toggleTheme } = useApp();
  const { path, navigateTo } = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e) => { if (!menuRef.current?.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [userMenuOpen]);

  const initial = (appUser?.displayName || appUser?.email || 'U').charAt(0).toUpperCase();
  const displayName = appUser?.displayName || appUser?.email?.split('@')[0] || 'User';

  return (
    <div className="rf-sidebar">
      {/* Brand */}
      <button className="rf-sidebar__brand" onClick={() => navigateTo('/')}>
        <div className="rf-sidebar__logo">
          <Waypoints size={18} />
        </div>
        <div className="rf-sidebar__brand-text">
          <span className="rf-sidebar__brand-name">ReachFlow</span>
          <span className="rf-sidebar__brand-sub">Outreach Platform</span>
        </div>
      </button>

      {/* Command palette trigger */}
      <button className="rf-sidebar__cmd" onClick={onOpenCommand}>
        <Search size={15} />
        <span className="rf-sidebar__cmd-text">Search…</span>
        <span className="rf-sidebar__cmd-shortcut">⌘K</span>
      </button>

      {/* Navigation */}
      <nav className="rf-sidebar__nav">
        <span className="rf-sidebar__section-label">Workspace</span>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = item.path === '/'
            ? path === '/'
            : path.startsWith(item.path);
          return (
            <button
              key={item.path}
              className={`rf-sidebar__link ${isActive ? 'rf-sidebar__link--active' : ''}`}
              onClick={() => navigateTo(item.path)}
            >
              <span className="rf-sidebar__link-icon"><Icon size={18} /></span>
              <span className="rf-sidebar__link-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="rf-sidebar__footer">
        {/* Gmail status */}
        <div className="rf-sidebar__gmail">
          <span className={`rf-dot ${gmailConnected ? 'rf-dot--success' : 'rf-dot--error'}`} />
          <span>{gmailConnected ? 'Gmail connected' : 'Gmail disconnected'}</span>
        </div>

        <button
          className={`rf-sidebar__link${path.startsWith('/settings') ? ' rf-sidebar__link--active' : ''}`}
          onClick={() => navigateTo('/settings')}
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          <span className="rf-sidebar__link-icon"><Settings size={16} /></span>
          <span className="rf-sidebar__link-label">Settings</span>
        </button>

        <button className="rf-sidebar__theme" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        <nav className="rf-sidebar__legal" aria-label="Legal pages">
          {LEGAL_ITEMS.map(item => (
            <a
              key={item.path}
              href={item.path}
              onClick={(e) => { e.preventDefault(); navigateTo(item.path); }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* User menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button className="rf-sidebar__user" onClick={() => setUserMenuOpen(v => !v)}>
            <div className="rf-avatar rf-avatar--sm">{initial}</div>
            <div className="rf-sidebar__user-info">
              <div className="rf-sidebar__user-name">{displayName}</div>
              <div className="rf-sidebar__user-email">{appUser?.email || ''}</div>
            </div>
          </button>

          {userMenuOpen && (
            <div className="rf-sidebar__user-menu">
              {gmailConnected ? (
                <button className="rf-sidebar__user-menu-item" onClick={() => { setUserMenuOpen(false); confirmDisconnectGmail(); }} disabled={gmailActionLoading}>
                  <XCircle size={14} /> {gmailActionLoading ? 'Working…' : 'Disconnect Gmail'}
                </button>
              ) : (
                <button className="rf-sidebar__user-menu-item" onClick={() => { setUserMenuOpen(false); connectGmail(); }} disabled={gmailActionLoading}>
                  <CheckCircle2 size={14} /> {gmailActionLoading ? 'Connecting…' : 'Connect Gmail'}
                </button>
              )}
              <div className="rf-sidebar__user-menu-divider" />
              <button className="rf-sidebar__user-menu-item rf-sidebar__user-menu-item--danger" onClick={() => { setUserMenuOpen(false); confirmLogout(); }}>
                <LogOut size={14} /> Log out
              </button>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button className="rf-sidebar__collapse" onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
    </div>
  );
}
