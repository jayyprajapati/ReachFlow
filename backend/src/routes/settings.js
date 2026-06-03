'use strict';

const express = require('express');
const { AISettings } = require('../db');
const { encryptJson, decryptJson } = require('../utils/dataSecurity');
const { llmPing, brainDetail, BrainError } = require('../services/brainClient');

const router = express.Router();

// Supported models per provider (used for UI dropdowns and validation)
const PROVIDER_MODELS = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
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
      personalizationPrefs: doc.personalizationPrefs || null,
      systemPrompt: doc.systemPrompt || '',
    });
  } catch (err) {
    console.error('[settings] GET /ai failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/settings/ai ────────────────────────────────────────────────────
router.put('/ai', async (req, res) => {
  try {
    const { provider, apiKey, model, localEndpoint, systemPrompt } = req.body || {};

    if (provider && !VALID_PROVIDERS.has(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${[...VALID_PROVIDERS].join(', ')}` });
    }

    const userId = req.user._id;
    let doc = await AISettings.findOne({ userId });
    if (!doc) doc = new AISettings({ userId });

    if (provider) doc.provider = provider;
    if (model !== undefined) doc.selectedModel = String(model || '');
    if (localEndpoint !== undefined) doc.localEndpoint = String(localEndpoint || '');
    if (systemPrompt !== undefined) {
      const trimmed = String(systemPrompt || '').trim().slice(0, 2000);
      doc.systemPrompt = trimmed;
    }

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
// Tests the stored AI provider by calling Brain /v1/llm/ping — a lightweight
// single-token LLM call. Returns step-by-step diagnostics for the UI timeline.
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

    // ── Step 3: Call Brain /v1/llm/ping ────────────────────────────────────
    const model = doc.selectedModel || '';
    const s3 = step(`Testing ${provider}${model ? ` (${model})` : ''} via Brain`);

    const llmOverride = { provider };
    if (apiKey) llmOverride.api_key = apiKey;
    if (model) llmOverride.model = model;
    if (provider === 'ollama_local' && doc.localEndpoint) llmOverride.base_url = doc.localEndpoint;

    let testOk = false;
    let testError = '';

    try {
      await llmPing({ llm: llmOverride });
      testOk = true;
    } catch (err) {
      if (err.name === 'AbortError') {
        testError = `Connection timed out. Check that ${provider === 'ollama_local' ? `Ollama is running at ${doc.localEndpoint || 'http://localhost:11434'}` : `the ${provider} API is reachable`}.`;
      } else if (err instanceof BrainError && !err.status) {
        const base = (process.env.BRAIN_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
        testError = `Cannot reach the Brain service at ${base}. Is it running?`;
      } else {
        testError = brainDetail(err);
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

// ── PUT /api/settings/ai/personalization ────────────────────────────────────
const VALID_TONES = new Set(['professional', 'casual', 'concise']);
const VALID_VERBOSITY = new Set(['brief', 'standard', 'detailed']);
const VALID_FORMAT = new Set(['bullet_heavy', 'prose', 'mixed']);

router.put('/ai/personalization', async (req, res) => {
  try {
    const { tone, verbosity, formatPreference } = req.body || {};

    if (tone !== undefined && !VALID_TONES.has(tone)) {
      return res.status(400).json({ error: `Invalid tone. Must be one of: ${[...VALID_TONES].join(', ')}` });
    }
    if (verbosity !== undefined && !VALID_VERBOSITY.has(verbosity)) {
      return res.status(400).json({ error: `Invalid verbosity. Must be one of: ${[...VALID_VERBOSITY].join(', ')}` });
    }
    if (formatPreference !== undefined && !VALID_FORMAT.has(formatPreference)) {
      return res.status(400).json({ error: `Invalid formatPreference. Must be one of: ${[...VALID_FORMAT].join(', ')}` });
    }

    const userId = req.user._id;
    let doc = await AISettings.findOne({ userId });
    if (!doc) doc = new AISettings({ userId });

    doc.personalizationPrefs = {
      ...(doc.personalizationPrefs || {}),
      ...(tone !== undefined ? { tone } : {}),
      ...(verbosity !== undefined ? { verbosity } : {}),
      ...(formatPreference !== undefined ? { formatPreference } : {}),
    };

    await doc.save();
    console.log(`[settings] PUT /ai/personalization — userId: ${userId}`);
    return res.json({ ok: true, personalizationPrefs: doc.personalizationPrefs });
  } catch (err) {
    console.error('[settings] PUT /ai/personalization failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
