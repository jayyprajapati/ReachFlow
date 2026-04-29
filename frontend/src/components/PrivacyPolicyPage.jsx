import React from 'react';
import { useRouter } from '../router.jsx';

export default function PrivacyPolicyPage() {
  const { navigateTo } = useRouter();

  return (
    <div className="info-page-wrap">
      <div className="info-page-head">
        <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => navigateTo('/')}>Back to app</button>
        <h1>Privacy Policy</h1>
        <p>
          Last updated: March 2026. This policy explains what data ReachFlow uses, how it is protected,
          and how you stay in control of your Gmail connection and outreach data.
        </p>
      </div>

      <section className="info-section">
        <h2>1. Introduction</h2>
        <p>
          ReachFlow is an outreach tool that helps you organize contacts, personalize emails, and send messages through your own Gmail account.
          You control what gets sent and when it gets sent.
        </p>
      </section>

      <section className="info-section">
        <h2>2. Information We Collect</h2>
        <ul>
          <li>Account information, such as your name and email address from Firebase authentication.</li>
          <li>Contact data you add, such as name, email, LinkedIn URL, role, and similar outreach fields.</li>
          <li>Email content you create, including subject lines, message body text, and templates.</li>
          <li>Usage metadata, such as timestamps, send counts, and delivery status used for app operation.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>3. How We Use Information</h2>
        <ul>
          <li>To send emails on your behalf when you choose to send a campaign.</li>
          <li>To manage your contacts, groups, and templates inside ReachFlow.</li>
          <li>To provide personalization features using your saved variables and recipient data.</li>
          <li>To keep the application working reliably and improve core functionality.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>4. Gmail Integration and Permissions</h2>
        <ul>
          <li>ReachFlow only requests the Gmail send permission: <strong>gmail.send</strong>.</li>
          <li>ReachFlow does not read your inbox emails.</li>
          <li>ReachFlow sends emails only when you explicitly trigger a send action.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>5. Data Storage and Security</h2>
        <p>
          We protect your data with account-scoped access controls and secure storage practices. Sensitive outreach content is protected at rest,
          while minimal operational data is used to keep the app fast and reliable.
        </p>
        <h3>Technical Security Measures</h3>
        <ul>
          <li>Sensitive content is encrypted at rest using authenticated encryption with versioned envelopes and managed key identifiers.</li>
          <li>User-owned records are accessed through ownership-scoped queries tied to authenticated identity.</li>
          <li>Refresh tokens used for Gmail connectivity are stored encrypted.</li>
          <li>Minimal operational metadata may remain plaintext for reliability, including timestamps, status flags, and counts.</li>
          <li>Derived lookup helpers (such as normalized hashes/keys) are used for dedupe and grouping where appropriate.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>6. Data Sharing</h2>
        <ul>
          <li>We do not sell your data.</li>
          <li>We do not share your data with third parties for marketing or advertising.</li>
          <li>Your data is used only within ReachFlow to provide the service.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>7. Data Retention and Deletion</h2>
        <ul>
          <li>You can delete your data from ReachFlow.</li>
          <li>Using Delete My Account removes your stored ReachFlow data.</li>
          <li>You can disconnect Gmail access at any time.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>8. User Rights</h2>
        <ul>
          <li>You can access, update, or delete the data you store in ReachFlow.</li>
          <li>You can control and revoke your Gmail connection at any time.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>9. Logging and Safety</h2>
        <ul>
          <li>Operational logs are designed not to store personal email content.</li>
          <li>Logs focus on non-sensitive operational metadata, such as IDs, counts, and status outcomes.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>10. Contact Information</h2>
        <p>For privacy questions, contact: jay.prajapati5717@gmail.com.</p>
      </section>
    </div>
  );
}
