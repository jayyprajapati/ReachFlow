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
  anthropic:    'Anthropic',
  ollama_cloud: 'Ollama Cloud',
  ollama_local: 'Ollama Local',
};

const SETTINGS_PANELS = [
  {
    id: 'gmail',
    label: 'Gmail',
    kicker: 'Delivery',
    title: 'Mail connection',
    description: 'Manage OAuth, sender identity, and Google permissions from one place.',
    Icon: Mail,
  },
  {
    id: 'ai',
    label: 'AI Engine',
    kicker: 'Provider',
    title: 'Model provider',
    description: 'Choose the AI backend, validate it, and keep generated work behind your own key.',
    Icon: Brain,
  },
  {
    id: 'voice',
    label: 'AI Voice',
    kicker: 'Writing',
    title: 'Generated content style',
    description: 'Tune the tone, length, and structure used across AI-assisted writing.',
    Icon: Sliders,
  },
  {
    id: 'account',
    label: 'Account',
    kicker: 'Access',
    title: 'Session and data',
    description: 'Leave this device or permanently remove the workspace and its data.',
    Icon: ShieldAlert,
  },
];

function getPanelStatus(id, { gmailConnected, llmValid, llmConfigured }) {
  switch (id) {
    case 'gmail':
      return gmailConnected
        ? { label: 'Connected', tone: 'ok' }
        : { label: 'Action needed', tone: 'error' };
    case 'ai':
      if (llmValid) return { label: 'Validated', tone: 'ok' };
      if (llmConfigured) return { label: 'Test needed', tone: 'warn' };
      return { label: 'Not set', tone: 'error' };
    case 'voice':
      return { label: 'Ready', tone: 'neutral' };
    case 'account':
    default:
      return { label: 'Available', tone: 'neutral' };
  }
}

function SettingsStatus({ label, tone = 'neutral' }) {
  return (
    <span className={`rf-settings-status rf-settings-status--${tone}`}>
      <span className="rf-settings-status__dot" />
      {label}
    </span>
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
      <div className="rf-set-loading">
        <Loader size={14} className="rf-spin" />
        <span>Loading AI provider settings...</span>
      </div>
    );
  }

  const models = supportedModels[provider] || [];
  const needsApiKey = provider === 'openai' || provider === 'anthropic' || provider === 'ollama_cloud';
  const needsEndpoint = provider === 'ollama_local';
  const isValid = settings?.isValid;

  return (
    <form onSubmit={handleSave} className="rf-ai-form">

      {/* Validation status */}
      {settings?.configured && (
        <div className={`rf-set-status ${isValid ? 'rf-set-status--ok' : 'rf-set-status--error'}`}>
          {isValid
            ? <><CheckCircle2 size={14} /><span>Validated{settings.validatedAt ? ` · ${new Date(settings.validatedAt).toLocaleDateString()}` : ''}</span></>
            : <><XCircle size={14} /><span>Not validated. Resume Lab is disabled until you test the connection.</span></>
          }
        </div>
      )}

      <div className="rf-set-form-grid">
        {/* Provider */}
        <div className="rf-set-field">
          <label className="rf-label">Provider</label>
          <select className="rf-input" value={provider} onChange={e => { setProvider(e.target.value); setModel(''); }}>
            {Object.keys(PROVIDER_LABELS).map(p => (
              <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div className="rf-set-field">
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
          <div className="rf-set-field rf-set-field--wide">
            <label className="rf-label">API key</label>
            <div className="rf-set-secret">
              <input
                className="rf-input"
                type={showKey ? 'text' : 'password'}
                placeholder={settings?.hasApiKey ? settings.apiKeyPreview || '••••••••' : 'Enter API key...'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <button type="button" className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={() => setShowKey(v => !v)} title={showKey ? 'Hide' : 'Show'}>
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
          <div className="rf-set-field rf-set-field--wide">
            <label className="rf-label">Ollama endpoint</label>
            <input
              className="rf-input"
              placeholder="http://localhost:11434"
              value={localEndpoint}
              onChange={e => setLocalEndpoint(e.target.value)}
            />
          </div>
        )}
      </div>

      {saveError && (
        <div className="rf-set-error">
          <AlertCircle size={13} /> {saveError}
        </div>
      )}

      {/* Action buttons */}
      <div className="rf-set-actions">
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
        <div className={`rf-test-result ${testResult.ok ? 'rf-test-result--ok' : 'rf-test-result--error'}`}>
          {/* Step-by-step timeline */}
          {(testResult.steps || []).map((s, i) => (
            <div key={i} className="rf-test-result__step">
              {s.ok
                ? <CheckCircle2 size={13} />
                : <XCircle size={13} />
              }
              <div>
                <span>{s.name}</span>
                {s.error && <div className="rf-test-result__error">{s.error}</div>}
              </div>
            </div>
          ))}
          {/* Final status */}
          <div className="rf-test-result__final">
            {testResult.ok
              ? <><CheckCircle2 size={13} /><span>{testResult.message}</span></>
              : <><WifiOff size={13} /><span>{testResult.error}</span></>
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
    <div className="rf-choice-card">
      <div className="rf-choice-card__label">{label}</div>
      <div className="rf-choice-card__options">
        {options.map(opt => (
          <label key={opt.value} className={`rf-choice-option${value === opt.value ? ' rf-choice-option--active' : ''}`}>
            <input type="radio" name={label} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} />
            <span>{opt.label}</span>
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
    <div className="rf-personalization">
      {/* Radio groups in a 3-column grid */}
      <div className="rf-personalization__grid">
        <RadioGroup label="Tone" options={TONE_OPTIONS} value={tone} onChange={setTone} />
        <RadioGroup label="Verbosity" options={VERBOSITY_OPTIONS} value={verbosity} onChange={setVerbosity} />
        <RadioGroup label="Format" options={FORMAT_OPTIONS} value={formatPreference} onChange={setFormatPreference} />
      </div>

      {/* System prompt — narrower width */}
      <div className="rf-set-field rf-personalization__prompt">
        <div className="rf-field-head">
          <label className="rf-label">AI system prompt <span>(optional)</span></label>
          <span className={`rf-field-count${charCount > 1800 ? ' rf-field-count--warn' : ''}`}>{charCount}/2000</span>
        </div>
        <textarea
          rows={4}
          maxLength={2000}
          placeholder="Optional. Style or tone guidance the AI should follow. Avoid instructions that override grounding or accuracy rules."
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          className="rf-input rf-set-textarea"
        />
      </div>

      <div className="rf-set-actions rf-set-actions--stacked">
        <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader size={13} className="rf-spin" /> Saving…</> : saved ? <><CheckCheck size={13} /> Saved</> : <><Save size={13} /> Save Preferences</>}
        </button>
        <p className="rf-settings__help">
          These preferences are passed to the AI when generating resumes, cover letters, and HR emails.
        </p>
      </div>
    </div>
  );
}

function GmailSettingsPanel({
  gmailConnected,
  gmailActionLoading,
  connectGmail,
  confirmDisconnectGmail,
  confirmReconnectGmail,
  senderName,
  setSenderName,
  savedSenderName,
  savingSenderName,
  saveSenderPreference,
  grantedScopes,
  requiredScopes,
}) {
  const scopesGranted = grantedScopes || [];
  const visibleScopes = (requiredScopes || []).filter(scope => scope !== 'openid');

  return (
    <div className="rf-settings-panel-stack">
      <section className="rf-settings-module rf-settings-module--split">
        <div className="rf-settings-module__copy">
          <span className="rf-settings-kicker">OAuth status</span>
          <h3>{gmailConnected ? 'Gmail is ready to send' : 'Gmail is not connected'}</h3>
          <p>
            ReachFlow sends through Gmail OAuth, so your password never touches the app.
            Reconnect when Google asks for a fresh grant or a permission goes missing.
          </p>
        </div>
        <div className="rf-settings-action-stack">
          {gmailConnected ? (
            <button type="button" className="rf-btn rf-btn--danger rf-btn--sm" onClick={confirmDisconnectGmail} disabled={gmailActionLoading}>
              {gmailActionLoading ? <><Loader size={13} className="rf-spin" /> Working…</> : <><WifiOff size={13} /> Disconnect</>}
            </button>
          ) : (
            <button type="button" className="rf-btn rf-btn--primary rf-btn--sm" onClick={connectGmail} disabled={gmailActionLoading}>
              {gmailActionLoading ? <><Loader size={13} className="rf-spin" /> Connecting…</> : <><Mail size={13} /> Connect Gmail</>}
            </button>
          )}
          <button type="button" className="rf-btn rf-btn--secondary rf-btn--sm" onClick={confirmReconnectGmail} disabled={gmailActionLoading}>
            <Wifi size={13} /> Reconnect
          </button>
        </div>
      </section>

      <section className="rf-settings-module">
        <div className="rf-settings-module__head">
          <div>
            <span className="rf-settings-kicker">Identity</span>
            <h3>Sender display name</h3>
          </div>
        </div>
        <div className="rf-settings-input-line">
          <input
            className="rf-input"
            value={senderName}
            onChange={e => setSenderName(e.target.value)}
            placeholder="Optional, e.g. Jay Prajapati"
          />
          <button
            type="button"
            className="rf-btn rf-btn--secondary rf-btn--sm"
            onClick={saveSenderPreference}
            disabled={savingSenderName || senderName.trim() === savedSenderName}
          >
            {savingSenderName ? <><Loader size={13} className="rf-spin" /> Saving…</> : <><Save size={13} /> Save</>}
          </button>
        </div>
        <p className="rf-settings__help">
          This appears as the From name on outgoing emails. Leave it empty to use the Gmail account name.
        </p>
      </section>

      <section className="rf-settings-module">
        <div className="rf-settings-module__head">
          <div>
            <span className="rf-settings-kicker">Permissions</span>
            <h3>Google scopes</h3>
          </div>
          {gmailConnected && <SettingsStatus label="Granted by Google" tone="ok" />}
        </div>

        {gmailConnected && scopesGranted.length > 0 ? (
          <>
            <div className="rf-scope-list">
              {visibleScopes.map(scope => {
                const short = scope.startsWith('https://') ? scope.split('/').pop() : scope;
                const granted = scopesGranted.includes(scope);
                return (
                  <div key={scope} className={`rf-scope-item ${granted ? 'rf-scope-item--granted' : 'rf-scope-item--missing'}`}>
                    {granted ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    <span className="rf-scope-item__name">{short}</span>
                    <span className="rf-scope-item__status">{granted ? 'Granted' : 'Missing'}</span>
                  </div>
                );
              })}
            </div>
            <p className="rf-settings__help">If a permission is missing, reconnect Gmail and approve the Google prompt.</p>
          </>
        ) : (
          <div className="rf-settings-empty">
            <WifiOff size={16} />
            <span>Connect Gmail to review the permissions ReachFlow can use.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function AIEnginePanel({ authedFetch, aiSettings, aiSettingsLoading, llmValid, llmConfigured }) {
  return (
    <div className="rf-settings-panel-stack">
      <section className="rf-settings-module rf-settings-module--split">
        <div className="rf-settings-module__copy">
          <span className="rf-settings-kicker">Provider status</span>
          <h3>{llmValid ? 'AI tools are unlocked' : llmConfigured ? 'One test away' : 'Bring your own provider'}</h3>
          <p>
            Resume Lab and DSA Analysis only run after your selected provider has been saved and validated.
            No shared fallback key is used.
          </p>
        </div>
        <SettingsStatus
          label={llmValid ? 'Validated' : llmConfigured ? 'Test needed' : 'Not configured'}
          tone={llmValid ? 'ok' : llmConfigured ? 'warn' : 'error'}
        />
      </section>

      <section className="rf-settings-module">
        <div className="rf-settings-module__head">
          <div>
            <span className="rf-settings-kicker">Configuration</span>
            <h3>Model routing</h3>
          </div>
        </div>
        <AISettingsSection authedFetch={authedFetch} cachedSettings={aiSettings} cachedLoading={aiSettingsLoading} />
      </section>
    </div>
  );
}

function VoicePanel({ authedFetch, aiSettings }) {
  return (
    <div className="rf-settings-panel-stack">
      <section className="rf-settings-module rf-settings-module--split">
        <div className="rf-settings-module__copy">
          <span className="rf-settings-kicker">Defaults</span>
          <h3>Make generated writing sound right</h3>
          <p>
            These preferences guide resumes, cover letters, HR emails, and other AI-generated text.
            They can still be overridden inside individual workflows.
          </p>
        </div>
        <SettingsStatus label="Optional" tone="neutral" />
      </section>

      <section className="rf-settings-module">
        <AIPersonalizationSection
          authedFetch={authedFetch}
          initialPrefs={aiSettings?.personalizationPrefs}
          initialSystemPrompt={aiSettings?.systemPrompt}
        />
      </section>
    </div>
  );
}

function AccountPanel({ confirmLogout, deleteMyAccount }) {
  return (
    <div className="rf-settings-account-grid">
      <section className="rf-settings-module rf-settings-module--split">
        <div className="rf-settings-module__copy">
          <span className="rf-settings-kicker">Session</span>
          <h3>Sign out on this device</h3>
          <p>Use this when you are done working or switching accounts.</p>
        </div>
        <button type="button" className="rf-btn rf-btn--secondary rf-btn--sm" onClick={confirmLogout}>
          <LogOut size={13} /> Log out
        </button>
      </section>

      <section className="rf-settings-module rf-settings-module--danger rf-settings-module--split">
        <div className="rf-settings-module__copy">
          <span className="rf-settings-kicker">Permanent</span>
          <h3>Delete workspace data</h3>
          <p>Deletes your account, contacts, applications, resumes, and related data. This cannot be undone.</p>
        </div>
        <button type="button" className="rf-btn rf-btn--danger rf-btn--sm" onClick={deleteMyAccount}>
          <Trash2 size={13} /> Delete account
        </button>
      </section>
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

  const [activePanel, setActivePanel] = useState(SETTINGS_PANELS[0].id);
  const panels = useMemo(() => (
    SETTINGS_PANELS.map(panel => ({
      ...panel,
      status: getPanelStatus(panel.id, { gmailConnected, llmValid, llmConfigured }),
    }))
  ), [gmailConnected, llmValid, llmConfigured]);
  const activeMeta = panels.find(panel => panel.id === activePanel) || panels[0];
  const ActiveIcon = activeMeta.Icon;

  return (
    <div className="rf-page rf-page--wide rf-settings-page">
      <div className="rf-settings-console">
        <aside className="rf-settings-rail" aria-label="Settings navigation">
          <div className="rf-settings-rail__brand">
            <span>Settings</span>
            <h1>Workspace controls</h1>
            <p>Connection, AI, writing, and account controls without the clutter.</p>
          </div>

          <nav className="rf-settings-tabs" role="tablist" aria-label="Settings areas">
            {panels.map(panel => {
              const PanelIcon = panel.Icon;
              const isActive = activePanel === panel.id;
              return (
                <button
                  key={panel.id}
                  id={`settings-tab-${panel.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`settings-panel-${panel.id}`}
                  className={`rf-settings-tab${isActive ? ' rf-settings-tab--active' : ''}`}
                  onClick={() => setActivePanel(panel.id)}
                >
                  <span className="rf-settings-tab__icon"><PanelIcon size={16} /></span>
                  <span className="rf-settings-tab__label">
                    <strong>{panel.label}</strong>
                    <span>{panel.kicker}</span>
                  </span>
                  <SettingsStatus label={panel.status.label} tone={panel.status.tone} />
                </button>
              );
            })}
          </nav>

          <div className="rf-settings-rail__footer">
            <div>
              <span>Gmail</span>
              <strong>{gmailConnected ? 'Connected' : 'Disconnected'}</strong>
            </div>
            <div>
              <span>AI</span>
              <strong>{llmValid ? 'Validated' : llmConfigured ? 'Needs test' : 'Not set'}</strong>
            </div>
          </div>
        </aside>

        <main className="rf-settings-workbench">
          <header className="rf-settings-mast">
            <span className={`rf-settings-mast__icon rf-settings-mast__icon--${activeMeta.status.tone}`}>
              <ActiveIcon size={22} />
            </span>
            <div className="rf-settings-mast__copy">
              <span>{activeMeta.kicker}</span>
              <h2>{activeMeta.title}</h2>
              <p>{activeMeta.description}</p>
            </div>
            <SettingsStatus label={activeMeta.status.label} tone={activeMeta.status.tone} />
          </header>

          <section
            id={`settings-panel-${activeMeta.id}`}
            className="rf-settings-panel"
            role="tabpanel"
            aria-labelledby={`settings-tab-${activeMeta.id}`}
          >
            {activePanel === 'gmail' && (
              <GmailSettingsPanel
                gmailConnected={gmailConnected}
                gmailActionLoading={gmailActionLoading}
                connectGmail={connectGmail}
                confirmDisconnectGmail={confirmDisconnectGmail}
                confirmReconnectGmail={confirmReconnectGmail}
                senderName={senderName}
                setSenderName={setSenderName}
                savedSenderName={savedSenderName}
                savingSenderName={savingSenderName}
                saveSenderPreference={saveSenderPreference}
                grantedScopes={grantedScopes}
                requiredScopes={requiredScopes}
              />
            )}

            {activePanel === 'ai' && (
              <AIEnginePanel
                authedFetch={authedFetch}
                aiSettings={aiSettings}
                aiSettingsLoading={aiSettingsLoading}
                llmValid={llmValid}
                llmConfigured={llmConfigured}
              />
            )}

            {activePanel === 'voice' && (
              <VoicePanel authedFetch={authedFetch} aiSettings={aiSettings} />
            )}

            {activePanel === 'account' && (
              <AccountPanel confirmLogout={confirmLogout} deleteMyAccount={deleteMyAccount} />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
