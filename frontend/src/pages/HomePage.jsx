import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useRouter } from '../router.jsx';
import {
  Briefcase, PenLine, Users, Compass, Calendar,
  ArrowUpRight, AlertCircle, Mail, FileSearch, Binary,
  CheckCircle2, AlertTriangle, Sparkles,
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────
   Today page — single-fetch, hierarchy-driven layout.
   All data comes from GET /api/today; no fan-out.
   ────────────────────────────────────────────────────────── */

const ICONS = {
  calendar: Calendar,
  briefcase: Briefcase,
  users: Users,
  mail: Mail,
  compass: Compass,
};

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
  const fwd  = ms > 0;
  if (mins < 1)  return fwd ? 'in <1 min' : 'just now';
  if (mins < 60) return fwd ? `in ${mins}m` : `${mins}m ago`;
  if (hrs  < 24) return fwd ? `in ${hrs}h` : `${hrs}h ago`;
  if (days < 14) return fwd ? `in ${days}d` : `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HomePage() {
  const { API_BASE, authedFetch, appUser } = useApp();
  const { navigateTo } = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    authedFetch(`${API_BASE}/api/today`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancel && d) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = useMemo(() => {
    if (data?.user?.firstName) return data.user.firstName;
    const dn = appUser?.displayName || appUser?.email?.split('@')[0] || '';
    return dn.split(/[\s._-]/).filter(Boolean)[0] || 'there';
  }, [data, appUser]);

  const focus    = data?.focus    || [];
  const recent   = data?.recent   || [];
  const stats    = data?.stats    || {};
  const topJd    = data?.topJd    || null;
  const topDsa   = data?.topDsa   || null;
  const topRm    = data?.topRoadmap || null;
  const gmailOk  = data?.integrations?.gmailConnected;
  const aiOk     = data?.integrations?.llmValid;
  const hasAttention = !gmailOk || !aiOk;

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="rf-page">
      <div className="rf-today">
        {/* Hero — minimal, breathing room */}
        <header className="rf-today__hero">
          <div className="rf-today__eyebrow">
            <span className="rf-today__eyebrow-dot" />
            {todayLabel}
          </div>
          <h1 className="rf-today__title">
            {greetingFor()},{' '}
            <em>{firstName}</em>.
          </h1>
          <p className="rf-today__sub">
            {loading
              ? 'Pulling your snapshot…'
              : focus.length === 0
                ? 'You\'re clear. Pick one of the moves below.'
                : `${focus.length} thing${focus.length === 1 ? '' : 's'} need a quick decision today.`}
          </p>
        </header>

        {/* Primary moves — three big, opinionated actions. No tile grid soup. */}
        <section className="rf-today__moves">
          <button className="rf-today__move rf-today__move--primary" onClick={() => navigateTo('/compose')}>
            <span className="rf-today__move-icon"><PenLine size={20} strokeWidth={1.8} /></span>
            <span className="rf-today__move-text">
              <span className="rf-today__move-title">Send outreach</span>
              <span className="rf-today__move-sub">Compose with templates · AI rewrite</span>
            </span>
            <ArrowUpRight size={16} className="rf-today__move-go" />
          </button>
          <button className="rf-today__move" onClick={() => navigateTo('/resume-lab')}>
            <span className="rf-today__move-icon"><FileSearch size={20} strokeWidth={1.8} /></span>
            <span className="rf-today__move-text">
              <span className="rf-today__move-title">
                Analyze a JD <span className="rf-today__move-badge">New</span>
              </span>
              <span className="rf-today__move-sub">Tailor your resume to a job description</span>
            </span>
            <ArrowUpRight size={16} className="rf-today__move-go" />
          </button>
          <button className="rf-today__move" onClick={() => navigateTo('/pipeline')}>
            <span className="rf-today__move-icon"><Briefcase size={20} strokeWidth={1.8} /></span>
            <span className="rf-today__move-text">
              <span className="rf-today__move-title">Log an application</span>
              <span className="rf-today__move-sub">Drop a job link or paste a list</span>
            </span>
            <ArrowUpRight size={16} className="rf-today__move-go" />
          </button>
        </section>

        {/* Snapshot — quiet stats strip. Not the focal point. */}
        <section className="rf-today__snapshot" aria-label="This week snapshot">
          <Snap label="In flight"     value={stats.inFlight ?? 0}     onClick={() => navigateTo('/pipeline')} />
          <Snap label="Sent · 7d"      value={stats.sentThisWeek ?? 0} onClick={() => navigateTo('/compose')} />
          <Snap label="JD analyses"   value={stats.jdAnalyses ?? 0}    onClick={() => navigateTo('/resume-lab')} />
          <Snap label="DSA analyses"  value={stats.dsaAnalyses ?? 0}   onClick={() => navigateTo('/dsa-lab')} />
          <Snap label="Roadmaps"       value={stats.activeRoadmaps ?? 0} onClick={() => navigateTo('/roadmaps')} />
          <Snap label="Companies"     value={stats.companies ?? 0}     onClick={() => navigateTo('/contacts')} />
        </section>

        {/* Pick up where you left off — surfaces JD / DSA / sent. Up to 3 rows. */}
        {(recent.length > 0 || topJd || topDsa || topRm) && (
          <section className="rf-today__section">
            <div className="rf-today__section-head">
              <span className="rf-today__section-title">Pick up where you left off</span>
            </div>
            <div className="rf-today__resume">
              {topJd && (
                <button
                  className="rf-today__resume-card rf-today__resume-card--jd"
                  onClick={() => navigateTo('/resume-lab')}
                >
                  <span className="rf-today__resume-kind">JD Analysis</span>
                  <span className="rf-today__resume-title rf-truncate">
                    {topJd.jobTitle || 'Untitled role'}
                  </span>
                  <span className="rf-today__resume-meta">
                    {topJd.company || '—'} · {relativeTime(topJd.createdAt)}
                  </span>
                  <span className="rf-today__resume-score">
                    <span className="rf-today__score-bar">
                      <span
                        className="rf-today__score-fill"
                        style={{ width: `${Math.max(0, Math.min(100, topJd.matchScore))}%` }}
                      />
                    </span>
                    <span className="rf-today__score-num">{topJd.matchScore}%</span>
                  </span>
                </button>
              )}
              {topDsa && (
                <button
                  className="rf-today__resume-card rf-today__resume-card--dsa"
                  onClick={() => navigateTo('/dsa-lab')}
                >
                  <span className="rf-today__resume-kind">DSA Analysis</span>
                  <span className="rf-today__resume-title rf-truncate">
                    {topDsa.problemTitle || 'Untitled problem'}
                  </span>
                  <span className="rf-today__resume-meta">
                    {topDsa.hasUserCode ? 'Your code · ' : ''}{relativeTime(topDsa.createdAt)}
                  </span>
                  <span className={`rf-today__resume-tag rf-today__resume-tag--${topDsa.isOptimal === true ? 'ok' : topDsa.isOptimal === false ? 'warn' : 'neutral'}`}>
                    {topDsa.isOptimal === true
                      ? <><CheckCircle2 size={11} /> Optimal</>
                      : topDsa.isOptimal === false
                        ? <><AlertTriangle size={11} /> Improve</>
                        : <><Binary size={11} /> Analyzed</>}
                  </span>
                </button>
              )}
              {topRm && (
                <button
                  className="rf-today__resume-card rf-today__resume-card--roadmap"
                  onClick={() => navigateTo(`/roadmaps/${topRm.id}`)}
                >
                  <span className="rf-today__resume-kind">Roadmap</span>
                  <span className="rf-today__resume-title rf-truncate">{topRm.title}</span>
                  <span className="rf-today__resume-meta">Updated {relativeTime(topRm.updatedAt)}</span>
                  <span className="rf-today__resume-score">
                    <span className="rf-today__score-bar">
                      <span
                        className="rf-today__score-fill"
                        style={{ width: `${Math.max(0, Math.min(100, topRm.progressPercent))}%` }}
                      />
                    </span>
                    <span className="rf-today__score-num">{topRm.progressPercent}%</span>
                  </span>
                </button>
              )}
            </div>

            {recent.length > 0 && (
              <ul className="rf-today__feed">
                {recent.slice(0, 3).map((r, i) => (
                  <li key={`${r.kind}-${i}`}>
                    <button className="rf-today__feed-row" onClick={() => navigateTo(r.route)}>
                      <span className={`rf-today__feed-dot rf-today__feed-dot--${r.kind}`} />
                      <span className="rf-today__feed-title rf-truncate">{r.title}</span>
                      <span className="rf-today__feed-meta">{r.meta}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Priority focus — moved to the bottom so it doesn't crowd the page top. */}
        {focus.length > 0 && (
          <section className="rf-today__section">
            <div className="rf-today__section-head">
              <span className="rf-today__section-title">Up next</span>
              <span className="rf-today__section-count">{focus.length}</span>
            </div>
            <ul className="rf-today__focus">
              {focus.map(item => {
                const Icon = ICONS[item.icon] || AlertCircle;
                return (
                  <li key={item.key}>
                    <button
                      className={`rf-today__focus-row rf-today__focus-row--${item.kind || 'default'}`}
                      onClick={() => navigateTo(item.route)}
                    >
                      <span className="rf-today__focus-icon"><Icon size={16} strokeWidth={2} /></span>
                      <span className="rf-today__focus-body">
                        <span className="rf-today__focus-title">{item.title}</span>
                        <span className="rf-today__focus-meta">{item.meta}</span>
                      </span>
                      <ArrowUpRight size={14} className="rf-today__focus-go" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Setup banner — only if something is off. Quiet, single line. */}
        {!loading && hasAttention && (
          <button className="rf-today__setup" onClick={() => navigateTo('/settings')}>
            <AlertTriangle size={14} />
            <span>
              {!gmailOk && !aiOk && 'Gmail & AI provider need setup'}
              {!gmailOk && aiOk && 'Gmail isn\'t connected'}
              {gmailOk && !aiOk && 'AI provider isn\'t configured'}
            </span>
            <span className="rf-today__setup-cta">Open settings <ArrowUpRight size={12} /></span>
          </button>
        )}

        {!loading && !hasAttention && focus.length === 0 && recent.length === 0 && !topJd && !topDsa && (
          <div className="rf-today__empty">
            <Sparkles size={18} strokeWidth={1.6} />
            <strong>Brand new dashboard.</strong>
            <span>Start with a JD analysis or send your first outreach above.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Snap({ label, value, onClick }) {
  return (
    <button className="rf-today__snap" onClick={onClick}>
      <span className="rf-today__snap-value">{value}</span>
      <span className="rf-today__snap-label">{label}</span>
    </button>
  );
}
