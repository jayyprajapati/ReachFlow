import React, { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import {
  Waypoints, Sun, Moon,
  BookUser, SendHorizonal, LayoutDashboard, Sparkles,
  ShieldCheck, KeyRound, EyeOff,
  ArrowRight, Compass, Terminal, Check, Settings, User,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────
// Constellation — 4 stations joined by curved paths
// with traveling pulses. Compact, fluid, percentage-based.
// ──────────────────────────────────────────────────────────

const MAIN_NODES = [
  { slot: 'compose',  icon: SendHorizonal,   title: 'Compose',       desc: 'Personalized email at scale.',    pos: { left: '50%', top: '6%'  }, primary: true, labelAbove: true },
  { slot: 'contacts', icon: BookUser,        title: 'Contacts',      desc: 'Every connection, encrypted.',    pos: { left: '16%', top: '30%' } },
  { slot: 'apps',     icon: LayoutDashboard, title: 'Applications',  desc: 'Track the whole pipeline.',       pos: { left: '84%', top: '30%' } },
  { slot: 'resume',   icon: Sparkles,        title: 'Resume Lab',    desc: 'Job-aware tailoring, BYO key.',   pos: { left: '16%', top: '72%' }, labelAbove: true },
  { slot: 'dsa',      icon: Terminal,        title: 'DSA Analysis',  desc: 'Algorithm review, AI-powered.',   pos: { left: '84%', top: '72%' }, labelAbove: true },
  { slot: 'roadmap',  icon: Compass,         title: 'Roadmap',       desc: 'The structured bookmarks, mapped.',        pos: { left: '50%', top: '92%' }, labelAbove: true },
];

function quadPath(a, b, arc = 0.08) {
  const mx = (a.cx + b.cx) / 2;
  const my = (a.cy + b.cy) / 2;
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const offset = len * arc;
  return `M ${a.cx},${a.cy} Q ${mx + px * offset},${my + py * offset} ${b.cx},${b.cy}`;
}

function Constellation() {
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const [paths, setPaths] = useState([]);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (MAIN_NODES.some(n => !nodeRefs.current[n.slot])) return;

    const cr = container.getBoundingClientRect();
    const center = (el) => {
      const r = el.getBoundingClientRect();
      return { cx: r.left - cr.left + r.width / 2, cy: r.top - cr.top + r.height / 2 };
    };

    const N = {};
    MAIN_NODES.forEach(n => { N[n.slot] = center(nodeRefs.current[n.slot]); });

    const { contacts: c, compose: co, apps: a, resume: r, dsa: d, roadmap: rm } = N;

    setPaths([
      { id: 'p1', d: quadPath(c,  co,  0.08), dur: '2.6s' },
      { id: 'p2', d: quadPath(co, a,  -0.08), dur: '2.2s' },
      { id: 'p3', d: quadPath(c,  r,   0.06), dur: '2.8s' },
      { id: 'p4', d: quadPath(a,  d,  -0.06), dur: '3.4s' },
      { id: 'p5', d: quadPath(r,  rm,  0.06), dur: '3.0s' },
      { id: 'p6', d: quadPath(d,  rm, -0.06), dur: '2.9s' },
      { id: 'p7', d: quadPath(r,  d,   0.04), dur: '3.2s' },
    ]);
    setDims({ w: cr.width, h: cr.height });
  }, []);

  useLayoutEffect(() => {
    let frameId = 0;
    const schedule = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        recalc();
      });
    };
    schedule();
    window.addEventListener('resize', schedule);

    const observer = new ResizeObserver(schedule);
    const container = containerRef.current;
    if (container) observer.observe(container);
    MAIN_NODES.forEach(n => {
      const el = nodeRefs.current[n.slot];
      if (el) observer.observe(el);
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule).catch(() => {});
    }

    return () => {
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [recalc]);

  return (
    <div ref={containerRef} className="rf-constellation">
      <svg
        className="rf-constellation__svg"
        width={dims.w || '100%'}
        height={dims.h || '100%'}
        aria-hidden="true"
      >
        {paths.map(p => (
          <path key={p.id} id={p.id} d={p.d} className="rf-cpath" />
        ))}
        {paths.map(p => (
          <circle key={`pulse-${p.id}`} r={3} className="rf-cdot">
            <animateMotion dur={p.dur} repeatCount="indefinite" calcMode="linear">
              <mpath href={`#${p.id}`} />
            </animateMotion>
          </circle>
        ))}
      </svg>

      {MAIN_NODES.map(n => (
        <div
          key={n.slot}
          ref={el => { nodeRefs.current[n.slot] = el; }}
          className={
            'rf-node'
            + (n.labelAbove ? ' rf-node--label-above' : '')
            + (n.primary ? ' rf-node--primary' : '')
          }
          style={n.pos}
        >
          <div className="rf-node__dot" />
          <div className="rf-node__card">
            <div className="rf-node__title">
              <n.icon size={12} strokeWidth={1.8} />
              {n.title}
            </div>
            <div className="rf-node__desc">{n.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileFlow() {
  return (
    <div className="rf-constellation__mobile">
      {MAIN_NODES.map(n => (
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

// ──────────────────────────────────────────────────────────
// App Preview — animated demo with mockup
// ──────────────────────────────────────────────────────────

const DEMO_TABS = [
  {
    slot: 'compose',
    icon: SendHorizonal,
    label: 'Compose',
    tagline: 'Personalized outreach, at scale',
    bullets: [
      'Variable tokens auto-fill name, company, and role per recipient',
      'Templates, drafts, attachments, and scheduled sends',
      'Emails go through your Gmail — nothing passes through us',
    ],
  },
  {
    slot: 'contacts',
    icon: BookUser,
    label: 'Contacts',
    tagline: 'Your network, organized',
    bullets: [
      'Build groups for laser-targeted campaigns',
      'All data AES-256 encrypted at rest',
      'Searchable by name, company, or role',
    ],
  },
  {
    slot: 'apps',
    icon: LayoutDashboard,
    label: 'Applications',
    tagline: 'Every application, tracked',
    bullets: [
      'Kanban board from Applied to Offer',
      'Parse job listings to auto-fill company and role',
      'Linked to your outreach and send history',
    ],
  },
  {
    slot: 'resume',
    icon: Sparkles,
    label: 'Resume Lab',
    tagline: 'Job-aware tailoring, your AI key',
    bullets: [
      'Upload base resume — build a canonical career profile',
      'Paste any JD → keyword-matched LaTeX PDF',
      'Powered by the AI provider you control',
    ],
    ai: true,
  },
  {
    slot: 'dsa',
    icon: Terminal,
    label: 'DSA Analysis',
    tagline: 'Algorithm analysis, explained',
    bullets: [
      'Submit a problem and your solution for instant review',
      'Time & space complexity with pattern detection',
      'Human-readable hints — powered by AI',
    ],
    ai: true,
  },
  {
    slot: 'roadmap',
    icon: Compass,
    label: 'Roadmap',
    tagline: 'The full campaign, mapped',
    bullets: [
      'Stages and milestones for the long search',
      'Visual progress tracking across every phase',
      'Works alongside your pipeline and outreach',
    ],
  },
];

// Mockup color constants — light to match landing page theme
const MK_ACCENT = 'rgb(22, 131, 255)';
const MK_BG = '#f4f7fb';
const MK_SIDEBAR = '#e8eef7';
const MK_BORDER = 'rgba(22, 131, 255, 0.13)';
const MK_DIM = 'rgba(40, 70, 130, 0.40)';
const MK_FAINT = 'rgba(22, 131, 255, 0.07)';
const MK_LINE = 'rgba(22, 131, 255, 0.18)';

// Primitive helpers for building mockups
const ML = ({ w = '100%', h = 6, faint = false, style = {} }) => (
  <div style={{ height: h, width: w, borderRadius: 3, background: faint ? MK_FAINT : MK_LINE, flexShrink: 0, ...style }} />
);
const MChip = ({ w = 46, accent = false, faint = false }) => (
  <div style={{ height: 14, width: w, borderRadius: 7, flexShrink: 0, background: accent ? 'rgba(22,131,255,0.22)' : (faint ? 'rgba(255,255,255,0.05)' : MK_FAINT), border: `1px solid ${accent ? 'rgba(22,131,255,0.38)' : MK_BORDER}` }} />
);
const MBtn = ({ accent = false, w = 42 }) => (
  <div style={{ height: 17, width: w, borderRadius: 4, flexShrink: 0, background: accent ? 'rgba(22,131,255,0.32)' : MK_FAINT, border: `1px solid ${accent ? 'rgba(22,131,255,0.48)' : MK_BORDER}` }} />
);
const MRow = ({ children, gap = 6, style = {} }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap, ...style }}>{children}</div>
);

function ComposeMockup() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, height: '100%' }}>
      <MRow>
        <MChip accent /><MChip accent /><MChip /><MChip faint />
      </MRow>
      <ML w="80%" />
      <div style={{ padding: '4px 0', borderTop: `1px solid ${MK_BORDER}`, borderBottom: `1px solid ${MK_BORDER}` }}>
        <MRow gap={5}>
          {[16,16,16,16,16,24].map((w, i) => (
            <div key={i} style={{ height: 7, width: w, borderRadius: 2, background: MK_FAINT }} />
          ))}
        </MRow>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <ML w="93%" /><ML w="71%" /><ML w="85%" /><ML w="54%" />
      </div>
      <MRow style={{ justifyContent: 'space-between', borderTop: `1px solid ${MK_BORDER}`, paddingTop: 5 }}>
        <MRow gap={5}><MBtn /><MBtn /></MRow>
        <MBtn accent w={58} />
      </MRow>
    </div>
  );
}

function ContactsMockup() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      <MRow style={{ marginBottom: 7, gap: 6 }}>
        <div style={{ flex: 1, height: 17, borderRadius: 4, background: MK_FAINT, border: `1px solid ${MK_BORDER}` }} />
        <MBtn accent w={38} />
      </MRow>
      <MRow style={{ paddingBottom: 5, borderBottom: `1px solid ${MK_BORDER}`, opacity: 0.4, gap: 8 }}>
        <ML w="30%" h={4} /><ML w="22%" h={4} style={{ marginLeft: 'auto' }} />
      </MRow>
      {[
        { accent: true },
        { accent: false },
        { accent: true },
        { accent: false },
      ].map((row, i) => (
        <MRow key={i} style={{ paddingBlock: 5, borderBottom: `1px solid ${MK_BORDER}`, gap: 7 }}>
          <div style={{ width: 17, height: 17, borderRadius: '50%', background: 'rgba(22,131,255,0.18)', flexShrink: 0 }} />
          <ML w="27%" />
          <MChip accent={row.accent} w={38} />
          <ML w="20%" faint style={{ marginLeft: 'auto' }} />
        </MRow>
      ))}
    </div>
  );
}

function PipelineMockup() {
  const cols = [
    { count: 4, cards: [null, null, null] },
    { count: 2, cards: [null, null] },
    { count: 1, cards: [null] },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, height: '100%', overflow: 'hidden' }}>
      {cols.map((col, ci) => (
        <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
          <MRow gap={5} style={{ marginBottom: 2 }}>
            <ML w="62%" h={5} />
            <div style={{ height: 12, width: 15, borderRadius: 3, background: 'rgba(22,131,255,0.18)', border: '1px solid rgba(22,131,255,0.3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 7, color: MK_ACCENT, fontFamily: 'monospace' }}>{col.count}</span>
            </div>
          </MRow>
          {col.cards.map((_, i) => (
            <div key={i} style={{ padding: '4px 5px', borderRadius: 4, background: MK_FAINT, border: `1px solid ${MK_BORDER}` }}>
              <ML w="82%" h={5} />
              <ML w="55%" h={4} faint style={{ marginTop: 3 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ResumeMockup() {
  return (
    <div style={{ display: 'flex', gap: 8, height: '100%' }}>
      <div style={{ width: '38%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ML w="65%" h={4} faint style={{ marginBottom: 3 }} />
        {[true, false, false].map((active, i) => (
          <div key={i} style={{ padding: '4px 6px', borderRadius: 4, background: active ? 'rgba(22,131,255,0.1)' : MK_FAINT, border: `1px solid ${active ? 'rgba(22,131,255,0.28)' : MK_BORDER}` }}>
            <ML w="85%" h={5} /><ML w="55%" h={4} faint style={{ marginTop: 3 }} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <MRow gap={8}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2.5px solid ${MK_ACCENT}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 7.5, color: MK_ACCENT, fontFamily: 'monospace', fontWeight: 700 }}>87%</span>
          </div>
          <div style={{ flex: 1 }}>
            <ML w="72%" h={5} /><ML w="52%" h={4} faint style={{ marginTop: 3 }} />
          </div>
        </MRow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <MRow key={i} gap={5}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: i === 2 ? 'rgba(232,146,68,0.55)' : 'rgba(22,131,255,0.55)', flexShrink: 0 }} />
              <ML w={['65%','55%','42%'][i]} h={5} />
            </MRow>
          ))}
        </div>
        <MBtn accent w="100%" style={{ marginTop: 'auto' }} />
      </div>
    </div>
  );
}

function DsaMockup() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <div style={{ padding: '5px 6px', borderRadius: 4, background: MK_FAINT, border: `1px solid ${MK_BORDER}` }}>
        <ML w="88%" h={5} /><ML w="68%" h={4} faint style={{ marginTop: 3 }} />
      </div>
      <div style={{ flex: 1, borderRadius: 4, background: '#edf0f7', border: `1px solid ${MK_BORDER}`, padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
        {['92%','70%','58%','76%','48%'].map((w, i) => (
          <MRow key={i} gap={5}>
            <div style={{ width: 9, height: 5, borderRadius: 1, background: MK_FAINT, flexShrink: 0 }} />
            <ML w={w} h={5} />
          </MRow>
        ))}
      </div>
      <MRow gap={5} style={{ paddingTop: 4, borderTop: `1px solid ${MK_BORDER}` }}>
        <MChip accent w={40} /><MChip accent w={36} /><MChip w={38} />
      </MRow>
    </div>
  );
}

function RoadmapMockup() {
  const stages = [80, 45, 20, 5];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, height: '100%' }}>
      <ML w="52%" h={7} />
      <ML w="33%" h={4} faint style={{ marginTop: -3 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
        {stages.map((pct, i) => (
          <div key={i}>
            <MRow style={{ marginBottom: 3, justifyContent: 'space-between' }}>
              <ML w="44%" h={5} /><ML w="14%" h={4} faint />
            </MRow>
            <div style={{ height: 4, borderRadius: 2, background: MK_FAINT, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: MK_ACCENT, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockupContent({ slot }) {
  if (slot === 'compose')  return <ComposeMockup />;
  if (slot === 'contacts') return <ContactsMockup />;
  if (slot === 'apps')     return <PipelineMockup />;
  if (slot === 'resume')   return <ResumeMockup />;
  if (slot === 'dsa')      return <DsaMockup />;
  if (slot === 'roadmap')  return <RoadmapMockup />;
  return null;
}

function AppPreview() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [contentKey, setContentKey] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActiveIdx(i => (i + 1) % DEMO_TABS.length);
      setContentKey(k => k + 1);
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const switchTab = (i) => {
    if (i === activeIdx) return;
    setActiveIdx(i);
    setContentKey(k => k + 1);
  };

  const tab = DEMO_TABS[activeIdx];
  const TabIcon = tab.icon;

  return (
    <div className="rf-preview">
      {/* Left: explanation */}
      <div className="rf-preview__left">
        <span className="rf-eyebrow">Inside ReachFlow</span>
        <div className="rf-preview__info" key={`info-${activeIdx}`}>
          <div className="rf-preview__tab-head">
            <span className="rf-preview__tab-icon">
              <TabIcon size={18} strokeWidth={1.7} />
            </span>
            <h3 className="rf-preview__tab-name">{tab.label}</h3>
            {tab.ai && <span className="rf-preview__ai-tag"><Sparkles size={9} strokeWidth={2} />AI</span>}
          </div>
          <p className="rf-preview__tagline">{tab.tagline}</p>
          <ul className="rf-preview__bullets">
            {tab.bullets.map((b, i) => (
              <li key={i}>
                <Check size={12} strokeWidth={2.5} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rf-preview__dots">
          {DEMO_TABS.map((t, i) => (
            <button
              key={i}
              className={`rf-preview__dot${i === activeIdx ? ' rf-preview__dot--active' : ''}`}
              onClick={() => switchTab(i)}
              aria-label={`View ${t.label}`}
              title={t.label}
            />
          ))}
        </div>
      </div>

      {/* Right: app mockup */}
      <div className="rf-preview__right">
        <div className="rf-preview__frame">
          {/* Browser chrome */}
          <div className="rf-preview__chrome">
            <div className="rf-preview__traffic-group">
              <span className="rf-preview__traffic rf-preview__traffic--r" />
              <span className="rf-preview__traffic rf-preview__traffic--y" />
              <span className="rf-preview__traffic rf-preview__traffic--g" />
            </div>
            <span className="rf-preview__url-bar">
              <span className="rf-preview__url-text">reachflow.jayprajapati.dev/{tab.slot}</span>
            </span>
          </div>
          {/* App shell */}
          <div className="rf-preview__app-shell" style={{ background: MK_BG }}>
            {/* Sidebar nav */}
            <div className="rf-preview__sidebar" style={{ background: MK_SIDEBAR, borderRight: `1px solid ${MK_BORDER}` }}>
              <div className="rf-preview__sidebar-brand">
                <Waypoints size={10} strokeWidth={1.8} style={{ color: MK_ACCENT }} />
              </div>
              <div className="rf-preview__sidebar-main">
                {DEMO_TABS.map((t, i) => {
                  const NavIcon = t.icon;
                  const active = i === activeIdx;
                  return (
                    <button
                      key={t.slot}
                      className="rf-preview__nav-item"
                      style={{
                        background: active ? 'rgba(22,131,255,0.10)' : 'transparent',
                        color: active ? MK_ACCENT : MK_DIM,
                        borderRight: `2px solid ${active ? MK_ACCENT : 'transparent'}`,
                      }}
                      onClick={() => switchTab(i)}
                      aria-label={t.label}
                      title={t.label}
                    >
                      <NavIcon size={10} strokeWidth={1.8} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="rf-preview__sidebar-bottom" style={{ borderTop: `1px solid ${MK_BORDER}` }}>
                {[{ icon: Settings, label: 'Settings' }, { icon: User, label: 'Profile' }].map(({ icon: BotIcon, label }) => (
                  <div key={label} className="rf-preview__nav-item" style={{ color: MK_DIM }}>
                    <BotIcon size={10} strokeWidth={1.8} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Content area */}
            <div className="rf-preview__content" key={contentKey}>
              <MockupContent slot={tab.slot} />
            </div>
          </div>
        </div>
      </div>
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
          <span className="rf-hero__eyebrow">For serious job seekers</span>
          <h1 className="rf-hero__title">
            Outreach, resumes, and prep —<br />
            <span className="rf-hero__title-accent">finally connected.</span>
          </h1>
          <p className="rf-hero__subtitle">
            One canvas for the whole job search — from cold email to offer letter.
          </p>
          <p className="rf-hero__tags">
            Gmail Send &middot; Resume Lab &middot; DSA Analysis &middot; Pipeline &middot; Encrypted
          </p>
          <div className="rf-hero__cta">
            <button className="rf-btn rf-btn--primary rf-btn--lg" onClick={login}>
              Start free with Google
              <ArrowRight size={15} />
            </button>
            <span className="rf-hero__cta-note">no credit card · BYO AI key · native Gmail</span>
          </div>
        </div>

        <div className="rf-hero__canvas">
          <Constellation />
          <MobileFlow />
        </div>
      </section>

      {/* ── APP PREVIEW — 2nd section ── */}
      <section className="rf-preview-section" id="inside">
        <AppPreview />
      </section>

      {/* ── PHILOSOPHY — 3rd section ── */}
      <section className="rf-philo">
        <div className="rf-philo__inner">
          <div className="rf-philo__left">
            <span className="rf-eyebrow">Why we built it</span>
            <h2 className="rf-philo__heading">
              The tools were broken, not the hunt.
            </h2>
            <ul className="rf-philo__list">
              <li>
                <span className="rf-philo__before">Spreadsheets for tracking</span>
                <span className="rf-philo__arrow">→</span>
                <strong>Pipeline kanban</strong>
              </li>
              <li>
                <span className="rf-philo__before">Docs for resumes</span>
                <span className="rf-philo__arrow">→</span>
                <strong>AI-tailored LaTeX PDFs</strong>
              </li>
              <li>
                <span className="rf-philo__before">Copy-pasted Gmail drafts</span>
                <span className="rf-philo__arrow">→</span>
                <strong>Personalized at scale</strong>
              </li>
              <li>
                <span className="rf-philo__before">LeetCode grind, no feedback</span>
                <span className="rf-philo__arrow">→</span>
                <strong>DSA Analysis</strong>
              </li>
            </ul>
          </div>
          <div className="rf-philo__right">
            <PhilosophySketch />
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="rf-trust" id="trust">
        <div className="rf-section__inner">
          <div className="rf-trust__head">
            <span className="rf-eyebrow">Built private</span>
            <h2 className="rf-trust__heading">Your data path, drawn straight.</h2>
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
              <p>Emails go through your account, not ours. We don&apos;t read, store, or scan your inbox.</p>
            </div>
            <div className="rf-trust__pillar">
              <span className="rf-trust__icon"><KeyRound size={16} strokeWidth={1.7} /></span>
              <h4>Bring your own AI</h4>
              <p>Your provider key. Your data path. Resume tailoring runs through credentials you own.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="rf-final">
        <div className="rf-final__inner">
          <h2 className="rf-final__heading">
            Stop juggling tabs.{' '}
            <span className="rf-final__heading-accent">Connect the dots.</span>
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

// ──────────────────────────────────────────────────────────
// Philosophy sketch — chaos -> order, blueprint style
// ──────────────────────────────────────────────────────────

function PhilosophySketch() {
  return (
    <svg className="rf-sketch" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {/* Chaotic upper half */}
      <path className="rf-sketch__chaos" d="M 10,40 Q 60,10 100,55 T 200,30 T 320,60 T 350,20" />
      <path className="rf-sketch__chaos" d="M 20,75  C 80,20 140,110 220,55 S 320,95 350,65" />
      <path className="rf-sketch__chaos" d="M 14,100 Q 80,130 130,80 T 250,110 T 350,95" />
      <circle className="rf-sketch__chaos-dot" cx="50"  cy="35"  r="2.5" />
      <circle className="rf-sketch__chaos-dot" cx="130" cy="68"  r="2.5" />
      <circle className="rf-sketch__chaos-dot" cx="210" cy="42"  r="2.5" />
      <circle className="rf-sketch__chaos-dot" cx="290" cy="80"  r="2.5" />

      {/* Divider */}
      <line className="rf-sketch__divider" x1="0" y1="118" x2="360" y2="118" />

      {/* Ordered lower half */}
      <path className="rf-sketch__order" d="M 20,170 L 110,170 L 110,150 L 250,150 L 250,180 L 340,180" />
      <circle className="rf-sketch__dot" cx="20"  cy="170" r="3.5" />
      <circle className="rf-sketch__dot" cx="110" cy="170" r="3.5" />
      <circle className="rf-sketch__dot" cx="110" cy="150" r="3.5" />
      <circle className="rf-sketch__dot" cx="250" cy="150" r="3.5" />
      <circle className="rf-sketch__dot" cx="250" cy="180" r="3.5" />
      <circle className="rf-sketch__dot" cx="340" cy="180" r="3.5" />
    </svg>
  );
}
