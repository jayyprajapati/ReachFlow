import React from 'react';
import { useRouter } from '../../router.jsx';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import {
  Vault, User, LayoutDashboard, Clock,
  Brain, AlertTriangle, Loader, ArrowUpRight,
} from 'lucide-react';
import VaultPage from './VaultPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import WorkspacePage from './WorkspacePage.jsx';
import HistoryPage from './HistoryPage.jsx';

const SUB_ROUTES = [
  { path: '/resume-lab/vault',     label: 'Vault',     icon: Vault,           desc: 'Upload & manage' },
  { path: '/resume-lab/profile',   label: 'Profile',   icon: User,            desc: 'Merged career profile' },
  { path: '/resume-lab/workspace', label: 'Workspace', icon: LayoutDashboard, desc: 'Analyze & generate' },
  { path: '/resume-lab/history',   label: 'History',   icon: Clock,           desc: 'Past analyses & resumes' },
];

function SubRouter({ path }) {
  if (path === '/resume-lab/profile')   return <ProfilePage />;
  if (path === '/resume-lab/workspace') return <WorkspacePage />;
  if (path === '/resume-lab/history')   return <HistoryPage />;
  return <VaultPage />;
}

function ByokGate({ navigateTo }) {
  const { aiSettings, aiSettingsLoading } = useResumeLab();

  if (aiSettingsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--rf-text-muted)', padding: 'var(--rf-sp-10)' }}>
        <Loader size={16} className="rf-spin" />
        <span style={{ fontSize: 'var(--rf-text-base)' }}>Checking AI configuration…</span>
      </div>
    );
  }

  if (!aiSettings?.isValid) {
    const isConfigured = aiSettings?.configured;
    return (
      <div className="rf-empty" style={{ padding: 'var(--rf-sp-12) var(--rf-sp-6)' }}>
        <div
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: isConfigured ? 'var(--rf-warning-muted)' : 'var(--rf-bg-overlay)',
            color: isConfigured ? 'var(--rf-warning-text)' : 'var(--rf-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 'var(--rf-sp-2)',
          }}
        >
          {isConfigured ? <AlertTriangle size={24} /> : <Brain size={24} />}
        </div>
        <div className="rf-empty__title">
          {isConfigured ? 'AI connection not verified' : 'Connect an AI provider'}
        </div>
        <p className="rf-empty__desc">
          {isConfigured
            ? 'Your API key is saved but not tested. Go to Settings and run "Test connection" to verify it works before using Resume Lab.'
            : 'Resume Lab needs your own AI key (OpenAI or Ollama) to extract resume content, score against job descriptions, and tailor resumes. Add it in Settings to get started.'}
        </p>
        <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => navigateTo('/settings')}>
          <Brain size={13} /> Open Settings <ArrowUpRight size={13} />
        </button>
      </div>
    );
  }
  return null;
}

export default function ResumeLabPage() {
  const { path, navigateTo } = useRouter();
  return <ResumeLabPageInner path={path} navigateTo={navigateTo} />;
}

function ResumeLabPageInner({ path, navigateTo }) {
  const { aiSettings, aiSettingsLoading } = useResumeLab();
  const blocked = aiSettingsLoading || !aiSettings?.isValid;

  const isActive = (itemPath) => path === itemPath || (path === '/resume-lab' && itemPath === '/resume-lab/vault');

  return (
    <div className="rf-page rf-page--wide rf-rl-page">
      <header className="rf-page-header">
        <div className="rf-page-header__lead">
          <div className="rf-page-header__eyebrow"><DotMark /> Resume Lab</div>
          <h1 className="rf-page-header__title">Career intelligence</h1>
          <p className="rf-page-header__subtitle">
            Upload your resumes once. Tailor them to any job description with AI-scored keyword analysis and one-click PDF generation.
          </p>
        </div>
      </header>

      <nav className="rf-subnav" aria-label="Resume Lab sections">
        {SUB_ROUTES.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              className={`rf-subnav__item${isActive(item.path) ? ' rf-subnav__item--active' : ''}`}
              onClick={() => navigateTo(item.path)}
            >
              <Icon size={15} strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="rf-rl-workspace">
        {blocked ? <ByokGate navigateTo={navigateTo} /> : <SubRouter path={path} />}
      </div>
    </div>
  );
}

function DotMark() {
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--rf-accent)', display: 'inline-block' }} />;
}
