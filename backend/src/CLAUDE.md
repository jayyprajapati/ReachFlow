# Backend Reference

## Purpose

Node.js + Express REST API. Handles auth, encryption, Gmail send, AI orchestration via Brain service, and all data persistence.

## Read This When

- Adding or modifying any API route
- Touching encryption or sensitive field storage
- Working on Gmail OAuth or send flow
- Integrating with the Brain LLM service
- Adding new Mongoose models or running migrations
- Debugging BYOK (AI provider) errors

## Feature Map

| Route prefix | File | Feature |
|---|---|---|
| `/api/campaigns` | `routes/campaigns.js` | Compose / outreach + scheduled send |
| `/api/groups` | `routes/groups.js` | Contacts & groups |
| `/api/recipients` | `routes/recipients.js` | Recipient resolution for campaigns |
| `/api/applications` | `routes/applications.js` | Application pipeline |
| `/api/templates` | `routes/templates.js` | Email templates |
| `/api/variables` | `routes/variables.js` | Template variables |
| `/api/resumelab` | `routes/resumelab.js` | Resume Lab (upload, analyze, generate) |
| `/api/settings` | `routes/settings.js` | AI provider BYOK, personalization |
| `/api/roadmaps` | `routes/roadmaps.js` | Roadmap Lab |
| `/api/dsa` | `routes/dsa.js` | DSA Lab (algorithm analysis) |
| `/api/resources` | `routes/resources.js` | Shared resource (file) library |
| `/api/today` | `routes/today.js` | Dashboard aggregations |
| `/auth/me` | `app.js` | Profile, sender name, account deletion |
| `/gmail/*` | `app.js` + `gmail.js` | Gmail OAuth connect/disconnect |
| `/auth/google/callback` | `app.js` | OAuth callback (public — no requireAuth) |

## Critical Files

### app.js
Boot entry point. Firebase init → crypto assert → middleware → route mounts → MongoDB connect → campaign worker start. Houses `requireAuth`, Gmail OAuth endpoints, profile endpoints, and `deleteCurrentUserAppData`.

### db.js
All Mongoose schemas and model registrations. The single source of truth for collection shape and indexes. Migrations also live here (`migrateCollectionNames`). **Read this before touching any model.**

### utils/dataSecurity.js
AES-256-GCM encryption (`encryptJson`/`decryptJson`/`encryptString`/`decryptString`), HMAC email hashing (`computeEmailHash`), company key normalization (`normalizeCompanyKey`). Envelope shape: `{ v, alg, kid, iv, tag, ct }`. Check `isEncryptedEnvelope()` before decrypt — Mixed fields may be legacy plaintext.

### utils/crypto.js
Gmail refresh token encryption only. Uses `TOKEN_ENC_KEY` (separate from `DATA_ENC_KEY`). Do not use for anything else.

### services/brainClient.js
All calls to the Brain LLM+RAG service. Functions: `extractResume`, `mergeCanonicalProfile`, `analyzeResumeMatch`, `generateCoverLetter`, `generateHrEmail`, `generateResumeLatex`, `composeRewrite`, `analyzeDsa`, `deleteResumeVectors`, `deleteAllUserVectors`, `llmPing`. Retry logic built in (max 2 retries). `toBrainLlm()` strips internal fields before sending.

### services/brainPrompts.js
All LLM prompt builders. Change here to adjust AI output quality, format, or behavior. Exports: `resumeExtractPrompt`, `mergeProfilePrompt`, `analyzePrompt`, `coverLetterPrompt`, `hrEmailPrompt`, `generateFromLatexPrompt`, `rewritePrompt`, `dsaAnalysisPrompt`, `buildStyleBlock`.

### services/llmSettings.js
`resolveUserLlm(userId)` — enforces BYOK. Must be called at the top of every AI route. Throws `LLM_NOT_CONFIGURED`, `LLM_NOT_VALIDATED`, `LLM_KEY_ERROR`. `isByokError(err)` — use in catch blocks to return 402 vs. 500.

### services/latexCompiler.js
Compiles LaTeX source → PDF by running the `reachflow-latex` Docker container. Exports: `compileToPdf`, `injectTemplate` (wraps generated content into a role-specific `.tex` template), `validateLatex` (pre-compile sanity check), `escapeLaTeX`, `TEMPLATE_FILES`. Templates live in `backend/src/resume_templates/`. Writes temp `.tex` files to `LATEX_TEMP_DIR`, output PDFs to `PDF_OUTPUT_DIR`.

### gmail.js
Gmail OAuth2 helpers. `getAuthUrl()`, `exchangeCodeForUser()`, `getAuthorizedClient()`, `clearGmailAuthorization()`, `introspectTokenScopes()`. Refresh token encrypted via `crypto.js`.

### scripts/runMigrations.js
Migration orchestrator. Run via `npm run migrate` (never auto-run on startup). Add new migrations here.

### services/dsaSafety.js
Guards DSA Lab routes against non-DSA input. Checks `is_dsa_problem` flag returned by Brain before saving analysis.

### services/resourceStorage.js
Resource library service. Owns per-user disk layout (`RESOURCE_UPLOAD_DIR/<user.resourceFolderName>/`), SHA-256 dedup, the multer `resourceDiskStorage`, and the cross-feature helpers used by Compose + Resume Lab:
- `registerStoredResource({ userId, file, source, resumeId? })` — write or dedup; enforces `MAX_RESOURCES_PER_USER` (10).
- `syncResumeResources(user)` — backfill legacy Resume Vault files into the Resource collection on the next `GET /api/resources` call (idempotent, side-effecting).
- `resolveResourceAttachments(userId, attachments)` — materialize base64 bytes for Gmail send (Compose).
- `describeResourceAttachments(userId, attachments)` — metadata-only for draft restore.
- `detachResumeResource({ userId, resumeId, storagePath })` — Resume delete calls this to release the link before file removal.
- `deleteUserResourceFolder(user)` — used in `deleteCurrentUserAppData`.

## Dependencies

**Uses:**
- Firebase Admin SDK — token verification
- Mongoose — all data access
- Brain service — all LLM/AI operations
- Gmail API (googleapis) — OAuth + send
- Docker (exec) — LaTeX compilation
- express-rate-limit, helmet, cors

**Used By:**
- Frontend (React SPA) via HTTP API

## Known Gotchas

- **Mixed-type fields**: Always call `isEncryptedEnvelope()` before `decryptJson()` — legacy docs may have plaintext.
- **Brain field whitelist**: `toBrainLlm()` strips `_personalizationPrefs` and `_userSystemPrompt` — attach these to the `llm` object if you need style injection; Brain never sees them.
- **BYOK gate**: Every AI route must call `resolveUserLlm()` and use `isByokError()` in catch to return 402.
- **Transactions**: `deleteCurrentUserAppData` falls back to non-transactional when replica set unavailable (dev MongoDB).
- **OAuth callback is public**: `/auth/google/callback` has no `requireAuth` — uses `gmailState` CSRF pattern instead.
- **DsaAnalysis not encrypted**: Intentional — problem text and code contain no PII.
- **Resource dedup unique index**: `(userId, sha256)` is unique — `registerStoredResource` returns existing doc with `deduplicated: true` on collision; never throws 11000 to the route handler unless a race occurs (handled inline).
- **Resource delete returns 409**: If `resumeIds.length > 0`, deletion is blocked; the Resume must be removed from Vault first (which calls `detachResumeResource`).

## Read Next

- `ARCHITECTURE.md` — system flows and data model
- `.claude/specs/` — product specs for the feature you're touching
- `.claude/tasks/` — engineering tasks for the feature you're touching

## File Reference

### app.js
Purpose: Boot sequence + all route mounts. Houses requireAuth, Gmail OAuth, profile, account deletion.

### db.js
Purpose: Mongoose schemas + model exports + migration helpers. Single source of truth for data shape.

### gmail.js
Purpose: Gmail OAuth2 — token exchange, authorized client, scope introspection, revocation.

### routes/campaigns.js
Purpose: Campaign CRUD + Gmail send + scheduled send. Exports `router` and `processScheduledCampaigns`.

### routes/resumelab.js
Purpose: Resume upload, profile operations, JD analysis, resume/cover letter/HR email generation, direct LaTeX compile (`/compile-latex`, `/generated/:id/compile-latex`), and template-based generation (`/generate-from-latex`).

### routes/dsa.js
Purpose: DSA problem analysis endpoint. Calls `dsaSafety.js` + `brainClient.analyzeDsa`.

### routes/resources.js
Purpose: Resource library CRUD. Endpoints: `GET /` (list, with sync), `POST /upload` (multer), `GET /:id/download`, `DELETE /:id` (with link guard).

### routes/today.js
Purpose: Dashboard aggregation queries (activity counts, pipeline stats, recent history).

### services/brainPrompts.js
Purpose: All LLM prompt templates. First place to look when AI output quality needs adjusting.

### services/recipientParser.js
Purpose: Parses raw email/contact text into structured recipient arrays for campaigns.

### services/senderResolver.js
Purpose: Resolves the "from" display name for Gmail sends.

### services/templateService.js
Purpose: Template variable substitution logic for campaign body rendering.

### utils/sanitizeEmailHtml.js
Purpose: Sanitizes HTML before email send to prevent XSS in recipient-visible content.
