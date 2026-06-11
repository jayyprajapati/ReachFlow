# ReachFlow Architecture

## System Architecture

ReachFlow is a privacy-first job search platform with a React SPA frontend, a Node.js/Express backend, MongoDB for persistence, Firebase for authentication, and an external Brain service for all LLM/RAG operations.

```
Browser (React + Vite, port 5173)
        │ HTTPS + Firebase ID token
        ▼
Express API (Node.js, port 4000)
        │ requireAuth middleware (Firebase Admin SDK)
        │
        ├─── MongoDB (Mongoose, reachflow_* collections)
        ├─── Brain service (LLM + RAG, port 8000)
        ├─── Gmail API (OAuth, send)
        └─── LaTeX compiler (Docker, reachflow-latex image)
```

---

## Major Areas

### Frontend (`frontend/src/`)

**Purpose:** React SPA for all user interactions. No server-side rendering.

**Key technologies:** React 18, Vite, custom pushState router, plain CSS (no Tailwind).

**Responsibilities:**
- Auth gate: shows LandingPage when logged out, AppShell+PageRouter when logged in.
- Route management: custom `RouterProvider` in `router.jsx` using `window.history.pushState`.
- Global state: `AppContext` holds auth, Gmail status, templates, groups, variables, history.
- Feature state: `ResumeLabContext` (resume vault, profile, analyses, generated docs), `RoadmapContext` (roadmaps + stages + items).
- API calls: contexts call `authedFetch` (injects Firebase ID token as `Authorization: Bearer`).
- Theming: dark/light via CSS variables in `styles/tokens.css`; stored in localStorage.

**Critical files:**
- `src/App.jsx` — component tree root; `AppProvider → RouterProvider → AuthGate → AppShell+PageRouter`
- `src/router.jsx` — custom pushState router, exports `RouterProvider`, `useRouter`
- `src/contexts/AppContext.jsx` — auth, Gmail, groups, templates, variables, history, theme
- `src/contexts/ResumeLabContext.jsx` — Resume Lab full state and API wiring
- `src/contexts/RoadmapContext.jsx` — Roadmap Lab state and API wiring
- `src/styles/tokens.css` — all CSS custom properties; change here to retheme

---

### Backend (`backend/src/`)

**Purpose:** Express REST API — auth, encryption, Gmail send, AI orchestration.

**Key technologies:** Node.js 20+, Express, Mongoose, Firebase Admin SDK, CommonJS modules.

**Responsibilities:**
- Verifies Firebase ID tokens on every `/api/*` request and upserts a `User` doc.
- Encrypts/decrypts all sensitive fields via `utils/dataSecurity.js` (AES-256-GCM).
- Proxies AI calls to Brain service; enforces BYOK validation before any LLM route.
- Manages Gmail OAuth flow and sends email via Gmail API.
- Runs a scheduled campaign worker (`setInterval`, 60s) after MongoDB connects.

**Critical files:**
- `src/app.js` — boot sequence, middleware, all route mounts, Gmail OAuth callbacks
- `src/db.js` — all Mongoose schemas and model registrations; migration helpers
- `src/gmail.js` — Gmail OAuth helpers, `getAuthorizedClient`, `exchangeCodeForUser`
- `src/utils/dataSecurity.js` — AES-256-GCM encrypt/decrypt, HMAC hash, envelope shape
- `src/utils/crypto.js` — Gmail refresh token encryption (`TOKEN_ENC_KEY`, separate from dataSecurity)
- `src/services/brainClient.js` — all Brain API calls (extract, generate, analyze, DSA, ping)
- `src/services/brainPrompts.js` — all LLM prompt builders for Brain
- `src/services/llmSettings.js` — `resolveUserLlm()`: enforces BYOK; throws typed errors
- `src/services/latexCompiler.js` — LaTeX → PDF via Docker container
- `src/scripts/runMigrations.js` — migration orchestrator (run via `npm run migrate`)

---

### Database (MongoDB)

**Purpose:** Primary persistence. All collections are prefixed `reachflow_`.

See [Mongoose models & collections](#mongoose-models--collections) in CLAUDE.md for the full table.

**Notable design decisions:**
- Sensitive fields stored as `encryptedPayload` (Mixed type) — AES-256-GCM envelope.
- Email dedup uses HMAC hash (`emailHash` field); never plain-text indexed.
- Company grouping uses `normalizeCompanyKey(domain)` → `companyKey` field.
- `contacts[]` are embedded in the `Group` document (not a separate collection).
- `DsaAnalysis` stores problem text and code unencrypted — no PII.

---

### Brain Service (external, `http://localhost:8000` default)

**Purpose:** Application-agnostic LLM + RAG engine. ReachFlow provides prompts; Brain executes them.

**API endpoints used:**
- `POST /v1/extract` — PDF/DOC/DOCX → text + Qdrant vector ingest (5 min timeout)
- `POST /v1/generate` — generic LLM call → JSON or text (3 min timeout)
- `POST /v1/delete` — delete vectors by `doc_id` or `namespace` (per-user isolation)
- `POST /v1/llm/ping` — BYOK connection test

**Auth:** single `Bearer BRAIN_API_KEY` (env var). Per-user isolation via `namespace` = `userId`.

**Wrapper:** `src/services/brainClient.js` — handles retries (max 2), timeouts, error surfacing.

---

## Feature Architecture

### 1. Compose (Outreach)
**Purpose:** Personalized email campaigns via Gmail.
- **Route:** `POST /api/campaigns`, `POST /api/campaigns/:id/send`, etc.
- **Key files:** `backend/src/routes/campaigns.js`, `frontend/src/pages/ComposePage.jsx`
- **Flow:** Compose → Draft save → Preview per recipient → Send (Gmail API) or Schedule
- **Scheduled send:** campaign worker `processScheduledCampaigns` runs every 60s
- **Variable substitution:** `{{variable}}` tokens replaced per-recipient at send time

### 2. Contacts & Groups
**Purpose:** Company-scoped contact management.
- **Route:** `GET/POST/PATCH/DELETE /api/groups`
- **Key files:** `backend/src/routes/groups.js`, `frontend/src/pages/ContactsPage.jsx`, `frontend/src/components/GroupManager.jsx`
- **Dedup:** `computeEmailHash(email)` compared on ingest; duplicate contacts rejected
- **Auto-grouping:** `deriveCompanyKeyFromEmail(email)` → `normalizeCompanyKey()` assigns contacts to groups

### 3. Application Pipeline
**Purpose:** Kanban job application tracker.
- **Route:** `GET/POST/PATCH/DELETE /api/applications`
- **Key files:** `backend/src/routes/applications.js`, `frontend/src/pages/PipelinePage.jsx`
- **Statuses:** `applied → oa → interviewing → on_hold → offer → rejected → ghosted`
- **Linked to groups:** `companyGroupId` references the Group for contact cross-reference

### 4. Resume Lab
**Purpose:** AI-powered resume tailoring with LaTeX PDF output.
- **Route:** `GET/POST /api/resumelab/*`
- **Key files:** `backend/src/routes/resumelab.js`, `frontend/src/pages/ResumeLab/`, `frontend/src/contexts/ResumeLabContext.jsx`, `frontend/src/services/resumeLabApi.js`
- **Sub-pages:** VaultPage (uploads), ProfilePage (career profile editor), AnalyzePage (JD match), WorkspacePage (generate), GeneratedPage (preview), HistoryPage
- **Career Profile:** uploaded resumes are extracted via Brain → merged by LLM into a single `CanonicalProfile` doc
- **JD Analysis:** Brain analyzes JD vs. canonical profile → returns `matchScore`, gaps, ATS clusters; results cached in-memory (30 min TTL)
- **Generation:** Brain generates LaTeX → `injectTemplate()` wraps it into a role-specific template → `latexCompiler.js` compiles to PDF; `latexSource` stored on `GeneratedResume`
- **LaTeX templates:** `backend/src/resume_templates/` — `backend.tex`, `frontend.tex`, `fullstack.tex`, `from-scratch.tex`; selected by `templateType` param
- **Direct compile:** `POST /compile-latex` and `POST /generated/:id/compile-latex` accept raw `latexSource` and return PDF
- **BYOK gate:** `resolveUserLlm()` must succeed; HTTP 402 returned otherwise
- **flowId:** shared UUID linking an analysis + its generated resume/cover letter/HR email

### 5. Roadmap Lab
**Purpose:** Self-directed learning tracker with kanban board.
- **Route:** `GET/POST/PATCH/DELETE /api/roadmaps/*`
- **Key files:** `backend/src/routes/roadmaps.js`, `frontend/src/pages/RoadmapLab/`, `frontend/src/contexts/RoadmapContext.jsx`, `frontend/src/services/roadmapApi.js`
- **Data model:** `Roadmap` → `RoadmapStage[]` → `RoadmapItem[]`
- **Resource types:** youtube_playlist, youtube_video, course, article, book, github, custom
- **Item lifecycle:** planned → active → completed / skipped

### 6. DSA Lab
**Purpose:** Algorithm/data-structure problem analysis with multi-approach teaching.
- **Route:** `GET/POST /api/dsa`
- **Key files:** `backend/src/routes/dsa.js`, `frontend/src/pages/DsaLab/`, `frontend/src/services/dsaApi.js`
- **UI components:** `frontend/src/components/dsa/` — `CodeBlock.jsx`, `CodeEditor.jsx`, `DsaResult.jsx`
- **Model:** `DsaAnalysis` (`reachflow_dsa_analyses`) — problem text + code stored unencrypted (no PII)
- **LLM gate:** same BYOK enforcement via `resolveUserLlm()`
- **Safety check:** `src/services/dsaSafety.js` — guards against non-DSA input (Brain response `is_dsa_problem` flag)

### 7. Resources (Shared file library)
**Purpose:** Single source of truth for user-uploaded files; powers Compose attachments and links to Resume Vault entries.
- **Route:** `GET/POST/DELETE /api/resources` (`/upload`, `/:id/download`, `/:id`)
- **Key files:** `backend/src/routes/resources.js`, `backend/src/services/resourceStorage.js`, `frontend/src/pages/ResourcesPage.jsx`, `frontend/src/services/resourcesApi.js`
- **Storage:** files written to `RESOURCE_UPLOAD_DIR/<user.resourceFolderName>/` (per-user folder). `user.resourceFolderName` is lazily assigned + persisted.
- **Dedup:** SHA-256 of file bytes; `(userId, sha256)` unique index — re-uploads return the existing doc with `deduplicated: true`.
- **Limits:** `MAX_RESOURCES_PER_USER = 10`, `MAX_RESOURCE_UPLOAD_MB` (default 20).
- **Cross-linking:** `sources[]` records origin (`compose`, `resume_vault`, `manual`); `resumeIds[]` tracks Resume Vault references. `syncResumeResources(user)` migrates legacy Resume files into the resource library on first `GET /api/resources` call.
- **Delete guard:** resources still linked to a Resume return 409 — user must remove the resume from Vault first.
- **Compose integration:** Compose attachments reference resources by `resourceId`; `resolveResourceAttachments()` materializes bytes (base64) for send time; `describeResourceAttachments()` returns metadata for draft restoration.

### 8. Settings
**Purpose:** AI provider setup, sender name, account deletion.
- **Route:** `GET/POST/PATCH /api/settings`
- **Key files:** `backend/src/routes/settings.js`, `frontend/src/pages/SettingsPage.jsx`
- **BYOK:** provider + API key saved to `AISettings` doc, encrypted; `llmPing()` validates before `isValid` set to true
- **AI personalization:** `personalizationPrefs` (tone, verbosity, formatting) + `systemPrompt` stored on `AISettings`

### 9. Gmail Integration
**Purpose:** OAuth2 send-from-Gmail with refresh token lifecycle management.
- **Routes (in app.js):** `POST /gmail/connect`, `GET /auth/google/callback`, `POST /gmail/disconnect`, `POST /gmail/reconnect`
- **Key files:** `backend/src/gmail.js`, `backend/src/utils/crypto.js`
- **Token storage:** refresh token stored in `User.encryptedRefreshToken` (encrypted via `TOKEN_ENC_KEY`)
- **State correlation:** CSRF-style: random `gmailState` stored on User doc, matched on callback

### 10. Templates
**Purpose:** Reusable email templates for Compose.
- **Route:** `GET/POST/PATCH/DELETE /api/templates`
- **Key files:** `backend/src/routes/templates.js`, `frontend/src/pages/TemplatesPage.jsx`

### 11. Today / Dashboard
**Purpose:** Homepage dashboard aggregating activity and stats.
- **Route:** `GET /api/today`
- **Key files:** `backend/src/routes/today.js`, `frontend/src/pages/HomePage.jsx`

---

## Key Flows

### Authentication
```
User signs in (Google)
→ Firebase Auth (client-side)
→ Firebase ID token issued
→ AppContext stores idToken, refreshes on expiry
→ Every API call: Authorization: Bearer <token>
→ requireAuth verifies with Firebase Admin SDK
→ User.findOneAndUpdate({ firebaseUid }) — upsert on every request
```

### Gmail OAuth Connect
```
POST /gmail/connect
→ generate random state → save to User.gmailState
→ return Google OAuth URL to client
→ user authorizes in browser
→ GET /auth/google/callback (public)
→ look up User by gmailState → exchangeCodeForUser
→ refresh token encrypted → User.encryptedRefreshToken
→ redirect to frontend /?gmail=success
```

### Resume Upload + Profile Merge
```
POST /api/resumelab/resumes (multipart)
→ save file to disk
→ brainClient.extractResume() — /v1/extract (5 min)
→ Resume doc saved with extractedContent + normalizedResumeText
→ brainClient.mergeCanonicalProfile() — LLM merges into CanonicalProfile
→ profileVersion incremented → JD cache invalidated
```

### JD Analysis
```
POST /api/resumelab/analyze { jobDescription }
→ resolveUserLlm() — BYOK check
→ check in-memory JD cache (userId:version:jdHash)
→ brainClient.analyzeResumeMatch() → matchScore + gaps + ATS clusters
→ ResumeAnalysis doc saved → cache entry set
```

### Resume Generation (LaTeX → PDF)
```
POST /api/resumelab/generate { analysisId, intensity, templateType, … }
→ resolveUserLlm()
→ brainClient.generateResumeLatex() — returns { latex_source }
→ injectTemplate({ templateType, name, contact, generated }) — wraps into .tex template
→ validateLatex(src) — sanity check; retries once if invalid
→ latexCompiler.compileToPdf(latexSource) — Docker run reachflow-latex
→ PDF saved to PDF_OUTPUT_DIR
→ GeneratedResume doc saved (latexSource + pdfPath + status: generated)
```

### Scheduled Campaign Send
```
setInterval(processScheduledCampaigns, 60s) [in app.js after Mongo connects]
→ Campaign.find({ status: 'scheduled', scheduledAt: { $lte: now } })
→ for each: getAuthorizedClient(user) → Gmail API send
→ status → 'sent' | 'failed'
```

---

## Data Model Overview

```
User (1)
  ├─── Campaign (N) — outreach_items, embed recipients[]; attachments[] → Resource (ref via resourceId)
  ├─── Group (N) — embed contacts[]
  ├─── Template (N)
  ├─── Variable (N)
  ├─── SendLog (N)
  ├─── Application (N) → Group (ref)
  ├─── Resume (N) ↔ Resource (linked via storagePath / resumeIds[])
  ├─── Resource (N) — shared file library; sources[] + resumeIds[] backrefs
  ├─── CanonicalProfile (1)
  ├─── ResumeAnalysis (N)
  ├─── GeneratedResume (N) → ResumeAnalysis (ref)
  ├─── AISettings (1)
  ├─── DsaAnalysis (N)
  ├─── Roadmap (N)
  │      ├─── RoadmapStage (N)
  │      └─── RoadmapItem (N) → RoadmapStage (ref)
```

---

## External Dependencies

| Dependency | Purpose |
|---|---|
| Firebase Auth | User identity; ID token verification on every API call |
| Gmail API | OAuth send-from-user email; token stored server-side encrypted |
| Brain service | LLM generation + Qdrant vector store for resume RAG |
| Docker (reachflow-latex) | LaTeX → PDF compilation; isolated container |
| MongoDB | Primary data store; all collections `reachflow_*` |

---

## Cross-Cutting Concerns

### Authentication & Authorization
- Firebase Admin SDK verifies every ID token in `requireAuth`.
- All model queries are scoped by `userId` from `req.user._id`.
- Gmail OAuth is stateful: `gmailState` on User doc acts as CSRF token.

### Encryption
- Two separate key systems: `dataSecurity.js` (DATA_ENC_KEY) and `crypto.js` (TOKEN_ENC_KEY).
- `isEncryptedEnvelope()` detects if a Mixed field is encrypted before decrypt.
- Legacy plaintext fields (`subject`, `body_html`, `gmailEmail`) are being `$unset` as writes occur.

### Rate Limiting
- `/auth/*` routes: 30 req / 10 min.
- `/api/*` routes: 200 req / 15 min.
- `RATE_LIMIT_BYPASS_EMAILS` for test accounts.

### BYOK Enforcement
- `resolveUserLlm(userId)` — called at the top of every AI route handler.
- Throws `LLM_NOT_CONFIGURED` (402), `LLM_NOT_VALIDATED` (402), or `LLM_KEY_ERROR` (500).
- `isByokError(err)` used in route catch blocks to distinguish 402 vs. 500.

### Background Jobs
- Campaign worker: `setInterval(processScheduledCampaigns, 60s)` starts after Mongo connects.
- No job queue; in-process only.

---

## Technical Conventions

- **CommonJS (backend)** — `require`/`module.exports` only. Never import ESM in backend.
- **ESM (frontend)** — `import`/`export` only. Never use require in frontend.
- **Encryption required** for all new sensitive fields: Mixed type + migration + `runMigrations.js`.
- **No plaintext PII in logs** — never log email, name, body HTML.
- **All Mongoose indexes** defined in `db.js` alongside schemas.
- **New collections** must use `reachflow_` prefix.
- **Specs first** — read `.claude/specs/<feature>.spec.md` and `.claude/tasks/<feature>.tasks.md` before implementing.

---

## Known Gotchas

- **Transactions**: `deleteCurrentUserAppData` tries a Mongo transaction but falls back to non-transactional if replica set not available (dev environments).
- **CORS**: `FRONTEND_ORIGINS` (plural, comma-separated) overrides `FRONTEND_ORIGIN`; both vars exist.
- **Gmail state expiry**: `gmailStateExpiresAt` is 10 min; expired states are cleared and user must restart OAuth.
- **Brain whitelist**: `toBrainLlm()` strips `_personalizationPrefs` and `_userSystemPrompt` before sending to Brain — those are ReachFlow-internal fields that Brain doesn't know about.
- **Profile version**: incrementing `profileVersion` invalidates the JD cache; if a merge fails, version doesn't increment and cache may stale-hit.
- **LaTeX compile failures**: `pdfError` stored on GeneratedResume; PDF may not exist even when `status: 'generated'`.
- **`autoIndex: true`**: Mongoose creates indexes on connect in dev; in production ensure indexes are pre-built.
- **DSA Lab is not encrypted**: `DsaAnalysis.problemStatement` and `userCode` are stored as plain strings — intentional, no PII.
- **Resources sync on read**: `GET /api/resources` calls `syncResumeResources()` first — legacy Resume Vault files get backfilled into the Resource collection on first visit. Be aware of the side-effect when load-testing or mocking.
- **Resource delete guard**: deleting a Resource that's referenced by a Resume returns HTTP 409. The frontend must surface "remove from Resume Vault first." Resume deletion calls `detachResumeResource()` to release the link.

---

## Common Change Areas

| Task | Read first |
|---|---|
| Add/modify an AI feature | `brainClient.js`, `brainPrompts.js`, `llmSettings.js` |
| Change a sensitive field | `dataSecurity.js`, `db.js`, `runMigrations.js` |
| Add a route | `app.js` (mount), `db.js` (schema if new model) |
| Resume Lab changes | `.claude/specs/04-resume-lab.spec.md`, `routes/resumelab.js`, `ResumeLabContext.jsx` |
| LaTeX template changes | `backend/src/resume_templates/*.tex`, `latexCompiler.js` (`injectTemplate`) |
| DSA Lab changes | `routes/dsa.js`, `dsaSafety.js`, `pages/DsaLab/`, `components/dsa/` |
| Resources / attachments | `routes/resources.js`, `services/resourceStorage.js`, `pages/ResourcesPage.jsx` |
| Gmail OAuth changes | `gmail.js`, `crypto.js`, `app.js` |
| Frontend routing | `router.jsx`, `App.jsx` (PageRouter switch) |
| Styling / tokens | `styles/tokens.css`, then feature-specific CSS files |
