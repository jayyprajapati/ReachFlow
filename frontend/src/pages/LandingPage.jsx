import React, { useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import {
  Waypoints, Sun, Moon, X, AlertTriangle,
  BookUser, SendHorizonal, LayoutDashboard, Sparkles,
  Paperclip, MailCheck,
} from 'lucide-react';

const MAIN_NODES = [
  { slot: 'contacts', icon: BookUser,        title: 'Contacts Ledger',      desc: 'Store every connection',             pos: { left: '30%', top: '50%' } },
  { slot: 'compose',  icon: SendHorizonal,   title: 'Compose',              desc: 'Personalized email to dozens',        pos: { left: '50%', top: '36%' } },
  { slot: 'apps',     icon: LayoutDashboard, title: 'Application Tracking', desc: 'Log, parse, and track',               pos: { left: '70%', top: '50%' } },
  { slot: 'resume',   icon: Sparkles,        title: 'Resume Lab',           desc: 'AI-powered resume optimization',      pos: { left: '50%', top: '68%' }, accent: true },
];

const FLOATERS = [
  { id: 'gmail',       icon: MailCheck, label: 'Gmail Native',            connectedTo: 'compose',  pos: { left: '22%', top: '28%' }, dur: '3.1s' },
  { id: 'attachments', icon: Paperclip, label: 'Attachments',             connectedTo: 'compose',  pos: { left: '81%', top: '31%' }, dur: '2.7s' },
];

function Constellation({ login }) {
  const containerRef = useRef(null);
  const nodeRefs    = useRef({});
  const floaterRefs = useRef({});
  const [paths, setPaths]       = useState([]);
  const [svgDims, setSvgDims]   = useState({ w: 0, h: 0 });
  const [svgKey, setSvgKey]     = useState(0);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (MAIN_NODES.some(n => !nodeRefs.current[n.slot]))    return;
    if (FLOATERS.some(f => !floaterRefs.current[f.id]))     return;

    const cr = container.getBoundingClientRect();
    const center = (el) => {
      const r = el.getBoundingClientRect();
      return { cx: r.left - cr.left + r.width / 2, cy: r.top - cr.top + r.height / 2 };
    };

    const N = {};
    MAIN_NODES.forEach(n => { N[n.slot] = center(nodeRefs.current[n.slot]); });
    const F = {};
    FLOATERS.forEach(f => { F[f.id] = center(floaterRefs.current[f.id]); });

    const { contacts: c, compose: co, apps: a, resume: r } = N;

    const mainPaths = [
      { id: 'p1', d: `M ${c.cx},${c.cy} L ${co.cx},${co.cy}`,                                          dur: '1.8s', main: true },
      { id: 'p2', d: `M ${co.cx},${co.cy} L ${a.cx},${a.cy}`,                                          dur: '2.2s', main: true },
      { id: 'p3', d: `M ${r.cx},${r.cy} L ${co.cx},${co.cy}`,                                          dur: '2.6s', main: true },
    ];

    const floaterPaths = FLOATERS.map(f => ({
      id:   `fp-${f.id}`,
      d:    `M ${F[f.id].cx},${F[f.id].cy} L ${N[f.connectedTo].cx},${N[f.connectedTo].cy}`,
      dur:  f.dur,
      main: false,
    }));

    setPaths([...mainPaths, ...floaterPaths]);
    setSvgDims({ w: cr.width, h: cr.height });
    setSvgKey(k => k + 1);
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
    FLOATERS.forEach(f => {
      const el = floaterRefs.current[f.id];
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
        key={svgKey}
        className="rf-constellation__svg"
        width={svgDims.w || '100%'}
        height={svgDims.h || '100%'}
        aria-hidden="true"
      >
        {paths.map(p => (
          <path key={p.id} id={p.id} d={p.d} fill="none"
            className={p.main ? 'rf-cpath' : 'rf-cpath--secondary'} />
        ))}
        {paths.filter(p => p.main).map(p => (
          <circle key={`dot-${p.id}`} r={3}
            className="rf-cdot">
            <animateMotion dur={p.dur} repeatCount="indefinite" calcMode="linear">
              <mpath href={`#${p.id}`} />
            </animateMotion>
          </circle>
        ))}
      </svg>

      {/* Hero text — top center */}
      <div className="rf-constellation__hero">
        <span className="rf-constellation__eyebrow">for serious job seekers</span>
        <h1 className="rf-constellation__title">
          Your entire job search, <span>one place.</span>
        </h1>
        <p className="rf-constellation__subtitle">
          Contacts, outreach, applications, and AI-powered resumes — connected by design.
        </p>
      </div>

      {/* 4 main nodes */}
      {MAIN_NODES.map(n => (
        <div
          key={n.slot}
          ref={el => { nodeRefs.current[n.slot] = el; }}
          className={`rf-main-node${n.accent ? ' rf-main-node--accent' : ''}`}
          style={n.pos}
        >
          <div className="rf-main-node__icon"><n.icon size={18} /></div>
          <div className="rf-main-node__title">{n.title}</div>
          <div className="rf-main-node__desc">{n.desc}</div>
        </div>
      ))}

      {/* Floating secondary features */}
      {FLOATERS.map(f => (
        <div
          key={f.id}
          ref={el => { floaterRefs.current[f.id] = el; }}
          className="rf-floater"
          style={f.pos}
        >
          <div className="rf-floater__icon"><f.icon size={11} /></div>
          <span className="rf-floater__label">{f.label}</span>
        </div>
      ))}

      {/* CTA — bottom center */}
      <div className="rf-constellation__cta">
        <button className="rf-btn rf-btn--primary rf-btn--lg" onClick={login}>
          Get Started — Free
        </button>
        <p className="rf-constellation__trust">
          Encrypted at rest and in transit · We never read your emails
        </p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { login, theme, toggleTheme } = useApp();
  const [bannerVisible, setBannerVisible] = useState(() => {
    try { return !localStorage.getItem('rf-scope-banner-dismissed'); } catch { return true; }
  });

  const dismissBanner = () => {
    setBannerVisible(false);
    try { localStorage.setItem('rf-scope-banner-dismissed', '1'); } catch {}
  };

  return (
    <div className="rf-landing">
      {bannerVisible && (
        <div className="rf-scope-banner">
          <AlertTriangle size={13} className="rf-scope-banner__icon" />
          <span>
            ReachFlow is awaiting <strong>Google OAuth scope approval</strong> for <code>gmail.send</code>.
            {' '}Meanwhile,{' '}
            <a href="#demo">watch the demo</a>
            {' '}or{' '}
            <a href="mailto:jay.prajapati5717@gmail.com">email to request early access</a>
            {' '}— we&apos;ll add you shortly.
          </span>
          <button onClick={dismissBanner} className="rf-scope-banner__close" aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      <header className="rf-landing__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--rf-sp-3)' }}>
          <div className="rf-sidebar__logo"><Waypoints size={18} /></div>
          <span className="rf-landing__brand-name">ReachFlow</span>
        </div>
        <div className="rf-landing__header-actions">
          <button
            className="rf-btn rf-btn--ghost rf-btn--icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="rf-btn rf-btn--primary" onClick={login}>Sign in with Google</button>
        </div>
      </header>

      <Constellation login={login} />

      <footer className="rf-landing__footer">
        <a href="/about">About</a>
        <a href="/privacy-policy">Privacy</a>
        <a href="/terms-of-use">Terms</a>
      </footer>
    </div>
  );
}
