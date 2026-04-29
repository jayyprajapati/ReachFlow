import React from 'react';
import { Mail, Users, FileText, History, Shield } from 'lucide-react';
import { useRouter } from '../router.jsx';

function InfoCard({ icon, title, text }) {
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

export default function AboutPage() {
  const { navigateTo } = useRouter();

  return (
    <div className="info-page-wrap">
      <div className="info-page-head">
        <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => navigateTo('/')}>Back to app</button>
        <h1>About ReachFlow</h1>
        <p>
          ReachFlow is a privacy-first outreach workspace for composing personalized emails, organizing contacts by company,
          and running repeatable campaigns without spreadsheet-heavy workflows.
        </p>
      </div>

      <section className="info-grid">
        <InfoCard
          icon={<Mail size={18} />}
          title="Personalized compose flow"
          text="Compose once, personalize per recipient with {{name}} and custom variables, preview output, then send only on explicit action."
        />
        <InfoCard
          icon={<Users size={18} />}
          title="Groups, bulk import, and dedupe"
          text="Manage contacts by company, bulk paste or CSV import across groups, auto-route by domain, and skip duplicates consistently."
        />
        <InfoCard
          icon={<History size={18} />}
          title="Drafts and reusable templates"
          text="Drafts store full editable compose snapshots. Templates store reusable content patterns for fast campaign setup."
        />
        <InfoCard
          icon={<FileText size={18} />}
          title="Encrypted data at rest"
          text="Sensitive content is encrypted server-side with authenticated encryption, while safe metadata remains queryable for app behavior."
        />
        <InfoCard
          icon={<Shield size={18} />}
          title="User-scoped and auditable"
          text="User-owned records are queried by ownership scope, with migration and security controls designed for safe long-term operation."
        />
      </section>

      <section className="info-section">
        <h2>How ReachFlow works</h2>
        <p>
          ReachFlow combines compose, contact management, and campaign execution in one flow. You can create groups,
          import contacts, draft personalized messages, preview recipient-level output, and send through your connected Gmail account.
          Campaign status and history remain visible so outreach can be resumed and tracked over time.
        </p>
      </section>

      <section className="info-section">
        <h2>Security and storage model</h2>
        <p>
          ReachFlow uses server-side hybrid encryption. Sensitive user-generated content is encrypted at rest, while limited
          operational metadata is stored in plaintext only when needed for filtering, counters, and fast list rendering.
          Derived lookup fields are used for dedupe and grouping workflows without relying on plaintext personal data.
        </p>
      </section>

      <section className="info-section">
        <h2>Drafts, templates, and history</h2>
        <p>
          Draft snapshots are stored as outreach items and filtered by status so active work and sent records are both available.
          Templates remain reusable message patterns. Send logs capture operational send metadata while preserving privacy boundaries.
        </p>
      </section>

      <section className="info-section">
        <h2>What ReachFlow is not</h2>
        <p>
          ReachFlow is not an inbox reader or autonomous sender. It does not send campaigns in the background without a user-triggered action.
        </p>
      </section>
    </div>
  );
}
