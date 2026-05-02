const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Roadmap, RoadmapStage, RoadmapItem } = require('../db');

const VALID_RESOURCE_TYPES = ['youtube_playlist', 'youtube_video', 'course', 'article', 'book', 'github', 'custom'];
const VALID_ITEM_STATUSES = ['planned', 'active', 'completed', 'skipped'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const VALID_ROADMAP_STATUSES = ['active', 'paused', 'completed'];

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function recalcProgress(roadmapId) {
  const items = await RoadmapItem.find({ roadmapId });
  const nonSkipped = items.filter(i => i.status !== 'skipped');
  const completed = nonSkipped.filter(i => i.status === 'completed');
  const progressPercent = nonSkipped.length > 0 ? Math.round((completed.length / nonSkipped.length) * 100) : 0;
  await Roadmap.findByIdAndUpdate(roadmapId, { progressPercent });
  return progressPercent;
}

// ── Roadmaps ──────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { title, description, domain, icon, colorTheme, status } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
    if (status && !VALID_ROADMAP_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_ROADMAP_STATUSES.join(', ')}` });
    }
    const roadmap = await Roadmap.create({
      userId: req.user._id,
      title: String(title).trim(),
      description: description ? String(description).trim() : '',
      domain: domain ? String(domain).trim() : '',
      icon: icon ? String(icon).trim() : '',
      colorTheme: colorTheme ? String(colorTheme).trim() : '',
      status: status || 'active',
    });
    return res.status(201).json(roadmap);
  } catch (err) {
    console.error('[roadmaps] POST /:', err.message);
    return res.status(500).json({ error: 'Failed to create roadmap' });
  }
});

router.get('/', async (req, res) => {
  try {
    const roadmaps = await Roadmap.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    return res.json(roadmaps);
  } catch (err) {
    console.error('[roadmaps] GET /:', err.message);
    return res.status(500).json({ error: 'Failed to fetch roadmaps' });
  }
});

// ── Utility routes (must be before /:id to avoid param capture) ───────────────

router.patch('/stages/:stageId', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.stageId)) return res.status(400).json({ error: 'Invalid stage ID' });
    const stage = await RoadmapStage.findOne({ _id: req.params.stageId, userId: req.user._id });
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
    const { title, order } = req.body;
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty' });
      stage.title = String(title).trim();
    }
    if (order !== undefined) stage.order = Number(order);
    await stage.save();
    return res.json(stage);
  } catch (err) {
    console.error('[roadmaps] PATCH /stages/:stageId:', err.message);
    return res.status(500).json({ error: 'Failed to update stage' });
  }
});

router.delete('/stages/:stageId', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.stageId)) return res.status(400).json({ error: 'Invalid stage ID' });
    const stage = await RoadmapStage.findOneAndDelete({ _id: req.params.stageId, userId: req.user._id });
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
    await RoadmapItem.deleteMany({ stageId: stage._id, userId: req.user._id });
    await recalcProgress(stage.roadmapId);
    return res.json({ message: 'Stage deleted' });
  } catch (err) {
    console.error('[roadmaps] DELETE /stages/:stageId:', err.message);
    return res.status(500).json({ error: 'Failed to delete stage' });
  }
});

router.patch('/items/:itemId', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.itemId)) return res.status(400).json({ error: 'Invalid item ID' });
    const item = await RoadmapItem.findOne({ _id: req.params.itemId, userId: req.user._id });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const { title, description, resourceType, url, platform, stageId, order, status, priority, estimatedHours, notes, tags } = req.body;
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty' });
      item.title = String(title).trim();
    }
    if (description !== undefined) item.description = String(description).trim();
    if (resourceType !== undefined) {
      if (!VALID_RESOURCE_TYPES.includes(resourceType)) {
        return res.status(400).json({ error: `resourceType must be one of: ${VALID_RESOURCE_TYPES.join(', ')}` });
      }
      item.resourceType = resourceType;
    }
    if (url !== undefined) item.url = String(url).trim();
    if (platform !== undefined) item.platform = String(platform).trim();
    if (stageId !== undefined) {
      if (stageId && !isValidObjectId(stageId)) return res.status(400).json({ error: 'Invalid stage ID' });
      if (stageId) {
        const stage = await RoadmapStage.findOne({ _id: stageId, roadmapId: item.roadmapId, userId: req.user._id });
        if (!stage) return res.status(404).json({ error: 'Stage not found in this roadmap' });
      }
      item.stageId = stageId || null;
    }
    if (order !== undefined) item.order = Number(order);
    if (status !== undefined) {
      if (!VALID_ITEM_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_ITEM_STATUSES.join(', ')}` });
      }
      item.status = status;
      if (status === 'completed' && !item.completedAt) item.completedAt = new Date();
      if (status !== 'completed') item.completedAt = null;
    }
    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
      }
      item.priority = priority;
    }
    if (estimatedHours !== undefined) item.estimatedHours = estimatedHours === null ? null : Number(estimatedHours);
    if (notes !== undefined) item.notes = String(notes).trim();
    if (tags !== undefined) item.tags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [];
    await item.save();
    await recalcProgress(item.roadmapId);
    return res.json(item);
  } catch (err) {
    console.error('[roadmaps] PATCH /items/:itemId:', err.message);
    return res.status(500).json({ error: 'Failed to update item' });
  }
});

router.delete('/items/:itemId', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.itemId)) return res.status(400).json({ error: 'Invalid item ID' });
    const item = await RoadmapItem.findOneAndDelete({ _id: req.params.itemId, userId: req.user._id });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    await recalcProgress(item.roadmapId);
    return res.json({ message: 'Item deleted' });
  } catch (err) {
    console.error('[roadmaps] DELETE /items/:itemId:', err.message);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
});

// ── Roadmap by ID ──────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid roadmap ID' });
    const roadmap = await Roadmap.findOne({ _id: req.params.id, userId: req.user._id });
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
    const [stages, items] = await Promise.all([
      RoadmapStage.find({ roadmapId: roadmap._id }).sort({ order: 1 }),
      RoadmapItem.find({ roadmapId: roadmap._id }).sort({ order: 1 }),
    ]);
    return res.json({ ...roadmap.toObject(), stages, items });
  } catch (err) {
    console.error('[roadmaps] GET /:id:', err.message);
    return res.status(500).json({ error: 'Failed to fetch roadmap' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid roadmap ID' });
    const roadmap = await Roadmap.findOne({ _id: req.params.id, userId: req.user._id });
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
    const { title, description, domain, icon, colorTheme, status } = req.body;
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ error: 'Title cannot be empty' });
      roadmap.title = String(title).trim();
    }
    if (description !== undefined) roadmap.description = String(description).trim();
    if (domain !== undefined) roadmap.domain = String(domain).trim();
    if (icon !== undefined) roadmap.icon = String(icon).trim();
    if (colorTheme !== undefined) roadmap.colorTheme = String(colorTheme).trim();
    if (status !== undefined) {
      if (!VALID_ROADMAP_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_ROADMAP_STATUSES.join(', ')}` });
      }
      roadmap.status = status;
    }
    await roadmap.save();
    return res.json(roadmap);
  } catch (err) {
    console.error('[roadmaps] PATCH /:id:', err.message);
    return res.status(500).json({ error: 'Failed to update roadmap' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid roadmap ID' });
    const roadmap = await Roadmap.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
    await Promise.all([
      RoadmapStage.deleteMany({ roadmapId: roadmap._id }),
      RoadmapItem.deleteMany({ roadmapId: roadmap._id }),
    ]);
    return res.json({ message: 'Roadmap deleted' });
  } catch (err) {
    console.error('[roadmaps] DELETE /:id:', err.message);
    return res.status(500).json({ error: 'Failed to delete roadmap' });
  }
});

// ── Stages under roadmap ───────────────────────────────

router.post('/:id/stages', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid roadmap ID' });
    const roadmap = await Roadmap.findOne({ _id: req.params.id, userId: req.user._id });
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
    const { title, order } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Stage title is required' });
    let nextOrder;
    if (order !== undefined) {
      nextOrder = Number(order);
    } else {
      const last = await RoadmapStage.findOne({ roadmapId: roadmap._id }).sort({ order: -1 });
      nextOrder = last ? last.order + 1 : 0;
    }
    const stage = await RoadmapStage.create({
      roadmapId: roadmap._id,
      userId: req.user._id,
      title: String(title).trim(),
      order: nextOrder,
    });
    return res.status(201).json(stage);
  } catch (err) {
    console.error('[roadmaps] POST /:id/stages:', err.message);
    return res.status(500).json({ error: 'Failed to create stage' });
  }
});

// ── Items under roadmap ────────────────────────────────

router.post('/:id/items', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid roadmap ID' });
    const roadmap = await Roadmap.findOne({ _id: req.params.id, userId: req.user._id });
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
    const { title, description, resourceType, url, platform, stageId, order, status, priority, estimatedHours, notes, tags } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Item title is required' });
    if (resourceType && !VALID_RESOURCE_TYPES.includes(resourceType)) {
      return res.status(400).json({ error: `resourceType must be one of: ${VALID_RESOURCE_TYPES.join(', ')}` });
    }
    if (status && !VALID_ITEM_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_ITEM_STATUSES.join(', ')}` });
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
    }
    if (stageId) {
      if (!isValidObjectId(stageId)) return res.status(400).json({ error: 'Invalid stage ID' });
      const stage = await RoadmapStage.findOne({ _id: stageId, roadmapId: roadmap._id, userId: req.user._id });
      if (!stage) return res.status(404).json({ error: 'Stage not found in this roadmap' });
    }
    let nextOrder;
    if (order !== undefined) {
      nextOrder = Number(order);
    } else {
      const last = await RoadmapItem.findOne({ roadmapId: roadmap._id, stageId: stageId || null }).sort({ order: -1 });
      nextOrder = last ? last.order + 1 : 0;
    }
    const item = await RoadmapItem.create({
      roadmapId: roadmap._id,
      stageId: stageId || null,
      userId: req.user._id,
      title: String(title).trim(),
      description: description ? String(description).trim() : '',
      resourceType: resourceType || 'custom',
      url: url ? String(url).trim() : '',
      platform: platform ? String(platform).trim() : '',
      order: nextOrder,
      status: status || 'planned',
      priority: priority || 'medium',
      estimatedHours: estimatedHours !== undefined ? Number(estimatedHours) : null,
      notes: notes ? String(notes).trim() : '',
      tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
    });
    await recalcProgress(roadmap._id);
    return res.status(201).json(item);
  } catch (err) {
    console.error('[roadmaps] POST /:id/items:', err.message);
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

// ── Reorder ────────────────────────────────────────────

router.post('/:id/reorder', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid roadmap ID' });
    const roadmap = await Roadmap.findOne({ _id: req.params.id, userId: req.user._id });
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
    const { type, orderedIds } = req.body;
    if (!['stages', 'items'].includes(type)) return res.status(400).json({ error: 'type must be "stages" or "items"' });
    if (!Array.isArray(orderedIds) || !orderedIds.length) {
      return res.status(400).json({ error: 'orderedIds must be a non-empty array' });
    }
    if (orderedIds.some(id => !isValidObjectId(id))) return res.status(400).json({ error: 'orderedIds contains invalid IDs' });
    const Model = type === 'stages' ? RoadmapStage : RoadmapItem;
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, roadmapId: roadmap._id, userId: req.user._id },
        update: { $set: { order: index } },
      },
    }));
    await Model.bulkWrite(ops, { ordered: false });
    return res.json({ message: 'Reordered' });
  } catch (err) {
    console.error('[roadmaps] POST /:id/reorder:', err.message);
    return res.status(500).json({ error: 'Failed to reorder' });
  }
});

// ── Progress ───────────────────────────────────────────

router.get('/:id/progress', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid roadmap ID' });
    const roadmap = await Roadmap.findOne({ _id: req.params.id, userId: req.user._id });
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });
    const [stages, items] = await Promise.all([
      RoadmapStage.find({ roadmapId: roadmap._id }).sort({ order: 1 }),
      RoadmapItem.find({ roadmapId: roadmap._id }),
    ]);
    const nonSkipped = items.filter(i => i.status !== 'skipped');
    const completed = nonSkipped.filter(i => i.status === 'completed');
    const progressPercent = nonSkipped.length > 0 ? Math.round((completed.length / nonSkipped.length) * 100) : 0;
    const stageProgress = stages.map(stage => {
      const stageItems = items.filter(i => String(i.stageId) === String(stage._id));
      const stageNonSkipped = stageItems.filter(i => i.status !== 'skipped');
      const stageCompleted = stageNonSkipped.filter(i => i.status === 'completed');
      return {
        stageId: stage._id,
        title: stage.title,
        order: stage.order,
        totalItems: stageItems.length,
        completedItems: stageCompleted.length,
        progressPercent: stageNonSkipped.length > 0 ? Math.round((stageCompleted.length / stageNonSkipped.length) * 100) : 0,
        isComplete: stageNonSkipped.length > 0 && stageCompleted.length === stageNonSkipped.length,
      };
    });
    return res.json({
      roadmapId: roadmap._id,
      progressPercent,
      total: items.length,
      completed: completed.length,
      active: items.filter(i => i.status === 'active').length,
      planned: items.filter(i => i.status === 'planned').length,
      skipped: items.filter(i => i.status === 'skipped').length,
      stageProgress,
    });
  } catch (err) {
    console.error('[roadmaps] GET /:id/progress:', err.message);
    return res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

module.exports = router;
