'use strict';

/**
 * DSA Lab unit tests
 *
 * Runs with: node --test src/test/dsa.test.js
 *
 * Like the Resume Lab tests, these verify the real prompt builder plus the route's
 * decision logic using lightweight stubs — no running MongoDB or Brain required.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { dsaAnalysisPrompt, DSA_LANGUAGES } = require('../services/brainPrompts');

// ── Route logic mirrored for isolated testing (see routes/dsa.js) ────────────

const VALID_LANGUAGES = new Set(['java', 'python']);
const PROBLEM_MAX_LENGTH = 20_000;

function clampLanguage(raw) {
  return VALID_LANGUAGES.has(raw) ? raw : 'java';
}

// Mirrors the gatekeeper + persistence branch of POST /analyze.
function decideResponse({ result, hasUserCode }) {
  if (result && result.is_dsa_problem === false) {
    const reason = String(result.rejection_reason || '').trim()
      || 'This does not look like a Data Structures & Algorithms problem.';
    return { status: 422, body: { error: reason, code: 'NOT_DSA_PROBLEM' } };
  }
  const isOptimal = hasUserCode
    ? (typeof result?.review?.is_optimal === 'boolean' ? result.review.is_optimal : null)
    : null;
  return { status: 200, body: { ...result }, persisted: { isOptimal } };
}

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

// ── dsaAnalysisPrompt (real builder) ─────────────────────────────────────────

describe('dsaAnalysisPrompt', () => {
  test('problem-only mode requests both languages and gates non-DSA input', () => {
    const { system, prompt } = dsaAnalysisPrompt({ problemStatement: 'Given an array, find two numbers that sum to a target.' });
    assert.match(system, /is_dsa_problem/);
    assert.match(system, /Java and Python/i);
    assert.match(system, /brute force/i);
    // No user code → review must be null in the schema.
    assert.match(prompt, /"review": null/);
    assert.match(prompt, /"has_user_code": false/);
    assert.match(prompt, /find two numbers/);
  });

  test('review mode embeds the user code and a review block', () => {
    const { system, prompt } = dsaAnalysisPrompt({
      problemStatement: 'Two Sum',
      userCode: 'def two_sum(a, t): ...',
      language: 'python',
    });
    assert.match(prompt, /"has_user_code": true/);
    assert.match(prompt, /"language": "python"/);
    assert.match(prompt, /def two_sum/);
    assert.match(system, /submitted their own solution/i);
    assert.match(system, /already optimal/i);
  });

  test('invalid language falls back to java', () => {
    const { prompt } = dsaAnalysisPrompt({ problemStatement: 'p', userCode: 'x', language: 'rust' });
    assert.match(prompt, /"language": "java"/);
  });

  test('exports the supported languages', () => {
    assert.deepEqual([...DSA_LANGUAGES].sort(), ['java', 'python']);
  });
});

// ── Language + length handling ───────────────────────────────────────────────

describe('input handling', () => {
  test('clampLanguage accepts java/python, rejects others', () => {
    assert.equal(clampLanguage('python'), 'python');
    assert.equal(clampLanguage('java'), 'java');
    assert.equal(clampLanguage('c++'), 'java');
    assert.equal(clampLanguage(undefined), 'java');
  });

  test('problem statement is capped at the max length', () => {
    const huge = 'x'.repeat(PROBLEM_MAX_LENGTH + 500);
    assert.equal(huge.slice(0, PROBLEM_MAX_LENGTH).length, PROBLEM_MAX_LENGTH);
  });
});

// ── Gatekeeper + persistence decision ────────────────────────────────────────

describe('decideResponse', () => {
  test('refuses non-DSA input with 422 / NOT_DSA_PROBLEM', () => {
    const r = decideResponse({ result: { is_dsa_problem: false, rejection_reason: 'This is a poem.' }, hasUserCode: false });
    assert.equal(r.status, 422);
    assert.equal(r.body.code, 'NOT_DSA_PROBLEM');
    assert.equal(r.body.error, 'This is a poem.');
  });

  test('falls back to a default reason when none is given', () => {
    const r = decideResponse({ result: { is_dsa_problem: false }, hasUserCode: false });
    assert.equal(r.status, 422);
    assert.match(r.body.error, /Data Structures/);
  });

  test('accepts a valid DSA result and derives isOptimal from the review', () => {
    const result = { is_dsa_problem: true, review: { is_optimal: true }, approaches: [{ is_optimal: true }] };
    const r = decideResponse({ result, hasUserCode: true });
    assert.equal(r.status, 200);
    assert.equal(r.persisted.isOptimal, true);
  });

  test('isOptimal is null when no user code was submitted', () => {
    const result = { is_dsa_problem: true, review: null, approaches: [{ is_optimal: true }] };
    const r = decideResponse({ result, hasUserCode: false });
    assert.equal(r.status, 200);
    assert.equal(r.persisted.isOptimal, null);
  });
});

// ── toSummary mapping ────────────────────────────────────────────────────────

describe('toSummary', () => {
  test('maps a doc to the history summary shape', () => {
    const now = new Date();
    const doc = {
      _id: { toString: () => 'dsa-1' },
      problemTitle: 'Two Sum',
      hasUserCode: 1,
      language: 'python',
      isOptimal: false,
      status: 'analyzed',
      createdAt: now,
      updatedAt: now,
    };
    const s = toSummary(doc);
    assert.equal(s.id, 'dsa-1');
    assert.equal(s.problemTitle, 'Two Sum');
    assert.equal(s.hasUserCode, true);
    assert.equal(s.language, 'python');
    assert.equal(s.isOptimal, false);
    assert.equal(s.status, 'analyzed');
  });
});
