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
        <div><h1 className="rf-page-header__title">Settings</h1><p className="rf-page-header__subtitle">Configure Gmail, AI provider, and account preferences</p></div>
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
            Configure the LLM used for JD analysis and resume generation. A validated API key is required — Resume Lab will not work without one.
          </p>
          <Divider />
          <AISettingsSection authedFetch={authedFetch} cachedSettings={aiSettings} cachedLoading={aiSettingsLoading} />
        </div>
      </div>

      {/* ── AI Personalization row ── */}
      <div style={{ ...card, marginTop: 'var(--rf-sp-5)' }}>
        <SectionTitle icon={Sliders}>AI Personalization</SectionTitle>
        <p className="rf-settings__help" style={{ marginTop: -8 }}>
          Control the tone and style of AI-generated content across Resume Lab.
        </p>
        <Divider />
        <AIPersonalizationSection authedFetch={authedFetch} initialPrefs={aiSettings?.personalizationPrefs} initialSystemPrompt={aiSettings?.systemPrompt} />
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
