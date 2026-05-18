import React from 'react';
import { useRouter } from '../../router.jsx';
import { RoadmapProvider } from '../../contexts/RoadmapContext.jsx';
import DashboardPage from './DashboardPage.jsx';
import BoardPage from './BoardPage.jsx';

export default function RoadmapLabPage() {
  const { path } = useRouter();
  const boardMatch = path.match(/^\/roadmaps\/([a-f0-9]{24})$/);

  return (
    <RoadmapProvider>
      {boardMatch ? <BoardPage id={boardMatch[1]} /> : <DashboardPage />}
    </RoadmapProvider>
  );
}
