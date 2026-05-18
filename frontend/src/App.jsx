import React from 'react';
import { AppProvider, useApp } from './contexts/AppContext.jsx';
import { RouterProvider, useRouter } from './router.jsx';
import { ResumeLabProvider } from './contexts/ResumeLabContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LandingPage from './pages/LandingPage.jsx';
import ComposePage from './pages/ComposePage.jsx';
import PipelinePage from './pages/PipelinePage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ResumeLabPage from './pages/ResumeLab/index.jsx';
import RoadmapLabPage from './pages/RoadmapLab/index.jsx';
import AboutPage from './components/AboutPage.jsx';
import PrivacyPolicyPage from './components/PrivacyPolicyPage.jsx';
import TermsOfUsePage from './components/TermsOfUsePage.jsx';
import { Loader } from 'lucide-react';

function PageRouter() {
  const { path } = useRouter();

  switch (true) {
    case path === '/': return <ComposePage />;
    case path === '/pipeline': return <PipelinePage />;
    case path.startsWith('/contacts'): return <ContactsPage />;
    case path === '/templates': return <TemplatesPage />;
    case path === '/history': return <HistoryPage />;
    case path === '/settings': return <SettingsPage />;
    case path.startsWith('/resume-lab'): return <ResumeLabPage />;
    case path.startsWith('/roadmaps'):   return <RoadmapLabPage />;
    default: return <ComposePage />;
  }
}

function AuthGate() {
  const { appUser, authLoading } = useApp();
  const { path } = useRouter();

  // Static pages — no auth needed
  if (path === '/about') return <AboutPage />;
  if (path === '/privacy-policy') return <PrivacyPolicyPage />;
  if (path === '/terms-of-use') return <TermsOfUsePage />;

  // Loading
  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--rf-bg-root)' }}>
        <div className="rf-spinner"><Loader size={28} /></div>
      </div>
    );
  }

  // Not logged in
  if (!appUser) return <LandingPage />;

  // Logged in — show shell + router
  return (
    <ResumeLabProvider>
      <AppShell>
        <PageRouter />
      </AppShell>
    </ResumeLabProvider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RouterProvider>
        <AuthGate />
      </RouterProvider>
    </AppProvider>
  );
}
