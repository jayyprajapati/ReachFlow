import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { makeResumeLabApi } from '../services/resumeLabApi.js';
import {
  CheckCircle2, XCircle, Save, AlertCircle, CheckCheck, Loader,
  Wifi, WifiOff, Eye, EyeOff,
} from 'lucide-react';

const SETTINGS_TABS = [
  { id: 'gmail',      label: 'Gmail' },
  { id: 'ai',         label: 'AI · Resume Lab' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'danger',     label: 'Danger Zone' },
];

const PROVIDER_LABELS = {
  openai:       'OpenAI',
  ollama_cloud: 'Ollama Cloud',
  ollama_local: 'Ollama Local',
};

// ── AI Settings Tab ───────────────────────────────────────────────────────────

function AISettingsTab({ authedFetch }) {
  const api = useMemo(() => makeResumeLabApi(authedFetch), [authedFetch]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [settings, setSettings] = useState(null);
  const [supportedModels, setSupportedModels] = useState({});

  const [provider, setProvider] = useState('ollama_cloud');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [localEndpoint, setLocalEndpoint] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [testResult, setTestResult] = useState(null); // { ok, message } or { ok: false, error }
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAISettings();
      setSettings(data);
      setSupportedModels(data.supportedModels || {});
      setProvider(data.provider || 'ollama_cloud');
      setModel(data.model || '');
      setLocalEndpoint(data.localEndpoint || '');
      setApiKey(''); // never pre-fill the key field
    } catch {
      // ignore — will show empty form
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaveError('');
    setTestResult(null);
    setSaving(true);
    try {
      await api.saveAISettings({
        provider,
        model: model || undefined,
        apiKey: apiKey || undefined,
        localEndpoint: localEndpoint || undefined,
      });
      await load();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const data = await api.testAIConnection();
      setTestResult({ ok: true, message: data.message || 'Connection validated.' });
      await load();
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '32px 0', color: 'var(--rf-text-muted)' }}>
        <Loader size={16} className="rf-spin" /> Loading AI settings…
      </div>
    );
  }

  const models = supportedModels[provider] || [];
  const needsApiKey = provider === 'openai' || provider === 'ollama_cloud';
  const needsEndpoint = provider === 'ollama_local';
  const isValid = settings?.isValid;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-4)' }}>

      {/* Validation status */}
      {settings?.configured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isValid
            ? <><CheckCircle2 size={15} style={{ color: 'var(--rf-success)' }} /> <span style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-success-text)' }}>Connection validated{settings.validatedAt ? ` · ${new Date(settings.validatedAt).toLocaleDateString()}` : ''}</span></>
            : <><XCircle size={15} style={{ color: 'var(--rf-error)' }} /> <span style={{ fontSize: 'var(--rf-text-sm)', color: 'var(--rf-error-text)' }}>Not validated — save your settings and click Test Connection</span></>
          }
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-3)' }}>

        {/* Provider */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
          <label className="rf-label">AI Provider</label>
          <select className="rf-input" value={provider} onChange={e => { setProvider(e.target.value); setModel(''); }}>
            {Object.keys(PROVIDER_LABELS).map(p => (
              <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
          <label className="rf-label">Model</label>
          {models.length > 0 ? (
            <select className="rf-input" value={model} onChange={e => setModel(e.target.value)}>
              <option value="">Use provider default</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              className="rf-input"
              placeholder={needsEndpoint ? 'e.g. llama3.3:70b (discovered from endpoint)' : 'Model name'}
              value={model}
              onChange={e => setModel(e.target.value)}
            />
          )}
        </div>

        {/* API key */}
        {needsApiKey && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
            <label className="rf-label">API Key</label>
            <div style={{ display: 'flex', gap: 'var(--rf-sp-2)' }}>
              <input
                className="rf-input"
                type={showKey ? 'text' : 'password'}
                placeholder={settings?.hasApiKey ? settings.apiKeyPreview || '••••••••' : 'Enter API key…'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ flex: 1 }}
                autoComplete="off"
              />
              <button type="button" className="rf-btn rf-btn--ghost rf-btn--sm" onClick={() => setShowKey(v => !v)} title={showKey ? 'Hide' : 'Show'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {settings?.hasApiKey && !apiKey && (
              <p className="rf-settings__help">API key is saved. Enter a new value to replace it.</p>
            )}
          </div>
        )}

        {/* Local endpoint */}
        {needsEndpoint && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
            <label className="rf-label">Ollama Endpoint</label>
            <input
              className="rf-input"
              placeholder="http://localhost:11434"
              value={localEndpoint}
              onChange={e => setLocalEndpoint(e.target.value)}
            />
          </div>
        )}

        {saveError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-error-text)' }}>
            <AlertCircle size={13} /> {saveError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--rf-sp-2)', flexWrap: 'wrap' }}>
          <button className="rf-btn rf-btn--secondary rf-btn--sm" type="submit" disabled={saving}>
            {saving ? <><Loader size={13} className="rf-spin" /> Saving…</> : <><Save size={13} /> Save Settings</>}
          </button>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" type="button" onClick={handleTest} disabled={testing || saving || !settings?.configured}>
            {testing
              ? <><Loader size={13} className="rf-spin" /> Testing…</>
              : isValid
              ? <><CheckCheck size={13} /> Re-test Connection</>
              : <><Wifi size={13} /> Test Connection</>
            }
          </button>
        </div>
      </form>

      {testResult && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 'var(--rf-radius-md)', background: testResult.ok ? 'var(--rf-success-faint, var(--rf-bg-overlay))' : 'var(--rf-error-faint, var(--rf-bg-overlay))', fontSize: 'var(--rf-text-sm)' }}>
          {testResult.ok
            ? <><CheckCircle2 size={14} style={{ color: 'var(--rf-success)', flexShrink: 0, marginTop: 1 }} /> <span style={{ color: 'var(--rf-success-text)' }}>{testResult.message}</span></>
            : <><WifiOff size={14} style={{ color: 'var(--rf-error)', flexShrink: 0, marginTop: 1 }} /> <span style={{ color: 'var(--rf-error-text)' }}>{testResult.error}</span></>
          }
        </div>
      )}

      <p className="rf-settings__help">
        Your API key is encrypted before storage. It is only decrypted at request time and never logged.
        Cortex falls back to its default provider if no key is configured or the test fails.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const {
    authedFetch,
    gmailConnected, gmailActionLoading, connectGmail, confirmDisconnectGmail, confirmReconnectGmail,
    senderName, setSenderName, savedSenderName, savingSenderName, saveSenderPreference,
    grantedScopes, requiredScopes,
    deleteMyAccount, confirmLogout,
    theme, toggleTheme,
  } = useApp();

  const [activeTab, setActiveTab] = useState('gmail');

  return (
    <div className="rf-settings">
      <div className="rf-page-header"><div><h1 className="rf-page-header__title">Settings</h1></div></div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--rf-sp-5)', borderBottom: '1px solid var(--rf-border-subtle)', paddingBottom: 0 }}>
        {SETTINGS_TABS.map(tab => (
          <button
            key={tab.id}
            className="rf-btn rf-btn--ghost rf-btn--sm"
            style={{
              borderBottom: activeTab === tab.id ? '2px solid var(--rf-accent)' : '2px solid transparent',
              borderRadius: 0,
              paddingBottom: 'var(--rf-sp-2)',
              color: activeTab === tab.id ? 'var(--rf-accent)' : 'var(--rf-text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Gmail tab ── */}
      {activeTab === 'gmail' && (
        <>
          <div className="rf-settings__section">
            <div className="rf-settings__section-title">Gmail Connection</div>
            <div className="rf-settings__row">
              <div><span className="rf-settings__label">Status</span><br /><span className={`rf-badge ${gmailConnected ? 'rf-badge--success' : 'rf-badge--error'}`}>{gmailConnected ? 'Connected' : 'Not connected'}</span></div>
              {gmailConnected
                ? <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={confirmDisconnectGmail} disabled={gmailActionLoading}>{gmailActionLoading ? 'Working…' : 'Disconnect'}</button>
                : <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={connectGmail} disabled={gmailActionLoading}>{gmailActionLoading ? 'Connecting…' : 'Connect Gmail'}</button>
              }
            </div>
            <button className="rf-btn rf-btn--link" onClick={confirmReconnectGmail} disabled={gmailActionLoading}>{gmailActionLoading ? 'Working…' : 'Reconnect Gmail (fresh OAuth)'}</button>
          </div>

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
        </>
      )}

      {/* ── AI tab ── */}
      {activeTab === 'ai' && (
        <div className="rf-settings__section">
          <div className="rf-settings__section-title">AI Provider — Resume Lab</div>
          <p className="rf-settings__help" style={{ marginBottom: 'var(--rf-sp-4)' }}>
            Configure which LLM to use for JD analysis and resume generation. Leave unconfigured to use the default Cortex provider.
          </p>
          <AISettingsTab authedFetch={authedFetch} />
        </div>
      )}

      {/* ── Appearance tab ── */}
      {activeTab === 'appearance' && (
        <div className="rf-settings__section">
          <div className="rf-settings__section-title">Appearance</div>
          <div className="rf-settings__row" style={{ alignItems: 'center' }}>
            <div>
              <span className="rf-settings__label">Theme</span>
              <p className="rf-settings__help" style={{ margin: '2px 0 0' }}>Choose between light and dark mode.</p>
            </div>
            <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={toggleTheme}>
              Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
            </button>
          </div>
        </div>
      )}

      {/* ── Danger tab ── */}
      {activeTab === 'danger' && (
        <div className="rf-settings__section rf-settings__section--danger">
          <div className="rf-settings__section-title">Danger Zone</div>
          <p className="rf-settings__help">Permanently remove your account and all data. This action cannot be undone.</p>
          <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={deleteMyAccount}>Delete My Account</button>
        </div>
      )}
    </div>
  );
}
