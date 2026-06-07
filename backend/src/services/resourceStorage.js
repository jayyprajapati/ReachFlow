'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Types } = require('mongoose');
const multer = require('multer');
const { Resource, Resume } = require('../db');

const MAX_RESOURCES_PER_USER = 10;
const MAX_RESOURCE_UPLOAD_MB = parseInt(process.env.MAX_RESOURCE_UPLOAD_MB || '20', 10);
const RESOURCE_UPLOAD_DIR = process.env.RESOURCE_UPLOAD_DIR
  || process.env.RESUME_UPLOAD_DIR
  || path.join(os.homedir(), '.reachflow', 'uploads', 'resources');

const ALLOWED_RESOURCE_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

const MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function safeName(value, fallback = 'file') {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || fallback;
}

function safeFolderName(value) {
  return String(value || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'user';
}

async function ensureUserResourceFolder(user) {
  if (!user.resourceFolderName) {
    const display = user.displayName || String(user.email || '').split('@')[0] || 'user';
    user.resourceFolderName = `${safeFolderName(display)}-${user._id.toString()}`;
    await user.save();
  }
  const dir = path.join(RESOURCE_UPLOAD_DIR, user.resourceFolderName);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

const resourceDiskStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    ensureUserResourceFolder(req.user).then(dir => cb(null, dir)).catch(cb);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = safeName(path.basename(file.originalname, ext), 'resource').slice(0, 70);
    cb(null, `${base}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

async function safeDeleteFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[resources] Could not delete file ${filePath}: ${err.message}`);
    }
  }
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

function resolveMimeType(file) {
  if (ALLOWED_RESOURCE_MIME.has(file.mimetype)) return file.mimetype;
  return MIME_BY_EXTENSION[path.extname(file.originalname || file.path || '').toLowerCase()]
    || 'application/octet-stream';
}

function resourceError(message, status = 400, code = 'RESOURCE_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function registerStoredResource({ userId, file, source = 'manual', resumeId = null }) {
  const sha256 = await sha256File(file.path);
  const existing = await Resource.findOne({ userId, sha256 });

  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
    if (resumeId && !existing.resumeIds.some(id => id.equals(resumeId))) existing.resumeIds.push(resumeId);
    await existing.save();
    if (existing.storagePath !== file.path) await safeDeleteFile(file.path);
    return { resource: existing, deduplicated: true };
  }

  const count = await Resource.countDocuments({ userId });
  if (count >= MAX_RESOURCES_PER_USER) {
    await safeDeleteFile(file.path);
    throw resourceError(
      `Resource limit reached. Delete a resource before adding another (max ${MAX_RESOURCES_PER_USER}).`,
      409,
      'RESOURCE_LIMIT'
    );
  }

  try {
    const resource = await Resource.create({
      userId,
      name: String(file.originalname || file.filename || 'resource').slice(0, 255),
      storagePath: file.path,
      mimeType: resolveMimeType(file),
      fileSize: file.size || 0,
      sha256,
      sources: [source],
      resumeIds: resumeId ? [resumeId] : [],
    });
    return { resource, deduplicated: false };
  } catch (err) {
    if (err?.code === 11000) {
      const duplicate = await Resource.findOne({ userId, sha256 });
      if (duplicate) {
        if (!duplicate.sources.includes(source)) duplicate.sources.push(source);
        if (resumeId && !duplicate.resumeIds.some(id => id.equals(resumeId))) duplicate.resumeIds.push(resumeId);
        await duplicate.save();
        await safeDeleteFile(file.path);
        return { resource: duplicate, deduplicated: true };
      }
    }
    await safeDeleteFile(file.path);
    throw err;
  }
}

async function syncResumeResources(user) {
  const userId = user._id;
  const resumes = await Resume.find({ userId, storagePath: { $ne: '' } }).sort({ uploadedAt: 1 });

  for (const resume of resumes) {
    const linked = await Resource.findOne({ userId, storagePath: resume.storagePath });
    if (linked) {
      let changed = false;
      if (!linked.sources.includes('resume_vault')) {
        linked.sources.push('resume_vault');
        changed = true;
      }
      if (!linked.resumeIds.some(id => id.equals(resume._id))) {
        linked.resumeIds.push(resume._id);
        changed = true;
      }
      if (changed) await linked.save();
      continue;
    }

    try {
      if (await Resource.countDocuments({ userId }) >= MAX_RESOURCES_PER_USER) break;
      await fs.promises.access(resume.storagePath, fs.constants.R_OK);
      const dir = await ensureUserResourceFolder(user);
      const oldPath = resume.storagePath;
      const alreadyInResourceFolder = path.dirname(oldPath) === dir;
      const targetPath = alreadyInResourceFolder
        ? oldPath
        : path.join(
          dir,
          `${safeName(path.basename(resume.fileName || oldPath, path.extname(resume.fileName || oldPath)), 'resume').slice(0, 70)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${path.extname(resume.fileName || oldPath).toLowerCase()}`
        );

      if (!alreadyInResourceFolder) await fs.promises.copyFile(oldPath, targetPath);
      const stat = await fs.promises.stat(targetPath);
      const registered = await registerStoredResource({
        userId,
        source: 'resume_vault',
        resumeId: resume._id,
        file: {
          path: targetPath,
          originalname: resume.fileName || path.basename(oldPath),
          filename: path.basename(targetPath),
          mimetype: resume.mimeType || '',
          size: resume.fileSize || stat.size,
        },
      });

      resume.storagePath = registered.resource.storagePath;
      resume.mimeType = registered.resource.mimeType;
      resume.fileSize = registered.resource.fileSize;
      await resume.save();
      if (oldPath !== registered.resource.storagePath) await safeDeleteFile(oldPath);
    } catch (err) {
      console.warn(`[resources] Could not index resume ${resume._id}: ${err.message}`);
    }
  }
}

function toResourceResponse(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize || 0,
    sources: doc.sources || [],
    linkedResumeCount: (doc.resumeIds || []).length,
    canDelete: !(doc.resumeIds || []).length,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    downloadUrl: `/api/resources/${doc._id}/download`,
  };
}

function normalizeResourceRef(att) {
  const resourceId = String(att?.resourceId || att?.id || '').trim();
  if (resourceId && Types.ObjectId.isValid(resourceId)) return { resourceId };
  return null;
}

async function resolveResourceAttachments(userId, attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return [];

  const refs = attachments.map(normalizeResourceRef);
  const ids = [...new Set(refs.filter(Boolean).map(ref => ref.resourceId))];
  const docs = await Resource.find({ _id: { $in: ids }, userId });
  const byId = new Map(docs.map(doc => [doc._id.toString(), doc]));

  return Promise.all(attachments.map(async (attachment, index) => {
    const ref = refs[index];
    if (!ref) {
      if (attachment?.data) {
        return {
          name: String(attachment.name || 'attachment').slice(0, 255),
          mimeType: String(attachment.mimeType || 'application/octet-stream'),
          size: Number(attachment.size) || 0,
          data: String(attachment.data),
        };
      }
      throw resourceError('Attachments must reference an uploaded resource.', 400, 'INVALID_RESOURCE_REF');
    }
    const { resourceId } = ref;
    const doc = byId.get(resourceId);
    if (!doc) throw resourceError('One or more attached resources no longer exist.', 404, 'RESOURCE_NOT_FOUND');
    let data;
    try {
      data = await fs.promises.readFile(doc.storagePath);
    } catch {
      throw resourceError(`Resource file is unavailable: ${doc.name}`, 410, 'RESOURCE_FILE_MISSING');
    }
    return {
      name: doc.name,
      mimeType: doc.mimeType,
      size: doc.fileSize || data.length,
      data: data.toString('base64'),
    };
  }));
}

async function describeResourceAttachments(userId, attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return [];
  const refs = attachments.map(normalizeResourceRef).filter(Boolean);
  const ids = [...new Set(refs.map(ref => ref.resourceId))];
  const docs = await Resource.find({ _id: { $in: ids }, userId });
  const byId = new Map(docs.map(doc => [doc._id.toString(), doc]));
  return attachments.map((attachment) => {
    const ref = normalizeResourceRef(attachment);
    if (ref) {
      const doc = byId.get(ref.resourceId);
      return doc ? toResourceResponse(doc) : null;
    }
    if (!attachment?.data) return null;
    return {
      id: `legacy-${crypto.createHash('sha1').update(String(attachment.name || '') + String(attachment.size || 0)).digest('hex').slice(0, 12)}`,
      resourceId: '',
      name: String(attachment.name || 'attachment'),
      mimeType: String(attachment.mimeType || 'application/octet-stream'),
      fileSize: Number(attachment.size) || 0,
      sources: [],
      canDelete: false,
      legacy: true,
    };
  }).filter(Boolean);
}

async function detachResumeResource({ userId, resumeId, storagePath }) {
  const resource = await Resource.findOne({ userId, storagePath });
  if (!resource) return false;
  resource.resumeIds = (resource.resumeIds || []).filter(id => !id.equals(resumeId));
  if (!resource.resumeIds.length) {
    resource.sources = (resource.sources || []).filter(source => source !== 'resume_vault');
  }
  await resource.save();
  return true;
}

async function deleteUserResourceFolder(user) {
  if (!user?.resourceFolderName) return;
  const dir = path.join(RESOURCE_UPLOAD_DIR, user.resourceFolderName);
  await fs.promises.rm(dir, { recursive: true, force: true });
}

module.exports = {
  ALLOWED_RESOURCE_MIME,
  MAX_RESOURCES_PER_USER,
  MAX_RESOURCE_UPLOAD_MB,
  RESOURCE_UPLOAD_DIR,
  resourceDiskStorage,
  registerStoredResource,
  syncResumeResources,
  resolveResourceAttachments,
  describeResourceAttachments,
  detachResumeResource,
  deleteUserResourceFolder,
  safeDeleteFile,
  toResourceResponse,
};
