import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  Send, Users, Kanban, Settings, Search,
  ChevronsLeft, ChevronsRight, LogOut, XCircle, CheckCircle2,
  Waypoints, Sun, Moon, Brain, Map,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Compose', icon: Send },
  { path: '/pipeline', label: 'Applications', icon: Kanban },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/resume-lab', label: 'Resume Lab', icon: Brain },
  { path: '/roadmaps', label: 'Roadmap', icon: Map },
];

const LEGAL_ITEMS = [
  { path: '/about',          label: 'About' },
  { path: '/privacy-policy', label: 'Privacy' },
  { path: '/terms-of-use',   label: 'Terms' },
];

export default function Sidebar({ collapsed, onToggleCollapse, onOpenCommand, onNavigate }) {
  const {
    API_BASE, authedFetch,
    appUser, gmailConnected,
    confirmLogout, confirmDisconnectGmail, connectGmail, gmailActionLoading,
    theme, toggleTheme,
  } = useApp();
  const { path, navigateTo } = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [llmValid, setLlmValid] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e) => { if (!menuRef.current?.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [userMenuOpen]);

  // Check AI settings validity once on mount
  useEffect(() => {
    if (!authedFetch || !API_BASE) return;
    let cancelled = false;
    authedFetch(`${API_BASE}/api/settings/ai`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setLlmValid(d.isValid === true); })
      .catch(() => { if (!cancelled) setLlmValid(false); });
    return () => { cancelled = true; };
  }, [authedFetch, API_BASE]);

  const initial = (appUser?.displayName || appUser?.email || 'U').charAt(0).toUpperCase();
  const displayName = appUser?.displayName || appUser?.email?.split('@')[0] || 'User';
  const goTo = (nextPath) => {
    navigateTo(nextPath);
    onNavigate?.();
  };

  return (
    <div className="rf-sidebar">
      {/* Brand */}
      <button className="rf-sidebar__brand" onClick={() => goTo('/')}>
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
              onClick={() => goTo(item.path)}
            >
              <span className="rf-sidebar__link-icon"><Icon size={18} /></span>
              <span className="rf-sidebar__link-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="rf-sidebar__footer">
        {/* Gmail + LLM status */}
        <div className="rf-sidebar__gmail">
          <span className={`rf-dot ${gmailConnected ? 'rf-dot--success' : 'rf-dot--error'}`} />
          <span>{gmailConnected ? 'Gmail connected' : 'Gmail disconnected'}</span>
        </div>
        <div className="rf-sidebar__gmail">
          <span className={`rf-dot ${llmValid ? 'rf-dot--success' : 'rf-dot--error'}`} />
          <span>{llmValid ? 'AI configured' : 'AI not configured'}</span>
        </div>

        {/* Settings link */}
        <button
          className={`rf-sidebar__link${path.startsWith('/settings') ? ' rf-sidebar__link--active' : ''}`}
          onClick={() => goTo('/settings')}
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          <span className="rf-sidebar__link-icon"><Settings size={16} /></span>
          <span className="rf-sidebar__link-label">Settings</span>
        </button>

        {/* Theme toggle */}
        <div className="rf-sidebar__theme-row">
          <Sun size={13} className={`rf-sidebar__theme-icon${theme !== 'dark' ? ' rf-sidebar__theme-icon--active' : ''}`} />
          <button
            role="switch"
            aria-checked={theme === 'dark'}
            className={`rf-theme-switch${theme === 'dark' ? ' rf-theme-switch--on' : ''}`}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          />
          <Moon size={13} className={`rf-sidebar__theme-icon${theme === 'dark' ? ' rf-sidebar__theme-icon--active' : ''}`} />
          <span className="rf-sidebar__theme-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </div>

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

        {/* Legal links — below user, at very bottom */}
        <div style={{ height: 1, background: 'var(--rf-border-subtle)', margin: '2px 0' }} />
        <nav className="rf-sidebar__legal" aria-label="Legal pages">
          {LEGAL_ITEMS.map((item, i) => (
            <React.Fragment key={item.path}>
              {i > 0 && <span className="rf-sidebar__legal-dot" aria-hidden="true">·</span>}
              <a
                href={item.path}
                onClick={(e) => { e.preventDefault(); goTo(item.path); }}
              >
                {item.label}
              </a>
            </React.Fragment>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button className="rf-sidebar__collapse" onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
    </div>
  );
}
