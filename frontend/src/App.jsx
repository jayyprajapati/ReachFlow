import React, { useEffect } from 'react';
import { AppProvider, useApp } from './contexts/AppContext.jsx';
import { RouterProvider, useRouter } from './router.jsx';
import { ResumeLabProvider } from './contexts/ResumeLabContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import LandingPage from './pages/LandingPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ComposePage from './pages/ComposePage.jsx';
import PipelinePage from './pages/PipelinePage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import RoadmapLabPage from './pages/RoadmapLab/index.jsx';
import ResumeLabPage from './pages/ResumeLab/index.jsx';
import DsaLabPage from './pages/DsaLab/index.jsx';
import AboutPage from './components/AboutPage.jsx';
import PrivacyPolicyPage from './components/PrivacyPolicyPage.jsx';
import TermsOfUsePage from './components/TermsOfUsePage.jsx';
import { Loader } from 'lucide-react';

const TITLE_SUFFIX = 'Career Workspace';

function routeTitle(path, appUser, authLoading) {
  const cleanPath = String(path || '/').split('?')[0];
  if (authLoading || !appUser) return `ReachFlow - ${TITLE_SUFFIX}`;

  switch (true) {
    case cleanPath === '/':                    return `Dashboard - ${TITLE_SUFFIX}`;
    case cleanPath === '/compose':             return `Compose - ${TITLE_SUFFIX}`;
    case cleanPath === '/pipeline':            return `Applications - ${TITLE_SUFFIX}`;
    case cleanPath.startsWith('/contacts'):    return `Contacts - ${TITLE_SUFFIX}`;
    case cleanPath === '/templates':           return `Templates - ${TITLE_SUFFIX}`;
    case cleanPath === '/history':             return `History - ${TITLE_SUFFIX}`;
    case cleanPath === '/settings':            return `Settings - ${TITLE_SUFFIX}`;
    case cleanPath.startsWith('/resume-lab'):  return `Resume Lab - ${TITLE_SUFFIX}`;
    case cleanPath.startsWith('/dsa-lab'):     return `DSA Analysis - ${TITLE_SUFFIX}`;
    case cleanPath.startsWith('/roadmaps'):    return `Roadmaps - ${TITLE_SUFFIX}`;
    case cleanPath === '/about':               return `About - ${TITLE_SUFFIX}`;
    case cleanPath === '/privacy-policy':      return `Privacy Policy - ${TITLE_SUFFIX}`;
    case cleanPath === '/terms-of-use':        return `Terms of Use - ${TITLE_SUFFIX}`;
    default:                                   return `Dashboard - ${TITLE_SUFFIX}`;
  }
}

function PageRouter() {
  const { path } = useRouter();

  switch (true) {
    case path === '/':                    return <HomePage />;
    case path === '/compose':             return <ComposePage />;
    case path === '/pipeline':            return <PipelinePage />;
    case path.startsWith('/contacts'):    return <ContactsPage />;
    case path === '/templates':           return <TemplatesPage />;
    case path === '/history':             return <HistoryPage />;
    case path === '/settings':            return <SettingsPage />;
    case path.startsWith('/resume-lab'):  return <ResumeLabPage />;
    case path.startsWith('/dsa-lab'):     return <DsaLabPage />;
    case path.startsWith('/roadmaps'):    return <RoadmapLabPage />;
    default:                              return <HomePage />;
  }
}

function AuthGate() {
  const { appUser, authLoading } = useApp();
  const { path } = useRouter();

  useEffect(() => {
    document.title = routeTitle(path, appUser, authLoading);
  }, [path, appUser, authLoading]);

  // Static pages — no auth needed
  if (path === '/about')          return <AboutPage />;
  if (path === '/privacy-policy') return <PrivacyPolicyPage />;
  if (path === '/terms-of-use')   return <TermsOfUsePage />;

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--rf-bg-root)' }}>
        <div className="rf-spinner"><Loader size={28} /></div>
      </div>
    );
  }

  if (!appUser) return <LandingPage />;

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
