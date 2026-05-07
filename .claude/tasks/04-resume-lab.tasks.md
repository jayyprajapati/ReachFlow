# Resume Lab · Tasks

## Current State
Resume Lab Phase 1 (upload, extract, profile build) and Phase 2 (JD analysis, generation) are implemented. Sub-pages: Vault, Career Profile (was "Canonical Profile"), Workspace, History. BYOK gating in place.

## Gaps vs. Spec
- [ ] "Canonical Profile" terminology still in backend (`/profile` endpoint, schema); rename to "Career Profile" in UI and API responses
- [ ] `isBaseResume` concept still exists in schema; base resume concept needs to be removed from UX (not necessarily DB — backward compat)
- [ ] Manual additions to Career Profile not implemented
- [ ] Unified timeline view in Career Profile not implemented
- [ ] History entries not clickable to restore workspace state
- [ ] Cover letter generation not implemented
- [ ] HR email generation not implemented
- [ ] "Open in Compose" from HR email not implemented
- [ ] AI personalization settings not fed into generation

---

## Frontend Changes

### Rename "Canonical Profile" → "Career Profile" in UI
- **Files**: `frontend/src/pages/ResumeLab/ProfilePage.jsx`, `frontend/src/contexts/ResumeLabContext.jsx`, any component with "canonical" in user-facing strings
- Replace all user-facing "Canonical Profile" strings with "Career Profile"
- API response key `canonicalProfile` can stay (internal); map it to `careerProfile` in context

### Remove base resume UX
- **File**: `frontend/src/pages/ResumeLab/VaultPage.jsx`
- Remove "Set as Base Resume" toggle/button from resume cards
- Remove any "base resume" indicator from vault list
- Keep `isBaseResume` field on backend (don't break existing data)

### Unified timeline view in Career Profile
- **File**: `frontend/src/pages/ResumeLab/ProfilePage.jsx`
- New section: "Career Timeline"
- Merge: `experience`, `education`, `certifications`, `projects` from `canonicalProfile`
- Sort by date descending (use `startDate` or `date` field from Cortex-extracted data)
- Each entry shows type badge + title + organization + date range
- Collapsible entries for detail

### Manual additions to Career Profile (new)
- **File**: `frontend/src/pages/ResumeLab/ProfilePage.jsx`
- "Add Entry" buttons per section (Experience, Education, Certification, Project)
- Form modal with fields per section type
- On save: PATCH `/api/resumelab/profile/manual-add` (new endpoint)
- Edit/delete existing manual entries

### History restore workspace state
- **File**: `frontend/src/pages/ResumeLab/HistoryPage.jsx`
- History items are clickable
- Clicking an analysis entry → navigate to Workspace with that analysis pre-loaded
- Clicking a generated resume entry → navigate to Workspace with analysis + generation pre-loaded
- Use `ResumeLabContext` to set `currentAnalysis` and `currentGenerated` state before navigation

### Cover letter generation
- **File**: `frontend/src/pages/ResumeLab/WorkspacePage.jsx`
- New "Generate Cover Letter" button after analysis
- Calls `POST /api/resumelab/generate-cover-letter`
- Shows generated cover letter text in a panel with copy button
- Saved to history

### HR email generation + Open in Compose
- **File**: `frontend/src/pages/ResumeLab/WorkspacePage.jsx`
- "Generate HR Email" button after analysis
- Calls `POST /api/resumelab/generate-hr-email`
- Shows subject + body in a panel
- "Open in Compose" button → `navigateTo('/compose')` + pass pre-fill state via context or URL params
- Compose must read pre-fill context on mount

---

## Backend Changes

### PATCH /api/resumelab/profile/manual-add (new)
- **File**: `backend/src/routes/resumelab.js`
- Accepts: `{ section: 'experience'|'education'|'certification'|'project', entry: {...} }`
- Validates entry fields per section
- Pushes entry into `canonicalProfile.[section]` array
- Increments `profileVersion`
- Returns updated profile stats

### PATCH /api/resumelab/profile/manual-remove (new)
- Accepts: `{ section, entryIndex }` or `{ section, entryId }`
- Removes entry from profile section
- Increments `profileVersion`

### POST /api/resumelab/generate-cover-letter (new)
- **File**: `backend/src/routes/resumelab.js`
- Accepts: `{ analysisId, userPrompt? }`
- Resolves user LLM (BYOK gate)
- Calls Cortex cover letter endpoint (to be built in Cortex)
- Returns: `{ coverLetterText: string }`
- Does NOT create a new DB record (or creates a `GeneratedOutput` record if history tracking needed)

### POST /api/resumelab/generate-hr-email (new)
- **File**: `backend/src/routes/resumelab.js`
- Accepts: `{ analysisId, userPrompt?, recipientName? }`
- Resolves user LLM (BYOK gate)
- Calls Cortex HR email endpoint
- Returns: `{ subject: string, body: string }`

### Feed personalization into generation calls
- **File**: `backend/src/routes/resumelab.js` + `backend/src/services/cortexClient.js`
- Load `aiSettings.personalizationPrefs` (new field) when building `llm` override
- Pass `personalization` object to Cortex calls

---

## Routes
| Method | Path | Description |
|---|---|---|
| POST | `/api/resumelab/upload` | Upload + parse resume |
| GET | `/api/resumelab/resumes` | List resumes |
| PATCH | `/api/resumelab/resumes/:id` | Update resume metadata |
| DELETE | `/api/resumelab/resumes/:id` | Delete resume |
| GET | `/api/resumelab/profile` | Get Career Profile |
| POST | `/api/resumelab/profile/rebuild` | Rebuild from all resumes |
| PATCH | `/api/resumelab/profile/manual-add` | **NEW** — add entry manually |
| PATCH | `/api/resumelab/profile/manual-remove` | **NEW** — remove manual entry |
| POST | `/api/resumelab/analyze` | Analyze JD |
| GET | `/api/resumelab/analyses` | List analyses |
| GET | `/api/resumelab/analyses/:id` | Get full analysis |
| POST | `/api/resumelab/generate` | Generate resume |
| GET | `/api/resumelab/generated` | List generated resumes |
| GET | `/api/resumelab/generated/:id` | Get generated resume |
| GET | `/api/resumelab/generated/:id/pdf` | Download PDF |
| POST | `/api/resumelab/generated/:id/compile-latex` | Recompile LaTeX |
| DELETE | `/api/resumelab/generated/:id` | Delete generated resume |
| GET | `/api/resumelab/history` | Merged history feed |
| POST | `/api/resumelab/compile-latex` | Stateless compile |
| POST | `/api/resumelab/generate-cover-letter` | **NEW** |
| POST | `/api/resumelab/generate-hr-email` | **NEW** |

---

## DB Impact
- `reachflow_canonical_profiles`: add `manualEntries` Mixed field to track manually added items vs. extracted
- OR: integrate manual entries directly into `canonicalProfile` sections (simpler but harder to distinguish source)
- `reachflow_ai_settings`: add `personalizationPrefs` Mixed field
- No breaking changes to existing collections

---

## State Impact (`ResumeLabContext`)
- Add `currentAnalysis` state for history restore
- Add `currentGenerated` state for history restore
- Add `careerProfile` alias for `canonicalProfile` data
- Add `hrEmailDraft` state for "Open in Compose" pre-fill

---

## Dependencies
- Cortex must implement cover letter and HR email endpoints
- Compose page must handle pre-fill from context state
- AI personalization settings: must be stored before generation calls

---

## Migration Needs
- No data migration needed
- `isBaseResume` field can remain on schema (backward compat)
- UI stops showing base resume concept; data remains valid

---

## Risky Areas
- Cortex endpoints for cover letter + HR email require Cortex-side implementation
- Manual Career Profile edits could drift out of sync with Cortex-merged data if user re-uploads a resume (merge may overwrite manual entries — need strategy)
- History restore requires accurate state serialization

---

## Testing Checklist
- [ ] Upload still works end-to-end
- [ ] Profile rebuild still works
- [ ] Manual add/remove entries work without breaking auto-extracted entries
- [ ] Unified timeline renders all entry types sorted by date
- [ ] History items are clickable and restore workspace
- [ ] Cover letter generated and displayed
- [ ] HR email generated; "Open in Compose" pre-fills compose
- [ ] "Canonical Profile" no longer appears in any user-facing UI string
- [ ] BYOK gate enforced on all new endpoints

---

## Done Definition
- "Career Profile" used throughout UI
- Base resume UX removed from Vault
- Manual additions work
- Unified timeline shown in Career Profile
- History is restorable
- Cover letter + HR email generation endpoints exist and work
- "Open in Compose" flow works
