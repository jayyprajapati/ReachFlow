import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext.jsx';
import { useRouter } from '../../router.jsx';
import {
  LayoutGrid, PenLine, Briefcase, Users, FileText, Compass,
  Search, ChevronsLeft, ChevronsRight,
  LogOut, XCircle, CheckCircle2,
  Sun, Moon, Settings, MailWarning, Sparkles, Lock,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/',           label: 'Today',         icon: LayoutGrid },
  { path: '/compose',    label: 'Compose',       icon: PenLine },
  { path: '/pipeline',   label: 'Applications',  icon: Briefcase },
  { path: '/contacts',   label: 'Contacts',      icon: Users },
  { path: '/resume-lab', label: 'Resume Lab',    icon: FileText, disabled: true, disabledReason: 'Feature coming soon' },
  { path: '/roadmaps',   label: 'Roadmaps',      icon: Compass },
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
  const [hoverTip, setHoverTip] = useState(null); // { text, x, y }
  const menuRef = useRef(null);

  const showHoverTip = (e, text) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverTip({ text, x: rect.right + 10, y: rect.top + rect.height / 2 });
  };
  const hideHoverTip = () => setHoverTip(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e) => { if (!menuRef.current?.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [userMenuOpen]);

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

  const isActive = (itemPath) => {
    if (itemPath === '/') return path === '/';
    return path === itemPath || path.startsWith(itemPath + '/') || path.startsWith(itemPath);
  };

  // Show a small alert pip when either critical integration is missing
  const integrationsHealthy = gmailConnected && llmValid;

  return (
    <div className="rf-sidebar">
      {hoverTip && (
        <div
          className="rf-hover-tip"
          role="tooltip"
          style={{ top: hoverTip.y, left: hoverTip.x }}
        >
          {hoverTip.text}
        </div>
      )}
      {/* Brand */}
      <button className="rf-sidebar__brand" onClick={() => goTo('/')}>
        <span className="rf-sidebar__logo">
          <Sparkles size={16} strokeWidth={2.2} />
        </span>
        <span className="rf-sidebar__brand-text">
          <span className="rf-sidebar__brand-name">ReachFlow</span>
          <span className="rf-sidebar__brand-sub">Career Workspace</span>
        </span>
      </button>

      {/* Command palette */}
      <button
        className="rf-sidebar__cmd"
        onClick={onOpenCommand}
        title="Search & jump (⌘K)"
        onMouseEnter={collapsed ? (e) => showHoverTip(e, 'Search & jump (⌘K)') : undefined}
        onMouseLeave={collapsed ? hideHoverTip : undefined}
        onFocus={collapsed ? (e) => showHoverTip(e, 'Search & jump (⌘K)') : undefined}
        onBlur={collapsed ? hideHoverTip : undefined}
      >
        <Search size={15} />
        <span className="rf-sidebar__cmd-text">Search…</span>
        <span className="rf-sidebar__cmd-shortcut">⌘K</span>
      </button>

      {/* Nav */}
      <nav className="rf-sidebar__nav">
        <span className="rf-sidebar__section-label">Workspace</span>
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = isActive(item.path);
          if (item.disabled) {
            const tip = item.disabledReason || 'Feature coming soon';
            return (
              <button
                key={item.path}
                className="rf-sidebar__link rf-sidebar__link--locked"
                aria-disabled="true"
                type="button"
                onClick={(e) => e.preventDefault()}
                onMouseEnter={(e) => showHoverTip(e, tip)}
                onMouseLeave={hideHoverTip}
                onFocus={(e) => showHoverTip(e, tip)}
                onBlur={hideHoverTip}
              >
                <span className="rf-sidebar__link-icon"><Icon size={18} strokeWidth={1.8} /></span>
                <span className="rf-sidebar__link-label">{item.label}</span>
                <Lock size={12} className="rf-sidebar__link-lock" />
              </button>
            );
          }
          return (
            <button
              key={item.path}
              className={`rf-sidebar__link${active ? ' rf-sidebar__link--active' : ''}`}
              onClick={() => { goTo(item.path); hideHoverTip(); }}
              onMouseEnter={collapsed ? (e) => showHoverTip(e, item.label) : undefined}
              onMouseLeave={collapsed ? hideHoverTip : undefined}
              onFocus={collapsed ? (e) => showHoverTip(e, item.label) : undefined}
              onBlur={collapsed ? hideHoverTip : undefined}
            >
              <span className="rf-sidebar__link-icon"><Icon size={18} strokeWidth={1.8} /></span>
              <span className="rf-sidebar__link-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="rf-sidebar__footer">
        <div className="rf-sidebar__footer-divider" />

        {/* Settings */}
        <button
          className={`rf-sidebar__link${path === '/settings' ? ' rf-sidebar__link--active' : ''}`}
          onClick={() => { goTo('/settings'); hideHoverTip(); }}
          onMouseEnter={collapsed ? (e) => showHoverTip(e, 'Settings') : undefined}
          onMouseLeave={collapsed ? hideHoverTip : undefined}
          onFocus={collapsed ? (e) => showHoverTip(e, 'Settings') : undefined}
          onBlur={collapsed ? hideHoverTip : undefined}
        >
          <span className="rf-sidebar__link-icon">
            <Settings size={18} strokeWidth={1.8} />
            {!integrationsHealthy && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute', width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--rf-warning)', marginLeft: 11, marginTop: -10,
                  boxShadow: '0 0 0 2px var(--rf-bg-root)',
                }}
              />
            )}
          </span>
          <span className="rf-sidebar__link-label">Settings</span>
        </button>

        {/* Theme toggle as a row */}
        <button
          className="rf-sidebar__theme-row"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          onMouseEnter={collapsed ? (e) => showHoverTip(e, `Appearance: ${theme === 'dark' ? 'Dark' : 'Light'}`) : undefined}
          onMouseLeave={collapsed ? hideHoverTip : undefined}
          onFocus={collapsed ? (e) => showHoverTip(e, `Appearance: ${theme === 'dark' ? 'Dark' : 'Light'}`) : undefined}
          onBlur={collapsed ? hideHoverTip : undefined}
        >
          <span className="rf-sidebar__theme-icon">
            {theme === 'dark' ? <Moon size={18} strokeWidth={1.8} /> : <Sun size={18} strokeWidth={1.8} />}
          </span>
          <span className="rf-sidebar__theme-label">Appearance</span>
          <span className="rf-sidebar__theme-state">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>

        {/* User */}
        <div ref={menuRef} className="rf-sidebar__user-wrap">
          <button
            className="rf-sidebar__user"
            onClick={() => { setUserMenuOpen(v => !v); hideHoverTip(); }}
            onMouseEnter={collapsed && !userMenuOpen ? (e) => showHoverTip(e, displayName) : undefined}
            onMouseLeave={collapsed ? hideHoverTip : undefined}
          >
            <span className="rf-avatar rf-avatar--sm">{initial}</span>
            <span className="rf-sidebar__user-info">
              <span className="rf-sidebar__user-name">{displayName}</span>
              <span className="rf-sidebar__user-email">{appUser?.email || ''}</span>
            </span>
          </button>

          {userMenuOpen && (
            <div className="rf-sidebar__user-menu">
              {gmailConnected ? (
                <button
                  className="rf-sidebar__user-menu-item"
                  onClick={() => { setUserMenuOpen(false); confirmDisconnectGmail(); }}
                  disabled={gmailActionLoading}
                >
                  <XCircle size={14} /> {gmailActionLoading ? 'Working…' : 'Disconnect Gmail'}
                </button>
              ) : (
                <button
                  className="rf-sidebar__user-menu-item"
                  onClick={() => { setUserMenuOpen(false); connectGmail(); }}
                  disabled={gmailActionLoading}
                >
                  <CheckCircle2 size={14} /> {gmailActionLoading ? 'Connecting…' : 'Connect Gmail'}
                </button>
              )}
              <div className="rf-sidebar__user-menu-divider" />
              <button
                className="rf-sidebar__user-menu-item rf-sidebar__user-menu-item--danger"
                onClick={() => { setUserMenuOpen(false); confirmLogout(); }}
              >
                <LogOut size={14} /> Log out
              </button>
            </div>
          )}
        </div>

        {/* Legal */}
        <nav className="rf-sidebar__legal" aria-label="Legal">
          {LEGAL_ITEMS.map((item, i) => (
            <React.Fragment key={item.path}>
              {i > 0 && <span className="rf-sidebar__legal-dot">·</span>}
              <a
                href={item.path}
                onClick={(e) => { e.preventDefault(); goTo(item.path); }}
              >
                {item.label}
              </a>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Edge-hugging collapse pill */}
      <button
        className="rf-sidebar__collapse"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
      </button>
    </div>
  );
}
