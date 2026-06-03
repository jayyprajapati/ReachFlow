/**
 * DSA Lab API service.
 *
 * makeDsaApi(authedFetch) — returns JSON-only API helpers. The shared `call()`
 * propagates `err.status` and `err.code` so callers can distinguish a BYOK gate
 * (402 / LLM_NOT_*), a refused non-DSA problem (422 / NOT_DSA_PROBLEM), and
 * an unsafe submitted-code rejection (422 / UNSAFE_CODE_REJECTED).
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function json(data) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

export function makeDsaApi(authedFetch) {
  async function call(path, opts = {}) {
    const res = await authedFetch(`${API_BASE}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      if (data.code) err.code = data.code;
      throw err;
    }
    return data;
  }

  return {
    analyze: (body) => call('/api/dsa/analyze', json(body)),
    getAnalyses: () => call('/api/dsa/analyses'),
    getAnalysis: (id) => call(`/api/dsa/analyses/${id}`),
    deleteAnalysis: (id) => call(`/api/dsa/analyses/${id}`, { method: 'DELETE' }),
    clearHistory: () => call('/api/dsa/analyses', { method: 'DELETE' }),
  };
}
