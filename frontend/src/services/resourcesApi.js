const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function parseResponse(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || fallback);
    if (data.code) err.code = data.code;
    throw err;
  }
  return data;
}

export function makeResourcesApi(authedFetch) {
  return {
    async list() {
      const res = await authedFetch(`${API_BASE}/api/resources`);
      return parseResponse(res, 'Failed to load resources');
    },
    async remove(id) {
      const res = await authedFetch(`${API_BASE}/api/resources/${id}`, { method: 'DELETE' });
      return parseResponse(res, 'Failed to delete resource');
    },
  };
}

export async function uploadResourceFile(idToken, file, source = 'manual') {
  const formData = new FormData();
  formData.append('resource', file);
  formData.append('source', source);
  const res = await fetch(`${API_BASE}/api/resources/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: formData,
  });
  return parseResponse(res, 'Failed to upload resource');
}

export async function downloadResourceFile(idToken, resource) {
  const res = await fetch(`${API_BASE}/api/resources/${resource.id}/download`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to download resource');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = resource.name || 'resource';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
