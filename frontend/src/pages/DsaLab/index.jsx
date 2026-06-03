import React from 'react';
import { useRouter } from '../../router.jsx';
import { useResumeLab } from '../../contexts/ResumeLabContext.jsx';
import { Binary, Clock, Brain, AlertTriangle, Loader, ArrowUpRight } from 'lucide-react';
import AnalyzePage from './AnalyzePage.jsx';
import HistoryPage from './HistoryPage.jsx';

const SUB_ROUTES = [
  { path: '/dsa-lab',         label: 'Analyze', icon: Binary },
  { path: '/dsa-lab/history', label: 'History', icon: Clock },
];

function SubRouter({ path }) {
  if (path === '/dsa-lab/history') return <HistoryPage />;
  return <AnalyzePage />;
}

// AI/BYOK gate — reuses the app-wide ResumeLabProvider's aiSettings (it just holds
// the user's validated AI provider, shared across every AI feature).
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
          ? 'Your API key is saved but not tested. Go to Settings and run "Test connection" to verify it works before using DSA Analysis.'
          : 'DSA Analysis needs your own AI key (OpenAI, Anthropic, or Ollama) to analyze problems and review your code. Add it in Settings to get started.'}
      </p>
      <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={() => navigateTo('/settings')}>
        <Brain size={13} /> Open Settings <ArrowUpRight size={13} />
      </button>
    </div>
  );
}

export default function DsaLabPage() {
  const { path, navigateTo } = useRouter();
  const { aiSettings, aiSettingsLoading } = useResumeLab();
  const blocked = aiSettingsLoading || !aiSettings?.isValid;

  const isActive = (itemPath) =>
    itemPath === '/dsa-lab'
      ? (path === '/dsa-lab' || path === '/dsa-lab/analyze')
      : path === itemPath;

  return (
    <div className="rf-page rf-page--wide dsa-page">
      <header className="rf-page-header">
        <div className="rf-page-header__lead">
          <div className="rf-page-header__eyebrow">
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--rf-accent)', display: 'inline-block' }} /> DSA Analysis
          </div>
          <h1 className="rf-page-header__title">Algorithm analysis</h1>
          <p className="rf-page-header__subtitle">
            Paste a Data Structures &amp; Algorithms problem — get clear approaches from brute force to optimal,
            in Java, Python, or both. Add your own solution to have it reviewed for correctness, complexity, and optimality.
          </p>
        </div>
      </header>

      <nav className="rf-subnav" aria-label="DSA Analysis sections">
        {SUB_ROUTES.map((item) => {
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

      <div className="dsa-workspace">
        {blocked ? <ByokGate navigateTo={navigateTo} /> : <SubRouter path={path} />}
      </div>
    </div>
  );
}
