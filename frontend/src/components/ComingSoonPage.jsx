import React from 'react';
import { useRouter } from '../router.jsx';
import { Lock, ArrowLeft } from 'lucide-react';

export default function ComingSoonPage({ feature = 'This feature' }) {
  const { navigateTo } = useRouter();
  return (
    <div className="rf-page rf-page--wide rf-coming-soon-page">
      <div className="rf-coming-soon-card">
        <div className="rf-coming-soon-card__badge">
          <Lock size={20} strokeWidth={1.8} />
        </div>
        <div className="rf-coming-soon-card__eyebrow">Coming soon</div>
        <h1 className="rf-coming-soon-card__title">{feature} is paused</h1>
        <p className="rf-coming-soon-card__desc">
          We're tuning this experience and have temporarily disabled it. The rest of the workspace is fully available — head back to your dashboard and we'll let you know when this is ready.
        </p>
        <div className="rf-coming-soon-card__actions">
          <button className="rf-btn rf-btn--primary" onClick={() => navigateTo('/')}>
            <ArrowLeft size={14} /> Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
