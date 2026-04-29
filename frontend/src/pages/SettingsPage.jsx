import React from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { CheckCircle2, XCircle, Save } from 'lucide-react';

export default function SettingsPage() {
  const { gmailConnected, gmailActionLoading, connectGmail, confirmDisconnectGmail, confirmReconnectGmail, senderName, setSenderName, savedSenderName, savingSenderName, saveSenderPreference, grantedScopes, requiredScopes, deleteMyAccount, confirmLogout, appUser } = useApp();

  return (
    <div className="rf-settings">
      <div className="rf-page-header"><div><h1 className="rf-page-header__title">Settings</h1></div></div>

      {/* Gmail */}
      <div className="rf-settings__section">
        <div className="rf-settings__section-title">Gmail Connection</div>
        <div className="rf-settings__row">
          <div><span className="rf-settings__label">Status</span><br /><span className={`rf-badge ${gmailConnected ? 'rf-badge--success' : 'rf-badge--error'}`}>{gmailConnected ? 'Connected' : 'Not connected'}</span></div>
          {gmailConnected ? (
            <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={confirmDisconnectGmail} disabled={gmailActionLoading}>{gmailActionLoading ? 'Working…' : 'Disconnect'}</button>
          ) : (
            <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={connectGmail} disabled={gmailActionLoading}>{gmailActionLoading ? 'Connecting…' : 'Connect Gmail'}</button>
          )}
        </div>
        <button className="rf-btn rf-btn--link" onClick={confirmReconnectGmail} disabled={gmailActionLoading}>{gmailActionLoading ? 'Working…' : 'Reconnect Gmail (fresh OAuth)'}</button>
      </div>

      {/* Account */}
      <div className="rf-settings__section">
        <div className="rf-settings__section-title">Account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
          <div className="rf-label">Sender display name</div>
          <div style={{ display: 'flex', gap: 'var(--rf-sp-2)' }}>
            <input className="rf-input" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Display name (optional)" />
            <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={saveSenderPreference} disabled={savingSenderName || senderName.trim() === savedSenderName}><Save size={14} />{savingSenderName ? 'Saving…' : 'Save'}</button>
          </div>
          <p className="rf-settings__help">Controls the display name in outgoing emails. Leave empty to use your email address.</p>
        </div>
        <button className="rf-btn rf-btn--link" onClick={confirmLogout}>Log out</button>
      </div>

      {/* Scopes */}
      {gmailConnected && grantedScopes.length > 0 && (
        <div className="rf-settings__section">
          <div className="rf-settings__section-title">Google Scopes</div>
          <div className="rf-scope-list">
            {requiredScopes.filter(s => s !== 'openid').map(scope => {
              const short = scope.startsWith('https://') ? scope.split('/').pop() : scope;
              const granted = grantedScopes.includes(scope);
              return (
                <div key={scope} className={`rf-scope-item ${granted ? 'rf-scope-item--granted' : 'rf-scope-item--missing'}`}>
                  {granted ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  <span>{short}</span>
                  <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)' }}>{granted ? 'Granted' : 'Missing'}</span>
                </div>
              );
            })}
          </div>
          <p className="rf-settings__help">If any scope is missing, use "Reconnect Gmail" above.</p>
        </div>
      )}

      {/* Danger */}
      <div className="rf-settings__section rf-settings__section--danger">
        <div className="rf-settings__section-title">Danger Zone</div>
        <p className="rf-settings__help">Permanently remove your account and all data.</p>
        <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={deleteMyAccount}>Delete My Account</button>
      </div>
    </div>
  );
}
