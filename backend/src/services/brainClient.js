'use strict';

/**
 * brainClient.js — ReachFlow's client for the Brain service.
 *
 * Brain is an application-agnostic LLM + RAG engine. It exposes generic
 * primitives (/v1/extract, /v1/generate, /v1/llm/ping, …); all resume/JD domain
 * logic lives in brainPrompts.js and is composed here. Auth is a single shared
 * Bearer key (BRAIN_API_KEY); per-user isolation is a generic `namespace`
 * (we pass the userId). No JWT.
 */

const fs = require('fs');
const path = require('path');
const prompts = require('./brainPrompts');

const BRAIN_BASE_URL = (process.env.BRAIN_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const BRAIN_API_KEY = process.env.BRAIN_API_KEY || 'change-me';
// One Qdrant collection per app; resumes live here, isolated per user via namespace.
const BRAIN_APP_NAME = process.env.BRAIN_APP_NAME || 'reachflow_resumes';

const BRAIN_TIMEOUT_MS = 60_000;
const BRAIN_EXTRACT_TIMEOUT_MS = parseInt(process.env.BRAIN_EXTRACT_TIMEOUT_MS || '300000', 10); // 5 min
const BRAIN_GENERATE_TIMEOUT_MS = parseInt(process.env.BRAIN_GENERATE_TIMEOUT_MS || '180000', 10); // 3 min

const MAX_RETRIES = 2;

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

class BrainError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'BrainError';
    this.status = status;
    this.body = body;
  }
}

// Extract a human-readable detail string from a BrainError's body.
function brainDetail(err) {
  if (err instanceof BrainError) {
    const raw = err.body?.detail || err.body?.error || err.message;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.map(e => e?.msg || JSON.stringify(e)).join('; ');
    return JSON.stringify(raw);
  }
  return err.message || String(err);
}

function isRetryable(err) {
  if (err.name === 'AbortError') return true;
  if (err instanceof BrainError) {
    if (!err.status) return true;
    if (err.status === 408 || err.status === 429) return true;
    return err.status >= 500;
  }
  return true;
}

// Whitelist only the provider fields Brain understands. ReachFlow attaches
// internal `_personalizationPrefs` / `_userSystemPrompt` to its llm object;
// those must NOT leak to Brain.
function toBrainLlm(llm) {
  if (!llm || !llm.provider) return undefined;
  const out = { provider: llm.provider };
  if (llm.api_key) out.api_key = llm.api_key;
  if (llm.model) out.model = llm.model;
  if (llm.base_url) out.base_url = llm.base_url;
  return out;
}

// Build the style block from a route-supplied llm (carrying internal fields)
// and/or explicit overrides.
function styleBlockFrom(llm, personalizationPrefs, userSystemPrompt) {
  const prefs = personalizationPrefs ?? llm?._personalizationPrefs ?? null;
  const sys = userSystemPrompt ?? llm?._userSystemPrompt ?? null;
  return prompts.buildStyleBlock(prefs, sys);
}

async function brainFetch(method, endpoint, body, { isFormData = false, timeoutMs = BRAIN_TIMEOUT_MS } = {}) {
  const url = `${BRAIN_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const options = { method, signal: controller.signal };
    if (isFormData) {
      options.headers = { Authorization: `Bearer ${BRAIN_API_KEY}` };
      options.body = body;
    } else {
      options.headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${BRAIN_API_KEY}` };
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { detail: text }; }

    if (!res.ok) {
      const detail = parsed?.detail || parsed?.error || res.statusText;
      throw new BrainError(`Brain ${method} ${endpoint} failed (${res.status}): ${detail}`, { status: res.status, body: parsed });
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[brain] ${label} — attempt ${attempt + 1}`);
      const result = await fn();
      console.log(`[brain] ${label} — success`);
      return result;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      if (isLast || !isRetryable(err)) {
        console.error(`[brain] ${label} — failed: ${brainDetail(err)}`);
        throw err;
      }
      const delay = err instanceof BrainError && err.status === 429 ? 8000 * (attempt + 1) : 500 * (attempt + 1);
      console.warn(`[brain] ${label} — attempt ${attempt + 1} failed (${brainDetail(err)}), retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Low-level: generic LLM call → returns parsed JSON (json=true) or text.
async function generate({ system, prompt, data, llm, json = false, maxTokens, timeoutMs = BRAIN_GENERATE_TIMEOUT_MS }) {
  const body = { app_name: BRAIN_APP_NAME, system, prompt };
  if (data !== undefined) body.data = data;
  const cleanLlm = toBrainLlm(llm);
  if (cleanLlm) body.llm = cleanLlm;
  if (json) body.response_format = 'json';
  if (maxTokens) body.max_tokens = maxTokens;
  const res = await brainFetch('POST', '/v1/generate', body, { timeoutMs });
  return json ? (res.json ?? {}) : (res.text ?? '');
}

// ── Resume extract: file → text (ingested as deduped vectors) → structured ────

async function extractResume({ filePath, userId, docId, llm }) {
  const label = `extractResume (user: ${userId})`;
  return withRetry(async () => {
    const fileBuffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const blob = new Blob([fileBuffer], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, path.basename(filePath));
    formData.append('app_name', BRAIN_APP_NAME);
    if (docId) formData.append('doc_id', String(docId));
    formData.append('namespace', String(userId));
    formData.append('ingest', 'true');
    formData.append('dedup', 'true');

    // 1) Extract plain text + store deduped vectors in Qdrant (scoped to this user).
    const extracted = await brainFetch('POST', '/v1/extract', formData, {
      isFormData: true,
      timeoutMs: BRAIN_EXTRACT_TIMEOUT_MS,
    });

    // 2) Structure the text into a profile via a generic JSON generation call.
    const { system, prompt } = prompts.resumeExtractPrompt({ resumeText: extracted.text });
    const structured = await generate({ system, prompt, llm, json: true });

    return {
      ...structured,
      doc_id: extracted.doc_id || (docId ? String(docId) : ''),
      normalized_resume_text: extracted.text || '',
      sectioned_resume_source: structured.sectioned_resume_source || null,
      metadata: {
        confidence: typeof structured.confidence === 'number' ? structured.confidence : null,
        chunk_count: extracted.chunk_count || 0,
        skipped_duplicates: extracted.skipped_duplicates || 0,
        cache_hit: false,
      },
    };
  }, label);
}

// ── Cumulative career-profile merge ───────────────────────────────────────────

async function mergeCanonicalProfile({ userId, existingProfile, incomingProfile }) {
  const label = `mergeCanonicalProfile (user: ${userId})`;
  const { system, prompt } = prompts.mergeProfilePrompt({ existingProfile, incomingProfile });
  return withRetry(async () => {
    const result = await generate({ system, prompt, json: true });
    return {
      canonical_profile: result.canonical_profile || existingProfile || {},
      added_items: result.added_items || {},
      merged_duplicates: result.merged_duplicates || {},
    };
  }, label);
}

// ── JD analysis scoped to the selected resume ─────────────────────────────────

async function analyzeResumeMatch({ userId, jobDescription, canonicalProfile, baseResume, llm, personalizationPrefs, userSystemPrompt }) {
  const label = `analyzeResumeMatch (user: ${userId})`;
  const styleBlock = styleBlockFrom(llm, personalizationPrefs, userSystemPrompt);
  const { system, prompt } = prompts.analyzePrompt({ jobDescription, baseResume, canonicalProfile, styleBlock });
  return withRetry(() => generate({ system, prompt, llm, json: true }), label);
}

// ── Cover letter ──────────────────────────────────────────────────────────────

async function generateCoverLetter({ userId, jobDescription, canonicalProfile, llm, analysisSummary, userPrompt, personalizationPrefs, userSystemPrompt }) {
  const label = `generateCoverLetter (user: ${userId})`;
  const styleBlock = styleBlockFrom(llm, personalizationPrefs, userSystemPrompt);
  const { system, prompt } = prompts.coverLetterPrompt({ jobDescription, canonicalProfile, analysisSummary, userPrompt, styleBlock });
  return withRetry(() => generate({ system, prompt, llm, json: true }), label);
}

// ── HR outreach email ─────────────────────────────────────────────────────────

async function generateHrEmail({ userId, jobDescription, canonicalProfile, recipientName, llm, analysisSummary, userPrompt, personalizationPrefs, userSystemPrompt }) {
  const label = `generateHrEmail (user: ${userId})`;
  const styleBlock = styleBlockFrom(llm, personalizationPrefs, userSystemPrompt);
  const { system, prompt } = prompts.hrEmailPrompt({ jobDescription, canonicalProfile, recipientName, analysisSummary, userPrompt, styleBlock });
  return withRetry(() => generate({ system, prompt, llm, json: true }), label);
}

// ── Compose body rewrite ──────────────────────────────────────────────────────

async function composeRewrite({ userId, instruction, bodyHtml, bodyText, subject, llm, personalizationPrefs, userSystemPrompt }) {
  const label = `composeRewrite (user: ${userId})`;
  const styleBlock = styleBlockFrom(llm, personalizationPrefs, userSystemPrompt);
  const { system, prompt } = prompts.rewritePrompt({ instruction, bodyHtml: bodyHtml || bodyText || '', subject, styleBlock });
  return withRetry(() => generate({ system, prompt, llm, json: true }), label);
}

// ── Vector cleanup ────────────────────────────────────────────────────────────

// Delete a resume's vectors from Qdrant, scoped to this user (namespace) AND this
// document (doc_id) so it can never touch another user's or another resume's
// vectors. Idempotent — deleting an already-absent doc is a no-op.
async function deleteResumeVectors({ userId, docId }) {
  if (!docId) return { ok: true, deleted: 0 };
  const label = `deleteResumeVectors (user: ${userId}, doc: ${docId})`;
  const body = {
    app_name: BRAIN_APP_NAME,
    doc_id: String(docId),
    namespace: String(userId),
  };
  return withRetry(() => brainFetch('POST', '/v1/delete', body, { timeoutMs: 30_000 }), label);
}

// Delete ALL of a user's vectors from Qdrant in one shot, scoped only to this
// user's namespace (no doc_id) — used when wiping the entire Career Profile.
// Per-user isolation still holds: it never touches another namespace.
async function deleteAllUserVectors({ userId }) {
  if (!userId) return { ok: true, deleted: 0 };
  const label = `deleteAllUserVectors (user: ${userId})`;
  const body = {
    app_name: BRAIN_APP_NAME,
    namespace: String(userId),
  };
  return withRetry(() => brainFetch('POST', '/v1/delete', body, { timeoutMs: 30_000 }), label);
}

// ── DSA / algorithm analysis ──────────────────────────────────────────────────

// Analyze a DSA problem (and optionally the user's Java/Python solution). Returns
// the parsed JSON described by prompts.dsaAnalysisPrompt — including the
// is_dsa_problem gate the caller uses to refuse non-DSA input. maxTokens is
// generous because 2–3 approaches × two languages of real code is large.
async function analyzeDsa({ userId, problemStatement, userCode, language, outputLanguages, llm }) {
  const label = `analyzeDsa (user: ${userId})`;
  const { system, prompt } = prompts.dsaAnalysisPrompt({ problemStatement, userCode, language, outputLanguages });
  return withRetry(() => generate({ system, prompt, llm, json: true, maxTokens: 8000 }), label);
}

// ── BYOK connection test ──────────────────────────────────────────────────────

async function llmPing({ llm }) {
  const body = {};
  const cleanLlm = toBrainLlm(llm);
  if (cleanLlm) body.llm = cleanLlm;
  return brainFetch('POST', '/v1/llm/ping', body, { timeoutMs: 30_000 });
}

module.exports = {
  extractResume,
  mergeCanonicalProfile,
  analyzeResumeMatch,
  generateCoverLetter,
  generateHrEmail,
  composeRewrite,
  analyzeDsa,
  deleteResumeVectors,
  deleteAllUserVectors,
  llmPing,
  BrainError,
  brainDetail,
};
