# Settings · Tasks

## Current State
Settings page exists with AI provider configuration (provider, API key, model, test connection). Step-by-step diagnostic implemented. Sender display name via `/auth/me/preferences`. Gmail connect/disconnect/reconnect via dedicated routes.

## Gaps vs. Spec
- [ ] AI personalization settings (tone, verbosity, formatting) not implemented
- [ ] Settings page may need layout/section organization improvements
- [ ] No dedicated section for account deletion in settings UI (may be elsewhere)

---

## Frontend Changes

### AI Personalization section (new)
- **File**: `frontend/src/pages/SettingsPage.jsx`
- New section: "AI Personalization"
- Fields:
  - `tone`: radio or select — Professional / Casual / Concise
  - `verbosity`: radio or select — Brief / Standard / Detailed
  - `formatPreference`: radio or select — Bullet-heavy / Prose / Mixed
- Save button → PUT `/api/settings/ai/personalization`
- Load current values on mount → GET `/api/settings/ai`

### Section organization
- Sections: Profile, Gmail, AI · Resume Lab, AI Personalization, Danger Zone
- Each section has a clear heading with dot separator style
- Danger Zone: Delete All App Data (destructive, confirmation required)

---

## Backend Changes

### PUT /api/settings/ai/personalization (new)
- **File**: `backend/src/routes/settings.js`
- Accepts: `{ tone, verbosity, formatPreference }`
- Validates: each field is one of its allowed values
- Stores in `AISettings.personalizationPrefs` (new Mixed field on schema)
- Does NOT reset `isValid` (personalization is separate from provider config)
- Returns: `{ ok: true }`

### GET /api/settings/ai — extend response
- Include `personalizationPrefs` in response when it exists
- Backward compatible (field absent = unset = use defaults)

### AISettings schema update
- **File**: `backend/src/db.js`
- Add field: `personalizationPrefs: { type: mongoose.Schema.Types.Mixed, default: null }`
- No migration needed (field defaults to null)

---

## Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/settings/ai` | Get AI settings |
| PUT | `/api/settings/ai` | Update AI provider settings |
| POST | `/api/settings/ai/test` | Test AI connection |
| PUT | `/api/settings/ai/personalization` | **NEW** — save personalization prefs |
| PATCH | `/auth/me/preferences` | Update sender display name |
| DELETE | `/auth/me` | Delete all app data |

---

## DB Impact
- `reachflow_ai_settings`: add `personalizationPrefs: Mixed` field
- No migration script needed (defaults to null, handled gracefully in generation code)

---

## State Impact
- `ResumeLabContext`: load and expose `personalizationPrefs` for display in Settings
- Or handle in a dedicated `SettingsContext` if created

---

## Dependencies
- AI personalization prefs fed into Cortex calls in `resumelab.js` routes
- `resolveUserLlm` must also return `personalizationPrefs` or be called alongside it

---

## Migration Needs
- None — new optional field

---

## Testing Checklist
- [ ] AI personalization fields render with current values
- [ ] Saving personalization persists via PUT endpoint
- [ ] Changing AI provider settings still resets `isValid`
- [ ] Personalization does NOT reset `isValid`
- [ ] Settings sections clearly organized
- [ ] Account deletion still works

---

## Done Definition
- AI personalization section implemented with tone/verbosity/format fields
- Values persisted to `AISettings.personalizationPrefs`
- Personalization fed into Resume Lab generation calls
