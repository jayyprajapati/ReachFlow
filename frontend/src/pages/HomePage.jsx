import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import {
  Briefcase, Clock, FileText, Send, PenLine, Users, Compass,
  ArrowUpRight, AlertCircle, Calendar, Mail, FileSearch,
  CheckCircle2, AlertTriangle, Sparkles, Plus,
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────
   Utilities
   ────────────────────────────────────────────────────────── */

function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 5)  return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night';
}

function relativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  const hrs  = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const fwd = ms > 0;
  if (mins < 1)  return fwd ? 'in <1 min' : 'just now';
  if (mins < 60) return fwd ? `in ${mins}m` : `${mins}m ago`;
  if (hrs  < 24) return fwd ? `in ${hrs}h` : `${hrs}h ago`;
  if (days < 14) return fwd ? `in ${days}d` : `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function daysSince(iso) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86400000);
}

const ACTIVE_STATUSES = new Set(['applied', 'oa', 'interviewing']);
const STATUS_LABEL = {
  applied: 'Applied',
  oa: 'OA',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
  on_hold: 'On Hold',
};

/* ──────────────────────────────────────────────────────────
   HomePage
   ────────────────────────────────────────────────────────── */

export default function HomePage() {
  const {
    API_BASE, authedFetch,
    appUser,
    gmailConnected,
    groups, loadGroups,
    drafts, loadDrafts,
    scheduled, loadScheduled,
    history, loadHistory,
    templates, loadTemplates,
  } = useApp();
  const { navigateTo } = useRouter();

  const [apps, setApps] = useState([]);
  const [roadmaps, setRoadmaps] = useState([]);
  const [llmValid, setLlmValid] = useState(null);

  // Load everything the dashboard needs in parallel, silently.
  useEffect(() => {
    loadGroups();
    loadDrafts();
    loadScheduled();
    loadHistory();
    loadTemplates();

    let cancel = false;
    authedFetch(`${API_BASE}/api/applications`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (!cancel) setApps(Array.isArray(d) ? d : []); })
      .catch(() => {});
    authedFetch(`${API_BASE}/api/roadmaps`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (!cancel) setRoadmaps(Array.isArray(d) ? d : []); })
      .catch(() => {});
    authedFetch(`${API_BASE}/api/settings/ai`)
      .then(r => r.json())
      .then(d => { if (!cancel) setLlmValid(d?.isValid === true); })
      .catch(() => { if (!cancel) setLlmValid(false); });

    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Derived data ────────────────────────────────────── */

  const firstName = useMemo(() => {
    const dn = appUser?.displayName || appUser?.email?.split('@')[0] || '';
    return dn.split(/[\s._-]/).filter(Boolean)[0] || 'there';
  }, [appUser]);

  const stats = useMemo(() => {
    const inFlight = apps.filter(a => ACTIVE_STATUSES.has(a.status)).length;
    const weekMs = 7 * 86400000;
    const sentWeek = history.filter(h => {
      const t = new Date(h.updated_at || h.created_at).getTime();
      return !isNaN(t) && (Date.now() - t < weekMs);
    }).length;
    return {
      inFlight,
      sentWeek,
      drafts: drafts.length,
      scheduled: scheduled.length,
    };
  }, [apps, history, drafts, scheduled]);

  const focusItems = useMemo(() => {
    const items = [];

    // Scheduled (urgent — next 7 days)
    scheduled.forEach(s => {
      if (!s.scheduledAt) return;
      const days = Math.ceil((new Date(s.scheduledAt) - Date.now()) / 86400000);
      if (days < 0 || days > 7) return;
      items.push({
        key: `sch-${s.id}`,
        kind: days <= 1 ? 'accent' : 'info',
        priority: days <= 1 ? 1 : 2,
        icon: Calendar,
        title: s.subject || 'Scheduled campaign',
        meta: `Sends ${relativeTime(s.scheduledAt)} · ${s.recipient_count} recipient${s.recipient_count === 1 ? '' : 's'}`,
        onClick: () => navigateTo('/compose'),
      });
    });

    // Stale active applications (>14d, in active statuses)
    apps.forEach(a => {
      if (!ACTIVE_STATUSES.has(a.status)) return;
      const last = a.updated_at || a.created_at;
      const d = daysSince(last);
      if (d < 14 || d === Infinity) return;
      items.push({
        key: `app-${a.id}`,
        kind: d > 30 ? 'alert' : 'warn',
        priority: d > 30 ? 1 : 3,
        icon: Briefcase,
        title: a.title || a.companyName || 'Application',
        meta: `${STATUS_LABEL[a.status] || a.status} · last touched ${relativeTime(last)}${a.companyName && a.title ? ` · ${a.companyName}` : ''}`,
        onClick: () => navigateTo('/pipeline'),
      });
    });

    // Drafts not sent (oldest first)
    [...drafts]
      .sort((a, b) => new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at))
      .slice(0, 3)
      .forEach(d => {
        items.push({
          key: `draft-${d.id}`,
          kind: 'default',
          priority: 4,
          icon: PenLine,
          title: d.subject || 'Untitled draft',
          meta: `Draft · ${d.recipient_count || 0} recipient${(d.recipient_count || 0) === 1 ? '' : 's'} · saved ${relativeTime(d.updated_at || d.created_at)}`,
          onClick: () => navigateTo('/compose'),
        });
      });

    // Companies with zero contacts
    groups
      .filter(g => (g.contactCount || 0) === 0)
      .slice(0, 2)
      .forEach(g => {
        items.push({
          key: `grp-${g.id}`,
          kind: 'default',
          priority: 5,
          icon: Users,
          title: g.companyName,
          meta: 'No contacts yet · add HR or recruiter contacts to enable outreach',
          onClick: () => navigateTo(`/contacts/${g.id}`),
        });
      });

    // Stale roadmaps (active, not touched in >7 days)
    roadmaps.forEach(rm => {
      if (rm.status && rm.status !== 'active') return;
      const last = rm.updatedAt || rm.createdAt;
      const d = daysSince(last);
      if (d < 7 || d === Infinity) return;
      items.push({
        key: `rm-${rm._id || rm.id}`,
        kind: 'default',
        priority: 6,
        icon: Compass,
        title: rm.title || 'Active roadmap',
        meta: `${rm.progressPercent ?? 0}% complete · not updated in ${d}d`,
        onClick: () => navigateTo(`/roadmaps/${rm._id || rm.id}`),
      });
    });

    return items.sort((a, b) => a.priority - b.priority).slice(0, 6);
  }, [scheduled, apps, drafts, groups, roadmaps, navigateTo]);

  // Recently sent (this week)
  const recentSent = useMemo(() => {
    return history
      .filter(h => h.status === 'sent')
      .slice(0, 4);
  }, [history]);

  // Active roadmaps
  const activeRoadmaps = useMemo(() => {
    return roadmaps
      .filter(rm => !rm.status || rm.status === 'active')
      .sort((a, b) => (b.progressPercent ?? 0) - (a.progressPercent ?? 0))
      .slice(0, 3);
  }, [roadmaps]);

  const integrationsHealthy = gmailConnected && llmValid;

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="rf-page">
      <div className="rf-home">
        {/* Hero */}
        <header className="rf-home__hero">
          <div>
            <div className="rf-home__hi-eyebrow">
              <Sparkles size={11} strokeWidth={2.2} /> Today · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <h1 className="rf-home__hi-title">
              {greetingFor()}, <em>{firstName}</em>.
            </h1>
            <p className="rf-home__hi-sub">
              {focusItems.length === 0
                ? 'You\'re all caught up. Below is a snapshot of your week — pick something to move forward.'
                : `${focusItems.length} thing${focusItems.length === 1 ? '' : 's'} need your attention. Start at the top.`
              }
            </p>
          </div>

          <div className="rf-home__hero-status">
            <button
              className={`rf-home__status-pill${integrationsHealthy ? '' : ' rf-home__status-pill--warn'}`}
              onClick={() => navigateTo('/settings')}
              title={integrationsHealthy ? 'All systems connected' : 'Some integrations need attention'}
            >
              {integrationsHealthy
                ? <CheckCircle2 size={14} />
                : <AlertTriangle size={14} />}
              <span>
                {gmailConnected ? 'Gmail' : 'Gmail off'}
                {' · '}
                {llmValid === null ? 'Checking AI…' : llmValid ? 'AI ready' : 'AI off'}
              </span>
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="rf-home__stats">
          <Stat
            icon={Briefcase}
            label="In-flight apps"
            value={stats.inFlight}
            sub="Applied · OA · Interviewing"
            onClick={() => navigateTo('/pipeline')}
          />
          <Stat
            icon={Send}
            label="Sent this week"
            value={stats.sentWeek}
            sub="Across all campaigns"
            onClick={() => navigateTo('/compose')}
          />
          <Stat
            icon={PenLine}
            label="Open drafts"
            value={stats.drafts}
            sub="Ready to finish"
            onClick={() => navigateTo('/compose')}
          />
          <Stat
            icon={Calendar}
            label="Scheduled"
            value={stats.scheduled}
            sub="Sends queued"
            onClick={() => navigateTo('/compose')}
          />
        </div>

        {/* Main grid */}
        <div className="rf-home__grid">
          {/* Focus stream */}
          <section className="rf-home__focus">
            {/* Jump-in tiles — primary entry points */}
            <div className="rf-home__section-head">
              <div className="rf-home__section-title">Jump in</div>
            </div>
            <div className="rf-home__tiles">
              <Tile icon={PenLine}    title="New email"          desc="Compose with templates, variables, AI rewrite."   onClick={() => navigateTo('/compose')} />
              <Tile icon={Briefcase}  title="Track application"  desc="Drop a job link or paste a list into Pipeline."   onClick={() => navigateTo('/pipeline')} />
              <Tile icon={Users}      title="Add contact"        desc="Build a company group with HR + recruiter info."  onClick={() => navigateTo('/contacts')} />
              <Tile icon={FileSearch} title="Analyze a JD"       desc="Tailor your resume against a job description."    onClick={() => navigateTo('/resume-lab')} locked />
              <Tile icon={Compass}    title="Push a roadmap"     desc="Move a learning track forward today."             onClick={() => navigateTo('/roadmaps')} />
            </div>

            {/* Up-next focus list */}
            <div className="rf-home__section-head" style={{ marginTop: 'var(--rf-sp-6)' }}>
              <div className="rf-home__section-title">
                Up next
                <span className="rf-home__section-count">{focusItems.length}</span>
              </div>
            </div>

            {focusItems.length === 0 ? (
              <div className="rf-home__focus-empty">
                <strong>Nothing pressing.</strong>
                Start a new outreach, log a fresh application, or push your roadmap forward — use a tile above.
              </div>
            ) : (
              focusItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    className={`rf-home__card${item.kind && item.kind !== 'default' ? ' rf-home__card--' + item.kind : ''}`}
                    onClick={item.onClick}
                  >
                    <span className="rf-home__card-icon"><Icon size={18} strokeWidth={1.8} /></span>
                    <span className="rf-home__card-body">
                      <span className="rf-home__card-title">{item.title}</span>
                      <span className="rf-home__card-meta">{item.meta}</span>
                    </span>
                    <ArrowUpRight size={16} className="rf-home__card-go" />
                  </button>
                );
              })
            )}
          </section>

          {/* Side rail */}
          <aside className="rf-home__rail">
            <div className="rf-home__rail-card">
              <div className="rf-home__rail-title">This week</div>
              <div className="rf-home__rail-stat">
                <span className="rf-home__rail-stat-label">Emails sent</span>
                <span className="rf-home__rail-stat-value">{stats.sentWeek}</span>
              </div>
              <div className="rf-home__rail-stat">
                <span className="rf-home__rail-stat-label">Companies tracked</span>
                <span className="rf-home__rail-stat-value">{groups.length}</span>
              </div>
              <div className="rf-home__rail-stat">
                <span className="rf-home__rail-stat-label">Active roadmaps</span>
                <span className="rf-home__rail-stat-value">{activeRoadmaps.length}</span>
              </div>
              <div className="rf-home__rail-stat">
                <span className="rf-home__rail-stat-label">Templates</span>
                <span className="rf-home__rail-stat-value">{templates.length}</span>
              </div>
            </div>

            {recentSent.length > 0 && (
              <div className="rf-home__rail-card">
                <div className="rf-home__rail-title">Recently sent</div>
                {recentSent.map(h => (
                  <button
                    key={h.id}
                    className="rf-home__rail-link"
                    onClick={() => navigateTo('/compose')}
                    title={h.subject}
                  >
                    <Mail size={15} className="rf-home__rail-link-icon" />
                    <span className="rf-truncate" style={{ flex: 1, fontSize: 'var(--rf-text-sm)' }}>
                      {h.subject || 'Untitled campaign'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--rf-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                      {relativeTime(h.updated_at || h.created_at)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {activeRoadmaps.length > 0 && (
              <div className="rf-home__rail-card">
                <div className="rf-home__rail-title">Active roadmaps</div>
                {activeRoadmaps.map(rm => (
                  <button
                    key={rm._id || rm.id}
                    className="rf-home__rail-link"
                    onClick={() => navigateTo(`/roadmaps/${rm._id || rm.id}`)}
                  >
                    <Compass size={15} className="rf-home__rail-link-icon" />
                    <span className="rf-truncate" style={{ flex: 1, fontSize: 'var(--rf-text-sm)' }}>
                      {rm.title || 'Untitled roadmap'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--rf-text-muted)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {rm.progressPercent ?? 0}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────────────── */

function Stat({ icon: Icon, label, value, sub, onClick }) {
  return (
    <button className="rf-home__stat" onClick={onClick}>
      <span className="rf-home__stat-label">
        <Icon size={12} strokeWidth={2.2} />
        {label}
      </span>
      <span className="rf-home__stat-value">{value}</span>
      <span className="rf-home__stat-sub">{sub}</span>
    </button>
  );
}

function Tile({ icon: Icon, title, desc, onClick, locked }) {
  if (locked) {
    return (
      <button
        className="rf-home__tile rf-home__tile--locked"
        aria-disabled="true"
        type="button"
        title="Feature coming soon"
        onClick={(e) => e.preventDefault()}
      >
        <span className="rf-home__tile-icon"><Icon size={18} strokeWidth={1.8} /></span>
        <span className="rf-home__tile-title">{title} <LockMark /></span>
        <span className="rf-home__tile-desc">{desc}</span>
      </button>
    );
  }
  return (
    <button className="rf-home__tile" onClick={onClick}>
      <span className="rf-home__tile-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="rf-home__tile-title">{title}</span>
      <span className="rf-home__tile-desc">{desc}</span>
    </button>
  );
}

function LockMark() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 6, color: 'var(--rf-text-faint)' }} aria-hidden="true">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </span>
  );
}
