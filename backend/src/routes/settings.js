'use strict';

const express = require('express');
const { AISettings } = require('../db');
const { encryptJson, decryptJson } = require('../utils/dataSecurity');

const router = express.Router();

// Supported models per provider (used for UI dropdowns and validation)
const PROVIDER_MODELS = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  ollama_cloud: ['gpt-oss:120b', 'llama3.3:70b', 'llama3.1:70b', 'mistral:7b'],
  ollama_local: [],  // dynamic — discovered from the local endpoint
};

const VALID_PROVIDERS = new Set(Object.keys(PROVIDER_MODELS));

function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

// ── GET /api/settings/ai ────────────────────────────────────────────────────
router.get('/ai', async (req, res) => {
  try {
    const doc = await AISettings.findOne({ userId: req.user._id });
    if (!doc) {
      return res.json({
        configured: false,
        provider: 'ollama_cloud',
        model: '',
        hasApiKey: false,
        localEndpoint: '',
        isValid: false,
        validatedAt: null,
        supportedModels: PROVIDER_MODELS,
      });
    }

    let apiKeyPreview = '';
    if (doc.apiKeyEncrypted) {
      try {
        const raw = decryptJson(doc.apiKeyEncrypted);
        apiKeyPreview = maskKey(typeof raw === 'string' ? raw : raw?.key || '');
      } catch {
        apiKeyPreview = '••••••••';
      }
    }

    return res.json({
      configured: true,
      provider: doc.provider,
      model: doc.selectedModel,
      hasApiKey: !!doc.apiKeyEncrypted,
      apiKeyPreview,
      localEndpoint: doc.localEndpoint,
      isValid: doc.isValid,
      validatedAt: doc.validatedAt,
      supportedModels: PROVIDER_MODELS,
    });
  } catch (err) {
    console.error('[settings] GET /ai failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/settings/ai ────────────────────────────────────────────────────
router.put('/ai', async (req, res) => {
  try {
    const { provider, apiKey, model, localEndpoint } = req.body || {};

    if (provider && !VALID_PROVIDERS.has(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${[...VALID_PROVIDERS].join(', ')}` });
    }

    const userId = req.user._id;
    let doc = await AISettings.findOne({ userId });
    if (!doc) doc = new AISettings({ userId });

    if (provider) doc.provider = provider;
    if (model !== undefined) doc.selectedModel = String(model || '');
    if (localEndpoint !== undefined) doc.localEndpoint = String(localEndpoint || '');

    // Encrypt API key if provided and non-empty
    if (apiKey !== undefined) {
      if (apiKey === '' || apiKey === null) {
        doc.apiKeyEncrypted = '';
      } else {
        doc.apiKeyEncrypted = encryptJson(String(apiKey).trim());
      }
    }

    // Any settings change resets validation — user must re-test
    doc.isValid = false;
    doc.validatedAt = null;

    await doc.save();
    console.log(`[settings] PUT /ai — userId: ${userId}, provider: ${doc.provider}`);

    return res.json({ ok: true, provider: doc.provider, model: doc.selectedModel });
  } catch (err) {
    console.error('[settings] PUT /ai failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/settings/ai/test ──────────────────────────────────────────────
// Tests the stored AI provider by calling Cortex /llm/ping — a lightweight
// single-token LLM call, much faster than the old /analyze/match approach.
// Returns step-by-step diagnostics so the UI can show a timeline.
router.post('/ai/test', async (req, res) => {
  const steps = [];

  function step(name) {
    const s = { name, ok: false };
    steps.push(s);
    return s;
  }

  try {
    const userId = req.user._id;

    // ── Step 1: Load settings ──────────────────────────────────────────────
    const s1 = step('Loading saved settings');
    const doc = await AISettings.findOne({ userId });
    if (!doc) {
      s1.error = 'No AI settings configured. Save your provider settings first.';
      return res.status(400).json({ ok: false, error: s1.error, steps });
    }
    s1.ok = true;

    const provider = doc.provider;

    // ── Step 2: Decrypt credentials ────────────────────────────────────────
    const s2 = step('Decrypting credentials');
    let apiKey = '';
    if (doc.apiKeyEncrypted) {
      try {
        const raw = decryptJson(doc.apiKeyEncrypted);
        apiKey = typeof raw === 'string' ? raw : (raw?.key || '');
      } catch {
        s2.error = 'API key decryption failed. Please re-save your API key.';
        return res.status(400).json({ ok: false, error: s2.error, steps });
      }
    }
    s2.ok = true;

    // ── Step 3: Call Cortex /llm/ping ──────────────────────────────────────
    const model = doc.selectedModel || '';
    const s3 = step(`Testing ${provider}${model ? ` (${model})` : ''} via Cortex`);

    const CORTEX_BASE_URL = (process.env.CORTEX_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

    const llmOverride = { provider };
    if (apiKey) llmOverride.api_key = apiKey;
    if (model) llmOverride.model = model;
    if (provider === 'ollama_local' && doc.localEndpoint) llmOverride.base_url = doc.localEndpoint;

    const controller = new AbortController();
    // 30 s — enough for a single-token generation even on slow hardware
    const timer = setTimeout(() => controller.abort(), 30_000);
    let testOk = false;
    let testError = '';

    try {
      const pingRes = await fetch(`${CORTEX_BASE_URL}/llm/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llm: llmOverride }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (pingRes.ok) {
        testOk = true;
      } else {
        const body = await pingRes.text().catch(() => '');
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = { detail: body }; }
        testError = parsed?.detail || `HTTP ${pingRes.status}`;
      }
    } catch (fetchErr) {
      clearTimeout(timer);
      if (fetchErr.name === 'AbortError') {
        testError = `Connection timed out after 30s. Check that ${provider === 'ollama_local' ? `Ollama is running at ${doc.localEndpoint || 'http://localhost:11434'}` : `the ${provider} API is reachable`}.`;
      } else if (fetchErr.code === 'ECONNREFUSED') {
        testError = `Cannot reach Cortex backend at ${CORTEX_BASE_URL}. Is the Cortex server running?`;
      } else {
        testError = fetchErr.message;
      }
    }

    s3.ok = testOk;
    if (!testOk) s3.error = testError;

    // Persist validation result
    doc.isValid = testOk;
    doc.validatedAt = testOk ? new Date() : null;
    await doc.save();

    if (testOk) {
      const label = model ? `${provider} / ${model}` : provider;
      console.log(`[settings] AI test PASSED — userId: ${userId}, provider: ${provider}`);
      return res.json({
        ok: true,
        message: `${label} connection validated successfully.`,
        provider,
        model,
        steps,
      });
    } else {
      console.warn(`[settings] AI test FAILED — userId: ${userId}, provider: ${provider}: ${testError}`);
      return res.status(400).json({ ok: false, error: testError, steps });
    }
  } catch (err) {
    console.error('[settings] POST /ai/test failed:', err.message);
    res.status(500).json({ ok: false, error: err.message, steps });
  }
});

module.exports = router;
