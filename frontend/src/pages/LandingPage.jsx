import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import {
  Waypoints, Sun, Moon,
  BookUser, SendHorizonal, LayoutDashboard, Sparkles,
  ShieldCheck, KeyRound, EyeOff,
  ArrowRight, Compass, Terminal, Check,
  Mail, FileText, Target,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────
// Constellation — six modules orbit one workspace.
// Hub at center, satellites evenly spaced on a single ring.
// No crossing paths; pulses travel along the orbit.
// ──────────────────────────────────────────────────────────

// Satellites in clockwise order from top (0° = 12 o'clock).
// Position is computed from angle + radius in CSS percentages.
const SATELLITES = [
  { slot: 'compose',  icon: SendHorizonal,   title: 'Compose',       angle: 0,   labelSide: 'top'    },
  { slot: 'apps',     icon: LayoutDashboard, title: 'Pipeline',      angle: 60,  labelSide: 'right'  },
  { slot: 'dsa',      icon: Terminal,        title: 'DSA Lab',       angle: 120, labelSide: 'right'  },
  { slot: 'roadmap',  icon: Compass,         title: 'Roadmap',       angle: 180, labelSide: 'bottom' },
  { slot: 'contacts', icon: BookUser,        title: 'Contacts',      angle: 240, labelSide: 'left'   },
  { slot: 'resume',   icon: Sparkles,        title: 'Resume Lab',    angle: 300, labelSide: 'left'   },
];

const ORBIT_RADIUS_PCT = 36; // percent of container

function polarToPct(angleDeg, radiusPct) {
  const rad = (angleDeg - 90) * (Math.PI / 180); // -90 so 0° points up
  return {
    left: `${50 + radiusPct * Math.cos(rad)}%`,
    top:  `${50 + radiusPct * Math.sin(rad)}%`,
  };
}

function Constellation() {
  return (
    <div className="rf-constellation">
      {/* Orbital ring + pulses */}
      <svg
        className="rf-constellation__svg"
        viewBox="0 0 400 400"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          {/* Full circular orbit path, starting from top (12 o'clock) */}
          <path
            id="rf-orbit-path"
            d="M 200 56 A 144 144 0 1 1 199.99 56"
            fill="none"
          />
        </defs>

        {/* Soft outer halo */}
        <circle cx="200" cy="200" r="184" className="rf-orbit-halo" />
        {/* Inner accent halo around the hub */}
        <circle cx="200" cy="200" r="58" className="rf-hub-halo" />
        {/* Visible orbit ring */}
        <circle cx="200" cy="200" r="144" className="rf-orbit-ring" />

        {/* Three pulses traveling along the orbit, evenly phased */}
        {[0, 1, 2].map((i) => (
          <circle key={i} r="3.5" className="rf-cdot">
            <animateMotion
              dur="9s"
              repeatCount="indefinite"
              calcMode="linear"
              begin={`${i * -3}s`}
            >
              <mpath href="#rf-orbit-path" />
            </animateMotion>
          </circle>
        ))}
      </svg>

      {/* Hub (workspace) — solid anchor at the center of the orbit */}
      <div className="rf-node rf-node--hub" style={{ left: '50%', top: '50%' }}>
        <span className="rf-node__hub-glow" aria-hidden="true" />
        <span className="rf-node__hub-mark">
          <Waypoints size={30} strokeWidth={1.6} />
        </span>
      </div>

      {/* Six satellite modules */}
      {SATELLITES.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.slot}
            className={`rf-node rf-node--sat rf-node--label-${s.labelSide}`}
            style={polarToPct(s.angle, ORBIT_RADIUS_PCT)}
          >
            <div className="rf-node__chip" aria-hidden="true">
              <Icon size={15} strokeWidth={1.7} />
            </div>
            <div className="rf-node__label">{s.title}</div>
          </div>
        );
      })}
    </div>
  );
}

function MobileFlow() {
  const MOBILE_ITEMS = [
    { slot: 'hub',      icon: Waypoints,        title: 'ReachFlow',  desc: 'One workspace for the whole search.', primary: true },
    ...SATELLITES.map((s) => ({
      slot: s.slot,
      icon: s.icon,
      title: s.title,
      desc: MOBILE_DESCS[s.slot] || '',
    })),
  ];
  return (
    <div className="rf-constellation__mobile">
      {MOBILE_ITEMS.map((n) => (
        <div key={n.slot} className={`rf-mobile-node${n.primary ? ' rf-mobile-node--primary' : ''}`}>
          <div className="rf-mobile-node__icon"><n.icon size={15} strokeWidth={1.8} /></div>
          <div>
            <div className="rf-mobile-node__title">{n.title}</div>
            <div className="rf-mobile-node__desc">{n.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const MOBILE_DESCS = {
  compose:  'Personalized email at scale.',
  apps:     'Track the whole pipeline.',
  dsa:      'Algorithm review, AI-powered.',
  roadmap:  'Structured bookmarks, mapped.',
  contacts: 'Every connection, encrypted.',
  resume:   'Job-aware tailoring, BYO key.',
};

// ──────────────────────────────────────────────────────────
// Module visuals — tight, realistic chips for each module
// card. No browser chrome; reads as a UI fragment.
// ──────────────────────────────────────────────────────────

const MK_ACCENT = 'var(--L-accent)';
const MK_BORDER = 'var(--L-line-faint)';
const MK_FAINT = 'var(--L-fg-faint)';

const Bar = ({ w = '100%', h = 5, dim = false, style = {} }) => (
  <div
    style={{
      height: h,
      width: w,
      borderRadius: 2,
      background: dim ? 'color-mix(in oklab, var(--L-fg-faint) 28%, transparent)' : 'color-mix(in oklab, var(--L-fg) 30%, transparent)',
      flexShrink: 0,
      ...style,
    }}
  />
);

const Chip = ({ w = 42, accent = false, style = {} }) => (
  <div
    style={{
      height: 14,
      width: w,
      borderRadius: 3,
      flexShrink: 0,
      background: accent ? 'color-mix(in oklab, var(--L-accent) 18%, transparent)' : 'transparent',
      border: `1px solid ${accent ? 'color-mix(in oklab, var(--L-accent) 45%, transparent)' : 'var(--L-line-faint)'}`,
      ...style,
    }}
  />
);

function ComposeMockup() {
  return (
    <div className="rf-mock rf-mock--compose">
      <div className="rf-mock__head">
        <span className="rf-mock__label">To</span>
        <Chip w={68} accent /><Chip w={54} accent /><Chip w={48} />
      </div>
      <div className="rf-mock__head">
        <span className="rf-mock__label">Subject</span>
        <Bar w="60%" h={4} />
      </div>
      <div className="rf-mock__body">
        <Bar w="92%" /><Bar w="76%" /><Bar w="88%" /><Bar w="58%" />
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <Chip w={48} accent /><Chip w={38} accent />
        </div>
        <Bar w="80%" /><Bar w="44%" />
      </div>
      <div className="rf-mock__foot">
        <div style={{ display: 'flex', gap: 5 }}>
          <Chip w={32} /><Chip w={26} />
        </div>
        <div className="rf-mock__send">Send</div>
      </div>
    </div>
  );
}

function PipelineMockup() {
  const cols = [
    { label: 'Applied', count: 8, accent: false },
    { label: 'Phone', count: 3, accent: false },
    { label: 'Onsite', count: 2, accent: true },
  ];
  return (
    <div className="rf-mock rf-mock--pipeline">
      {cols.map((col, ci) => (
        <div key={ci} className="rf-mock__col">
          <div className="rf-mock__col-head">
            <span className="rf-mock__col-label">{col.label}</span>
            <span className={`rf-mock__col-count${col.accent ? ' is-accent' : ''}`}>{col.count}</span>
          </div>
          {[0, 1, 2].slice(0, ci === 2 ? 2 : 3).map(i => (
            <div key={i} className="rf-mock__card">
              <Bar w="78%" h={4.5} />
              <Bar w="52%" h={3.5} dim style={{ marginTop: 3 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ContactsMockup() {
  const rows = [
    { tag: true,  tagW: 38 },
    { tag: false, tagW: 32 },
    { tag: true,  tagW: 42 },
    { tag: false, tagW: 28 },
  ];
  return (
    <div className="rf-mock rf-mock--contacts">
      <div className="rf-mock__search">
        <Bar w="62%" h={4} dim />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="rf-mock__row">
          <div className="rf-mock__avatar" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Bar w="50%" h={4.5} />
            <Bar w="32%" h={3} dim />
          </div>
          <Chip w={row.tagW} accent={row.tag} />
        </div>
      ))}
    </div>
  );
}

function ResumeMockup() {
  return (
    <div className="rf-mock rf-mock--resume">
      <div className="rf-mock__score">
        <svg viewBox="0 0 36 36" className="rf-mock__ring" aria-hidden="true">
          <circle cx="18" cy="18" r="15" className="rf-mock__ring-bg" />
          <circle cx="18" cy="18" r="15" className="rf-mock__ring-fg" pathLength="100" strokeDasharray="87 100" />
        </svg>
        <span className="rf-mock__score-num">87<small>%</small></span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Bar w="72%" h={5} />
        <Bar w="50%" h={3.5} dim />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
          {[
            { w: '64%', good: true },
            { w: '54%', good: true },
            { w: '40%', good: false },
          ].map((b, i) => (
            <div key={i} className="rf-mock__check-row">
              <span className={`rf-mock__check-dot${b.good ? '' : ' is-warn'}`} />
              <Bar w={b.w} h={4} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DsaMockup() {
  return (
    <div className="rf-mock rf-mock--dsa">
      <div className="rf-mock__code-head">
        <Chip w={36} accent /><Chip w={28} />
      </div>
      <div className="rf-mock__code">
        {[
          { indent: 0, w: '78%' },
          { indent: 1, w: '64%' },
          { indent: 2, w: '54%' },
          { indent: 2, w: '72%' },
          { indent: 1, w: '48%' },
          { indent: 0, w: '60%' },
        ].map((line, i) => (
          <div key={i} className="rf-mock__code-line">
            <span className="rf-mock__code-num">{i + 1}</span>
            <Bar w={line.w} h={4} style={{ marginLeft: line.indent * 8 }} />
          </div>
        ))}
      </div>
      <div className="rf-mock__complexity">
        <div className="rf-mock__bigO">O(n log n)</div>
        <div className="rf-mock__bigO rf-mock__bigO--space">O(1)</div>
      </div>
    </div>
  );
}

function RoadmapMockup() {
  const stages = [
    { label: 'Discovery',   pct: 100 },
    { label: 'Outreach',    pct: 72  },
    { label: 'Interviews',  pct: 38  },
    { label: 'Offer',       pct: 8   },
  ];
  return (
    <div className="rf-mock rf-mock--roadmap">
      {stages.map((s, i) => (
        <div key={i} className="rf-mock__stage">
          <div className="rf-mock__stage-head">
            <Bar w={64 + i * 4} h={4} />
            <span className="rf-mock__stage-pct">{s.pct}%</span>
          </div>
          <div className="rf-mock__progress">
            <div className="rf-mock__progress-fill" style={{ width: `${s.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Module grid — every capability, on one screen
// ──────────────────────────────────────────────────────────

const MODULES = [
  {
    icon: SendHorizonal,
    name: 'Compose',
    tagline: 'Personalized outreach at scale.',
    bullets: [
      'Variable tokens auto-fill name, company, role',
      'Templates, drafts, attachments, scheduled send',
      'Through your Gmail — never through us',
    ],
    mockup: ComposeMockup,
  },
  {
    icon: LayoutDashboard,
    name: 'Pipeline',
    tagline: 'Every application, one board.',
    bullets: [
      'Kanban from Applied to Offer',
      'Parse job postings to auto-fill role + company',
      'Linked to your outreach and send history',
    ],
    mockup: PipelineMockup,
  },
  {
    icon: BookUser,
    name: 'Contacts',
    tagline: 'Your network, organized.',
    bullets: [
      'Groups for laser-targeted campaigns',
      'AES-256 encrypted at rest',
      'Searchable by name, company, role',
    ],
    mockup: ContactsMockup,
  },
  {
    icon: Sparkles,
    name: 'Resume Lab',
    tagline: 'Job-aware résumés on demand.',
    bullets: [
      'Canonical career profile from your résumé',
      'Paste any JD → keyword-matched LaTeX PDF',
      'Runs on your AI provider key',
    ],
    mockup: ResumeMockup,
    ai: true,
  },
  {
    icon: Terminal,
    name: 'DSA Lab',
    tagline: 'Interview prep with feedback.',
    bullets: [
      'Submit a problem and your solution',
      'Complexity analysis + pattern detection',
      'Human-readable hints, your AI key',
    ],
    mockup: DsaMockup,
    ai: true,
  },
  {
    icon: Compass,
    name: 'Roadmap',
    tagline: 'Map the long search.',
    bullets: [
      'Stages and milestones for the months ahead',
      'Visual progress across every phase',
      'Works alongside pipeline and outreach',
    ],
    mockup: RoadmapMockup,
  },
];

function ModuleGrid() {
  return (
    <div className="rf-modules">
      {MODULES.map((m) => {
        const Mock = m.mockup;
        const Icon = m.icon;
        return (
          <article key={m.name} className="rf-module">
            <div className="rf-module__visual">
              <Mock />
            </div>
            <div className="rf-module__body">
              <div className="rf-module__head">
                <span className="rf-module__icon"><Icon size={14} strokeWidth={1.8} /></span>
                <h3 className="rf-module__name">{m.name}</h3>
                {m.ai && (
                  <span className="rf-module__ai" title="Uses your AI key">
                    <Sparkles size={11} strokeWidth={2} />
                    AI-powered
                  </span>
                )}
              </div>
              <p className="rf-module__tag">{m.tagline}</p>
              <ul className="rf-module__list">
                {m.bullets.map((b, i) => (
                  <li key={i}>
                    <Check size={11} strokeWidth={2.6} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Workflow strip — three steps, one line
// ──────────────────────────────────────────────────────────

const STEPS = [
  {
    n: '01',
    icon: Mail,
    title: 'Connect Gmail',
    desc: 'Sign in with Google. Scoped OAuth — we never touch your inbox.',
  },
  {
    n: '02',
    icon: FileText,
    title: 'Build your profile',
    desc: 'Upload a résumé. AI extracts a canonical career profile you can edit.',
  },
  {
    n: '03',
    icon: Target,
    title: 'Tailor & send',
    desc: 'Paste a JD → tailored PDF, personalized email, tracked in the pipeline.',
  },
];

function WorkflowStrip() {
  return (
    <div className="rf-workflow">
      <div className="rf-workflow__rail" aria-hidden="true" />
      {STEPS.map((s) => {
        const Icon = s.icon;
        return (
          <div className="rf-step" key={s.n}>
            <span className="rf-step__n">{s.n}</span>
            <div className="rf-step__icon">
              <Icon size={22} strokeWidth={1.7} />
            </div>
            <h4 className="rf-step__title">{s.title}</h4>
            <p className="rf-step__desc">{s.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────

export default function LandingPage() {
  const { login, theme, toggleTheme } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="rf-landing" ref={rootRef}>
      <header className="rf-landing__header" data-scrolled={scrolled ? 'true' : 'false'}>
        <a href="/" className="rf-landing__brand" aria-label="ReachFlow">
          <span className="rf-landing__brand-mark"><Waypoints size={17} strokeWidth={1.8} /></span>
          <span className="rf-landing__brand-name">ReachFlow</span>
        </a>

        <nav className="rf-landing__nav" aria-label="Sections">
          <a href="#modules">Modules</a>
          <a href="#flow">How it works</a>
          <a href="#trust">Privacy</a>
        </nav>

        <div className="rf-landing__header-actions">
          <button
            className="rf-btn rf-btn--ghost rf-btn--icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="rf-btn rf-btn--primary" onClick={login}>
            Sign in <span aria-hidden="true">→</span>
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="rf-hero" aria-label="ReachFlow at a glance">
        <div className="rf-hero__intro">
          <span className="rf-hero__eyebrow">Job-search workspace &mdash; v1 early access</span>
          <h1 className="rf-hero__title">
            Run the job search<br />
            <span className="rf-hero__title-accent">like a system.</span>
          </h1>
          <p className="rf-hero__subtitle">
            Outreach, applications, AI-tailored résumés, and interview prep — connected in one workspace. Sends through your Gmail. Runs on your AI key.
          </p>
          <div className="rf-hero__cta">
            <button className="rf-btn rf-btn--primary rf-btn--lg" onClick={login}>
              Start free with Google
              <ArrowRight size={15} />
            </button>
            <span className="rf-hero__cta-note">no credit card · BYO AI key · native Gmail</span>
          </div>
          <p className="rf-hero__meta">
            Gmail Send <span>·</span> Resume Lab <span>·</span> DSA Analysis <span>·</span> Pipeline <span>·</span> AES-256 encrypted
          </p>
        </div>

        <div className="rf-hero__canvas">
          <Constellation />
          <MobileFlow />
        </div>
      </section>

      {/* ── MODULES ── */}
      <section className="rf-section rf-modules-section" id="modules">
        <div className="rf-section__inner">
          <div className="rf-section__head">
            <span className="rf-eyebrow">Six modules · one workspace</span>
            <h2 className="rf-section__title">Everything the search needs, in one canvas.</h2>
            <p className="rf-section__sub">
              No more juggling sheets, docs, and tabs. Each module is purpose-built, encrypted, and wired into the next.
            </p>
          </div>
          <ModuleGrid />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="rf-section rf-flow-section" id="flow">
        <div className="rf-section__inner">
          <div className="rf-section__head">
            <span className="rf-eyebrow">How it works</span>
            <h2 className="rf-section__title">From sign-in to sent in minutes.</h2>
          </div>
          <WorkflowStrip />
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="rf-trust" id="trust">
        <div className="rf-section__inner">
          <div className="rf-section__head">
            <span className="rf-eyebrow">Built private</span>
            <h2 className="rf-section__title">Your data path, drawn straight.</h2>
          </div>
          <div className="rf-trust__row">
            <div className="rf-trust__pillar">
              <span className="rf-trust__icon"><ShieldCheck size={16} strokeWidth={1.7} /></span>
              <h4>Encrypted at rest</h4>
              <p>AES-256-GCM envelopes for every sensitive field. Lookups use HMAC hashes, not plaintext.</p>
            </div>
            <div className="rf-trust__pillar">
              <span className="rf-trust__icon"><EyeOff size={16} strokeWidth={1.7} /></span>
              <h4>Gmail-native send</h4>
              <p>Email leaves through your account, not ours. We don&apos;t read, store, or scan your inbox.</p>
            </div>
            <div className="rf-trust__pillar">
              <span className="rf-trust__icon"><KeyRound size={16} strokeWidth={1.7} /></span>
              <h4>Bring your own AI</h4>
              <p>Your provider, your key, your usage. Résumé tailoring runs through credentials you control.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="rf-final">
        <div className="rf-final__inner">
          <h2 className="rf-final__heading">
            Stop juggling tabs.<br />
            <span className="rf-final__heading-accent">Start landing offers.</span>
          </h2>
          <button className="rf-btn rf-btn--primary rf-btn--lg" onClick={login}>
            Get started — free
            <ArrowRight size={15} />
          </button>
          <span className="rf-final__note">free during early access · sign in with Google</span>
        </div>
      </section>

      <footer className="rf-landing__footer">
        <span className="rf-landing__footer-meta">reachflow · v1 · early access</span>
        <nav className="rf-landing__footer-links">
          <a href="/about">About</a>
          <a href="/privacy-policy">Privacy</a>
          <a href="/terms-of-use">Terms</a>
        </nav>
      </footer>
    </div>
  );
}
