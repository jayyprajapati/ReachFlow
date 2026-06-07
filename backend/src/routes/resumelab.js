'use strict';

const crypto = require('crypto');
const express = require('express');
const { Types } = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Resume, CanonicalProfile, ResumeAnalysis, GeneratedResume } = require('../db');
const {
  resourceDiskStorage,
  registerStoredResource,
  detachResumeResource,
  safeDeleteFile,
} = require('../services/resourceStorage');
const { extractResume, mergeCanonicalProfile, analyzeResumeMatch, generateCoverLetter, generateHrEmail, generateResumeLatex, deleteResumeVectors, deleteAllUserVectors, BrainError, brainDetail } = require('../services/brainClient');
const { resolveUserLlm, isByokError } = require('../services/llmSettings');
const { injectTemplate, compileToPdf, validateLatex } = require('../services/latexCompiler');

const router = express.Router();

// ── Config ─────────────────────────────────────────────────────────────────

const MAX_RESUME_UPLOAD_MB = parseInt(process.env.MAX_RESUME_UPLOAD_MB || '10', 10);

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const RESUME_TYPES = new Set(['frontend', 'backend', 'fullstack', 'custom']);

// ── Multer ──────────────────────────────────────────────────────────────────

const upload = multer({
  storage: resourceDiskStorage,
  limits: { fileSize: MAX_RESUME_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    const err = new Error('Only PDF, DOC, and DOCX files are accepted');
    err.code = 'INVALID_FILE_TYPE';
    cb(err);
  },
});

// Wraps multer so errors surface as JSON responses instead of unhandled crashes.
function uploadMiddleware(req, res, next) {
  upload.single('resume')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Maximum allowed size is ${MAX_RESUME_UPLOAD_MB}MB.` });
    }
    if (err.code === 'INVALID_FILE_TYPE') {
      return res.status(415).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message || 'File upload failed' });
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeTag(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
}

function parseTags(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return arr.map(sanitizeTag).filter(Boolean);
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
    isStartingResume: !!doc.isBaseResume,
    uploadSource: doc.uploadSource || 'manual',
    status: doc.status || 'uploaded',
    uploadedAt: doc.uploadedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    latexSource: doc.latexSource || '',
    hasLatex: !!(doc.latexSource || '').trim(),
  };
}

function profileStats(profile) {
  if (!profile) {
    return { skills: 0, projects: 0, experience: 0, education: 0, certifications: 0 };
  }
  return {
    skills: (profile.skills || []).length,
    projects: (profile.projects || []).length,
    experience: (profile.experience || []).length,
    education: (profile.education || []).length,
    certifications: (profile.certifications || []).length,
  };
}

// BYOK resolution (resolveUserLlm + isByokError) lives in ../services/llmSettings
// so every AI feature enforces a validated provider identically.

// ── JD analysis in-memory cache ─────────────────────────────────────────────
// Keyed by userId:profileVersion:sha256(jd)[:16] — avoids re-running the LLM
// for the same JD + profile combination within the TTL window.

const _jdAnalysisCache = new Map();
const _JD_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const _JD_CACHE_MAX = 200;

function _jdCacheKey(userId, profileVersion, jd) {
  const h = crypto.createHash('sha256').update(jd).digest('hex').slice(0, 16);
  return `${userId}:${profileVersion}:${h}`;
}

function _jdCacheGet(key) {
  const entry = _jdAnalysisCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > _JD_CACHE_TTL_MS) { _jdAnalysisCache.delete(key); return null; }
  return entry.data;
}

function _jdCacheSet(key, data) {
  if (_jdAnalysisCache.size >= _JD_CACHE_MAX) {
    _jdAnalysisCache.delete(_jdAnalysisCache.keys().next().value);
  }
  _jdAnalysisCache.set(key, { data, ts: Date.now() });
}

// ── POST /api/resumelab/upload ───────────────────────────────────────────────

router.post('/upload', uploadMiddleware, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Resume file is required (field name: resume)' });
  }

  const userId = req.user._id;
  const { title, type, tags: tagsRaw, uploadSource } = req.body || {};
  const file = req.file;

  const resumeType = RESUME_TYPES.has(type) ? type : 'custom';
  const tags = parseTags(tagsRaw);
  const defaultTitle = path.basename(file.originalname, path.extname(file.originalname));

  // Enforce BYOK — user must have a validated AI provider before any LLM call.
  let llm;
  try {
    llm = await resolveUserLlm(userId);
  } catch (err) {
    if (isByokError(err)) {
      await safeDeleteFile(file.path);
      return res.status(402).json({ error: err.message, code: err.code });
    }
    await safeDeleteFile(file.path);
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }

  console.log(`[resumelab] POST /upload — userId: ${userId}, file: ${file.filename}, size: ${file.size}B, type: ${resumeType}`);

  // Persist the resume record immediately so callers can reference it even on partial failure.
  let resumeDoc;
  try {
    resumeDoc = await Resume.create({
      userId,
      title: String(title || defaultTitle).trim().slice(0, 200),
      type: resumeType,
      fileName: file.originalname,
      storagePath: file.path,
      fileUrl: '',
      mimeType: file.mimetype,
      fileSize: file.size,
      tags,
      isBaseResume: false,
      uploadSource: String(uploadSource || 'manual').slice(0, 40),
      status: 'uploaded',
      uploadedAt: new Date(),
    });
  } catch (dbErr) {
    console.error(`[resumelab] Failed to create resume record — userId: ${userId}:`, dbErr.message);
    await safeDeleteFile(file.path);
    return res.status(500).json({ error: 'Failed to save resume metadata' });
  }

  try {
    const registered = await registerStoredResource({
      userId,
      file,
      source: 'resume_vault',
      resumeId: resumeDoc._id,
    });
    resumeDoc.storagePath = registered.resource.storagePath;
    resumeDoc.fileSize = registered.resource.fileSize;
    resumeDoc.mimeType = registered.resource.mimeType;
    await resumeDoc.save();
  } catch (resourceErr) {
    await Resume.deleteOne({ _id: resumeDoc._id, userId });
    return res.status(resourceErr.status || 500).json({
      error: resourceErr.message || 'Failed to store resume resource',
      code: resourceErr.code,
    });
  }

  // ── Steps 1 + 2 in parallel: extract + fetch existing profile ──────────
  // Both are independent — extract is the slow path (Cortex LLM), profile
  // fetch is a fast MongoDB read. Running them concurrently saves ~200-400 ms.
  const _t0 = Date.now();
  let extractResult, profileDoc;
  try {
    [extractResult, profileDoc] = await Promise.all([
      extractResume({
        filePath: resumeDoc.storagePath,
        userId: userId.toString(),
        docId: resumeDoc._id.toString(),
        llm,
      }),
      CanonicalProfile.findOne({ userId }),
    ]);
    resumeDoc.parsedDocId = extractResult.doc_id || resumeDoc._id.toString();
    resumeDoc.extractedContent = extractResult;
    resumeDoc.normalizedResumeText = extractResult.normalized_resume_text || '';
    resumeDoc.sectionedResumeSource = extractResult.sectioned_resume_source || null;
    console.log(`[resumelab] [latency] upload.extract=${Date.now() - _t0}ms userId:${userId} confidence:${extractResult.metadata?.confidence} cache_hit:${extractResult.metadata?.cache_hit || false}`);
  } catch (extractErr) {
    const detail = brainDetail(extractErr);
    console.error(`[resumelab] Extraction failed — userId: ${userId}, resumeId: ${resumeDoc._id}: ${detail}`);
    resumeDoc.status = 'failed';
    await resumeDoc.save();
    if (extractErr instanceof BrainError && [400, 413, 415, 422, 429].includes(extractErr.status)) {
      return res.status(extractErr.status).json({ error: detail });
    }
    return res.status(502).json({
      error: 'Resume parsing failed.',
      detail,
    });
  }

  const existingProfile = profileDoc?.canonicalProfile || {};

  // ── Step 3: Merge into canonical profile via Cortex ────────────────────
  let mergeResult;
  const _t1 = Date.now();
  try {
    mergeResult = await mergeCanonicalProfile({
      userId: userId.toString(),
      existingProfile,
      incomingProfile: extractResult,
    });
    console.log(`[resumelab] [latency] upload.merge=${Date.now() - _t1}ms userId:${userId}`);
  } catch (mergeErr) {
    const detail = brainDetail(mergeErr);
    console.error(`[resumelab] Merge failed — userId: ${userId}, resumeId: ${resumeDoc._id}: ${detail}`);
    // Extraction succeeded — mark parsed so the user can trigger /profile/rebuild later.
    resumeDoc.status = 'parsed';
    await resumeDoc.save();
    if (mergeErr instanceof BrainError && [400, 413, 415, 422, 429].includes(mergeErr.status)) {
      return res.status(mergeErr.status).json({ error: detail });
    }
    return res.status(502).json({
      error: 'Profile merge failed. Resume was parsed but the canonical profile was not updated. Use /profile/rebuild to retry.',
      detail,
      resume: toResumeResponse(resumeDoc),
      extract_summary: {
        doc_id: resumeDoc.parsedDocId,
        skills: (extractResult.skills || []).length,
        experience: (extractResult.experience || []).length,
      },
    });
  }

  // ── Step 4: Persist updated canonical profile ───────────────────────────
  const mergedCanonical = mergeResult.canonical_profile;

  if (profileDoc) {
    profileDoc.canonicalProfile = mergedCanonical;
    profileDoc.profileVersion += 1;
    if (!profileDoc.sourceResumeIds.some(id => id.equals(resumeDoc._id))) {
      profileDoc.sourceResumeIds.push(resumeDoc._id);
    }
    profileDoc.lastMergedResumeId = resumeDoc._id;
    await profileDoc.save();
  } else {
    profileDoc = await CanonicalProfile.create({
      userId,
      profileVersion: 1,
      canonicalProfile: mergedCanonical,
      sourceResumeIds: [resumeDoc._id],
      lastMergedResumeId: resumeDoc._id,
    });
  }

  resumeDoc.status = 'parsed';
  await resumeDoc.save();

  console.log(`[resumelab] Upload complete — userId: ${userId}, resumeId: ${resumeDoc._id}, profileVersion: ${profileDoc.profileVersion}`);

  return res.json({
    resume: toResumeResponse(resumeDoc),
    extract_summary: {
      doc_id: resumeDoc.parsedDocId,
      skills: (mergedCanonical.skills || []).length,
      experience: (mergedCanonical.experience || []).length,
      projects: (mergedCanonical.projects || []).length,
      added: mergeResult.added_items || {},
      merged_duplicates: mergeResult.merged_duplicates || {},
    },
    canonical_profile_summary: profileStats(mergedCanonical),
    profileVersion: profileDoc.profileVersion,
  });
});

// ── GET /api/resumelab/resumes ───────────────────────────────────────────────

router.get('/resumes', async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`[resumelab] GET /resumes — userId: ${userId}`);

    const resumes = await Resume.find({ userId }).sort({ uploadedAt: -1 });
    const list = resumes.map(toResumeResponse);

    const byType = {};
    for (const r of list) {
      (byType[r.type] = byType[r.type] || []).push(r);
    }

    console.log(`[resumelab] GET /resumes — userId: ${userId}, count: ${list.length}`);
    res.json({ resumes: list, byType });
  } catch (err) {
    console.error('[resumelab] GET /resumes failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load resumes' });
  }
});

// ── PATCH /api/resumelab/resumes/:id ────────────────────────────────────────

router.patch('/resumes/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const userId = req.user._id;
    console.log(`[resumelab] PATCH /resumes/${id} — userId: ${userId}`);

    const doc = await Resume.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Resume not found' });

    const incoming = req.body || {};

    if (Object.prototype.hasOwnProperty.call(incoming, 'title')) {
      doc.title = String(incoming.title || '').trim().slice(0, 200);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'type')) {
      if (RESUME_TYPES.has(incoming.type)) doc.type = incoming.type;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'tags')) {
      doc.tags = parseTags(incoming.tags);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'isBaseResume')) {
      doc.isBaseResume = !!incoming.isBaseResume;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'latexSource')) {
      doc.latexSource = String(incoming.latexSource || '').slice(0, 500_000);
    }

    await doc.save();
    console.log(`[resumelab] PATCH /resumes/${id} — updated, userId: ${userId}`);
    res.json(toResumeResponse(doc));
  } catch (err) {
    console.error(`[resumelab] PATCH /resumes/${id} failed:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to update resume' });
  }
});

// ── DELETE /api/resumelab/resumes/:id ───────────────────────────────────────

router.delete('/resumes/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const userId = req.user._id;
    console.log(`[resumelab] DELETE /resumes/${id} — userId: ${userId}`);

    const doc = await Resume.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Resume not found' });

    const { storagePath } = doc;
    const vectorDocId = doc.parsedDocId || doc._id.toString();
    await Resume.deleteOne({ _id: id, userId });

    // Best-effort: drop this resume's deduped vectors from Qdrant, scoped to
    // (namespace=userId, doc_id) so it never touches another user/resume. A
    // Brain outage must not fail the user's delete — the Mongo record is gone.
    try {
      await deleteResumeVectors({ userId: userId.toString(), docId: vectorDocId });
    } catch (vecErr) {
      console.warn(`[resumelab] DELETE /resumes/${id} — vector cleanup failed (orphaned in Qdrant): ${brainDetail(vecErr)}`);
    }

    // Remove from canonical profile source list
    await CanonicalProfile.updateOne(
      { userId },
      { $pull: { sourceResumeIds: doc._id } }
    );
    // Clear lastMergedResumeId if it pointed to this resume
    await CanonicalProfile.updateOne(
      { userId, lastMergedResumeId: doc._id },
      { $set: { lastMergedResumeId: null } }
    );

    const managedByResources = await detachResumeResource({ userId, resumeId: doc._id, storagePath });
    if (storagePath && !managedByResources) await safeDeleteFile(storagePath);

    console.log(`[resumelab] DELETE /resumes/${id} — deleted, userId: ${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[resumelab] DELETE /resumes/${id} failed:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to delete resume' });
  }
});

// ── GET /api/resumelab/profile ───────────────────────────────────────────────

router.get('/profile', async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`[resumelab] GET /profile — userId: ${userId}`);

    const profileDoc = await CanonicalProfile.findOne({ userId });
    if (!profileDoc) {
      return res.json({
        exists: false,
        profileVersion: 0,
        canonicalProfile: null,
        sourceResumeIds: [],
        lastMergedResumeId: null,
        stats: profileStats(null),
        updatedAt: null,
      });
    }

    const profile = profileDoc.canonicalProfile;
    console.log(`[resumelab] GET /profile — userId: ${userId}, version: ${profileDoc.profileVersion}`);
    res.json({
      exists: true,
      profileVersion: profileDoc.profileVersion,
      canonicalProfile: profile,
      sourceResumeIds: (profileDoc.sourceResumeIds || []).map(id => id.toString()),
      lastMergedResumeId: profileDoc.lastMergedResumeId?.toString() || null,
      stats: profileStats(profile),
      updatedAt: profileDoc.updatedAt,
    });
  } catch (err) {
    console.error('[resumelab] GET /profile failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load canonical profile' });
  }
});

// ── DELETE /api/resumelab/profile ────────────────────────────────────────────
// Nuclear option: wipes the user's entire Career Profile — every uploaded resume
// (records + files on disk), the merged canonical profile, and all of the user's
// vectors in Qdrant. History (analyses + generated) is intentionally left alone;
// it is cleared separately via DELETE /history.

router.delete('/profile', async (req, res) => {
  const userId = req.user._id;
  console.log(`[resumelab] DELETE /profile — userId: ${userId}`);

  try {
    const resumes = await Resume.find({ userId });

    // Remove the canonical profile and all resume records first — the user's
    // data is gone from Mongo even if file/vector cleanup below partially fails.
    await Promise.all([
      CanonicalProfile.deleteOne({ userId }),
      Resume.deleteMany({ userId }),
    ]);

    // Best-effort file cleanup on disk.
    for (const resume of resumes) {
      const managedByResources = await detachResumeResource({
        userId,
        resumeId: resume._id,
        storagePath: resume.storagePath,
      });
      if (resume.storagePath && !managedByResources) await safeDeleteFile(resume.storagePath);
    }

    // Best-effort: wipe every vector for this user (namespace-level). A Brain
    // outage must not fail the delete — the Mongo records are already gone.
    try {
      await deleteAllUserVectors({ userId: userId.toString() });
    } catch (vecErr) {
      console.warn(`[resumelab] DELETE /profile — vector cleanup failed (orphaned in Qdrant): ${brainDetail(vecErr)}`);
    }

    console.log(`[resumelab] DELETE /profile — wiped ${resumes.length} resume(s) + profile, userId: ${userId}`);
    res.json({ ok: true, deletedResumes: resumes.length });
  } catch (err) {
    console.error('[resumelab] DELETE /profile failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to delete profile' });
  }
});

// ── PATCH /api/resumelab/profile/item-note ──────────────────────────────────
// Set the showcase_prompt on a specific experience or project in the canonical profile.

router.patch('/profile/item-note', async (req, res) => {
  try {
    const userId = req.user._id;
    const { section, canonical_key, showcase_prompt } = req.body || {};
    if (!['experience', 'projects'].includes(section)) {
      return res.status(400).json({ error: 'section must be "experience" or "projects"' });
    }
    if (!canonical_key) return res.status(400).json({ error: 'canonical_key is required' });

    const doc = await CanonicalProfile.findOne({ userId });
    if (!doc?.canonicalProfile) return res.status(404).json({ error: 'No canonical profile found' });

    const profile = doc.canonicalProfile;
    const items = profile[section] || [];
    const idx = items.findIndex(it => it.canonical_key === canonical_key);
    if (idx === -1) return res.status(404).json({ error: `Item not found in ${section}` });

    const sanitized = String(showcase_prompt || '').trim().slice(0, 800);
    items[idx] = { ...items[idx], showcase_prompt: sanitized || null };
    profile[section] = items;
    doc.canonicalProfile = profile;
    doc.markModified('canonicalProfile');
    await doc.save();

    console.log(`[resumelab] PATCH /profile/item-note — userId: ${userId}, section: ${section}, key: ${canonical_key}`);
    res.json({ ok: true, canonical_key, showcase_prompt: sanitized || null });
  } catch (err) {
    console.error('[resumelab] PATCH /profile/item-note failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/resumelab/profile/rebuild ─────────────────────────────────────

router.post('/profile/rebuild', async (req, res) => {
  const userId = req.user._id;
  console.log(`[resumelab] POST /profile/rebuild — userId: ${userId}`);

  let llm;
  try {
    llm = await resolveUserLlm(userId);
  } catch (err) {
    if (isByokError(err)) return res.status(402).json({ error: err.message, code: err.code });
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }

  try {
    const resumes = await Resume.find({ userId, status: 'parsed' }).sort({ uploadedAt: 1 });
    if (!resumes.length) {
      return res.status(400).json({ error: 'No parsed resumes found. Upload at least one resume first.' });
    }

    console.log(`[resumelab] Rebuild — ${resumes.length} parsed resumes found for userId: ${userId}`);

    let buildingProfile = {};
    const successfulIds = [];

    for (const resume of resumes) {
      if (!resume.storagePath) {
        console.warn(`[resumelab] Rebuild — resumeId: ${resume._id} has no storagePath, skipping`);
        continue;
      }

      // Verify the file is still accessible on disk before calling Cortex
      try {
        await fs.promises.access(resume.storagePath, fs.constants.R_OK);
      } catch {
        console.warn(`[resumelab] Rebuild — file missing for resumeId: ${resume._id} (${resume.storagePath}), skipping`);
        continue;
      }

      let extractResult;
      try {
        extractResult = await extractResume({
          filePath: resume.storagePath,
          userId: userId.toString(),
          docId: resume._id.toString(),
          llm,
        });
      } catch (err) {
        console.warn(`[resumelab] Rebuild — extract failed for resumeId: ${resume._id}: ${err.message}, skipping`);
        continue;
      }

      try {
        const mergeResult = await mergeCanonicalProfile({
          userId: userId.toString(),
          existingProfile: buildingProfile,
          incomingProfile: extractResult,
        });
        buildingProfile = mergeResult.canonical_profile;
        successfulIds.push(resume._id);
      } catch (err) {
        console.warn(`[resumelab] Rebuild — merge failed for resumeId: ${resume._id}: ${err.message}, skipping`);
        continue;
      }
    }

    if (!successfulIds.length) {
      return res.status(502).json({ error: 'Rebuild failed — no resumes could be successfully processed' });
    }

    const existing = await CanonicalProfile.findOne({ userId });
    let profileDoc;
    if (existing) {
      existing.canonicalProfile = buildingProfile;
      existing.profileVersion += 1;
      existing.sourceResumeIds = successfulIds;
      existing.lastMergedResumeId = successfulIds[successfulIds.length - 1];
      await existing.save();
      profileDoc = existing;
    } else {
      profileDoc = await CanonicalProfile.create({
        userId,
        profileVersion: 1,
        canonicalProfile: buildingProfile,
        sourceResumeIds: successfulIds,
        lastMergedResumeId: successfulIds[successfulIds.length - 1],
      });
    }

    console.log(`[resumelab] Rebuild complete — userId: ${userId}, processed: ${successfulIds.length}/${resumes.length}, version: ${profileDoc.profileVersion}`);

    res.json({
      ok: true,
      profileVersion: profileDoc.profileVersion,
      processedResumes: successfulIds.length,
      totalResumes: resumes.length,
      stats: profileStats(buildingProfile),
    });
  } catch (err) {
    console.error(`[resumelab] Rebuild failed — userId: ${userId}:`, err.message);
    res.status(500).json({ error: err.message || 'Profile rebuild failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — JD ANALYZER + RESUME GENERATION
// ═══════════════════════════════════════════════════════════════════════════

const JD_MAX_LENGTH = 20_000;
const TEMPLATE_TYPES = new Set(['frontend', 'backend', 'fullstack', 'custom']);

// ── Helpers ─────────────────────────────────────────────────────────────────

function toAnalysisSummary(doc) {
  return {
    id: doc._id.toString(),
    flowId: doc.flowId || null,
    matchScore: doc.matchScore || 0,
    jobTitle: doc.extractedJobMetadata?.title || '',
    company: doc.extractedJobMetadata?.company || '',
    seniority: doc.extractedJobMetadata?.seniority || '',
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toAnalysisFull(doc) {
  const analysis = doc.matchAnalysis || {};
  return {
    id: doc._id.toString(),
    matchScore: doc.matchScore || 0,
    jobTitle: doc.extractedJobMetadata?.title || '',
    company: doc.extractedJobMetadata?.company || '',
    seniority: doc.extractedJobMetadata?.seniority || '',
    domain: doc.extractedJobMetadata?.domain || '',
    canonicalProfileVersion: doc.canonicalProfileVersion || 0,
    baseResumeId: doc.baseResumeId?.toString() || null,
    requiredKeywords: analysis.required_keywords || [],
    missingKeywords: analysis.missing_keywords || [],
    existingButMissingFromResume: analysis.existing_but_missing_from_resume || [],
    irrelevantContent: analysis.irrelevant_content || [],
    recommendedAdditions: analysis.recommended_additions || [],
    recommendedRemovals: analysis.recommended_removals || [],
    atsKeywordClusters: analysis.ats_keyword_clusters || {},
    mentionsYears: !!analysis.mentions_years,
    requiredYearsMin: Number(analysis.required_years_min) || 0,
    requiredYearsMax: Number(analysis.required_years_max) || 0,
    candidateYearsEstimate: Number(analysis.candidate_years_estimate) || 0,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toGeneratedSummary(doc) {
  return {
    id: doc._id.toString(),
    flowId: doc.flowId || null,
    analysisId: doc.analysisId?.toString() || null,
    baseResumeId: doc.baseResumeId?.toString() || null,
    outputFormat: doc.templateType,
    generationMode: doc.generationMode || 'canonical_only',
    startingResumeId: doc.startingResumeId?.toString() || null,
    aggressiveness: doc.aggressiveness || 'balanced',
    matchScoreBefore: doc.matchScoreBefore || 0,
    matchScoreAfter: doc.matchScoreAfter || 0,
    hasPdf: !!doc.pdfPath,
    pdfError: doc.pdfError || '',
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toGeneratedFull(doc) {
  return {
    ...toGeneratedSummary(doc),
    generatedContent: doc.generatedContent || null,
    latexSource: doc.latexSource || '',
    pdfUrl: doc.pdfPath ? `/api/resumelab/generated/${doc._id}/pdf` : null,
  };
}

// Resolve the best base resume's extractedContent for a user.
// Returns null if nothing usable is found.
async function resolveBaseResume(userId, baseResumeId, llm) {
  let resume = null;

  if (baseResumeId && Types.ObjectId.isValid(baseResumeId)) {
    resume = await Resume.findOne({ _id: baseResumeId, userId, status: 'parsed' });
  }

  if (!resume) {
    resume = await Resume.findOne({ userId, status: 'parsed', isBaseResume: true }).sort({ updatedAt: -1 });
  }

  if (!resume) return null;

  // Use cached extractedContent first; fall back to re-extraction if the file is accessible.
  if (resume.extractedContent) return { resume, extractedContent: resume.extractedContent };

  if (!resume.storagePath) return null;

  try {
    await fs.promises.access(resume.storagePath, fs.constants.R_OK);
    const extractedContent = await extractResume({
      filePath: resume.storagePath,
      userId: userId.toString(),
      docId: resume._id.toString(),
      llm,
    });
    // Persist for future calls.
    await Resume.updateOne({ _id: resume._id }, { $set: { extractedContent } });
    return { resume, extractedContent };
  } catch {
    return null;
  }
}

// ── POST /api/resumelab/analyze ──────────────────────────────────────────────

router.post('/analyze', async (req, res) => {
  const userId = req.user._id;
  const { jobDescription, baseResumeId, jobTitle, company } = req.body || {};

  if (!jobDescription || !String(jobDescription).trim()) {
    return res.status(400).json({ error: 'jobDescription is required' });
  }

  const jd = String(jobDescription).trim().slice(0, JD_MAX_LENGTH);
  console.log(`[resumelab] POST /analyze — userId: ${userId}, jdLen: ${jd.length}`);

  // Enforce BYOK — must have a validated AI provider before any LLM call.
  let llm;
  try {
    llm = await resolveUserLlm(userId);
  } catch (err) {
    if (isByokError(err)) return res.status(402).json({ error: err.message, code: err.code });
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }

  // Parallel reads: profile and base resume are independent of each other.
  const _ta0 = Date.now();
  const [profileDoc, baseResumeResult] = await Promise.all([
    CanonicalProfile.findOne({ userId }),
    resolveBaseResume(userId, baseResumeId, llm),
  ]);
  console.log(`[resumelab] [latency] analyze.fetch=${Date.now() - _ta0}ms userId:${userId}`);

  if (!profileDoc?.canonicalProfile) {
    return res.status(400).json({ error: 'No canonical profile found. Upload at least one resume first.' });
  }

  // Check in-memory JD analysis cache before hitting the LLM.
  const _cacheKey = _jdCacheKey(userId, profileDoc.profileVersion, jd);
  let matchAnalysis = _jdCacheGet(_cacheKey);
  if (matchAnalysis) {
    console.log(`[resumelab] analyze cache hit — userId: ${userId}, profileVersion: ${profileDoc.profileVersion}`);
  } else {
    const _ta1 = Date.now();
    try {
      // brainClient sanitizes the llm for the provider and applies the user's
      // personalization/system-prompt internally — pass it through as-is.
      matchAnalysis = await analyzeResumeMatch({
        userId: userId.toString(),
        jobDescription: jd,
        canonicalProfile: profileDoc.canonicalProfile,
        baseResume: baseResumeResult?.extractedContent || undefined,
        llm,
      });
      console.log(`[resumelab] [latency] analyze.llm=${Date.now() - _ta1}ms userId:${userId}`);
    } catch (err) {
      const detail = brainDetail(err);
      console.error(`[resumelab] Analyze failed — userId: ${userId}: ${detail}`);
      return res.status(502).json({ error: 'Resume analysis failed. Please try again.', detail });
    }
    _jdCacheSet(_cacheKey, matchAnalysis);
  }

  const analysisDoc = await ResumeAnalysis.create({
    userId,
    baseResumeId: baseResumeResult?.resume?._id || null,
    canonicalProfileVersion: profileDoc.profileVersion,
    jobDescriptionRaw: jd,
    extractedJobMetadata: {
      title: String(jobTitle || '').trim().slice(0, 180),
      company: String(company || '').trim().slice(0, 180),
      seniority: String(matchAnalysis.role_seniority || '').slice(0, 60),
      domain: String(matchAnalysis.domain_fit || '').slice(0, 300),
    },
    matchAnalysis,
    matchScore: matchAnalysis.match_score || 0,
    status: 'analyzed',
    flowId: crypto.randomUUID(),
  });

  console.log(`[resumelab] Analyze complete — userId: ${userId}, analysisId: ${analysisDoc._id}, score: ${analysisDoc.matchScore}`);

  res.json({
    analysisId: analysisDoc._id.toString(),
    matchScore: analysisDoc.matchScore,
    seniority: analysisDoc.extractedJobMetadata.seniority,
    domain: analysisDoc.extractedJobMetadata.domain,
    requiredKeywords: matchAnalysis.required_keywords || [],
    missingKeywords: matchAnalysis.missing_keywords || [],
    existingButMissingFromResume: matchAnalysis.existing_but_missing_from_resume || [],
    irrelevantContent: matchAnalysis.irrelevant_content || [],
    recommendedAdditions: matchAnalysis.recommended_additions || [],
    recommendedRemovals: matchAnalysis.recommended_removals || [],
    mentionsYears: !!matchAnalysis.mentions_years,
    requiredYearsMin: Number(matchAnalysis.required_years_min) || 0,
    requiredYearsMax: Number(matchAnalysis.required_years_max) || 0,
    candidateYearsEstimate: Number(matchAnalysis.candidate_years_estimate) || 0,
  });
});

// ── GET /api/resumelab/analyses ──────────────────────────────────────────────

router.get('/analyses', async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`[resumelab] GET /analyses — userId: ${userId}`);
    const docs = await ResumeAnalysis.find({ userId }).sort({ createdAt: -1 }).limit(100);
    console.log(`[resumelab] GET /analyses — userId: ${userId}, count: ${docs.length}`);
    res.json({ analyses: docs.map(toAnalysisSummary) });
  } catch (err) {
    console.error('[resumelab] GET /analyses failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load analyses' });
  }
});

// ── GET /api/resumelab/analyses/:id ─────────────────────────────────────────

router.get('/analyses/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const userId = req.user._id;
    const doc = await ResumeAnalysis.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Analysis not found' });
    res.json(toAnalysisFull(doc));
  } catch (err) {
    console.error(`[resumelab] GET /analyses/${req.params.id} failed:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to load analysis' });
  }
});

// ── POST /api/resumelab/generate ─────────────────────────────────────────────

const VALID_GENERATION_MODES = new Set(['canonical_only', 'modify_existing']);
const VALID_AGGRESSIVENESS = new Set(['conservative', 'balanced', 'aggressive']);

router.post('/generate', async (req, res) => {
  // Tailored resume generation (LaTeX → PDF) is intentionally locked for now.
  // The orchestration below is retained but dormant; analysis, cover letters,
  // and HR emails remain fully available.
  return res.status(423).json({
    error: 'Tailored resume generation is temporarily disabled. Use JD analysis, cover letters, and HR emails for now.',
    code: 'FEATURE_LOCKED',
  });

  /* eslint-disable no-unreachable */
  const userId = req.user._id;
  const {
    analysisId,
    templateType: reqTemplateType,
    outputFormat: reqOutputFormat,
    baseResumeId,
    startingResumeId: reqStartingResumeId,
    generationMode: reqGenerationMode,
    userPrompt,
    aggressiveness: reqAggressiveness,
  } = req.body || {};

  if (!analysisId || !Types.ObjectId.isValid(analysisId)) {
    return res.status(400).json({ error: 'Valid analysisId is required' });
  }

  const outputFormat = TEMPLATE_TYPES.has(reqOutputFormat) ? reqOutputFormat
    : TEMPLATE_TYPES.has(reqTemplateType) ? reqTemplateType
    : 'fullstack';
  const generationMode = VALID_GENERATION_MODES.has(reqGenerationMode) ? reqGenerationMode : 'canonical_only';
  const aggressiveness = VALID_AGGRESSIVENESS.has(reqAggressiveness) ? reqAggressiveness : 'balanced';
  const resolvedStartingId = reqStartingResumeId || baseResumeId;

  console.log(`[resumelab] POST /generate — userId: ${userId}, analysisId: ${analysisId}, mode: ${generationMode}, template: ${outputFormat}`);

  // Enforce BYOK — must have a validated AI provider before any LLM call.
  let llm;
  try {
    llm = await resolveUserLlm(userId);
  } catch (err) {
    if (isByokError(err)) return res.status(402).json({ error: err.message, code: err.code });
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }

  // Phase 1: two independent reads in parallel.
  const _tg0 = Date.now();
  const [analysisDoc, profileDoc] = await Promise.all([
    ResumeAnalysis.findOne({ _id: analysisId, userId }),
    CanonicalProfile.findOne({ userId }),
  ]);

  if (!analysisDoc) return res.status(404).json({ error: 'Analysis not found' });
  if (!profileDoc?.canonicalProfile) {
    return res.status(400).json({ error: 'No canonical profile found. Upload at least one resume first.' });
  }

  // Phase 2: base resume depends on analysisDoc.baseResumeId.
  const baseResumeResult = await resolveBaseResume(userId, resolvedStartingId || analysisDoc.baseResumeId?.toString());
  console.log(`[resumelab] [latency] generate.fetch=${Date.now() - _tg0}ms userId:${userId}`);

  // For modify_existing, pass the sectioned resume dict AND the original raw text
  let sourceResumeContent;
  let originalResumeText;
  if (generationMode === 'modify_existing' && baseResumeResult?.resume) {
    sourceResumeContent = baseResumeResult.resume.sectionedResumeSource
      || baseResumeResult.extractedContent?.sectioned_resume_source
      || undefined;
    originalResumeText = baseResumeResult.resume.normalizedResumeText || undefined;
  }

  // Attach flowId to this generation (link it to the parent analysis)
  const flowId = analysisDoc.flowId || null;

  // Strip internal-only fields before sending llm to Cortex
  const cortexLlm = { ...llm };
  const _userSystemPromptForGen = cortexLlm._userSystemPrompt || undefined;
  delete cortexLlm._personalizationPrefs;
  delete cortexLlm._userSystemPrompt;

  // ── Step 1: Generate structured content via Cortex ─────────────────────
  const _cortexArgs = () => ({
    userId: userId.toString(),
    jobDescription: analysisDoc.jobDescriptionRaw,
    canonicalProfile: profileDoc.canonicalProfile,
    baseResume: baseResumeResult?.extractedContent || undefined,
    templateType: outputFormat,
    llm: cortexLlm,
    mode: generationMode,
    sourceResumeContent,
    originalResumeText,
    userTweakPrompt: userPrompt ? String(userPrompt).slice(0, 1000) : undefined,
    aggressiveness,
    userSystemPrompt: _userSystemPromptForGen,
  });

  let generatedContent;
  const _tg1 = Date.now();
  try {
    generatedContent = await generateOptimizedResume(_cortexArgs());
    console.log(`[resumelab] [latency] generate.llm=${Date.now() - _tg1}ms userId:${userId} scoreAfter:${generatedContent.match_score_improved}`);
  } catch (err) {
    const detail = brainDetail(err);
    console.error(`[resumelab] Generation failed — userId: ${userId}, analysisId: ${analysisId}: ${detail}`);
    await GeneratedResume.create({
      userId,
      analysisId: analysisDoc._id,
      baseResumeId: baseResumeResult?.resume?._id || null,
      templateType: outputFormat,
      generationMode,
      startingResumeId: baseResumeResult?.resume?._id || null,
      userPrompt: String(userPrompt || '').slice(0, 1000),
      aggressiveness,
      generatedContent: null,
      latexSource: '',
      pdfPath: '',
      pdfError: detail,
      matchScoreBefore: analysisDoc.matchScore,
      matchScoreAfter: 0,
      status: 'failed',
    });
    return res.status(502).json({ error: 'Resume generation failed. Please try again.', detail });
  }

  // ── Step 2: Inject into LaTeX template + validate ─────────────────────
  const _tg2 = Date.now();
  const _injectArgs = (content) => ({
    templateType: outputFormat,
    name: req.user.displayName || req.user.email || 'Candidate',
    contact: req.user.email || '',
    generated: content,
    canonicalProfile: profileDoc.canonicalProfile,
  });

  let latexSource = injectTemplate(_injectArgs(generatedContent));
  const latexErrors = validateLatex(latexSource);
  if (latexErrors.length > 0) {
    console.warn(`[resumelab] LaTeX validation failed (${latexErrors.join('; ')}) — retrying generation once userId:${userId}`);
    try {
      const retryContent = await generateOptimizedResume(_cortexArgs());
      const retryLatex = injectTemplate(_injectArgs(retryContent));
      const retryErrors = validateLatex(retryLatex);
      if (retryErrors.length === 0) {
        generatedContent = retryContent;
        latexSource = retryLatex;
        console.log(`[resumelab] LaTeX retry succeeded userId:${userId}`);
      } else {
        console.warn(`[resumelab] LaTeX retry still invalid (${retryErrors.join('; ')}) — proceeding with first attempt userId:${userId}`);
      }
    } catch (retryErr) {
      console.warn(`[resumelab] LaTeX retry generation threw — proceeding with first attempt: ${retryErr.message}`);
    }
  }
  console.log(`[resumelab] [latency] generate.inject=${Date.now() - _tg2}ms userId:${userId}`);

  // ── Step 3: Compile PDF (non-fatal on failure) ─────────────────────────
  const _tg3 = Date.now();
  let pdfPath = '';
  let pdfError = '';
  try {
    pdfPath = await compileToPdf({
      latexSource,
      userId: userId.toString(),
      outputName: `resume_${analysisDoc._id}_${Date.now()}`,
    });
    console.log(`[resumelab] [latency] generate.compile=${Date.now() - _tg3}ms userId:${userId} path:${pdfPath}`);
  } catch (pdfErr) {
    pdfError = pdfErr.message;
    console.warn(`[resumelab] PDF compilation failed — userId: ${userId}: ${pdfErr.message}`);
  }
  console.log(`[resumelab] [latency] generate.total=${Date.now() - _tg0}ms userId:${userId}`);

  // ── Step 4: Persist generated resume ──────────────────────────────────
  const genDoc = await GeneratedResume.create({
    userId,
    analysisId: analysisDoc._id,
    baseResumeId: baseResumeResult?.resume?._id || null,
    templateType: outputFormat,
    generationMode,
    startingResumeId: baseResumeResult?.resume?._id || null,
    userPrompt: String(userPrompt || '').slice(0, 1000),
    aggressiveness,
    generatedContent,
    latexSource,
    pdfPath,
    pdfError,
    matchScoreBefore: analysisDoc.matchScore,
    matchScoreAfter: generatedContent.match_score_improved || 0,
    status: 'generated',
    flowId,
  });

  console.log(`[resumelab] Generate complete — userId: ${userId}, genId: ${genDoc._id}, hasPdf: ${!!pdfPath}`);

  res.json({
    generatedResumeId: genDoc._id.toString(),
    latexSource,
    pdfUrl: pdfPath ? `/api/resumelab/generated/${genDoc._id}/pdf` : null,
    pdfError: pdfError || null,
    matchScoreBefore: genDoc.matchScoreBefore,
    matchScoreAfter: genDoc.matchScoreAfter,
    generationMode,
  });
});

// ── GET /api/resumelab/generated ─────────────────────────────────────────────

router.get('/generated', async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`[resumelab] GET /generated — userId: ${userId}`);
    const docs = await GeneratedResume.find({ userId }).sort({ createdAt: -1 }).limit(100);
    console.log(`[resumelab] GET /generated — userId: ${userId}, count: ${docs.length}`);
    res.json({ generatedResumes: docs.map(toGeneratedSummary) });
  } catch (err) {
    console.error('[resumelab] GET /generated failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load generated resumes' });
  }
});

// ── GET /api/resumelab/generated/:id ─────────────────────────────────────────

router.get('/generated/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const userId = req.user._id;
    const doc = await GeneratedResume.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Generated resume not found' });
    res.json(toGeneratedFull(doc));
  } catch (err) {
    console.error(`[resumelab] GET /generated/${req.params.id} failed:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to load generated resume' });
  }
});

// ── GET /api/resumelab/generated/:id/pdf ─────────────────────────────────────
// Serves the compiled PDF through the authenticated route — never exposed publicly.

router.get('/generated/:id/pdf', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const userId = req.user._id;
    const doc = await GeneratedResume.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Generated resume not found' });
    if (!doc.pdfPath) {
      return res.status(404).json({ error: doc.pdfError ? `PDF unavailable: ${doc.pdfError}` : 'PDF not available for this resume' });
    }

    try {
      await fs.promises.access(doc.pdfPath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    const basename = `resume_${id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${basename}"`);
    fs.createReadStream(doc.pdfPath).pipe(res);
  } catch (err) {
    console.error(`[resumelab] GET /generated/${req.params.id}/pdf failed:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to serve PDF' });
  }
});

// ── GET /api/resumelab/history ───────────────────────────────────────────────
// Returns flow-grouped history. Rows with a shared flowId are grouped; standalone items appear alone.

router.get('/history', async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`[resumelab] GET /history — userId: ${userId}`);

    const [analyses, generated] = await Promise.all([
      ResumeAnalysis.find({ userId }).sort({ createdAt: -1 }).limit(100),
      GeneratedResume.find({ userId }).sort({ createdAt: -1 }).limit(100),
    ]);

    // Group by flowId
    const flowMap = new Map(); // flowId → { analysis, generations[], createdAt }

    for (const doc of analyses) {
      const fid = doc.flowId || null;
      if (fid) {
        if (!flowMap.has(fid)) flowMap.set(fid, { flowId: fid, analysis: null, generations: [], createdAt: doc.createdAt });
        flowMap.get(fid).analysis = { kind: 'analysis', ...toAnalysisSummary(doc), jobDescriptionRaw: doc.jobDescriptionRaw || '' };
      } else {
        // Standalone analysis — no flowId
        flowMap.set(`a_${doc._id}`, { flowId: null, analysis: { kind: 'analysis', ...toAnalysisSummary(doc), jobDescriptionRaw: doc.jobDescriptionRaw || '' }, generations: [], createdAt: doc.createdAt });
      }
    }

    for (const doc of generated) {
      const fid = doc.flowId || null;
      const entry = { kind: 'generated', ...toGeneratedSummary(doc) };
      if (fid && flowMap.has(fid)) {
        flowMap.get(fid).generations.push(entry);
      } else if (fid) {
        // flowId present but no matching analysis yet
        flowMap.set(fid, { flowId: fid, analysis: null, generations: [entry], createdAt: doc.createdAt });
      } else {
        flowMap.set(`g_${doc._id}`, { flowId: null, analysis: null, generations: [entry], createdAt: doc.createdAt });
      }
    }

    const rows = Array.from(flowMap.values())
      .map(row => ({
        ...row,
        kind: row.analysis && row.generations.length ? 'flow' : row.analysis ? 'analysis-only' : 'generation-only',
        matchScore: row.analysis?.matchScore || (row.generations[0]?.matchScoreAfter || 0),
        updatedAt: row.generations[0]?.createdAt || row.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100);

    console.log(`[resumelab] GET /history — userId: ${userId}, flows: ${rows.length}`);
    res.json({ history: rows });
  } catch (err) {
    console.error('[resumelab] GET /history failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load history' });
  }
});

// ── DELETE /api/resumelab/history ────────────────────────────────────────────
// Clears all of the user's history — every JD analysis and generated output
// (resumes, cover letters, HR emails), plus any compiled PDFs on disk. Uploaded
// resumes and the canonical profile are untouched (those live under /profile).

router.delete('/history', async (req, res) => {
  const userId = req.user._id;
  console.log(`[resumelab] DELETE /history — userId: ${userId}`);

  try {
    const generated = await GeneratedResume.find({ userId }, { pdfPath: 1 });

    const [genResult, analysisResult] = await Promise.all([
      GeneratedResume.deleteMany({ userId }),
      ResumeAnalysis.deleteMany({ userId }),
    ]);

    // Best-effort cleanup of any compiled PDFs on disk.
    await Promise.all(
      generated
        .filter(g => g.pdfPath)
        .map(g => safeDeleteFile(g.pdfPath))
    );

    const deleted = (genResult.deletedCount || 0) + (analysisResult.deletedCount || 0);
    console.log(`[resumelab] DELETE /history — cleared ${deleted} record(s), userId: ${userId}`);
    res.json({
      ok: true,
      deletedAnalyses: analysisResult.deletedCount || 0,
      deletedGenerated: genResult.deletedCount || 0,
    });
  } catch (err) {
    console.error('[resumelab] DELETE /history failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to clear history' });
  }
});

// ── GET /api/resumelab/flow/:flowId ─────────────────────────────────────────
// Returns the full analysis + latest generation for a given flowId.

router.get('/flow/:flowId', async (req, res) => {
  try {
    const userId = req.user._id;
    const { flowId } = req.params;
    if (!flowId) return res.status(400).json({ error: 'flowId is required' });

    const [analysis, latestGen] = await Promise.all([
      ResumeAnalysis.findOne({ userId, flowId }),
      GeneratedResume.findOne({ userId, flowId }).sort({ createdAt: -1 }),
    ]);

    if (!analysis && !latestGen) return res.status(404).json({ error: 'Flow not found' });

    res.json({
      flowId,
      analysis: analysis ? { ...toAnalysisFull(analysis), jobDescriptionRaw: analysis.jobDescriptionRaw || '' } : null,
      generation: latestGen ? toGeneratedFull(latestGen) : null,
    });
  } catch (err) {
    console.error('[resumelab] GET /flow/:flowId failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to load flow' });
  }
});

// ── POST /api/resumelab/compile-latex ────────────────────────────────────────
// Stateless compile: takes LaTeX source directly, returns base64 PDF.
// Used when there is no GeneratedResume record (e.g. pasting custom LaTeX).

router.post('/compile-latex', async (req, res) => {
  const userId = req.user._id;
  const { latexSource } = req.body || {};

  if (!latexSource || !String(latexSource).trim()) {
    return res.status(400).json({ error: 'latexSource is required' });
  }

  const src = String(latexSource);
  const outputName = `resume_preview_${userId}_${Date.now()}`;

  let pdfPath;
  try {
    pdfPath = await compileToPdf({ latexSource: src, userId: userId.toString(), outputName });
  } catch (compileErr) {
    console.warn(`[resumelab] Stateless compile failed — userId: ${userId}: ${compileErr.message}`);
    return res.status(422).json({ error: compileErr.message });
  }

  try {
    const pdfBytes = await fs.promises.readFile(pdfPath);
    const pdfBase64 = pdfBytes.toString('base64');
    // Preview PDFs are not tracked in DB; clean up after serving.
    fs.promises.unlink(pdfPath).catch(() => {});
    console.log(`[resumelab] Stateless compile complete — userId: ${userId}`);
    return res.json({ ok: true, pdfBase64 });
  } catch (err) {
    console.error(`[resumelab] POST /compile-latex read failed:`, err.message);
    return res.status(500).json({ error: err.message || 'Failed to read compiled PDF' });
  }
});

// ── POST /api/resumelab/generated/:id/compile-latex ──────────────────────────
// Compiles the stored (or supplied) LaTeX source to PDF and returns base64.

router.post('/generated/:id/compile-latex', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  const userId = req.user._id;
  const { latexSource: submittedLatex } = req.body || {};

  try {
    const doc = await GeneratedResume.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Generated resume not found' });

    const latexSource = (typeof submittedLatex === 'string' && submittedLatex.trim())
      ? submittedLatex
      : doc.latexSource;

    if (!latexSource) {
      return res.status(400).json({ error: 'No LaTeX source available to compile' });
    }

    const outputName = `resume_${id}_${Date.now()}`;
    let pdfPath;
    try {
      pdfPath = await compileToPdf({ latexSource, userId: userId.toString(), outputName });
    } catch (compileErr) {
      console.warn(`[resumelab] Compile failed — userId: ${userId}, genId: ${id}: ${compileErr.message}`);
      doc.pdfError = compileErr.message;
      await doc.save();
      return res.status(422).json({ error: compileErr.message });
    }

    const pdfBytes = await fs.promises.readFile(pdfPath);
    const pdfBase64 = pdfBytes.toString('base64');

    if (typeof submittedLatex === 'string' && submittedLatex.trim()) {
      doc.latexSource = latexSource;
    }
    doc.pdfPath = pdfPath;
    doc.pdfError = '';
    await doc.save();

    console.log(`[resumelab] Compile complete — userId: ${userId}, genId: ${id}`);
    return res.json({
      ok: true,
      pdfBase64,
      pdfUrl: `/api/resumelab/generated/${id}/pdf`,
    });
  } catch (err) {
    console.error(`[resumelab] POST /generated/${id}/compile-latex failed:`, err.message);
    res.status(500).json({ error: err.message || 'Compilation failed' });
  }
});

// ── DELETE /api/resumelab/generated/:id ──────────────────────────────────────

router.delete('/generated/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const userId = req.user._id;
    console.log(`[resumelab] DELETE /generated/${id} — userId: ${userId}`);
    const doc = await GeneratedResume.findOne({ _id: id, userId });
    if (!doc) return res.status(404).json({ error: 'Generated resume not found' });

    const { pdfPath } = doc;
    await GeneratedResume.deleteOne({ _id: id, userId });
    if (pdfPath) await safeDeleteFile(pdfPath);

    console.log(`[resumelab] DELETE /generated/${id} — deleted, userId: ${userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[resumelab] DELETE /generated/${id} failed:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to delete generated resume' });
  }
});

// ── POST /api/resumelab/generate-cover-letter ────────────────────────────────

router.post('/generate-cover-letter', async (req, res) => {
  const userId = req.user._id;
  const { analysisId, userPrompt } = req.body || {};

  if (!analysisId || !Types.ObjectId.isValid(analysisId)) {
    return res.status(400).json({ error: 'analysisId is required' });
  }

  let llm;
  try {
    llm = await resolveUserLlm(userId);
  } catch (err) {
    if (isByokError(err)) return res.status(402).json({ error: err.message, code: err.code });
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }

  try {
    const analysis = await ResumeAnalysis.findOne({ _id: analysisId, userId });
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' });

    const profile = await CanonicalProfile.findOne({ userId });
    const canonicalProfile = profile?.canonicalProfile || {};

    const result = await generateCoverLetter({
      userId: userId.toString(),
      jobDescription: analysis.jobDescriptionRaw || '',
      canonicalProfile,
      llm,
      analysisSummary: analysis.matchAnalysis || undefined,
      userPrompt: userPrompt || undefined,
    });

    const coverLetterText = result.cover_letter_text || result.text || '';

    await GeneratedResume.create({
      userId,
      analysisId,
      outputType: 'cover_letter',
      textContent: coverLetterText,
      matchScoreBefore: analysis.matchScore || 0,
      matchScoreAfter: analysis.matchScore || 0,
      generationMode: 'canonical_only',
      status: 'generated',
    });

    return res.json({ coverLetterText, wordCount: result.word_count || null });
  } catch (err) {
    const detail = brainDetail(err);
    console.error(`[resumelab] generate-cover-letter failed — userId: ${userId}: ${detail}`);
    return res.status(502).json({ error: 'Cover letter generation failed.', detail });
  }
});

// ── POST /api/resumelab/generate-hr-email ────────────────────────────────────

router.post('/generate-hr-email', async (req, res) => {
  const userId = req.user._id;
  const { analysisId, userPrompt, recipientName } = req.body || {};

  if (!analysisId || !Types.ObjectId.isValid(analysisId)) {
    return res.status(400).json({ error: 'analysisId is required' });
  }

  let llm;
  try {
    llm = await resolveUserLlm(userId);
  } catch (err) {
    if (isByokError(err)) return res.status(402).json({ error: err.message, code: err.code });
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }

  try {
    const analysis = await ResumeAnalysis.findOne({ _id: analysisId, userId });
    if (!analysis) return res.status(404).json({ error: 'Analysis not found' });

    const profile = await CanonicalProfile.findOne({ userId });
    const canonicalProfile = profile?.canonicalProfile || {};

    const result = await generateHrEmail({
      userId: userId.toString(),
      jobDescription: analysis.jobDescriptionRaw || '',
      canonicalProfile,
      recipientName: recipientName || null,
      llm,
      analysisSummary: analysis.matchAnalysis || undefined,
    });

    const subject = result.subject || '';
    const body = result.body || '';

    await GeneratedResume.create({
      userId,
      analysisId,
      outputType: 'hr_email',
      textContent: JSON.stringify({ subject, body }),
      matchScoreBefore: analysis.matchScore || 0,
      matchScoreAfter: analysis.matchScore || 0,
      generationMode: 'canonical_only',
      status: 'generated',
    });

    return res.json({ subject, body, wordCount: result.word_count || null });
  } catch (err) {
    const detail = brainDetail(err);
    console.error(`[resumelab] generate-hr-email failed — userId: ${userId}: ${detail}`);
    return res.status(502).json({ error: 'HR email generation failed.', detail });
  }
});

// ── From-scratch LaTeX template (cached) ─────────────────────────────────────

const FROM_SCRATCH_TEMPLATE_PATH = path.join(__dirname, '..', 'resume_templates', 'from-scratch.tex');
let _fromScratchTemplateCache = null;
function readFromScratchTemplate() {
  if (_fromScratchTemplateCache !== null) return _fromScratchTemplateCache;
  _fromScratchTemplateCache = fs.readFileSync(FROM_SCRATCH_TEMPLATE_PATH, 'utf8');
  return _fromScratchTemplateCache;
}

// ── POST /api/resumelab/generate-from-latex ──────────────────────────────────
//
// Two-mode resume builder driven by the JD analysis + the user's choice of
// intensity. Returns final LaTeX source so the frontend can drop it into the
// editor and request a compile separately.

router.post('/generate-from-latex', async (req, res) => {
  const userId = req.user._id;
  const {
    mode,           // 'modify' | 'scratch'
    latexSource,    // required when mode === 'modify'
    intensity,      // 'minor' | 'balanced' | 'major'
    userPrompt,     // optional freeform tweak
    analysisId,     // required — anchors generation to a prior analysis
  } = req.body || {};

  if (mode !== 'modify' && mode !== 'scratch') {
    return res.status(400).json({ error: "mode must be 'modify' or 'scratch'" });
  }
  if (mode === 'modify' && (!latexSource || !String(latexSource).trim())) {
    return res.status(400).json({ error: 'latexSource is required when mode is modify' });
  }
  if (!analysisId || !Types.ObjectId.isValid(analysisId)) {
    return res.status(400).json({ error: 'analysisId is required' });
  }

  const intensityKey = ['minor', 'balanced', 'major'].includes(intensity) ? intensity : 'balanced';
  const trimmedUserPrompt = userPrompt ? String(userPrompt).trim().slice(0, 1000) : '';

  let llm;
  try {
    llm = await resolveUserLlm(userId);
  } catch (err) {
    if (isByokError(err)) return res.status(402).json({ error: err.message, code: err.code });
    return res.status(500).json({ error: 'Failed to load AI settings' });
  }

  const analysisDoc = await ResumeAnalysis.findOne({ _id: analysisId, userId });
  if (!analysisDoc) return res.status(404).json({ error: 'Analysis not found' });

  const profileDoc = await CanonicalProfile.findOne({ userId });
  if (!profileDoc?.canonicalProfile) {
    return res.status(400).json({ error: 'No Career Profile found. Upload at least one resume first.' });
  }

  const cortexLlm = { ...llm };
  const personalizationPrefs = cortexLlm._personalizationPrefs || null;
  const userSystemPrompt = cortexLlm._userSystemPrompt || undefined;
  delete cortexLlm._personalizationPrefs;
  delete cortexLlm._userSystemPrompt;

  const candidateName = req.user.displayName || profileDoc.canonicalProfile?.contact?.name || '';
  const candidateContact = profileDoc.canonicalProfile?.contact
    ? [profileDoc.canonicalProfile.contact.email, profileDoc.canonicalProfile.contact.phone, profileDoc.canonicalProfile.contact.location]
        .filter(Boolean).join(' • ')
    : '';

  console.log(`[resumelab] POST /generate-from-latex — userId: ${userId}, mode: ${mode}, intensity: ${intensityKey}`);

  let result;
  const _t0 = Date.now();
  try {
    result = await generateResumeLatex({
      userId: userId.toString(),
      mode,
      latexSource: mode === 'modify' ? String(latexSource) : '',
      templateLatex: mode === 'scratch' ? readFromScratchTemplate() : '',
      intensity: intensityKey,
      userPrompt: trimmedUserPrompt || undefined,
      jobDescription: analysisDoc.jobDescriptionRaw || '',
      matchAnalysis: analysisDoc.matchAnalysis || {},
      canonicalProfile: profileDoc.canonicalProfile,
      candidateName,
      candidateContact,
      llm: cortexLlm,
      personalizationPrefs,
      userSystemPrompt,
    });
    console.log(`[resumelab] [latency] generate-from-latex.llm=${Date.now() - _t0}ms userId:${userId}`);
  } catch (err) {
    const detail = brainDetail(err);
    console.error(`[resumelab] generate-from-latex failed — userId: ${userId}: ${detail}`);
    return res.status(502).json({ error: 'Resume generation failed. Please try again.', detail });
  }

  const latex = String(result.latex_source || '').trim();
  if (!latex) return res.status(502).json({ error: 'AI returned an empty document. Please try again.' });

  const validationErrors = validateLatex(latex);
  if (validationErrors.length) {
    console.warn(`[resumelab] generated LaTeX failed validation — userId: ${userId}: ${validationErrors.join('; ')}`);
    // Return anyway — the user can fix in the editor and recompile.
  }

  return res.json({ latex, validationWarnings: validationErrors });
});

module.exports = router;
