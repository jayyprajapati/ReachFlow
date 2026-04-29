import React from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { Waypoints, Mail, Users, Kanban, FileText, Shield, Sun, Moon } from 'lucide-react';

const FEATURES = [
  { icon: Mail, label: 'Gmail Outreach' },
  { icon: Users, label: 'Contact CRM' },
  { icon: Kanban, label: 'Application Pipeline' },
  { icon: FileText, label: 'Email Templates' },
  { icon: Shield, label: 'Data Encrypted' },
];

export default function LandingPage() {
  const { login, theme, toggleTheme } = useApp();

  return (
    <div className="rf-landing">
      <header className="rf-landing__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--rf-sp-3)' }}>
          <div className="rf-sidebar__logo"><Waypoints size={18} /></div>
          <span className="rf-landing__brand-name">ReachFlow</span>
        </div>
        <div className="rf-landing__header-actions">
          <button className="rf-btn rf-btn--ghost rf-btn--icon" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="rf-btn rf-btn--primary" onClick={login}>Sign in with Google</button>
        </div>
      </header>

      <main className="rf-landing__hero">
        <div className="rf-landing__hero-content">
          <h1 className="rf-landing__title">Your outreach,<br /><span>reimagined.</span></h1>
          <p className="rf-landing__subtitle">Track contacts, personalize emails at scale, and manage your job search pipeline — all from one command center.</p>
          <div className="rf-landing__features">
            {FEATURES.map(f => {
              const Icon = f.icon;
              return <span key={f.label} className="rf-landing__feature"><Icon size={14} />{f.label}</span>;
            })}
          </div>
          <button className="rf-btn rf-btn--primary rf-btn--lg rf-landing__cta" onClick={login}>Get Started — Free</button>
          <p className="rf-landing__trust">Your data is encrypted at rest and in transit. We never read your emails or share your contacts.</p>
        </div>
      </main>

      <footer className="rf-landing__footer">
        <a href="/about">About</a>
        <a href="/privacy-policy">Privacy</a>
        <a href="/terms-of-use">Terms</a>
      </footer>
    </div>
  );
}
