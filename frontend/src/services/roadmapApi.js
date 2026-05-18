const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function json(data, method = 'POST') {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

export function makeRoadmapApi(authedFetch) {
  async function call(path, opts = {}) {
    const res = await authedFetch(`${API_BASE}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    // Roadmaps
    getRoadmaps:   ()         => call('/api/roadmaps'),
    getRoadmap:    (id)       => call(`/api/roadmaps/${id}`),
    createRoadmap: (body)     => call('/api/roadmaps', json(body)),
    updateRoadmap: (id, body) => call(`/api/roadmaps/${id}`, json(body, 'PATCH')),
    deleteRoadmap: (id)       => call(`/api/roadmaps/${id}`, { method: 'DELETE' }),

    // Stages
    createStage: (roadmapId, body) => call(`/api/roadmaps/${roadmapId}/stages`, json(body)),
    updateStage: (stageId, body)   => call(`/api/roadmaps/stages/${stageId}`, json(body, 'PATCH')),
    deleteStage: (stageId)         => call(`/api/roadmaps/stages/${stageId}`, { method: 'DELETE' }),

    // Items
    createItem: (roadmapId, body) => call(`/api/roadmaps/${roadmapId}/items`, json(body)),
    updateItem: (itemId, body)    => call(`/api/roadmaps/items/${itemId}`, json(body, 'PATCH')),
    deleteItem: (itemId)          => call(`/api/roadmaps/items/${itemId}`, { method: 'DELETE' }),

    // Utilities
    reorder:     (roadmapId, body) => call(`/api/roadmaps/${roadmapId}/reorder`, json(body)),
    getProgress: (roadmapId)       => call(`/api/roadmaps/${roadmapId}/progress`),
  };
}
