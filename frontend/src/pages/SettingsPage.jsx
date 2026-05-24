import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useResumeLab } from '../contexts/ResumeLabContext.jsx';
import { makeResumeLabApi } from '../services/resumeLabApi.js';
import {
  CheckCircle2, XCircle, Save, AlertCircle, CheckCheck, Loader,
  Wifi, WifiOff, Eye, EyeOff, Mail, Brain, LogOut, Trash2, ShieldAlert, Sliders,
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

function AISettingsSection({ authedFetch, cachedSettings, cachedLoading }) {
  const api = useMemo(() => makeResumeLabApi(authedFetch), [authedFetch]);

  // Only show spinner if context hasn't loaded yet and we have no cached data
  const [loading, setLoading] = useState(!cachedSettings && cachedLoading !== false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState(cachedSettings || null);
  const [supportedModels, setSupportedModels] = useState(cachedSettings?.supportedModels || {});
  const [provider, setProvider] = useState(cachedSettings?.provider || 'ollama_cloud');
  const [model, setModel] = useState(cachedSettings?.model || '');
  const [apiKey, setApiKey] = useState('');
  const [localEndpoint, setLocalEndpoint] = useState(cachedSettings?.localEndpoint || '');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveError, setSaveError] = useState('');

  const fetchedRef = useRef(false);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await api.getAISettings();
      setSettings(data);
      setSupportedModels(data.supportedModels || {});
      setProvider(data.provider || 'ollama_cloud');
      setModel(data.model || '');
      setLocalEndpoint(data.localEndpoint || '');
      setApiKey('');
    } catch { /* show empty form */ }
    finally { if (showSpinner) setLoading(false); }
  }, [api]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    // If we already have cached data, background-refresh without a spinner
    load(!cachedSettings);
  }, [load, cachedSettings]);

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
      await load(true);
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const data = await api.testAIConnection();
      setTestResult({ ok: true, message: data.message || 'Connection validated.', steps: data.steps || [] });
      await load(true);
    } catch (err) {
      let steps = [];
      try {
        if (err.steps) steps = err.steps;
      } catch { /* ignore */ }
      setTestResult({ ok: false, error: err.message, steps });
    }
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
            : <><XCircle size={13} style={{ color: 'var(--rf-error)', flexShrink: 0 }} /><span style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-error-text)' }}>Not validated — Resume Lab is disabled until you test the connection</span></>
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

      {/* Test result timeline */}
      {testResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 'var(--rf-radius-md)', background: 'var(--rf-bg-root)', border: `1px solid ${testResult.ok ? 'var(--rf-border-success, var(--rf-border-subtle))' : 'var(--rf-border-error, var(--rf-border-subtle))'}`, fontSize: 'var(--rf-text-sm)' }}>
          {/* Step-by-step timeline */}
          {(testResult.steps || []).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {s.ok
                ? <CheckCircle2 size={13} style={{ color: 'var(--rf-success)', flexShrink: 0, marginTop: 1 }} />
                : <XCircle size={13} style={{ color: 'var(--rf-error)', flexShrink: 0, marginTop: 1 }} />
              }
              <div>
                <span style={{ color: s.ok ? 'var(--rf-text-secondary)' : 'var(--rf-error-text)' }}>{s.name}</span>
                {s.error && <div style={{ fontSize: 'var(--rf-text-xs)', color: 'var(--rf-error-text)', marginTop: 2 }}>{s.error}</div>}
              </div>
            </div>
          ))}
          {/* Final status */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: (testResult.steps || []).length ? 4 : 0, paddingTop: (testResult.steps || []).length ? 6 : 0, borderTop: (testResult.steps || []).length ? '1px solid var(--rf-border-subtle)' : 'none' }}>
            {testResult.ok
              ? <><CheckCircle2 size={13} style={{ color: 'var(--rf-success)', flexShrink: 0, marginTop: 1 }} /><span style={{ color: 'var(--rf-success-text)', fontWeight: 600 }}>{testResult.message}</span></>
              : <><WifiOff size={13} style={{ color: 'var(--rf-error)', flexShrink: 0, marginTop: 1 }} /><span style={{ color: 'var(--rf-error-text)' }}>{testResult.error}</span></>
            }
          </div>
        </div>
      )}

      <p className="rf-settings__help">
        Your API key is encrypted at rest and only decrypted at request time. Resume Lab features require a validated API key — no fallback to any default key is used.
      </p>
    </form>
  );
}

// ── AI Personalization section ────────────────────────────────────────────────

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual',       label: 'Casual' },
  { value: 'concise',      label: 'Concise' },
];
const VERBOSITY_OPTIONS = [
  { value: 'brief',    label: 'Brief' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
];
const FORMAT_OPTIONS = [
  { value: 'bullet_heavy', label: 'Bullet-heavy' },
  { value: 'prose',        label: 'Prose' },
  { value: 'mixed',        label: 'Mixed' },
];

function RadioGroup({ label, options, value, onChange }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--rf-sp-3)',
      padding: 'var(--rf-sp-4)',
      background: 'var(--rf-bg-root)',
      borderRadius: 'var(--rf-radius-md)',
      border: '1px solid var(--rf-border-subtle)',
    }}>
      <div className="rf-label" style={{ marginBottom: 0 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-2)' }}>
        {options.map(opt => (
          <label key={opt.value} className="rf-radio-label" style={{
            fontSize: 'var(--rf-text-sm)',
            color: value === opt.value ? 'var(--rf-text)' : 'var(--rf-text-secondary)',
          }}>
            <input type="radio" name={label} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function AIPersonalizationSection({ authedFetch, initialPrefs, initialSystemPrompt }) {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
  const [tone, setTone] = useState(initialPrefs?.tone || 'professional');
  const [verbosity, setVerbosity] = useState(initialPrefs?.verbosity || 'standard');
  const [formatPreference, setFormatPreference] = useState(initialPrefs?.formatPreference || 'mixed');
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const [prefRes, spRes] = await Promise.all([
        authedFetch(`${API_BASE}/api/settings/ai/personalization`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tone, verbosity, formatPreference }),
        }),
        authedFetch(`${API_BASE}/api/settings/ai`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt: systemPrompt.trim().slice(0, 2000) }),
        }),
      ]);
      if (!prefRes.ok || !spRes.ok) throw new Error('Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      // error shown inline
    } finally {
      setSaving(false);
    }
  }

  const charCount = systemPrompt.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rf-sp-5)' }}>
      {/* Radio groups in a 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--rf-sp-4)' }}>
        <RadioGroup label="Tone" options={TONE_OPTIONS} value={tone} onChange={setTone} />
        <RadioGroup label="Verbosity" options={VERBOSITY_OPTIONS} value={verbosity} onChange={setVerbosity} />
        <RadioGroup label="Format" options={FORMAT_OPTIONS} value={formatPreference} onChange={setFormatPreference} />
      </div>

      {/* System prompt — narrower width */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 480 }}>
        <div className="rf-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>AI System Prompt <span style={{ fontWeight: 400, color: 'var(--rf-text-secondary)' }}>(optional)</span></span>
          <span style={{ fontSize: 'var(--rf-text-xs)', color: charCount > 1800 ? 'var(--rf-error-text)' : 'var(--rf-text-secondary)' }}>{charCount}/2000</span>
        </div>
        <textarea
          className="rf-input"
          rows={4}
          maxLength={2000}
          placeholder="Optional. Style or tone guidance the AI should follow. Avoid instructions that override grounding or accuracy rules."
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--rf-text-sm)' }}
        />
      </div>

      <div>
        <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader size={13} className="rf-spin" /> Saving…</> : saved ? <><CheckCheck size={13} /> Saved</> : <><Save size={13} /> Save Preferences</>}
        </button>
        <p className="rf-settings__help" style={{ marginTop: 'var(--rf-sp-2)' }}>
          These preferences are passed to the AI when generating resumes, cover letters, and HR emails.
        </p>
      </div>
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
  } = useApp();

  const { aiSettings, aiSettingsLoading } = useResumeLab();
  const llmValid = aiSettings?.isValid === true;
  const llmConfigured = !!aiSettings?.configured;

  return (
    <div className="rf-page rf-page--wide rf-set-page">
      <header className="rf-page-header">
        <div className="rf-page-header__lead">
          <div className="rf-page-header__eyebrow">
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--rf-accent)', display: 'inline-block' }} />
            Settings
          </div>
          <h1 className="rf-page-header__title">Workspace settings</h1>
          <p className="rf-page-header__subtitle">
            Gmail connection, AI provider, personalization, and account controls.
          </p>
        </div>
      </header>

      {/* Integrations health strip */}
      <div className="rf-set-health">
        <HealthChip
          ok={gmailConnected}
          label="Gmail"
          okMsg="Connected — sending enabled"
          warnMsg="Not connected — Compose can't send"
        />
        <HealthChip
          ok={llmValid}
          warn={llmConfigured && !llmValid}
          label="AI provider"
          okMsg="Validated — Resume Lab enabled"
          warnMsg={llmConfigured ? 'Key saved but not validated' : 'Not configured — Resume Lab disabled'}
        />
      </div>

      {/* Top grid: Gmail · AI */}
      <div className="rf-set-grid">
        {/* Gmail card */}
        <section className="rf-set-card">
          <header className="rf-set-card__head">
            <h2 className="rf-set-card__title"><Mail size={16} /> Gmail</h2>
            <span className={`rf-badge ${gmailConnected ? 'rf-badge--success' : 'rf-badge--error'}`}>
              {gmailConnected ? 'Connected' : 'Disconnected'}
            </span>
          </header>

          <div className="rf-set-row">
            <div className="rf-set-row__body">
              <div className="rf-set-row__label">Connection</div>
              <p className="rf-set-row__help">
                ReachFlow sends from your Gmail using OAuth. Disconnecting revokes our access; we never store your password.
              </p>
            </div>
            <div className="rf-set-row__actions">
              {gmailConnected
                ? <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={confirmDisconnectGmail} disabled={gmailActionLoading}>
                    {gmailActionLoading ? <><Loader size={13} className="rf-spin" /> Working…</> : 'Disconnect'}
                  </button>
                : <button className="rf-btn rf-btn--primary rf-btn--sm" onClick={connectGmail} disabled={gmailActionLoading}>
                    {gmailActionLoading ? <><Loader size={13} className="rf-spin" /> Connecting…</> : 'Connect Gmail'}
                  </button>}
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={confirmReconnectGmail} disabled={gmailActionLoading} title="Force a fresh OAuth grant">
                Reconnect
              </button>
            </div>
          </div>

          <hr className="rf-divider" />

          <div className="rf-set-stack">
            <label className="rf-label">Sender display name</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="rf-input"
                style={{ flex: 1 }}
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                placeholder="Optional — e.g. Jay Prajapati"
              />
              <button
                className="rf-btn rf-btn--secondary rf-btn--sm"
                onClick={saveSenderPreference}
                disabled={savingSenderName || senderName.trim() === savedSenderName}
              >
                {savingSenderName ? <><Loader size={13} className="rf-spin" /> Saving…</> : <><Save size={13} /> Save</>}
              </button>
            </div>
            <p className="rf-set-row__help">
              Shown as the "From" name in outgoing emails. Leave empty to use your email address.
            </p>
          </div>

          {gmailConnected && grantedScopes.length > 0 && (
            <>
              <hr className="rf-divider" />
              <div className="rf-set-stack">
                <label className="rf-label">Google permissions</label>
                <div className="rf-scope-list">
                  {requiredScopes.filter(s => s !== 'openid').map(scope => {
                    const short = scope.startsWith('https://') ? scope.split('/').pop() : scope;
                    const granted = grantedScopes.includes(scope);
                    return (
                      <div key={scope} className={`rf-scope-item ${granted ? 'rf-scope-item--granted' : 'rf-scope-item--missing'}`}>
                        {granted ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        <span style={{ flex: 1 }}>{short}</span>
                        <span style={{ fontSize: 11, color: 'var(--rf-text-faint)' }}>
                          {granted ? 'Granted' : 'Missing'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="rf-set-row__help">If a permission is missing, click <strong>Reconnect</strong> above and approve the prompt.</p>
              </div>
            </>
          )}
        </section>

        {/* AI provider card */}
        <section className="rf-set-card">
          <header className="rf-set-card__head">
            <h2 className="rf-set-card__title"><Brain size={16} /> AI provider <span className="rf-set-card__sub">Resume Lab</span></h2>
            <span className={`rf-badge ${llmValid ? 'rf-badge--success' : llmConfigured ? 'rf-badge--warning' : 'rf-badge--error'}`}>
              {llmValid ? 'Validated' : llmConfigured ? 'Untested' : 'Not configured'}
            </span>
          </header>
          <p className="rf-set-row__help" style={{ marginTop: -4 }}>
            Bring your own key. Resume Lab needs a validated provider before it will run — there is no shared fallback.
          </p>
          <hr className="rf-divider" />
          <AISettingsSection authedFetch={authedFetch} cachedSettings={aiSettings} cachedLoading={aiSettingsLoading} />
        </section>
      </div>

      {/* Personalization */}
      <section className="rf-set-card">
        <header className="rf-set-card__head">
          <h2 className="rf-set-card__title"><Sliders size={16} /> AI personalization</h2>
        </header>
        <p className="rf-set-row__help" style={{ marginTop: -4 }}>
          Sets the default tone, length, and format for AI-generated resumes, cover letters, and outreach text.
        </p>
        <hr className="rf-divider" />
        <AIPersonalizationSection authedFetch={authedFetch} initialPrefs={aiSettings?.personalizationPrefs} initialSystemPrompt={aiSettings?.systemPrompt} />
      </section>

      {/* Footer grid: session + danger */}
      <div className="rf-set-grid">
        <section className="rf-set-card rf-set-card--inline">
          <div>
            <h2 className="rf-set-card__title" style={{ marginBottom: 4 }}>Session</h2>
            <p className="rf-set-row__help">Sign out of your ReachFlow account on this device.</p>
          </div>
          <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={confirmLogout}>
            <LogOut size={13} /> Log out
          </button>
        </section>

        <section className="rf-set-card rf-set-card--inline rf-set-card--danger">
          <div>
            <h2 className="rf-set-card__title" style={{ color: 'var(--rf-error-text)', marginBottom: 4 }}>
              <ShieldAlert size={16} /> Danger zone
            </h2>
            <p className="rf-set-row__help">Permanently delete your account, contacts, applications, and resumes. This cannot be undone.</p>
          </div>
          <button className="rf-btn rf-btn--danger rf-btn--sm" onClick={deleteMyAccount}>
            <Trash2 size={13} /> Delete account
          </button>
        </section>
      </div>
    </div>
  );
}

function HealthChip({ ok, warn, label, okMsg, warnMsg }) {
  const tone = ok ? 'ok' : warn ? 'warn' : 'err';
  return (
    <div className={`rf-set-health__chip rf-set-health__chip--${tone}`}>
      {ok ? <CheckCircle2 size={14} /> : warn ? <AlertCircle size={14} /> : <XCircle size={14} />}
      <span className="rf-set-health__chip-label">{label}</span>
      <span className="rf-set-health__chip-msg">{ok ? okMsg : warnMsg}</span>
    </div>
  );
}
