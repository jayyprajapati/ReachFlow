import React from 'react';

export default function TermsOfUsePage({ onBack }) {
  return (
    <div className="info-page-wrap">
      <div className="info-page-head">
        <button className="link" onClick={onBack}>← Back to app</button>
        <h1>Terms of Use</h1>
        <p>
          Last updated: March 2026. These terms explain the rules for using ReachFlow.
        </p>
      </div>

      <section className="info-section">
        <h2>1. Introduction</h2>
        <p>
          ReachFlow is an outreach tool that helps users organize contacts and send personalized emails using Gmail.
        </p>
      </section>

      <section className="info-section">
        <h2>2. User Responsibilities</h2>
        <ul>
          <li>You are responsible for the emails you send through ReachFlow.</li>
          <li>You are responsible for complying with anti-spam and email marketing laws in your region.</li>
          <li>You are responsible for the accuracy and lawfulness of your contact data.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>3. Acceptable Use</h2>
        <ul>
          <li>Do not use ReachFlow for spam campaigns.</li>
          <li>Do not use ReachFlow for harassment, abuse, or threatening communication.</li>
          <li>Do not use ReachFlow for illegal or fraudulent activity.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>4. Gmail Usage Disclaimer</h2>
        <ul>
          <li>ReachFlow uses the Gmail API to send emails from your connected account.</li>
          <li>ReachFlow is not affiliated with or endorsed by Google.</li>
          <li>You must comply with Google policies when using Gmail through ReachFlow.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>5. Account and Access</h2>
        <ul>
          <li>You are responsible for keeping your account access secure.</li>
          <li>Access to ReachFlow can be limited or revoked if misuse is detected.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>6. Limitation of Liability</h2>
        <ul>
          <li>ReachFlow is provided on an "as is" and "as available" basis.</li>
          <li>We are not liable for email delivery issues, third-party outages, or user misuse of the platform.</li>
        </ul>
      </section>

      <section className="info-section">
        <h2>7. Termination</h2>
        <p>
          We may suspend or terminate accounts that violate these terms or use ReachFlow in abusive ways.
        </p>
      </section>

      <section className="info-section">
        <h2>8. Changes to Terms</h2>
        <p>
          We may update these Terms of Use from time to time. Continued use of ReachFlow after updates means you accept the revised terms.
        </p>
      </section>

      <section className="info-section">
        <h2>9. Contact</h2>
        <p>For questions about these terms, contact: jay.prajapati5717@gmail.com.</p>
      </section>
    </div>
  );
}
