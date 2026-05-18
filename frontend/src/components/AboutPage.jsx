import React from 'react';
import InfoPageLayout, { InfoSection, InfoList, InfoCallout } from './InfoPageLayout.jsx';
import {
  BookUser, SendHorizonal, FileText, Lock, ShieldCheck,
  Compass, Database, History, AlertTriangle,
} from 'lucide-react';

const HIGHLIGHTS = [
  {
    num: '01',
    icon: SendHorizonal,
    title: 'Personalized compose flow',
    desc: 'Compose once, personalize per recipient with {{name}} and custom variables, preview output, then send only on explicit action.',
  },
  {
    num: '02',
    icon: BookUser,
    title: 'Groups, bulk import, and dedupe',
    desc: 'Manage contacts by company, bulk paste or CSV import across groups, auto-route by domain, and skip duplicates consistently.',
  },
  {
    num: '03',
    icon: FileText,
    title: 'Drafts and reusable templates',
    desc: 'Drafts store full editable compose snapshots. Templates store reusable content patterns for fast campaign setup.',
  },
  {
    num: '04',
    icon: Lock,
    title: 'Encrypted data at rest',
    desc: 'Sensitive content is encrypted server-side with authenticated encryption, while safe metadata remains queryable for app behavior.',
  },
  {
    num: '05',
    icon: ShieldCheck,
    title: 'User-scoped and auditable',
    desc: 'User-owned records are queried by ownership scope, with migration and security controls designed for safe long-term operation.',
  },
];

export default function AboutPage() {
  return (
    <InfoPageLayout
      eyebrow="About"
      title="One canvas for the"
      accent="whole job search."
      subtitle="ReachFlow is a privacy-first outreach workspace for composing personalized emails, organizing contacts by company, and running repeatable campaigns without spreadsheet-heavy workflows."
    >
      <section className="rf-info-feature-block">
        <header className="rf-info-feature-block__head">
          <span className="rf-eyebrow">What you get</span>
          <h2 className="rf-info-feature-block__heading">Five surfaces, one workflow.</h2>
        </header>
        <ol className="rf-info-feature-list">
          {HIGHLIGHTS.map((h) => (
            <li key={h.num} className="rf-info-feature-row">
              <span className="rf-info-feature-row__num">{h.num}</span>
              <div className="rf-info-feature-row__body">
                <h3 className="rf-info-feature-row__title">{h.title}</h3>
                <p className="rf-info-feature-row__desc">{h.desc}</p>
              </div>
              <span className="rf-info-feature-row__icon">
                <h.icon size={16} strokeWidth={1.7} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <InfoSection icon={Compass} title="How ReachFlow works">
        <p>
          ReachFlow combines compose, contact management, and campaign execution in one flow. You can create groups,
          import contacts, draft personalized messages, preview recipient-level output, and send through your connected
          Gmail account. Campaign status and history remain visible so outreach can be resumed and tracked over time.
        </p>
      </InfoSection>

      <InfoSection icon={Database} title="Security and storage model">
        <p>
          ReachFlow uses server-side hybrid encryption. Sensitive user-generated content is encrypted at rest, while
          limited operational metadata is stored in plaintext only when needed for filtering, counters, and fast list
          rendering. Derived lookup fields are used for dedupe and grouping workflows without relying on plaintext
          personal data.
        </p>
      </InfoSection>

      <InfoSection icon={History} title="Drafts, templates, and history">
        <p>
          Draft snapshots are stored as outreach items and filtered by status so active work and sent records are both
          available. Templates remain reusable message patterns. Send logs capture operational send metadata while
          preserving privacy boundaries.
        </p>
      </InfoSection>

      <InfoCallout
        icon={AlertTriangle}
        tone="warm"
        title="What ReachFlow is not."
      >
        ReachFlow is not an inbox reader or an autonomous sender. It does not send campaigns in the background without
        a user-triggered action.
      </InfoCallout>
    </InfoPageLayout>
  );
}
