import React from 'react';
import { useRouter } from '../../router.jsx';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import { Vault, User, LayoutDashboard, Clock, Brain, AlertTriangle, Loader } from 'lucide-react';
import VaultPage from './VaultPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import WorkspacePage from './WorkspacePage.jsx';
import HistoryPage from './HistoryPage.jsx';

const SUB_ROUTES = [
  { path: '/resume-lab/vault',     label: 'Resume Vault',  icon: Vault,            desc: 'Upload & manage' },
  { path: '/resume-lab/profile',   label: 'Career Profile', icon: User,            desc: 'Your merged profile' },
  { path: '/resume-lab/workspace', label: 'Workspace',     icon: LayoutDashboard,  desc: 'Analyze & generate' },
  { path: '/resume-lab/history',   label: 'History',       icon: Clock,            desc: 'Past analyses & resumes' },
];

function SubNav({ path, navigateTo }) {
  return (
    <nav className="rl-sub-nav">
      <div className="rl-sub-nav__header">
        <div>
          <div className="rl-sub-nav__title">Resume Lab</div>
          <div className="rl-sub-nav__subtitle">Career Intelligence</div>
        </div>
      </div>
      {SUB_ROUTES.map(item => {
        const Icon = item.icon;
        const active = path === item.path || (path === '/resume-lab' && item.path === '/resume-lab/vault');
        return (
          <button
            key={item.path}
            className={`rl-sub-nav__item${active ? ' rl-sub-nav__item--active' : ''}`}
            onClick={() => navigateTo(item.path)}
          >
            <span className="rl-sub-nav__item-icon"><Icon size={16} /></span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--rf-text-muted)' }}>
        <Loader size={16} className="rf-spin" />
        <span style={{ fontSize: 'var(--rf-text-sm)' }}>Checking AI configuration…</span>
      </div>
    );
  }

  if (!aiSettings?.isValid) {
    const isConfigured = aiSettings?.configured;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 'var(--rf-sp-4)', padding: 'var(--rf-sp-6)', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--rf-bg-surface)', border: '1px solid var(--rf-border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isConfigured
            ? <AlertTriangle size={24} style={{ color: 'var(--rf-warning, #f59e0b)' }} />
            : <Brain size={24} style={{ color: 'var(--rf-text-muted)' }} />
          }
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 'var(--rf-text-md)', color: 'var(--rf-text)', marginBottom: 8 }}>
            {isConfigured ? 'AI connection not verified' : 'AI provider not configured'}
          </div>
          <p style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text-secondary)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
            {isConfigured
              ? 'Your API key is saved but not tested. Go to Settings and click "Test Connection" to verify it works before using Resume Lab.'
              : 'Resume Lab requires your own API key to run AI analysis. Add your OpenAI or Ollama key in Settings to get started.'
            }
          </p>
        </div>
        <button
          className="rf-btn rf-btn--primary rf-btn--sm"
          onClick={() => navigateTo('/settings')}
        >
          <Brain size={13} /> Go to Settings
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
  const gate = <ByokGate navigateTo={navigateTo} />;
  const blocked = aiSettingsLoading || !aiSettings?.isValid;

  return (
    <div className="rl-shell">
      <SubNav path={path} navigateTo={navigateTo} />
      <div className="rl-workspace">
        {blocked ? gate : <SubRouter path={path} />}
      </div>
    </div>
  );
}
