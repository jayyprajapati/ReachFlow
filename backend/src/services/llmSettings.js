'use strict';

/**
 * llmSettings.js — shared BYOK (bring-your-own-key) resolution.
 *
 * Every AI feature (Resume Lab, DSA Lab, …) must run against the user's OWN
 * validated AI provider. This module centralizes that enforcement so each route
 * resolves the per-user `llm` override the same way and fails identically when
 * the provider is missing or unverified.
 *
 * The returned override is shaped for Brain's `/v1/generate` plus two internal
 * fields (`_personalizationPrefs`, `_userSystemPrompt`) that brainClient strips
 * before sending — see toBrainLlm()/styleBlockFrom() in brainClient.js.
 */

const { AISettings } = require('../db');
const { decryptJson } = require('../utils/dataSecurity');

// Resolves the user's AI provider override from their saved AISettings.
// Throws a typed error when no valid settings exist — enforces BYOK strictly.
async function resolveUserLlm(userId) {
  const doc = await AISettings.findOne({ userId });

  if (!doc) {
    const err = new Error(
      'AI provider not configured. Go to Settings → AI to add and test your API key before using AI features.'
    );
    err.code = 'LLM_NOT_CONFIGURED';
    throw err;
  }

  if (!doc.isValid) {
    const err = new Error(
      'AI provider connection not verified. Go to Settings → AI and click "Test Connection" to validate your key.'
    );
    err.code = 'LLM_NOT_VALIDATED';
    throw err;
  }

  const override = { provider: doc.provider };
  if (doc.selectedModel) override.model = doc.selectedModel;
  if (doc.provider === 'ollama_local' && doc.localEndpoint) override.base_url = doc.localEndpoint;
  if (doc.apiKeyEncrypted) {
    try {
      const raw = decryptJson(doc.apiKeyEncrypted);
      const key = typeof raw === 'string' ? raw : (raw?.key || '');
      if (key) override.api_key = key;
    } catch {
      const err = new Error('API key decryption failed. Please re-save your API key in Settings.');
      err.code = 'LLM_KEY_ERROR';
      throw err;
    }
  }
  override._personalizationPrefs = doc.personalizationPrefs || null;
  override._userSystemPrompt = (doc.systemPrompt || '').trim() || null;
  return override;
}

function isByokError(err) {
  return err.code === 'LLM_NOT_CONFIGURED' || err.code === 'LLM_NOT_VALIDATED' || err.code === 'LLM_KEY_ERROR';
}

module.exports = { resolveUserLlm, isByokError };
