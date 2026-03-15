import React from 'react';
import { Shield, Database, KeyRound, Mail, Lock, EyeOff, ExternalLink } from 'lucide-react';

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
          Last updated: March 2026. This policy explains what ReachFlow stores, how Gmail/Firebase are used,
          and how your outreach data is handled.
        </p>
      </div>

      <section className="info-grid">
        <PrivacyCard
          icon={<Shield size={18} />}
          title="Data protection principles"
          text="ReachFlow keeps data handling focused on campaign workflows and avoids unnecessary inbox-access permissions."
        />
        <PrivacyCard
          icon={<Database size={18} />}
          title="What we store"
          text="Account basics, contacts/groups, templates, draft snapshots, and campaign metadata are stored so work can be resumed reliably."
        />
        <PrivacyCard
          icon={<KeyRound size={18} />}
          title="Auth and identity"
          text="Firebase authentication is used for sign-in, and backend APIs verify Firebase ID tokens for each protected request."
        />
        <PrivacyCard
          icon={<Mail size={18} />}
          title="Gmail usage"
          text="Gmail OAuth is used for sending workflows and sender identity checks; emails send only after explicit user action."
        />
        <PrivacyCard
          icon={<EyeOff size={18} />}
          title="Inbox access"
          text="ReachFlow does not request Gmail read-only inbox scope and does not read mailbox content for campaign operation."
        />
        <PrivacyCard
          icon={<Lock size={18} />}
          title="Token security"
          text="Refresh tokens used to keep Gmail connected are stored encrypted in backend storage."
        />
      </section>

      <section className="info-section">
        <h2>Overview</h2>
        <p>
          ReachFlow is designed to help users compose and send personalized outreach emails through their own Gmail account.
          This policy explains what data is processed and how it is used.
        </p>
      </section>

      <section className="info-section">
        <h2>What data is collected</h2>
        <p>
          ReachFlow collects account identity information from Firebase authentication (such as Firebase UID, email, and display name),
          compose content you create, recipients you add, groups/contacts, templates, drafts, and campaign send history metadata.
        </p>
      </section>

      <section className="info-section">
        <h2>What is stored</h2>
        <p>
          Stored data can include contacts, group records, recipient variables and values, templates, draft snapshots, campaign records,
          and Gmail connection state used to keep your account connected between sessions.
        </p>
      </section>

      <section className="info-section">
        <h2>Firebase authentication usage</h2>
        <p>
          Firebase is used for sign-in and identity verification. ReachFlow backend verifies Firebase ID tokens to authenticate API requests.
        </p>
      </section>

      <section className="info-section">
        <h2>Gmail authorization usage</h2>
        <p>
          ReachFlow requests OAuth scopes for OpenID profile information and Gmail sending. It uses Gmail APIs to send messages and resolve sender identities.
          Emails are sent only when you explicitly trigger send actions.
        </p>
      </section>

      <section className="info-section">
        <h2>Inbox access</h2>
        <p>
          ReachFlow does not request Gmail read-only inbox access and does not read your inbox contents for campaign operation.
        </p>
      </section>

      <section className="info-section">
        <h2>OAuth tokens and security</h2>
        <p>
          OAuth refresh tokens may be stored to keep Gmail connected between sessions. Refresh tokens are stored in encrypted form in the backend.
          Access tokens are used transiently for authorized API calls.
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
