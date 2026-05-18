import React from 'react';
import InfoPageLayout, { InfoSection, InfoList } from './InfoPageLayout.jsx';
import {
  Info, UserCheck, CheckCircle2, Mail, KeyRound,
  AlertTriangle, Ban, RefreshCw, AtSign,
} from 'lucide-react';

export default function TermsOfUsePage() {
  return (
    <InfoPageLayout
      eyebrow="Terms of Use"
      title="The rules for"
      accent="using ReachFlow."
      subtitle="A short, plain-language summary of how ReachFlow may be used and what each side is responsible for."
      lastUpdated="March 2026"
    >
      <InfoSection num="01" icon={Info} title="Introduction">
        <p>
          ReachFlow is an outreach tool that helps users organize contacts and send personalized emails using Gmail.
        </p>
      </InfoSection>

      <InfoSection num="02" icon={UserCheck} title="User responsibilities">
        <InfoList
          items={[
            'You are responsible for the emails you send through ReachFlow.',
            'You are responsible for complying with anti-spam and email marketing laws in your region.',
            'You are responsible for the accuracy and lawfulness of your contact data.',
          ]}
        />
      </InfoSection>

      <InfoSection num="03" icon={CheckCircle2} title="Acceptable use">
        <InfoList
          items={[
            'Do not use ReachFlow for spam campaigns.',
            'Do not use ReachFlow for harassment, abuse, or threatening communication.',
            'Do not use ReachFlow for illegal or fraudulent activity.',
          ]}
        />
      </InfoSection>

      <InfoSection num="04" icon={Mail} title="Gmail usage disclaimer">
        <InfoList
          items={[
            'ReachFlow uses the Gmail API to send emails from your connected account.',
            'ReachFlow is not affiliated with or endorsed by Google.',
            'You must comply with Google policies when using Gmail through ReachFlow.',
          ]}
        />
      </InfoSection>

      <InfoSection num="05" icon={KeyRound} title="Account and access">
        <InfoList
          items={[
            'You are responsible for keeping your account access secure.',
            'Access to ReachFlow can be limited or revoked if misuse is detected.',
          ]}
        />
      </InfoSection>

      <InfoSection num="06" icon={AlertTriangle} title="Limitation of liability">
        <InfoList
          items={[
            <>ReachFlow is provided on an <em>&ldquo;as is&rdquo;</em> and <em>&ldquo;as available&rdquo;</em> basis.</>,
            'We are not liable for email delivery issues, third-party outages, or user misuse of the platform.',
          ]}
        />
      </InfoSection>

      <InfoSection num="07" icon={Ban} title="Termination">
        <p>
          We may suspend or terminate accounts that violate these terms or use ReachFlow in abusive ways.
        </p>
      </InfoSection>

      <InfoSection num="08" icon={RefreshCw} title="Changes to terms">
        <p>
          We may update these Terms of Use from time to time. Continued use of ReachFlow after updates means you accept
          the revised terms.
        </p>
      </InfoSection>

      <InfoSection num="09" icon={AtSign} title="Contact">
        <p>
          For questions about these terms, reach out at{' '}
          <a className="rf-info-link" href="mailto:jay.prajapati5717@gmail.com">jay.prajapati5717@gmail.com</a>.
        </p>
      </InfoSection>
    </InfoPageLayout>
  );
}
