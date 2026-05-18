import React from 'react';
import InfoPageLayout, { InfoSection, InfoList, InfoCallout } from './InfoPageLayout.jsx';
import {
  Info, Database, Workflow, Mail, Lock, Share2, Trash2, UserCheck,
  FileText, AtSign, ShieldCheck, EyeOff, KeyRound,
} from 'lucide-react';

const PROMISES = [
  { icon: ShieldCheck, label: 'Never sold',  desc: 'Your data is not sold to third parties — ever.' },
  { icon: EyeOff,      label: 'Never read',  desc: 'We do not read or scan the contents of your inbox.' },
  { icon: KeyRound,    label: 'Never shared', desc: 'Your data is used only inside ReachFlow to power the service.' },
];

export default function PrivacyPolicyPage() {
  return (
    <InfoPageLayout
      eyebrow="Privacy Policy"
      title="Your data path,"
      accent="drawn straight."
      subtitle="This policy explains what data ReachFlow uses, how it is protected, and how you stay in control of your Gmail connection and outreach data."
      lastUpdated="March 2026"
    >
      <section className="rf-info-promises" aria-label="Our privacy promises">
        {PROMISES.map((p) => (
          <div key={p.label} className="rf-info-promise">
            <span className="rf-info-promise__icon" aria-hidden="true">
              <p.icon size={16} strokeWidth={1.7} />
            </span>
            <div>
              <h3 className="rf-info-promise__label">{p.label}</h3>
              <p className="rf-info-promise__desc">{p.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <InfoSection num="01" icon={Info} title="Introduction">
        <p>
          ReachFlow is an outreach tool that helps you organize contacts, personalize emails, and send messages
          through your own Gmail account. You control what gets sent and when it gets sent.
        </p>
      </InfoSection>

      <InfoSection num="02" icon={Database} title="Information we collect">
        <InfoList
          items={[
            'Account information, such as your name and email address from Firebase authentication.',
            'Contact data you add, such as name, email, LinkedIn URL, role, and similar outreach fields.',
            'Email content you create, including subject lines, message body text, and templates.',
            'Usage metadata, such as timestamps, send counts, and delivery status used for app operation.',
          ]}
        />
      </InfoSection>

      <InfoSection num="03" icon={Workflow} title="How we use information">
        <InfoList
          items={[
            'To send emails on your behalf when you choose to send a campaign.',
            'To manage your contacts, groups, and templates inside ReachFlow.',
            'To provide personalization features using your saved variables and recipient data.',
            'To keep the application working reliably and improve core functionality.',
          ]}
        />
      </InfoSection>

      <InfoSection num="04" icon={Mail} title="Gmail integration and permissions">
        <InfoList
          items={[
            <>ReachFlow only requests the Gmail send permission: <code>gmail.send</code>.</>,
            'ReachFlow does not read your inbox emails.',
            'ReachFlow sends emails only when you explicitly trigger a send action.',
          ]}
        />
      </InfoSection>

      <InfoSection num="05" icon={Lock} title="Data storage and security">
        <p>
          We protect your data with account-scoped access controls and secure storage practices. Sensitive outreach
          content is protected at rest, while minimal operational data is used to keep the app fast and reliable.
        </p>
        <h3 className="rf-info-subhead">Technical security measures</h3>
        <InfoList
          items={[
            'Sensitive content is encrypted at rest using authenticated encryption with versioned envelopes and managed key identifiers.',
            'User-owned records are accessed through ownership-scoped queries tied to authenticated identity.',
            'Refresh tokens used for Gmail connectivity are stored encrypted.',
            'Minimal operational metadata may remain plaintext for reliability, including timestamps, status flags, and counts.',
            'Derived lookup helpers (such as normalized hashes/keys) are used for dedupe and grouping where appropriate.',
          ]}
        />
      </InfoSection>

      <InfoSection num="06" icon={Share2} title="Data sharing">
        <InfoList
          items={[
            'We do not sell your data.',
            'We do not share your data with third parties for marketing or advertising.',
            'Your data is used only within ReachFlow to provide the service.',
          ]}
        />
      </InfoSection>

      <InfoSection num="07" icon={Trash2} title="Data retention and deletion">
        <InfoList
          items={[
            'You can delete your data from ReachFlow.',
            'Using Delete My Account removes your stored ReachFlow data.',
            'You can disconnect Gmail access at any time.',
          ]}
        />
      </InfoSection>

      <InfoSection num="08" icon={UserCheck} title="User rights">
        <InfoList
          items={[
            'You can access, update, or delete the data you store in ReachFlow.',
            'You can control and revoke your Gmail connection at any time.',
          ]}
        />
      </InfoSection>

      <InfoSection num="09" icon={FileText} title="Logging and safety">
        <InfoList
          items={[
            'Operational logs are designed not to store personal email content.',
            'Logs focus on non-sensitive operational metadata, such as IDs, counts, and status outcomes.',
          ]}
        />
      </InfoSection>

      <InfoSection num="10" icon={AtSign} title="Contact">
        <p>
          For privacy questions, reach out at{' '}
          <a className="rf-info-link" href="mailto:jay.prajapati5717@gmail.com">jay.prajapati5717@gmail.com</a>.
        </p>
      </InfoSection>
    </InfoPageLayout>
  );
}
