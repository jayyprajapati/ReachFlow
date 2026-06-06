/**
 * Resume Lab API service.
 *
 * makeResumeLabApi(authedFetch) — returns JSON-only API helpers.
 * uploadResumeFile / downloadResumePdf — use idToken directly because
 *   authedFetch always sets Content-Type: application/json, which
 *   breaks multipart form-data and binary response handling.
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

function json(data) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

export function makeResumeLabApi(authedFetch) {
  async function call(path, opts = {}) {
    const res = await authedFetch(`${API_BASE}${path}`, opts);
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      if (data.steps) err.steps = data.steps;
      if (data.code) err.code = data.code;
      throw err;
    }
    return data;
  }

  return {
    // ── Resume Vault ──────────────────────────────────────────────────────
    getResumes: () =>
      call('/api/resumelab/resumes'),
    updateResume: (id, body) =>
      call(`/api/resumelab/resumes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    deleteResume: (id) =>
      call(`/api/resumelab/resumes/${id}`, { method: 'DELETE' }),

    // ── Canonical Profile ─────────────────────────────────────────────────
    getProfile: () =>
      call('/api/resumelab/profile'),
    rebuildProfile: () =>
      call('/api/resumelab/profile/rebuild', { method: 'POST' }),
    deleteProfile: () =>
      call('/api/resumelab/profile', { method: 'DELETE' }),

    // ── JD Analysis ───────────────────────────────────────────────────────
    analyzeJD: (body, { signal } = {}) =>
      call('/api/resumelab/analyze', { ...json(body), signal }),
    getAnalyses: () =>
      call('/api/resumelab/analyses'),
    getAnalysis: (id) =>
      call(`/api/resumelab/analyses/${id}`),

    // ── Resume Generation ─────────────────────────────────────────────────
    generateResume: (body) =>
      call('/api/resumelab/generate', json(body)),
    generateFromLatex: (body) =>
      call('/api/resumelab/generate-from-latex', json(body)),
    getGenerated: () =>
      call('/api/resumelab/generated'),
    getGeneratedById: (id) =>
      call(`/api/resumelab/generated/${id}`),
    deleteGenerated: (id) =>
      call(`/api/resumelab/generated/${id}`, { method: 'DELETE' }),
    compileLatex: (id, latexSource) =>
      call(`/api/resumelab/generated/${id}/compile-latex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latexSource }),
      }),
    compileLatexStateless: (latexSource) =>
      call('/api/resumelab/compile-latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latexSource }),
      }),

    // ── Cover Letter + HR Email ───────────────────────────────────────────
    generateCoverLetter: (body) =>
      call('/api/resumelab/generate-cover-letter', json(body)),
    generateHrEmail: (body) =>
      call('/api/resumelab/generate-hr-email', json(body)),

    // ── History + Flow ────────────────────────────────────────────────────
    getHistory: () =>
      call('/api/resumelab/history'),
    clearHistory: () =>
      call('/api/resumelab/history', { method: 'DELETE' }),
    getFlow: (flowId) =>
      call(`/api/resumelab/flow/${encodeURIComponent(flowId)}`),
    setItemNote: (section, canonicalKey, showcasePrompt) =>
      call('/api/resumelab/profile/item-note', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, canonical_key: canonicalKey, showcase_prompt: showcasePrompt }),
      }),

    // ── AI Settings ───────────────────────────────────────────────────────
    getAISettings: () =>
      call('/api/settings/ai'),
    saveAISettings: (body) =>
      call('/api/settings/ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    testAIConnection: () =>
      call('/api/settings/ai/test', { method: 'POST' }),
  };
}

// Multipart upload — must NOT send Content-Type (browser sets multipart boundary).
export async function uploadResumeFile(idToken, formData) {
  const res = await fetch(`${API_BASE}/api/resumelab/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// PDF download — binary response, must carry auth header.
export async function downloadResumePdf(idToken, generatedId) {
  const res = await fetch(`${API_BASE}/api/resumelab/generated/${generatedId}/pdf`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'PDF not available');
  }
  return res.blob();
}
