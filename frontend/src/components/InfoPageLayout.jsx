import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from '../router.jsx';
import { useApp } from '../contexts/AppContext.jsx';
import { Waypoints, Sun, Moon, ArrowLeft, ChevronRight } from 'lucide-react';

// ──────────────────────────────────────────────────────────
// Shared layout shell for public info pages (About / Privacy / Terms).
// Wraps content in the landing palette + sticky header + footer.
// ──────────────────────────────────────────────────────────

export default function InfoPageLayout({
  eyebrow,
  title,
  accent,
  subtitle,
  lastUpdated,
  children,
}) {
  const { navigateTo, path } = useRouter();
  const { theme, toggleTheme } = useApp();
  const rootRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const linkTo = (e, target) => {
    e.preventDefault();
    navigateTo(target);
  };

  return (
    <div className="rf-landing rf-info" ref={rootRef}>
      <header className="rf-landing__header" data-scrolled={scrolled ? 'true' : 'false'}>
        <a
          href="/"
          className="rf-landing__brand"
          aria-label="ReachFlow"
          onClick={(e) => linkTo(e, '/')}
        >
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
          <button
            className="rf-btn rf-btn--ghost rf-btn--sm rf-info__back"
            onClick={() => navigateTo('/')}
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
            Back
          </button>
        </div>
      </header>

      <section className="rf-info__hero">
        <span className="rf-eyebrow">{eyebrow}</span>
        <h1 className="rf-info__title">
          {title}
          {accent && (
            <>
              {' '}
              <span className="rf-info__title-accent">{accent}</span>
            </>
          )}
        </h1>
        {subtitle && <p className="rf-info__subtitle">{subtitle}</p>}
        {lastUpdated && (
          <span className="rf-info__updated">Last updated · {lastUpdated}</span>
        )}
      </section>

      <main className="rf-info__body">{children}</main>

      <footer className="rf-landing__footer">
        <span className="rf-landing__footer-meta">reachflow · v1 · early access</span>
        <nav className="rf-landing__footer-links">
          <a
            href="/about"
            onClick={(e) => linkTo(e, '/about')}
            aria-current={path === '/about' ? 'page' : undefined}
          >About</a>
          <a
            href="/privacy-policy"
            onClick={(e) => linkTo(e, '/privacy-policy')}
            aria-current={path === '/privacy-policy' ? 'page' : undefined}
          >Privacy</a>
          <a
            href="/terms-of-use"
            onClick={(e) => linkTo(e, '/terms-of-use')}
            aria-current={path === '/terms-of-use' ? 'page' : undefined}
          >Terms</a>
        </nav>
      </footer>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Reusable section primitives — used by all three info pages.
// ──────────────────────────────────────────────────────────

export function InfoSection({ num, icon: Icon, title, children }) {
  return (
    <section className="rf-info-section">
      <header className="rf-info-section__head">
        {num && <span className="rf-info-section__num">{num}</span>}
        {Icon && (
          <span className="rf-info-section__icon" aria-hidden="true">
            <Icon size={14} strokeWidth={1.8} />
          </span>
        )}
        <h2 className="rf-info-section__title">{title}</h2>
      </header>
      <div className="rf-info-section__body">{children}</div>
    </section>
  );
}

export function InfoList({ items }) {
  return (
    <ul className="rf-info-list">
      {items.map((node, i) => (
        <li key={i} className="rf-info-list__item">
          <span className="rf-info-list__bullet" aria-hidden="true">
            <ChevronRight size={11} strokeWidth={2.4} />
          </span>
          <span>{node}</span>
        </li>
      ))}
    </ul>
  );
}

export function InfoCallout({ icon: Icon, tone = 'neutral', title, children }) {
  return (
    <div className={`rf-info-callout rf-info-callout--${tone}`}>
      {Icon && (
        <span className="rf-info-callout__icon" aria-hidden="true">
          <Icon size={15} strokeWidth={1.8} />
        </span>
      )}
      <div className="rf-info-callout__body">
        {title && <strong className="rf-info-callout__title">{title}</strong>}
        <span>{children}</span>
      </div>
    </div>
  );
}
