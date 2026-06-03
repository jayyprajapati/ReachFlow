'use strict';

/**
 * dsa.js — DSA Lab routes.
 *
 * A user pastes a Data-Structures-&-Algorithms problem and, optionally, their own
 * Java/Python solution. We run a single stateless LLM call through Brain's generic
 * /v1/generate (composed in brainClient.analyzeDsa + brainPrompts.dsaAnalysisPrompt)
 * and persist the result per-user so it can be revisited from the History tab.
 *
 * BYOK is enforced exactly like Resume Lab via the shared resolveUserLlm helper.
 * Non-DSA input is refused: the model returns is_dsa_problem=false and we surface
 * that as HTTP 422 (code NOT_DSA_PROBLEM) so the UI shows a friendly error.
 */

const express = require('express');
const { Types } = require('mongoose');
const { DsaAnalysis } = require('../db');
const { analyzeDsa, BrainError, brainDetail } = require('../services/brainClient');
const { resolveUserLlm, isByokError } = require('../services/llmSettings');

const router = express.Router();

const PROBLEM_MAX_LENGTH = 20_000;
const CODE_MAX_LENGTH = 30_000;
const VALID_LANGUAGES = new Set(['java', 'python']);

function toSummary(doc) {
  return {
    id: doc._id.toString(),
    problemTitle: doc.problemTitle || '',
    hasUserCode: !!doc.hasUserCode,
    language: doc.language || 'java',
    isOptimal: doc.isOptimal,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toFull(doc) {
  return {
    ...toSummary(doc),
    problemStatement: doc.problemStatement || '',
    userCode: doc.userCode || '',
    result: doc.result || null,
  };
}

// ── POST /api/dsa/analyze ─────────────────────────────────────────────────────

router.post('/analyze', async (req, res) => {
  const userId = req.user._id;
  const { problemStatement, code, language: rawLanguage } = req.body || {};

  if (!problemStatement || !String(problemStatement).trim()) {
    return res.status(400).json({ error: 'problemStatement is required' });
  }

  const problem = String(problemStatement).trim().slice(0, PROBLEM_MAX_LENGTH);
  const userCode = code ? String(code).slice(0, CODE_MAX_LENGTH) : '';
  const hasUserCode = !!userCode.trim();
  const language = VALID_LANGUAGES.has(rawLanguage) ? rawLanguage : 'java';

  console.log(`[dsa] POST /analyze — userId: ${userId}, problemLen: ${problem.length}, hasCode: ${hasUserCode}, lang: ${language}`);

  // Enforce BYOK — must have a validated AI provider before any LLM call.
  let llm;
  try {
    llm = await resolveUserLlm(userId);
  } catch (err) {
    if (isByokError(err)) return res.status(402).json({ error: err.message, code: err.code });
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }

  let result;
  const _t0 = Date.now();
  try {
    result = await analyzeDsa({
      userId: userId.toString(),
      problemStatement: problem,
      userCode: hasUserCode ? userCode : '',
      language,
      llm,
    });
    console.log(`[dsa] [latency] analyze.llm=${Date.now() - _t0}ms userId:${userId}`);
  } catch (err) {
    const detail = brainDetail(err);
    console.error(`[dsa] Analyze failed — userId: ${userId}: ${detail}`);
    if (err instanceof BrainError && [400, 413, 422, 429].includes(err.status)) {
      return res.status(err.status).json({ error: detail });
    }
    return res.status(502).json({ error: 'DSA analysis failed. Please try again.', detail });
  }

  // Gatekeeper — the model decides if this is a real DSA problem.
  if (result && result.is_dsa_problem === false) {
    const reason = String(result.rejection_reason || '').trim()
      || 'This does not look like a Data Structures & Algorithms problem.';
    console.log(`[dsa] Rejected non-DSA input — userId: ${userId}`);
    return res.status(422).json({ error: reason, code: 'NOT_DSA_PROBLEM' });
  }

  // Find the optimal approach's flag for quick history filtering.
  const optimalFromApproaches = Array.isArray(result?.approaches)
    ? result.approaches.some(a => a && a.is_optimal)
    : false;
  const isOptimal = hasUserCode
    ? (typeof result?.review?.is_optimal === 'boolean' ? result.review.is_optimal : null)
    : null;

  const doc = await DsaAnalysis.create({
    userId,
    problemStatement: problem,
    userCode: hasUserCode ? userCode : '',
    language,
    hasUserCode,
    problemTitle: String(result?.problem_title || '').trim().slice(0, 200),
    result,
    isOptimal,
    status: 'analyzed',
  });

  console.log(`[dsa] Analyze complete — userId: ${userId}, id: ${doc._id}, optimalApproach: ${optimalFromApproaches}`);

  return res.json({ id: doc._id.toString(), ...result });
});

// ── GET /api/dsa/analyses ─────────────────────────────────────────────────────

router.get('/analyses', async (req, res) => {
  try {
    const userId = req.user._id;
    const docs = await DsaAnalysis.find({ userId }).sort({ createdAt: -1 }).limit(100);
    res.json({ analyses: docs.map(toSummary) });
  } catch (err) {
    console.error('[dsa] GET /analyses failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load analyses' });
  }
});

// ── GET /api/dsa/analyses/:id ─────────────────────────────────────────────────

router.get('/analyses/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const userId = req.user._id;
    const doc = await DsaAnalysis.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Analysis not found' });
    res.json(toFull(doc));
  } catch (err) {
    console.error(`[dsa] GET /analyses/${req.params.id} failed:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to load analysis' });
  }
});

// ── DELETE /api/dsa/analyses/:id ──────────────────────────────────────────────

router.delete('/analyses/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const userId = req.user._id;
    const result = await DsaAnalysis.deleteOne({ _id: id, userId });
    if (!result.deletedCount) return res.status(404).json({ error: 'Analysis not found' });
    console.log(`[dsa] DELETE /analyses/${id} — deleted, userId: ${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[dsa] DELETE /analyses/${req.params.id} failed:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to delete analysis' });
  }
});

// ── DELETE /api/dsa/analyses ──────────────────────────────────────────────────
// Clears all of the user's DSA history.

router.delete('/analyses', async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await DsaAnalysis.deleteMany({ userId });
    console.log(`[dsa] DELETE /analyses — cleared ${result.deletedCount || 0}, userId: ${userId}`);
    res.json({ ok: true, deleted: result.deletedCount || 0 });
  } catch (err) {
    console.error('[dsa] DELETE /analyses failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to clear history' });
  }
});

module.exports = router;
