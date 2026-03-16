import React from 'react';
import { Shield, Database, KeyRound, Mail, Lock, ExternalLink } from 'lucide-react';

function PrivacyCard({ icon, title, text }) {
  return (
    <article className="info-card">
      <div className="info-card__icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

const PERSONAL_SITE_URL = import.meta.env.VITE_PERSONAL_SITE_URL || 'https://jayprajapati.dev';

export default function PrivacyPolicyPage({ onBack }) {
  return (
    <div className="info-page-wrap">
      <div className="info-page-head">
        <button className="link" onClick={onBack}>← Back to app</button>
        <h1>Privacy Policy</h1>
        <p>
          Last updated: March 2026. This policy explains how ReachFlow protects outreach data, what is encrypted,
          and how account-scoped access is enforced.
        </p>
      </div>

      <section className="info-grid">
        <PrivacyCard
          icon={<Shield size={18} />}
          title="Server-side encryption"
          text="Sensitive content is encrypted at rest using authenticated encryption with versioned envelopes and managed key identifiers."
        />
        <PrivacyCard
          icon={<Database size={18} />}
          title="Hybrid storage model"
          text="Only minimal operational metadata remains queryable in plaintext; personal content is encrypted before MongoDB persistence."
        />
        <PrivacyCard
          icon={<KeyRound size={18} />}
          title="Derived lookup protection"
          text="Exact-match dedupe and grouping logic use normalized helper values like email hashes and company keys instead of plaintext lookup."
        />
        <PrivacyCard
          icon={<Mail size={18} />}
          title="Strict user ownership scope"
          text="User-owned records are read, updated, and deleted only through ownership-scoped queries tied to authenticated identity."
        />
        <PrivacyCard
          icon={<Lock size={18} />}
          title="OAuth token security"
          text="Refresh tokens used to keep Gmail connected are stored encrypted, and Gmail sends occur only on explicit user action."
        />
      </section>

      <section className="info-section">
        <h2>Overview</h2>
        <p>
          ReachFlow helps users compose and send personalized outreach through their own Gmail account while minimizing privacy risk.
          The backend decrypts only for authorized app operations and never requires client-side encryption.
        </p>
      </section>

      <section className="info-section">
        <h2>What is encrypted</h2>
        <p>
          Encrypted fields include sensitive compose content, recipient payloads, template content, variable definitions,
          and group contact personal fields such as names, emails, LinkedIn URLs, and related personal contact payloads.
        </p>
      </section>

      <section className="info-section">
        <h2>What remains plaintext and why</h2>
        <p>
          Non-sensitive operational metadata can remain plaintext for reliability and app behavior: ownership references,
          timestamps, status flags, counts, and limited grouping keys required for dedupe and filtering.
        </p>
      </section>

      <section className="info-section">
        <h2>Authentication and access control</h2>
        <p>
          Firebase is used for sign-in and identity verification. Backend APIs verify Firebase ID tokens and enforce ownership-scoped
          queries for user data access.
        </p>
      </section>

      <section className="info-section">
        <h2>Gmail authorization usage</h2>
        <p>
          ReachFlow requests OAuth scopes for OpenID profile information and Gmail sending. It uses Gmail APIs to send messages and
          resolve sender identities, and sends only when explicitly triggered by a user.
        </p>
      </section>

      <section className="info-section">
        <h2>Collection and migration governance</h2>
        <p>
          ReachFlow data collections use the reachflow_ prefix. Schema or encryption migrations are executed via an explicit migration
          command and are not part of normal application startup.
        </p>
      </section>

      <section className="info-section">
        <h2>Logging and operational safety</h2>
        <p>
          Operational logs should avoid plaintext personal content and should focus on non-sensitive metadata such as IDs, counts,
          and status outcomes.
        </p>
      </section>

      <section className="info-section">
        <h2>Disconnecting Gmail and data removal</h2>
        <p>
          You can disconnect Gmail from within ReachFlow settings. If account deletion/self-serve data deletion is not yet exposed in product UI,
          request support via: jay.prajapati5717@gmail.com.
        </p>
      </section>

      <section className="info-section">
        <h2>Contact</h2>
        <p>For privacy questions, contact: jay.prajapati5717@gmail.com.</p>
        <p>
          Personal site:{' '}
          <a className="link info-inline-link" href={PERSONAL_SITE_URL} target="_blank" rel="noreferrer noopener">
            Visit website <ExternalLink size={13} />
          </a>
        </p>
      </section>
    </div>
  );
}
