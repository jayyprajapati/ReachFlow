import React from 'react';
import { RoadmapProvider } from '../../contexts/RoadmapContext.jsx';
import DashboardPage from './DashboardPage.jsx';

export default function RoadmapLabPage() {
  return (
    <RoadmapProvider>
      <DashboardPage />
    </RoadmapProvider>
  );
}
