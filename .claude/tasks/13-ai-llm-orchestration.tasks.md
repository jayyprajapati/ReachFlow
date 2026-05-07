# AI / LLM Orchestration · Tasks

## Current State
`cortexClient.js` wraps Cortex HTTP calls. `resolveUserLlm` enforces BYOK. In-memory JD analysis cache in `resumelab.js`. LaTeX compiler service exists. AI test via `/llm/ping`.

## Gaps vs. Spec
- [ ] Cover letter generation endpoint not in Cortex or routes
- [ ] HR email generation endpoint not in Cortex or routes
- [ ] Personalization prefs not fed into Cortex calls
- [ ] `cortexClient.js` may need new functions for cover letter + HR email

---

## Backend Changes

### Update `cortexClient.js`
- **File**: `backend/src/services/cortexClient.js`
- Add `generateCoverLetter({ userId, jobDescription, canonicalProfile, llm, personalization? })` function
- Add `generateHrEmail({ userId, jobDescription, canonicalProfile, recipientName?, llm, personalization? })` function
- Both functions call their respective Cortex endpoints
- Match existing pattern: log latency, throw with `cortexDetail` on error

### Feed personalization into existing calls
- **File**: `backend/src/services/cortexClient.js` + `backend/src/routes/resumelab.js`
- `resolveUserLlm` returns `llm` override; also return `personalizationPrefs` from same AISettings doc
- Pass `personalization` to all Cortex generation calls (analyze, generate, cover letter, HR email)
- Cortex must accept optional `personalization` param (Cortex-side implementation)

### New routes in resumelab.js
- `POST /api/resumelab/generate-cover-letter`
- `POST /api/resumelab/generate-hr-email`
- Both: BYOK gate → Cortex call → return result
- Both: save result to history (new `GeneratedOutput` doc, or extend `GeneratedResume` schema with `outputType` field)

---

## DB Impact

### Option A: Extend GeneratedResume schema
- Add `outputType: { type: String, enum: ['resume', 'cover_letter', 'hr_email'], default: 'resume' }`
- Add `textContent: { type: String, default: '' }` for cover letter / HR email text
- Backward compatible: existing docs default to `resume`

### Option B: New collection `reachflow_generated_outputs`
- Separate schema for non-resume AI outputs
- Cleaner separation but requires new model

**Recommendation**: Option A (simpler, single history feed)

---

## Routes
| Method | Path | Description |
|---|---|---|
| POST | `/api/resumelab/generate-cover-letter` | **NEW** — generate cover letter |
| POST | `/api/resumelab/generate-hr-email` | **NEW** — generate HR email |
| PUT | `/api/settings/ai/personalization` | **NEW** — save personalization prefs |

---

## State Impact
- `ResumeLabContext`: `currentCoverLetter`, `currentHrEmail` state for Workspace display
- History feed: cover letter and HR email entries appear alongside resume/analysis entries

---

## Dependencies
- **Cortex must implement**:
  - `POST /cover-letter` endpoint
  - `POST /hr-email` endpoint
  - Accept `personalization` param on all generation endpoints
- These are Cortex-side Python changes; document the expected request/response contract

### Cortex Cover Letter API Contract
```
POST /cover-letter
Request: { job_description, canonical_profile, llm, personalization? }
Response: { cover_letter_text: string, word_count: int }
```

### Cortex HR Email API Contract
```
POST /hr-email
Request: { job_description, canonical_profile, recipient_name?, llm, personalization? }
Response: { subject: string, body: string, word_count: int }
```

---

## Migration Needs
- If using Option A: run migration to add `outputType: 'resume'` default to all existing `GeneratedResume` docs
- Or: handle missing field in code (`doc.outputType || 'resume'`)

---

## Risky Areas
- Cortex endpoints for cover letter + HR email are not yet implemented — this is the critical external dependency
- Personalization prefs: Cortex must support the `personalization` param for it to have any effect
- If Cortex is not updated, routes can still be added with a stub that returns "not implemented yet"

---

## Testing Checklist
- [ ] BYOK gate blocks cover letter/HR email generation for unconfigured users
- [ ] Cover letter generated and returned correctly
- [ ] HR email generated with subject + body
- [ ] Personalization prefs included in Cortex call payload
- [ ] New outputs appear in history feed
- [ ] History type correctly distinguishes resume / cover_letter / hr_email
- [ ] JD analysis cache still works correctly

---

## Done Definition
- Cover letter generation endpoint implemented and Cortex-integrated
- HR email generation endpoint implemented and Cortex-integrated
- Personalization prefs fed into all generation calls
- History shows all output types
