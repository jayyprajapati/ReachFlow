'use strict';

const express = require('express');
const { Types } = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Resume, CanonicalProfile } = require('../db');
const { extractResume, mergeCanonicalProfile } = require('../services/cortexClient');

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

module.exports = router;
