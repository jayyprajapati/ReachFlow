import React from 'react';
import { Mail, Users, FileText, History, Shield, LayoutGrid } from 'lucide-react';

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

export default function AboutPage({ onBack }) {
  return (
    <div className="info-page-wrap">
      <div className="info-page-head">
        <button className="link" onClick={onBack}>← Back to app</button>
        <h1>About ReachFlow</h1>
        <p>
          ReachFlow helps job-seekers and outreach-focused professionals send personalized email campaigns,
          manage contacts by company, and keep everything organized with drafts and templates.
        </p>
      </div>

      <section className="info-section">
        <h2>What ReachFlow is</h2>
        <p>
          ReachFlow is a focused outreach workspace: compose once, personalize per recipient, preview safely,
          and send only when you confirm.
        </p>
      </section>

      <section className="info-grid">
        <InfoCard
          icon={<Mail size={18} />}
          title="How composing works"
          text="Write a subject/body, add recipients, and use variables like {{name}} and your custom fields for personalization."
        />
        <InfoCard
          icon={<Users size={18} />}
          title="Groups and contact tracking"
          text="Organize contacts into groups, import them into a compose session, and automatically track outreach touches."
        />
        <InfoCard
          icon={<History size={18} />}
          title="Drafts vs templates"
          text="Drafts store full working snapshots (recipients, variables, values, settings). Templates store reusable subject and body only."
        />
        <InfoCard
          icon={<FileText size={18} />}
          title="Personalization variables"
          text="ReachFlow includes {{name}} by default and supports up to 2 custom variables for lightweight, controlled personalization."
        />
        <InfoCard
          icon={<Shield size={18} />}
          title="Gmail connection at a high level"
          text="Google OAuth is used to authorize sending from your account. ReachFlow sends only on user action and does not read inbox contents."
        />
        <InfoCard
          icon={<LayoutGrid size={18} />}
          title="Who this is for"
          text="Ideal for outreach campaigns that need personalization and structure without a heavy CRM workflow."
        />
      </section>

      <section className="info-section">
        <h2>What data is stored and why</h2>
        <p>
          ReachFlow stores account profile basics, contact/group data, templates, draft snapshots, and send history so your workflow can be resumed and audited.
          Gmail authorization state is also stored so you can send without reconnecting each time.
        </p>
      </section>

      <section className="info-section">
        <h2>What ReachFlow does not do</h2>
        <p>
          ReachFlow is not an inbox reader, mailbox analytics tool, or autonomous sender. It does not send emails in the background without your explicit action.
        </p>
      </section>
    </div>
  );
}
