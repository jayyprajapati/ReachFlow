'use strict';

const express = require('express');
const { Types } = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Resume, CanonicalProfile, ResumeAnalysis, GeneratedResume } = require('../db');
const { extractResume, mergeCanonicalProfile, analyzeResumeMatch, generateOptimizedResume } = require('../services/cortexClient');
const { injectTemplate, compileToPdf } = require('../services/latexCompiler');

const router = express.Router();

// ── Config ─────────────────────────────────────────────────────────────────

const MAX_RESUME_UPLOAD_MB = parseInt(process.env.MAX_RESUME_UPLOAD_MB || '10', 10);
const RESUME_UPLOAD_DIR = process.env.RESUME_UPLOAD_DIR
  || path.join(__dirname, '../../../uploads/resumes');

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const RESUME_TYPES = new Set(['frontend', 'backend', 'fullstack', 'custom']);

// ── Multer ──────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(RESUME_UPLOAD_DIR, req.user._id.toString());
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
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
    uploadSource: doc.uploadSource || 'manual',
    status: doc.status || 'uploaded',
    uploadedAt: doc.uploadedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
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

async function safeDeleteFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[resumelab] Could not delete file ${filePath}: ${err.message}`);
    }
  }
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

  // ── Step 1: Extract via Cortex ──────────────────────────────────────────
  let extractResult;
  try {
    extractResult = await extractResume({
      filePath: file.path,
      userId: userId.toString(),
      docId: resumeDoc._id.toString(),
    });
    resumeDoc.parsedDocId = extractResult.doc_id || resumeDoc._id.toString();
    resumeDoc.extractedContent = extractResult;
    console.log(`[resumelab] Extraction complete — userId: ${userId}, docId: ${resumeDoc.parsedDocId}, confidence: ${extractResult.metadata?.confidence}`);
  } catch (extractErr) {
    console.error(`[resumelab] Extraction failed — userId: ${userId}, resumeId: ${resumeDoc._id}:`, extractErr.message);
    resumeDoc.status = 'failed';
    await resumeDoc.save();
    return res.status(502).json({ error: 'Resume parsing failed. Please try again or check the file is readable.' });
  }

  // ── Step 2: Fetch existing canonical profile ────────────────────────────
  let profileDoc = await CanonicalProfile.findOne({ userId });
  const existingProfile = profileDoc?.canonicalProfile || {};

  // ── Step 3: Merge into canonical profile via Cortex ────────────────────
  let mergeResult;
  try {
    mergeResult = await mergeCanonicalProfile({
      userId: userId.toString(),
      existingProfile,
      incomingProfile: extractResult,
    });
  } catch (mergeErr) {
    console.error(`[resumelab] Merge failed — userId: ${userId}, resumeId: ${resumeDoc._id}:`, mergeErr.message);
    // Extraction succeeded so the resume doc is salvageable — mark parsed so the
    // user can trigger a manual rebuild once Cortex recovers.
    resumeDoc.status = 'parsed';
    await resumeDoc.save();
    return res.status(502).json({
      error: 'Profile merge failed. Resume was parsed but the canonical profile was not updated. Use /profile/rebuild to retry.',
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
    await Resume.deleteOne({ _id: id, userId });

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

    if (storagePath) await safeDeleteFile(storagePath);

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

// ── POST /api/resumelab/profile/rebuild ─────────────────────────────────────

router.post('/profile/rebuild', async (req, res) => {
  const userId = req.user._id;
  console.log(`[resumelab] POST /profile/rebuild — userId: ${userId}`);

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
    sectionRewrites: analysis.section_rewrites || {},
    atsKeywordClusters: analysis.ats_keyword_clusters || {},
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toGeneratedSummary(doc) {
  return {
    id: doc._id.toString(),
    analysisId: doc.analysisId?.toString() || null,
    baseResumeId: doc.baseResumeId?.toString() || null,
    templateType: doc.templateType,
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
    latexPreview: (doc.latexSource || '').slice(0, 3000),
    pdfUrl: doc.pdfPath ? `/api/resumelab/generated/${doc._id}/pdf` : null,
  };
}

// Resolve the best base resume's extractedContent for a user.
// Returns null if nothing usable is found.
async function resolveBaseResume(userId, baseResumeId) {
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

  const profileDoc = await CanonicalProfile.findOne({ userId });
  if (!profileDoc?.canonicalProfile) {
    return res.status(400).json({ error: 'No canonical profile found. Upload at least one resume first.' });
  }

  const baseResumeResult = await resolveBaseResume(userId, baseResumeId);

  let matchAnalysis;
  try {
    matchAnalysis = await analyzeResumeMatch({
      userId: userId.toString(),
      jobDescription: jd,
      canonicalProfile: profileDoc.canonicalProfile,
      baseResume: baseResumeResult?.extractedContent || undefined,
    });
  } catch (err) {
    console.error(`[resumelab] Analyze failed — userId: ${userId}:`, err.message);
    return res.status(502).json({ error: 'Resume analysis failed. Please try again.' });
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
    sectionRewrites: matchAnalysis.section_rewrites || {},
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

router.post('/generate', async (req, res) => {
  const userId = req.user._id;
  const { analysisId, templateType: reqTemplateType, baseResumeId } = req.body || {};

  if (!analysisId || !Types.ObjectId.isValid(analysisId)) {
    return res.status(400).json({ error: 'Valid analysisId is required' });
  }

  const templateType = TEMPLATE_TYPES.has(reqTemplateType) ? reqTemplateType : 'fullstack';
  console.log(`[resumelab] POST /generate — userId: ${userId}, analysisId: ${analysisId}, template: ${templateType}`);

  const analysisDoc = await ResumeAnalysis.findOne({ _id: analysisId, userId });
  if (!analysisDoc) return res.status(404).json({ error: 'Analysis not found' });

  const profileDoc = await CanonicalProfile.findOne({ userId });
  if (!profileDoc?.canonicalProfile) {
    return res.status(400).json({ error: 'No canonical profile found. Upload at least one resume first.' });
  }

  const baseResumeResult = await resolveBaseResume(userId, baseResumeId || analysisDoc.baseResumeId?.toString());

  // ── Step 1: Generate structured content via Cortex ─────────────────────
  let generatedContent;
  try {
    generatedContent = await generateOptimizedResume({
      userId: userId.toString(),
      jobDescription: analysisDoc.jobDescriptionRaw,
      canonicalProfile: profileDoc.canonicalProfile,
      baseResume: baseResumeResult?.extractedContent || undefined,
      templateType,
    });
    console.log(`[resumelab] Generation complete — userId: ${userId}, score improved to: ${generatedContent.match_score_improved}`);
  } catch (err) {
    console.error(`[resumelab] Generation failed — userId: ${userId}, analysisId: ${analysisId}:`, err.message);
    await GeneratedResume.create({
      userId,
      analysisId: analysisDoc._id,
      baseResumeId: baseResumeResult?.resume?._id || null,
      templateType,
      generatedContent: null,
      latexSource: '',
      pdfPath: '',
      pdfError: err.message,
      matchScoreBefore: analysisDoc.matchScore,
      matchScoreAfter: 0,
      status: 'failed',
    });
    return res.status(502).json({ error: 'Resume generation failed. Please try again.' });
  }

  // ── Step 2: Inject into LaTeX template ────────────────────────────────
  const latexSource = injectTemplate({
    templateType,
    name: req.user.displayName || req.user.email || 'Candidate',
    contact: req.user.email || '',
    generated: generatedContent,
    canonicalProfile: profileDoc.canonicalProfile,
  });

  // ── Step 3: Compile PDF (non-fatal on failure) ─────────────────────────
  let pdfPath = '';
  let pdfError = '';
  try {
    pdfPath = await compileToPdf({
      latexSource,
      userId: userId.toString(),
      outputName: `resume_${analysisDoc._id}_${Date.now()}`,
    });
    console.log(`[resumelab] PDF compiled — userId: ${userId}, path: ${pdfPath}`);
  } catch (pdfErr) {
    pdfError = pdfErr.message;
    console.warn(`[resumelab] PDF compilation failed — userId: ${userId}: ${pdfErr.message}`);
  }

  // ── Step 4: Persist generated resume ──────────────────────────────────
  const genDoc = await GeneratedResume.create({
    userId,
    analysisId: analysisDoc._id,
    baseResumeId: baseResumeResult?.resume?._id || null,
    templateType,
    generatedContent,
    latexSource,
    pdfPath,
    pdfError,
    matchScoreBefore: analysisDoc.matchScore,
    matchScoreAfter: generatedContent.match_score_improved || 0,
    status: 'generated',
  });

  console.log(`[resumelab] Generate complete — userId: ${userId}, genId: ${genDoc._id}, hasPdf: ${!!pdfPath}`);

  res.json({
    generatedResumeId: genDoc._id.toString(),
    latexPreview: latexSource.slice(0, 3000),
    pdfUrl: pdfPath ? `/api/resumelab/generated/${genDoc._id}/pdf` : null,
    pdfError: pdfError || null,
    matchScoreBefore: genDoc.matchScoreBefore,
    matchScoreAfter: genDoc.matchScoreAfter,
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

module.exports = router;
