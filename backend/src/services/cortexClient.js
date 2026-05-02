'use strict';

const fs = require('fs');
const path = require('path');

const CORTEX_BASE_URL = (process.env.CORTEX_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const CORTEX_APP_NAME = process.env.CORTEX_APP_NAME || 'resumelab';

// /extract makes up to 4 sequential LLM calls — give it enough time.
// All other JSON endpoints are single-shot; 60 s is plenty.
const CORTEX_TIMEOUT_MS = 60_000;
const CORTEX_EXTRACT_TIMEOUT_MS = parseInt(process.env.CORTEX_EXTRACT_TIMEOUT_MS || '300000', 10); // 5 min

const MAX_RETRIES = 2;

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

class CortexError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'CortexError';
    this.status = status;
    this.body = body;
  }
}

// Extract a human-readable detail string from a CortexError's body.
function cortexDetail(err) {
  if (err instanceof CortexError) {
    return err.body?.detail || err.body?.error || err.message;
  }
  return err.message;
}

function isRetryable(err) {
  if (err.name === 'AbortError') return true;
  // 4xx errors (except 408/429) are client-side failures — no point retrying.
  // 5xx (including our new 502 for LLM provider failures) are retried.
  if (err instanceof CortexError) {
    if (!err.status) return true;
    if (err.status === 408 || err.status === 429) return true; // timeout / rate-limit
    return err.status >= 500;
  }
  return true;
}

async function cortexFetch(method, endpoint, body, { isFormData = false, timeoutMs = CORTEX_TIMEOUT_MS } = {}) {
  const url = `${CORTEX_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const options = { method, signal: controller.signal };
    if (isFormData) {
      options.body = body;
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { detail: text }; }

    if (!res.ok) {
      const detail = parsed?.detail || parsed?.error || res.statusText;
      throw new CortexError(
        `Cortex ${method} ${endpoint} failed (${res.status}): ${detail}`,
        { status: res.status, body: parsed },
      );
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[cortex] ${label} — attempt ${attempt + 1}`);
      const result = await fn();
      console.log(`[cortex] ${label} — success`);
      return result;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      if (isLast || !isRetryable(err)) {
        console.error(`[cortex] ${label} — failed: ${cortexDetail(err)}`);
        throw err;
      }
      const delay = 500 * (attempt + 1);
      console.warn(`[cortex] ${label} — attempt ${attempt + 1} failed (${cortexDetail(err)}), retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Send a resume file to Cortex /extract and return the structured ExtractResponse.
 * Uses a 5-minute timeout because Cortex may make up to 4 sequential LLM calls.
 */
async function extractResume({ filePath, userId, docId }) {
  const label = `POST /extract (user: ${userId})`;
  return withRetry(async () => {
    const fileBuffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const blob = new Blob([fileBuffer], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, path.basename(filePath));
    formData.append('app_name', CORTEX_APP_NAME);
    formData.append('user_id', String(userId));
    if (docId) formData.append('doc_id', String(docId));
    formData.append('extraction_type', 'resume');

    return cortexFetch('POST', '/extract', formData, {
      isFormData: true,
      timeoutMs: CORTEX_EXTRACT_TIMEOUT_MS,
    });
  }, label);
}

/**
 * Merge an incoming ExtractResponse into an existing canonical profile via Cortex /profile/merge.
 * Pass existingProfile={} for a user's first upload — Cortex treats all items as new.
 */
async function mergeCanonicalProfile({ userId, existingProfile, incomingProfile, similarityThreshold = 0.85 }) {
  const label = `POST /profile/merge (user: ${userId})`;
  return withRetry(() => cortexFetch('POST', '/profile/merge', {
    app_name: CORTEX_APP_NAME,
    user_id: String(userId),
    existing_profile: existingProfile || {},
    incoming_profile: incomingProfile,
    similarity_threshold: similarityThreshold,
  }), label);
}

/**
 * Analyze a job description against a canonical profile via Cortex /analyze/match.
 */
async function analyzeResumeMatch({ userId, jobDescription, canonicalProfile, baseResume }) {
  const label = `POST /analyze/match (user: ${userId})`;
  const body = {
    app_name: CORTEX_APP_NAME,
    user_id: String(userId),
    job_description: jobDescription,
    canonical_profile: canonicalProfile,
  };
  if (baseResume) body.base_resume = baseResume;
  return withRetry(() => cortexFetch('POST', '/analyze/match', body), label);
}

/**
 * Generate an ATS-optimised structured resume via Cortex /generate/document.
 */
async function generateOptimizedResume({ userId, jobDescription, canonicalProfile, baseResume, templateType = 'fullstack' }) {
  const label = `POST /generate/document (user: ${userId}, template: ${templateType})`;
  const body = {
    app_name: CORTEX_APP_NAME,
    user_id: String(userId),
    job_description: jobDescription,
    canonical_profile: canonicalProfile,
    template_type: templateType,
  };
  if (baseResume) body.base_resume = baseResume;
  return withRetry(() => cortexFetch('POST', '/generate/document', body), label);
}

module.exports = { extractResume, mergeCanonicalProfile, analyzeResumeMatch, generateOptimizedResume, CortexError, cortexDetail };
