import React, { createContext, useContext, useMemo, useState } from 'react';
import { useApp } from './AppContext.jsx';
import { makeRoadmapApi } from '../services/roadmapApi.js';

const RoadmapContext = createContext(null);
export function useRoadmap() { return useContext(RoadmapContext); }

export function RoadmapProvider({ children }) {
  const { authedFetch, setNotice } = useApp();
  const api = useMemo(() => makeRoadmapApi(authedFetch), [authedFetch]);

  const [roadmaps, setRoadmaps] = useState([]);
  const [activeRoadmap, setActiveRoadmap] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [boardLoading, setBoardLoading] = useState(false);

  function patchActive(updater) {
    setActiveRoadmap(prev => (prev ? updater(prev) : prev));
  }

  function calcProgress(items) {
    const nonSkipped = (items || []).filter(i => i.status !== 'skipped');
    const done = nonSkipped.filter(i => i.status === 'completed');
    return nonSkipped.length > 0 ? Math.round((done.length / nonSkipped.length) * 100) : 0;
  }

  async function loadRoadmaps() {
    setDashboardLoading(true);
    try {
      setRoadmaps(await api.getRoadmaps());
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadRoadmap(id) {
    setBoardLoading(true);
    try {
      setActiveRoadmap(await api.getRoadmap(id));
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setBoardLoading(false);
    }
  }

  async function createRoadmap(body) {
    const data = await api.createRoadmap(body);
    setRoadmaps(prev => [data, ...prev]);
    return data;
  }

  async function updateRoadmap(id, body) {
    const data = await api.updateRoadmap(id, body);
    setRoadmaps(prev => prev.map(r => r._id === id ? { ...r, ...data } : r));
    patchActive(prev => prev._id === id ? { ...prev, ...data } : prev);
    return data;
  }

  async function deleteRoadmap(id) {
    await api.deleteRoadmap(id);
    setRoadmaps(prev => prev.filter(r => r._id !== id));
    setActiveRoadmap(prev => (prev?._id === id ? null : prev));
  }

  async function createStage(roadmapId, body) {
    const stage = await api.createStage(roadmapId, body);
    patchActive(prev => ({ ...prev, stages: [...(prev.stages || []), stage] }));
    return stage;
  }

  async function updateStage(stageId, body) {
    const stage = await api.updateStage(stageId, body);
    patchActive(prev => ({
      ...prev,
      stages: (prev.stages || []).map(s => s._id === stageId ? stage : s),
    }));
    return stage;
  }

  async function deleteStage(stageId) {
    await api.deleteStage(stageId);
    patchActive(prev => {
      const items = (prev.items || []).filter(i => String(i.stageId) !== String(stageId));
      return {
        ...prev,
        stages: (prev.stages || []).filter(s => s._id !== stageId),
        items,
        progressPercent: calcProgress(items),
      };
    });
  }

  async function createItem(roadmapId, body) {
    const item = await api.createItem(roadmapId, body);
    patchActive(prev => {
      const items = [...(prev.items || []), item];
      return { ...prev, items, progressPercent: calcProgress(items) };
    });
    return item;
  }

  async function updateItem(itemId, body) {
    const updated = await api.updateItem(itemId, body);
    patchActive(prev => {
      const items = (prev.items || []).map(i => i._id === itemId ? updated : i);
      return { ...prev, items, progressPercent: calcProgress(items) };
    });
    return updated;
  }

  async function deleteItem(itemId) {
    await api.deleteItem(itemId);
    patchActive(prev => {
      const items = (prev.items || []).filter(i => i._id !== itemId);
      return { ...prev, items, progressPercent: calcProgress(items) };
    });
  }

  async function moveItem(itemId, newStageId, roadmapId) {
    // Optimistic
    patchActive(prev => ({
      ...prev,
      items: (prev.items || []).map(i =>
        i._id === itemId ? { ...i, stageId: newStageId || null } : i
      ),
    }));
    try {
      await api.updateItem(itemId, { stageId: newStageId || null });
    } catch (err) {
      if (roadmapId) await loadRoadmap(roadmapId);
      setNotice({ type: 'error', message: 'Move failed — reverted' });
    }
  }

  const value = useMemo(() => ({
    api,
    roadmaps, activeRoadmap,
    dashboardLoading, boardLoading,
    loadRoadmaps, loadRoadmap,
    createRoadmap, updateRoadmap, deleteRoadmap,
    createStage, updateStage, deleteStage,
    createItem, updateItem, deleteItem,
    moveItem,
  }), [api, roadmaps, activeRoadmap, dashboardLoading, boardLoading]);

  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>;
}
