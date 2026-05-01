'use strict';

const fs = require('fs');
const path = require('path');

const CORTEX_BASE_URL = (process.env.CORTEX_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const CORTEX_APP_NAME = process.env.CORTEX_APP_NAME || 'resumelab';
const CORTEX_TIMEOUT_MS = 60_000;
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

function isRetryable(err) {
  if (err.name === 'AbortError') return true;
  if (err instanceof CortexError) return !err.status || err.status >= 500;
  return true;
}

async function cortexFetch(method, endpoint, body, { isFormData = false } = {}) {
  const url = `${CORTEX_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CORTEX_TIMEOUT_MS);

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
        { status: res.status, body: parsed }
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
        console.error(`[cortex] ${label} — failed: ${err.message}`);
        throw err;
      }
      const delay = 500 * (attempt + 1);
      console.warn(`[cortex] ${label} — attempt ${attempt + 1} failed (${err.message}), retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Send a resume file to Cortex /extract and return the structured ExtractResponse.
 * @param {object} opts
 * @param {string} opts.filePath  Absolute path to the file on disk.
 * @param {string} opts.userId    MongoDB user ID (for Cortex routing).
 * @param {string} [opts.docId]   Optional doc_id; Cortex generates a UUID if omitted.
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

    return cortexFetch('POST', '/extract', formData, { isFormData: true });
  }, label);
}

/**
 * Merge an incoming ExtractResponse into an existing canonical profile via Cortex /profile/merge.
 * Pass existingProfile={} for a user's first upload — Cortex treats all items as new.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {object} opts.existingProfile   Current CanonicalProfile or {} for first merge.
 * @param {object} opts.incomingProfile   ExtractResponse from the new resume.
 * @param {number} [opts.similarityThreshold]  0–1, default 0.85.
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

module.exports = { extractResume, mergeCanonicalProfile, CortexError };
