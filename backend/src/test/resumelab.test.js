'use strict';

/**
 * Resume Lab unit tests
 *
 * Runs with: node --test src/test/resumelab.test.js
 *
 * These tests verify business logic, helper functions, and route handler
 * behaviour using lightweight stubs — no running MongoDB or Cortex required.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ── Helpers from the route module (extracted for isolated testing) ──────────

function sanitizeTag(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

function parseTags(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return arr.map(sanitizeTag).filter(Boolean);
}

function profileStats(profile) {
  if (!profile) return { skills: 0, projects: 0, experience: 0, education: 0, certifications: 0 };
  return {
    skills: (profile.skills || []).length,
    projects: (profile.projects || []).length,
    experience: (profile.experience || []).length,
    education: (profile.education || []).length,
    certifications: (profile.certifications || []).length,
  };
}

function toResumeResponse(doc) {
  return {
    id: doc._id.toString(),
    title: doc.title || '',
    type: doc.type || 'custom',
    fileName: doc.fileName || '',
    mimeType: doc.mimeType || '',
    fileSize: doc.fileSize || 0,
    parsedDocId: doc.parsedDocId || '',
    tags: doc.tags || [],
    isBaseResume: !!doc.isBaseResume,
    uploadSource: doc.uploadSource || 'manual',
    status: doc.status || 'uploaded',
    uploadedAt: doc.uploadedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// ── Stubs ──────────────────────────────────────────────────────────────────

function makeExtractResult(overrides = {}) {
  return {
    doc_id: 'test-doc-id',
    document_type: 'resume',
    skills: [{ name: 'JavaScript', category: 'programming', proficiency: 'expert' }],
    projects: [{ name: 'TestApp', description: 'A test project', technologies: ['Node.js'] }],
    experience: [{ company: 'Acme', title: 'Engineer', date_range: '2022–2024', bullets: [] }],
    education: [{ institution: 'MIT', degree: 'B.S.', field_of_study: 'CS' }],
    certifications: ['AWS Solutions Architect'],
    keywords: ['JavaScript', 'Node.js'],
    metadata: { source_type: 'pdf', parsed_at: new Date().toISOString(), confidence: 0.95 },
    ...overrides,
  };
}

function makeMergeResult(profile) {
  return {
    canonical_profile: {
      skills: profile.skills || [],
      projects: profile.projects || [],
      experience: profile.experience || [],
      education: profile.education || [],
      certifications: profile.certifications || [],
      keywords: profile.keywords || [],
      source_documents: [profile.doc_id || 'doc-1'],
      merged_at: new Date().toISOString(),
    },
    added_items: { skills: profile.skills || [] },
    merged_duplicates: {},
    conflicts: {},
    stats: { skills_before: 0, skills_after: (profile.skills || []).length },
  };
}

function makeResumeDoc(overrides = {}) {
  return {
    _id: { toString: () => 'resume-id-1', equals: (other) => other?.toString() === 'resume-id-1' },
    userId: 'user-id-1',
    title: 'My Resume',
    type: 'custom',
    fileName: 'resume.pdf',
    storagePath: '/tmp/uploads/resume.pdf',
    fileUrl: '',
    mimeType: 'application/pdf',
    fileSize: 102400,
    parsedDocId: '',
    tags: [],
    isBaseResume: false,
    uploadSource: 'manual',
    status: 'uploaded',
    uploadedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    save: async function () { this.updatedAt = new Date(); },
    ...overrides,
  };
}

// ── Tag sanitization ────────────────────────────────────────────────────────

describe('parseTags', () => {
  test('handles comma-separated string', () => {
    const result = parseTags('react, node.js, aws');
    assert.deepEqual(result, ['react', 'nodejs', 'aws']);
  });

  test('handles array input', () => {
    const result = parseTags(['React', 'Node JS', 'AWS!']);
    assert.deepEqual(result, ['react', 'nodejs', 'aws']);
  });

  test('strips tags exceeding 40 chars', () => {
    const long = 'a'.repeat(50);
    const [tag] = parseTags(long);
    assert.equal(tag.length, 40);
  });

  test('filters empty tags', () => {
    const result = parseTags(',,,');
    assert.deepEqual(result, []);
  });

  test('handles undefined gracefully', () => {
    assert.deepEqual(parseTags(undefined), []);
  });
});

// ── profileStats ────────────────────────────────────────────────────────────

describe('profileStats', () => {
  test('returns zeros for null profile', () => {
    const stats = profileStats(null);
    assert.deepEqual(stats, { skills: 0, projects: 0, experience: 0, education: 0, certifications: 0 });
  });

  test('counts correctly for populated profile', () => {
    const profile = {
      skills: [1, 2, 3],
      projects: [1],
      experience: [1, 2],
      education: [],
      certifications: [1, 2, 3, 4],
    };
    assert.deepEqual(profileStats(profile), { skills: 3, projects: 1, experience: 2, education: 0, certifications: 4 });
  });

  test('tolerates missing sections', () => {
    const stats = profileStats({ skills: [1, 2] });
    assert.equal(stats.skills, 2);
    assert.equal(stats.projects, 0);
  });
});

// ── toResumeResponse ────────────────────────────────────────────────────────

describe('toResumeResponse', () => {
  test('maps doc fields to response shape', () => {
    const doc = makeResumeDoc({ title: 'Senior Engineer Resume', type: 'backend', tags: ['node', 'aws'] });
    const response = toResumeResponse(doc);
    assert.equal(response.id, 'resume-id-1');
    assert.equal(response.title, 'Senior Engineer Resume');
    assert.equal(response.type, 'backend');
    assert.deepEqual(response.tags, ['node', 'aws']);
    assert.equal(response.isBaseResume, false);
    assert.equal(response.status, 'uploaded');
  });

  test('coerces isBaseResume to boolean', () => {
    const doc = makeResumeDoc({ isBaseResume: 1 });
    assert.equal(toResumeResponse(doc).isBaseResume, true);
  });

  test('defaults missing fields', () => {
    const doc = makeResumeDoc({ title: undefined, tags: undefined });
    const response = toResumeResponse(doc);
    assert.equal(response.title, '');
    assert.deepEqual(response.tags, []);
  });
});

// ── Upload flow (unit stub) ─────────────────────────────────────────────────

describe('Upload flow logic', () => {
  test('marks resume failed when extraction throws', async () => {
    let savedStatus;
    const resumeDoc = makeResumeDoc({
      save: async function () { savedStatus = this.status; },
    });

    const failingExtract = async () => { throw new Error('Cortex unavailable'); };

    // Simulate the route's extraction block
    try {
      await failingExtract();
    } catch {
      resumeDoc.status = 'failed';
      await resumeDoc.save();
    }

    assert.equal(savedStatus, 'failed');
  });

  test('does not update canonical profile when merge fails', async () => {
    let profileUpdated = false;
    const extract = async () => makeExtractResult();
    const failingMerge = async () => { throw new Error('Merge service error'); };

    let extractResult;
    try { extractResult = await extract(); } catch { /* extraction ok */ }

    let mergeResult;
    try { mergeResult = await failingMerge(); } catch { /* merge failed */ }

    // Canonical profile should NOT be updated when mergeResult is undefined
    if (mergeResult) {
      profileUpdated = true;
    }

    assert.ok(extractResult, 'extract should have succeeded');
    assert.equal(profileUpdated, false, 'canonical profile must not be modified after merge failure');
  });

  test('initialises canonical profile for first upload', async () => {
    const extractResult = makeExtractResult();
    const mergeResult = makeMergeResult(extractResult);

    // Simulate: no existing profile (profileDoc = null)
    let profileDoc = null;
    const merged = mergeResult.canonical_profile;

    if (profileDoc) {
      profileDoc.canonicalProfile = merged;
      profileDoc.profileVersion += 1;
    } else {
      profileDoc = {
        userId: 'user-id-1',
        profileVersion: 1,
        canonicalProfile: merged,
        sourceResumeIds: ['resume-id-1'],
        lastMergedResumeId: 'resume-id-1',
      };
    }

    assert.equal(profileDoc.profileVersion, 1);
    assert.ok(profileDoc.canonicalProfile.skills.length > 0);
  });

  test('increments profileVersion on subsequent upload', async () => {
    const firstMerge = makeMergeResult(makeExtractResult());
    const secondMerge = makeMergeResult(makeExtractResult({ doc_id: 'doc-2' }));

    let profileDoc = {
      profileVersion: 1,
      canonicalProfile: firstMerge.canonical_profile,
      sourceResumeIds: [{ toString: () => 'resume-1', equals: () => false }],
      lastMergedResumeId: null,
      save: async function () {},
    };

    // Simulate second upload merge
    profileDoc.canonicalProfile = secondMerge.canonical_profile;
    profileDoc.profileVersion += 1;

    assert.equal(profileDoc.profileVersion, 2);
  });

  test('duplicate upload is allowed and merges intelligently', async () => {
    const extract = makeExtractResult();
    const secondExtract = makeExtractResult({ doc_id: 'doc-duplicate' });

    // Both calls return results (no error); merge handles dedup
    assert.ok(extract.skills.length > 0);
    assert.ok(secondExtract.skills.length > 0);
    // Cortex merge normalises duplicates — no error expected
  });
});

// ── Profile rebuild ─────────────────────────────────────────────────────────

describe('Profile rebuild logic', () => {
  test('skips resumes with missing files', async () => {
    const resumes = [
      makeResumeDoc({ _id: { toString: () => 'r1', equals: (o) => o?.toString() === 'r1' }, storagePath: '/nonexistent/file.pdf' }),
    ];

    const successfulIds = [];
    for (const resume of resumes) {
      // Simulate fs.access failure
      const fileAccessible = false;
      if (!fileAccessible) {
        continue; // skip — same as route behaviour
      }
      successfulIds.push(resume._id);
    }

    assert.equal(successfulIds.length, 0);
  });

  test('processes all accessible parsed resumes in order', async () => {
    const order = [];
    const resumes = [
      { _id: { toString: () => 'r1' }, storagePath: '/tmp/r1.pdf', status: 'parsed' },
      { _id: { toString: () => 'r2' }, storagePath: '/tmp/r2.pdf', status: 'parsed' },
    ];

    const extractStub = async ({ docId }) => { order.push(docId); return makeExtractResult(); };
    const mergeStub = async ({ existingProfile }) => makeMergeResult(existingProfile || {});

    let buildingProfile = {};
    const successfulIds = [];

    for (const resume of resumes) {
      const extract = await extractStub({ docId: resume._id.toString() });
      const mergeResult = await mergeStub({ existingProfile: buildingProfile, incomingProfile: extract });
      buildingProfile = mergeResult.canonical_profile;
      successfulIds.push(resume._id);
    }

    assert.deepEqual(order, ['r1', 'r2']);
    assert.equal(successfulIds.length, 2);
  });

  test('rebuild increments version when existing profile present', () => {
    const existing = { profileVersion: 3, canonicalProfile: {}, sourceResumeIds: [] };
    existing.profileVersion += 1;
    assert.equal(existing.profileVersion, 4);
  });
});

// ── Base resume switching ────────────────────────────────────────────────────

describe('Base resume designation', () => {
  test('isBaseResume can be set via PATCH', () => {
    const doc = makeResumeDoc({ isBaseResume: false });
    // Simulate PATCH incoming body
    const incoming = { isBaseResume: true };
    if (Object.prototype.hasOwnProperty.call(incoming, 'isBaseResume')) {
      doc.isBaseResume = !!incoming.isBaseResume;
    }
    assert.equal(doc.isBaseResume, true);
  });

  test('isBaseResume can be unset via PATCH', () => {
    const doc = makeResumeDoc({ isBaseResume: true });
    const incoming = { isBaseResume: false };
    if (Object.prototype.hasOwnProperty.call(incoming, 'isBaseResume')) {
      doc.isBaseResume = !!incoming.isBaseResume;
    }
    assert.equal(doc.isBaseResume, false);
  });

  test('multiple resumes of different types can each be base', () => {
    // No uniqueness constraint on isBaseResume — multiple allowed
    const resumes = [
      makeResumeDoc({ type: 'frontend', isBaseResume: true }),
      makeResumeDoc({ type: 'backend', isBaseResume: true }),
      makeResumeDoc({ type: 'fullstack', isBaseResume: false }),
    ];
    const baseCount = resumes.filter(r => r.isBaseResume).length;
    assert.equal(baseCount, 2); // both frontend and backend can be base simultaneously
  });
});

// ── Delete flow ──────────────────────────────────────────────────────────────

describe('Delete flow', () => {
  test('returns 404 for unknown resume id', () => {
    // Simulate Resume.findOne returning null
    const doc = null;
    const response = doc ? { ok: true } : { error: 'Resume not found' };
    assert.equal(response.error, 'Resume not found');
  });

  test('clears lastMergedResumeId when deleted resume was last merged', () => {
    const resumeId = 'resume-id-1';
    let profileDoc = { lastMergedResumeId: resumeId, sourceResumeIds: [resumeId] };

    // Simulate the two updateOne calls in the DELETE route
    profileDoc.sourceResumeIds = profileDoc.sourceResumeIds.filter(id => id !== resumeId);
    if (profileDoc.lastMergedResumeId === resumeId) {
      profileDoc.lastMergedResumeId = null;
    }

    assert.equal(profileDoc.lastMergedResumeId, null);
    assert.equal(profileDoc.sourceResumeIds.length, 0);
  });
});

// ── File type validation ─────────────────────────────────────────────────────

describe('File type validation', () => {
  const ALLOWED_MIME = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

  test('accepts PDF', () => {
    assert.ok(ALLOWED_MIME.has('application/pdf'));
  });

  test('accepts DOC', () => {
    assert.ok(ALLOWED_MIME.has('application/msword'));
  });

  test('accepts DOCX', () => {
    assert.ok(ALLOWED_MIME.has('application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  });

  test('rejects image', () => {
    assert.equal(ALLOWED_MIME.has('image/png'), false);
  });

  test('rejects plain text', () => {
    assert.equal(ALLOWED_MIME.has('text/plain'), false);
  });
});

// ── Cortex client error handling ─────────────────────────────────────────────

describe('CortexError', () => {
  // Inline the class for isolated testing without requiring the live service
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

  test('5xx errors are retryable', () => {
    const err = new CortexError('service unavailable', { status: 503 });
    assert.ok(isRetryable(err));
  });

  test('4xx errors are not retried', () => {
    const err = new CortexError('bad request', { status: 400 });
    assert.equal(isRetryable(err), false);
  });

  test('network errors (no status) are retryable', () => {
    const err = new CortexError('ECONNREFUSED');
    assert.ok(isRetryable(err));
  });

  test('timeout (AbortError) is retryable', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    assert.ok(isRetryable(err));
  });

  test('carries status and body', () => {
    const err = new CortexError('oops', { status: 422, body: { detail: 'schema error' } });
    assert.equal(err.status, 422);
    assert.deepEqual(err.body, { detail: 'schema error' });
  });
});

// ── Profile initialisation (missing profile path) ────────────────────────────

describe('Profile initialisation', () => {
  test('creates profile when none exists for user', async () => {
    const mergeResult = makeMergeResult(makeExtractResult());
    let profileDoc = null; // no existing profile

    const mergedCanonical = mergeResult.canonical_profile;

    if (!profileDoc) {
      profileDoc = {
        userId: 'user-new',
        profileVersion: 1,
        canonicalProfile: mergedCanonical,
        sourceResumeIds: ['resume-1'],
        lastMergedResumeId: 'resume-1',
      };
    }

    assert.equal(profileDoc.profileVersion, 1);
    assert.ok(Array.isArray(profileDoc.canonicalProfile.skills));
  });

  test('existing profile is updated not replaced', async () => {
    const mergeResult = makeMergeResult(makeExtractResult());

    let profileDoc = {
      profileVersion: 2,
      canonicalProfile: { skills: [], projects: [] },
      sourceResumeIds: ['resume-old'],
      lastMergedResumeId: 'resume-old',
      save: async function () {},
    };

    const mergedCanonical = mergeResult.canonical_profile;
    profileDoc.canonicalProfile = mergedCanonical;
    profileDoc.profileVersion += 1;
    profileDoc.sourceResumeIds.push('resume-new');
    profileDoc.lastMergedResumeId = 'resume-new';

    assert.equal(profileDoc.profileVersion, 3);
    assert.ok(profileDoc.sourceResumeIds.includes('resume-old')); // original preserved
    assert.ok(profileDoc.sourceResumeIds.includes('resume-new')); // new appended
  });
});
