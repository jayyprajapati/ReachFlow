import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { makeResumeLabApi } from '../services/resumeLabApi.js';
import {
  CheckCircle2, XCircle, Save, AlertCircle, CheckCheck, Loader,
  Wifi, WifiOff, Eye, EyeOff, Mail, Brain, LogOut, Trash2, ShieldAlert,
} from 'lucide-react';

const PROVIDER_LABELS = {
  openai:       'OpenAI',
  ollama_cloud: 'Ollama Cloud',
  ollama_local: 'Ollama Local',
};

function Divider() {
  return <div style={{ height: 1, background: 'var(--rf-border-subtle)', margin: 'var(--rf-sp-1) 0' }} />;
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--rf-sp-4)' }}>
      <Icon size={16} style={{ color: 'var(--rf-text-secondary)', flexShrink: 0 }} />
      <span style={{ fontFamily: 'var(--rf-font-display)', fontSize: 'var(--rf-text-md)', fontWeight: 600, color: 'var(--rf-text)' }}>
        {children}
      </span>
    </div>
  );
}

// ── AI Settings section ───────────────────────────────────────────────────────

function AISettingsSection({ authedFetch }) {
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
  const [testResult, setTestResult] = useState(null);
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
      setApiKey('');
    } catch { /* show empty form */ }
    finally { setLoading(false); }
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
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const data = await api.testAIConnection();
      setTestResult({ ok: true, message: data.message || 'Connection validated.' });
      await load();
    } catch (err) { setTestResult({ ok: false, error: err.message }); }
    finally { setTesting(false); }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--rf-text-muted)', padding: '8px 0' }}>
        <Loader size={14} className="rf-spin" /> Loading…
      </div>
    );
  }

  const models = supportedModels[provider] || [];
  const needsApiKey = provider === 'openai' || provider === 'ollama_cloud';
  const needsEndpoint = provider === 'ollama_local';
  const isValid = settings?.isValid;

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-4)' }}>

      {/* Validation status */}
      {settings?.configured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 'var(--rf-radius-md)', background: 'var(--rf-bg-root)', border: '1px solid var(--rf-border-subtle)' }}>
          {isValid
            ? <><CheckCircle2 size={13} style={{ color: 'var(--rf-success)', flexShrink: 0 }} /><span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-success-text)' }}>Validated{settings.validatedAt ? ` · ${new Date(settings.validatedAt).toLocaleDateString()}` : ''}</span></>
            : <><XCircle size={13} style={{ color: 'var(--rf-error)', flexShrink: 0 }} /><span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-error-text)' }}>Not validated — save settings then click Test</span></>
          }
        </div>
      )}

      {/* Provider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label className="rf-label">Provider</label>
        <select className="rf-input" value={provider} onChange={e => { setProvider(e.target.value); setModel(''); }}>
          {Object.keys(PROVIDER_LABELS).map(p => (
            <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label className="rf-label">Model</label>
        {models.length > 0 ? (
          <select className="rf-input" value={model} onChange={e => setModel(e.target.value)}>
            <option value="">Use provider default</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input
            className="rf-input"
            placeholder={needsEndpoint ? 'e.g. llama3.3:70b' : 'Model name'}
            value={model}
            onChange={e => setModel(e.target.value)}
          />
        )}
      </div>

      {/* API key */}
      {needsApiKey && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="rf-label">API Key</label>
          <div style={{ display: 'flex', gap: 8 }}>
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
            <p className="rf-settings__help">API key saved. Enter a new value to replace it.</p>
          )}
        </div>
      )}

      {/* Local endpoint */}
      {needsEndpoint && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        <div style={{ display: 'flex', gap: 6, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-error-text)', alignItems: 'center' }}>
          <AlertCircle size={13} /> {saveError}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

      {/* Test result */}
      {testResult && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 'var(--rf-radius-md)', background: 'var(--rf-bg-root)', border: '1px solid var(--rf-border-subtle)', fontSize: 'var(--rf-text-sm)' }}>
          {testResult.ok
            ? <><CheckCircle2 size={14} style={{ color: 'var(--rf-success)', flexShrink: 0, marginTop: 1 }} /><span style={{ color: 'var(--rf-success-text)' }}>{testResult.message}</span></>
            : <><WifiOff size={14} style={{ color: 'var(--rf-error)', flexShrink: 0, marginTop: 1 }} /><span style={{ color: 'var(--rf-error-text)' }}>{testResult.error}</span></>
          }
        </div>
      )}

      <p className="rf-settings__help">
        Your API key is encrypted at rest and only decrypted at request time. Cortex falls back to its default provider when no key is configured.
      </p>
    </form>
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
  } = useApp();

  // Card style shared by both columns
  const card = {
    background: 'var(--rf-bg-surface)',
    border: '1px solid var(--rf-border-subtle)',
    borderRadius: 'var(--rf-radius-lg)',
    padding: 'var(--rf-sp-5)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--rf-sp-4)',
  };

  return (
    // Override the max-width: 640px from .rf-settings so it fills the page
    <div className="rf-settings" style={{ maxWidth: 'none', width: '100%' }}>
      <div className="rf-page-header">
        <div><h1 className="rf-page-header__title">Settings</h1></div>
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--rf-sp-5)', alignItems: 'start' }}>

        {/* ── Left column: Gmail ── */}
        <div style={card}>
          <SectionTitle icon={Mail}>Gmail</SectionTitle>

          {/* Connection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-3)' }}>
            <div className="rf-settings__section-title" style={{ fontSize: 'var(--rf-text-sm)', fontWeight: 600 }}>Connection</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--rf-sp-3)' }}>
              <span className={`rf-badge ${gmailConnected ? 'rf-badge--success' : 'rf-badge--error'}`}>
                {gmailConnected ? 'Connected' : 'Not connected'}
              </span>
              {gmailConnected
                ? <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={confirmDisconnectGmail} disabled={gmailActionLoading}>{gmailActionLoading ? 'Working…' : 'Disconnect'}</button>
                : <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={connectGmail} disabled={gmailActionLoading}>{gmailActionLoading ? 'Connecting…' : 'Connect Gmail'}</button>
              }
            </div>
            <button className="rf-btn rf-btn--link" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={confirmReconnectGmail} disabled={gmailActionLoading}>
              {gmailActionLoading ? 'Working…' : 'Reconnect (fresh OAuth)'}
            </button>
          </div>

          <Divider />

          {/* Sender name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
            <div className="rf-label">Sender Display Name</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="rf-input"
                style={{ flex: 1 }}
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                placeholder="Display name (optional)"
              />
              <button
                className="rf-btn rf-btn--secondary rf-btn--sm"
                onClick={saveSenderPreference}
                disabled={savingSenderName || senderName.trim() === savedSenderName}
              >
                <Save size={13} />{savingSenderName ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="rf-settings__help">Controls the name shown in outgoing emails. Leave empty to use your email address.</p>
          </div>

          {/* OAuth scopes */}
          {gmailConnected && grantedScopes.length > 0 && (
            <>
              <Divider />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
                <div className="rf-label">Google Permissions</div>
                <div className="rf-scope-list">
                  {requiredScopes.filter(s => s !== 'openid').map(scope => {
                    const short = scope.startsWith('https://') ? scope.split('/').pop() : scope;
                    const granted = grantedScopes.includes(scope);
                    return (
                      <div key={scope} className={`rf-scope-item ${granted ? 'rf-scope-item--granted' : 'rf-scope-item--missing'}`}>
                        {granted ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        <span>{short}</span>
                        <span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-text-faint)', marginLeft: 'auto' }}>{granted ? 'Granted' : 'Missing'}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="rf-settings__help">If any scope is missing, use "Reconnect" above to re-authorise.</p>
              </div>
            </>
          )}
        </div>

        {/* ── Right column: AI ── */}
        <div style={card}>
          <SectionTitle icon={Brain}>AI · Resume Lab</SectionTitle>
          <p className="rf-settings__help" style={{ marginTop: -8 }}>
            Configure the LLM used for JD analysis and resume generation. Leave unconfigured to use the Cortex default provider.
          </p>
          <Divider />
          <AISettingsSection authedFetch={authedFetch} />
        </div>
      </div>

      {/* ── Bottom row: session + danger ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--rf-sp-5)', marginTop: 'var(--rf-sp-5)', alignItems: 'start' }}>

        {/* Logout */}
        <div style={{ ...card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-text)', marginBottom: 4 }}>Session</div>
            <p className="rf-settings__help" style={{ margin: 0 }}>Sign out of your account on this device.</p>
          </div>
          <button className="rf-btn rf-btn--secondary rf-btn--sm" style={{ flexShrink: 0 }} onClick={confirmLogout}>
            <LogOut size={13} /> Log out
          </button>
        </div>

        {/* Danger zone */}
        <div style={{ ...card, border: '1px solid rgba(239,68,68,0.25)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'var(--rf-text-sm)', color: 'var(--rf-error-text)', marginBottom: 4 }}>
              <ShieldAlert size={14} /> Danger Zone
            </div>
            <p className="rf-settings__help" style={{ margin: 0 }}>Permanently delete your account and all data.</p>
          </div>
          <button className="rf-btn rf-btn--danger rf-btn--sm" style={{ flexShrink: 0 }} onClick={deleteMyAccount}>
            <Trash2 size={13} /> Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
