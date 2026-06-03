'use strict';

/**
 * today.js — single aggregation endpoint for the Today page.
 *
 * Replaces six client-side fan-out calls (groups, drafts, scheduled, history,
 * applications, roadmaps, ai settings, JD analyses, DSA analyses) with one
 * authenticated roundtrip. Keep the response surface small — the Today page
 * only needs counters and a handful of "next action" rows; deep detail pages
 * stay on their own routes.
 */

const express = require('express');
const {
  Campaign,
  Application,
  Group,
  Roadmap,
  Template,
  AISettings,
  ResumeAnalysis,
  DsaAnalysis,
} = require('../db');
const { decryptJson, isEncryptedEnvelope } = require('../utils/dataSecurity');

const router = express.Router();

const ACTIVE_APP_STATUSES = new Set(['applied', 'oa', 'interviewing']);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_APP_DAYS = 14;

function safeSubject(row) {
  try {
    if (isEncryptedEnvelope(row.encryptedPayload)) {
      const decrypted = decryptJson(row.encryptedPayload);
      return String(decrypted?.subject || row.subject || '').trim();
    }
  } catch { /* swallow */ }
  return String(row.subject || '').trim();
}

function decryptAppCompany(app) {
  try {
    if (isEncryptedEnvelope(app.encryptedPayload)) {
      const d = decryptJson(app.encryptedPayload) || {};
      return {
        title: String(d.jobTitle || ''),
        company: String(d.companyNameSnapshot || app.companyNameSnapshot || ''),
      };
    }
  } catch { /* swallow */ }
  return {
    title: String(app.jobTitle || ''),
    company: String(app.companyNameSnapshot || ''),
  };
}

router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const now = Date.now();
    const weekAgo = new Date(now - WEEK_MS);

    const [
      sentThisWeek,
      draftCount,
      scheduledUpcoming,
      apps,
      groupCount,
      groupsZero,
      templateCount,
      activeRoadmaps,
      topRoadmap,
      jdCount,
      latestJd,
      dsaCount,
      latestDsa,
      ai,
    ] = await Promise.all([
      Campaign.countDocuments({ userId, status: 'sent', updated_at: { $gte: weekAgo } }),
      Campaign.countDocuments({ userId, status: 'draft' }),
      Campaign.find({ userId, status: 'scheduled', scheduledAt: { $ne: null } })
        .sort({ scheduledAt: 1 })
        .limit(3)
        .lean(),
      Application.find({ userId }).sort({ updatedAt: -1 }).lean(),
      Group.countDocuments({ userId }),
      Group.find({ userId, $or: [{ contactCount: 0 }, { contactCount: { $exists: false } }] })
        .sort({ updatedAt: -1 })
        .limit(2)
        .lean(),
      Template.countDocuments({ userId }),
      Roadmap.countDocuments({ userId, status: 'active' }),
      Roadmap.findOne({ userId, status: 'active' }).sort({ updatedAt: -1 }).lean(),
      ResumeAnalysis.countDocuments({ userId }),
      ResumeAnalysis.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      DsaAnalysis.countDocuments({ userId }),
      DsaAnalysis.findOne({ userId }).sort({ createdAt: -1 }).lean(),
      AISettings.findOne({ userId }).lean(),
    ]);

    // Latest sent campaign
    const lastSent = await Campaign.findOne({ userId, status: 'sent' })
      .sort({ updated_at: -1 })
      .lean();

    // ── Pipeline derived stats ────────────────────────────────────────
    const inFlight = apps.filter((a) => ACTIVE_APP_STATUSES.has(a.status)).length;
    const staleApps = apps
      .filter((a) => {
        if (!ACTIVE_APP_STATUSES.has(a.status)) return false;
        const t = new Date(a.updatedAt || a.createdAt).getTime();
        if (!t) return false;
        const days = Math.floor((now - t) / (24 * 60 * 60 * 1000));
        return days >= STALE_APP_DAYS;
      })
      .slice(0, 4)
      .map((a) => {
        const { title, company } = decryptAppCompany(a);
        const t = new Date(a.updatedAt || a.createdAt).getTime();
        return {
          id: a._id.toString(),
          title,
          company,
          status: a.status,
          daysStale: Math.floor((now - t) / (24 * 60 * 60 * 1000)),
        };
      });

    // ── Build focus list (priority-ordered) ───────────────────────────
    const focus = [];

    // 1. Overdue / very-soon scheduled campaigns
    for (const s of scheduledUpcoming) {
      const when = new Date(s.scheduledAt).getTime();
      const hours = (when - now) / (60 * 60 * 1000);
      if (hours <= 24) {
        focus.push({
          key: `sch-${s._id}`,
          kind: hours <= 0 ? 'alert' : 'accent',
          icon: 'calendar',
          priority: hours <= 0 ? 0 : 1,
          title: safeSubject(s) || 'Scheduled campaign',
          meta: hours <= 0
            ? `Was due ${formatRelative(when)} · ${s.recipient_count || 0} recipient${(s.recipient_count || 0) === 1 ? '' : 's'}`
            : `Sends ${formatRelative(when)} · ${s.recipient_count || 0} recipient${(s.recipient_count || 0) === 1 ? '' : 's'}`,
          route: '/compose',
        });
      }
    }

    // 2. Stale active apps (oldest first inside the slice)
    staleApps
      .sort((a, b) => b.daysStale - a.daysStale)
      .slice(0, 2)
      .forEach((a) => {
        focus.push({
          key: `app-${a.id}`,
          kind: a.daysStale > 30 ? 'alert' : 'warn',
          icon: 'briefcase',
          priority: 2,
          title: a.title || a.company || 'Application',
          meta: `${labelStatus(a.status)} · last touched ${a.daysStale}d ago${a.company ? ' · ' + a.company : ''}`,
          route: '/pipeline',
        });
      });

    // 3. Companies with zero contacts
    groupsZero.slice(0, 1).forEach((g) => {
      focus.push({
        key: `grp-${g._id}`,
        kind: 'default',
        icon: 'users',
        priority: 3,
        title: g.companyName,
        meta: 'No contacts yet — add HR or recruiter to enable outreach',
        route: `/contacts/${g._id}`,
      });
    });

    focus.sort((a, b) => a.priority - b.priority);

    // ── Build "recent" feed (small, mixed) ────────────────────────────
    const recent = [];
    if (lastSent) {
      recent.push({
        kind: 'sent',
        title: safeSubject(lastSent) || 'Untitled campaign',
        meta: `Sent ${formatRelative(new Date(lastSent.updated_at).getTime())} · ${lastSent.recipient_count || 0} recipient${(lastSent.recipient_count || 0) === 1 ? '' : 's'}`,
        when: lastSent.updated_at,
        route: '/compose',
      });
    }
    if (latestJd) {
      recent.push({
        kind: 'jd',
        title: latestJd.extractedJobMetadata?.title || 'Job description analysis',
        meta: `${latestJd.matchScore || 0}% match${latestJd.extractedJobMetadata?.company ? ' · ' + latestJd.extractedJobMetadata.company : ''}`,
        when: latestJd.createdAt,
        score: latestJd.matchScore || 0,
        route: '/resume-lab',
      });
    }
    if (latestDsa) {
      recent.push({
        kind: 'dsa',
        title: latestDsa.problemTitle || 'DSA problem',
        meta: latestDsa.isOptimal === true
          ? 'Marked optimal'
          : latestDsa.isOptimal === false
            ? 'Needs improvement'
            : 'Analyzed',
        when: latestDsa.createdAt,
        isOptimal: latestDsa.isOptimal,
        route: '/dsa-lab',
      });
    }
    recent.sort((a, b) => new Date(b.when) - new Date(a.when));

    // ── Integrations ──────────────────────────────────────────────────
    // Mirror /auth/me: refresh token presence is the source of truth.
    const gmailConnected = !!(req.user.encryptedRefreshToken || req.user.gmailConnected);
    const llmValid = !!(ai && ai.isValid);

    const firstName = (() => {
      const dn = req.user.displayName || (req.user.email || '').split('@')[0] || '';
      return dn.split(/[\s._-]/).filter(Boolean)[0] || '';
    })();

    res.json({
      user: { firstName, email: req.user.email || '' },
      integrations: { gmailConnected, llmValid },
      stats: {
        inFlight,
        sentThisWeek,
        drafts: draftCount,
        scheduled: scheduledUpcoming.length, // upcoming only; small + truthful
        jdAnalyses: jdCount,
        dsaAnalyses: dsaCount,
        activeRoadmaps,
        companies: groupCount,
        templates: templateCount,
      },
      focus,
      recent,
      topRoadmap: topRoadmap
        ? {
            id: topRoadmap._id.toString(),
            title: topRoadmap.title,
            progressPercent: topRoadmap.progressPercent ?? 0,
            updatedAt: topRoadmap.updatedAt,
          }
        : null,
      topJd: latestJd
        ? {
            id: latestJd._id.toString(),
            jobTitle: latestJd.extractedJobMetadata?.title || '',
            company: latestJd.extractedJobMetadata?.company || '',
            matchScore: latestJd.matchScore || 0,
            createdAt: latestJd.createdAt,
          }
        : null,
      topDsa: latestDsa
        ? {
            id: latestDsa._id.toString(),
            problemTitle: latestDsa.problemTitle || '',
            isOptimal: latestDsa.isOptimal,
            hasUserCode: !!latestDsa.hasUserCode,
            createdAt: latestDsa.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error('[today] aggregation failed:', err.message);
    res.status(500).json({ error: 'Failed to load Today snapshot' });
  }
});

function labelStatus(s) {
  return {
    applied: 'Applied',
    oa: 'OA',
    interviewing: 'Interviewing',
    offer: 'Offer',
    rejected: 'Rejected',
    ghosted: 'Ghosted',
    on_hold: 'On Hold',
  }[s] || s;
}

function formatRelative(ts) {
  const now = Date.now();
  const ms = ts - now;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const fwd = ms > 0;
  if (mins < 1) return fwd ? 'in <1 min' : 'just now';
  if (mins < 60) return fwd ? `in ${mins}m` : `${mins}m ago`;
  if (hrs < 24) return fwd ? `in ${hrs}h` : `${hrs}h ago`;
  if (days < 14) return fwd ? `in ${days}d` : `${days}d ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

module.exports = router;
