import React from 'react';
import { useRouter } from '../../router.jsx';
import { ResumeLabProvider } from '../../contexts/ResumeLabContext.jsx';
import { Vault, User, LayoutDashboard, Clock } from 'lucide-react';
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

export default function ResumeLabPage() {
  const { path, navigateTo } = useRouter();
  return (
    <ResumeLabProvider>
      <div className="rl-shell">
        <SubNav path={path} navigateTo={navigateTo} />
        <div className="rl-workspace">
          <SubRouter path={path} />
        </div>
      </div>
    </ResumeLabProvider>
  );
}
