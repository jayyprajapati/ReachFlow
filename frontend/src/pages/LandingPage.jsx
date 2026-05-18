import React, { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import {
  Waypoints, Sun, Moon, X, AlertTriangle,
  BookUser, SendHorizonal, LayoutDashboard, Sparkles,
  ShieldCheck, KeyRound, EyeOff,
  ArrowRight, Compass, FileText,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────
// Constellation — 4 stations joined by curved paths
// with traveling pulses. Compact, fluid, percentage-based.
// ──────────────────────────────────────────────────────────

const MAIN_NODES = [
  { slot: 'contacts', icon: BookUser,        title: 'Contacts',     desc: 'Every connection, encrypted.',  pos: { left: '12%', top: '50%' } },
  { slot: 'compose',  icon: SendHorizonal,   title: 'Compose',      desc: 'Personalized email at scale.',  pos: { left: '50%', top: '12%' }, primary: true, labelAbove: true },
  { slot: 'apps',     icon: LayoutDashboard, title: 'Applications', desc: 'Track the whole pipeline.',     pos: { left: '88%', top: '50%' } },
  { slot: 'resume',   icon: Sparkles,        title: 'Resume Lab',   desc: 'Job-aware tailoring, BYO key.', pos: { left: '50%', top: '88%' }, labelBelow: true },
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

    const { contacts: c, compose: co, apps: a, resume: r } = N;

    setPaths([
      { id: 'p1', d: quadPath(c,  co,  0.10), dur: '2.6s' },
      { id: 'p2', d: quadPath(co, a,  -0.10), dur: '2.2s' },
      { id: 'p3', d: quadPath(r,  co,  0.04), dur: '3.0s' },
      { id: 'p4', d: quadPath(r,  a,   0.10), dur: '3.4s' },
      { id: 'p5', d: quadPath(c,  r,   0.10), dur: '2.8s' },
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

// Mobile version of the constellation — vertical signal flow
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
// Features — editorial row list
// ──────────────────────────────────────────────────────────

const FEATURES = [
  { num: '01', title: 'Contacts',           desc: 'A ledger of every recruiter, alumnus, and hiring manager — encrypted at rest, searchable in plain language.', icon: BookUser },
  { num: '02', title: 'Compose',            desc: 'Personalized email to dozens. Variables, templates, drafts, attachments — sent natively through your Gmail.',  icon: SendHorizonal },
  { num: '03', title: 'Resume Lab',         desc: 'Upload a base resume, paste a job description, get a tailored LaTeX PDF — using the AI key you bring.',       icon: Sparkles, ai: true },
  { num: '04', title: 'Applications',       desc: 'Parse listings, log roles, watch the pipeline move from applied through interview to offer.',                    icon: LayoutDashboard },
  { num: '05', title: 'Roadmaps',           desc: 'A board for the long campaign — stages, milestones, and what comes next when a thread goes quiet.',              icon: Compass },
  { num: '06', title: 'Templates & Drafts', desc: 'Save the lines that work. Reuse them, swap variables, and ship faster every send.',                              icon: FileText },
];

// ──────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────

export default function LandingPage() {
  const { login, theme, toggleTheme } = useApp();
  const [bannerVisible, setBannerVisible] = useState(() => {
    try { return !localStorage.getItem('rf-scope-banner-dismissed'); } catch { return true; }
  });
  const [scrolled, setScrolled] = useState(false);
  const rootRef = useRef(null);

  const dismissBanner = () => {
    setBannerVisible(false);
    try { localStorage.setItem('rf-scope-banner-dismissed', '1'); } catch {}
  };

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
      {bannerVisible && (
        <div className="rf-scope-banner">
          <AlertTriangle size={13} className="rf-scope-banner__icon" />
          <span>
            Awaiting <strong>Google OAuth scope approval</strong> for <code>gmail.send</code>.{' '}
            <a href="mailto:jay.prajapati5717@gmail.com">Email for early access</a>.
          </span>
          <button onClick={dismissBanner} className="rf-scope-banner__close" aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

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
            Outreach, applications, and resumes —<br />
            <span className="rf-hero__title-accent">finally connected.</span>
          </h1>
          <p className="rf-hero__subtitle">
            One canvas for the whole job search — wired together by design, private by default.
          </p>
          <div className="rf-hero__cta">
            <button className="rf-btn rf-btn--primary rf-btn--lg" onClick={login}>
              Start free with Google
              <ArrowRight size={15} />
            </button>
            <span className="rf-hero__cta-note">no credit card · BYO AI key · native Gmail send</span>
          </div>
        </div>

        <div className="rf-hero__canvas">
          <Constellation />
          <MobileFlow />
        </div>
      </section>

      {/* ── PHILOSOPHY ── */}
      <section className="rf-philo">
        <div className="rf-philo__inner">
          <div className="rf-philo__left">
            <span className="rf-eyebrow">Why we built it</span>
            <h2 className="rf-philo__heading">
              Job hunting wasn&apos;t broken. The tools were.
            </h2>
            <p className="rf-philo__body">
              Spreadsheets for tracking. Docs for resumes. A dozen Gmail drafts. A folder you don&apos;t
              open. ReachFlow is what you&apos;d build if you wanted the entire campaign on one connected
              canvas — searchable, encrypted, and yours.
            </p>
          </div>
          <div className="rf-philo__right">
            <PhilosophySketch />
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="rf-features" id="inside">
        <div className="rf-section__inner">
          <div className="rf-features__head">
            <span className="rf-eyebrow">Inside ReachFlow</span>
            <h2 className="rf-features__heading">Six surfaces, one workflow.</h2>
          </div>

          <ol className="rf-features__list">
            {FEATURES.map(f => (
              <li key={f.num} className="rf-feature-row">
                <span className="rf-feature-row__num">{f.num}</span>
                <div className="rf-feature-row__body">
                  <h3 className="rf-feature-row__title">
                    {f.title}
                    {f.ai && <span className="rf-feature-row__ai" aria-label="AI-powered">AI</span>}
                  </h3>
                  <p className="rf-feature-row__desc">{f.desc}</p>
                </div>
                <span className="rf-feature-row__icon">
                  <f.icon size={16} strokeWidth={1.7} />
                </span>
              </li>
            ))}
          </ol>
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
