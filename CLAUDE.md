# CLAUDE.md

## Repository Layout
- `backend/` — Node.js + Express API (CommonJS, `src/app.js` entry).
- `frontend/` — React + Vite SPA. Custom `pushState` router in `src/router.jsx` — no React Router.
- `backend/docker/latex/` — Dockerfile for `reachflow-latex` image (PDF generation).
- `.claude/specs/` — feature specs (product truth). `.claude/tasks/` — engineering tasks (implementation truth).

## Commands

### Backend (from `backend/`)
- `npm run dev` — nodemon, port 4000
- `npm test` — Node built-in test runner (`node --test`); no Jest/Mocha
- `npm run migrate` — runs `src/scripts/runMigrations.js` manually (not on startup)

### Frontend (from `frontend/`)
- `npm run dev` — Vite dev server, port 5173
- `npm run build` / `npm run preview`

### LaTeX image
- `docker build -t reachflow-latex ./backend/docker/latex` — required before Resume Lab PDF generation works locally.

## Required Environment Variables (Backend)
Server won't start without these (asserted on boot):
- `DATA_ENC_KEY`, `DATA_ENC_KEY_ID`, `DATA_HASH_KEY` — AES-256-GCM + HMAC hashing
- `TOKEN_ENC_KEY` — Gmail refresh token encryption (separate module from dataSecurity.js)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `MONGO_URI`, `FRONTEND_ORIGIN`, `PORT`

Optional:
- `CORTEX_BASE_URL` (default `http://localhost:8000`) — external Python LLM service
- `RESUME_UPLOAD_DIR`, `PDF_OUTPUT_DIR`, `LATEX_TEMP_DIR` — default to `~/.reachflow/`
- `RATE_LIMIT_BYPASS_EMAILS` — comma-separated emails exempt from send rate limits

## Architecture

### Backend request flow
1. `src/app.js`: Firebase Admin init → crypto config assert → Helmet/CORS/rate limiters → routes.
2. All `/api/*` routes: `requireAuth` verifies Firebase ID token and **upserts a User doc** (`firebaseUid` key).
3. Routes in `src/routes/`: campaigns, groups, recipients, templates, variables, applications, resumelab, roadmaps, settings.
4. `/auth/google/callback` is **public** — correlates OAuth state via `gmailState` on user doc.
5. Scheduled campaign worker: `setInterval(processScheduledCampaigns, 60s)` starts after Mongo connects.

### Encryption model — READ BEFORE TOUCHING ANY MODEL
- Sensitive fields stored as AES-256-GCM envelopes: `{ v, alg, kid, iv, tag, ct }` — see `isEncryptedEnvelope()` in `src/utils/dataSecurity.js`.
- Helpers: `encryptJson`/`decryptJson`, `encryptString`/`decryptString`.
- Fields: `encryptedPayload` (or `*Enc`) on each model. Legacy plaintext fields (`subject`, `body_html`, `gmailEmail`) are being phased out — new writes encrypt and `$unset` plaintext.
- Lookup by content uses HMAC hashes: `computeEmailHash(email)` for dedup, `normalizeCompanyKey` for group keys.
- Gmail tokens use `src/utils/crypto.js` (`TOKEN_ENC_KEY`) — separate from `dataSecurity.js`.

### Mongoose models & collections
All collections prefixed `reachflow_*`. All defined in `src/db.js`.

| Model | Collection |
|---|---|
| User | `reachflow_users` |
| Campaign | `reachflow_outreach_items` |
| Group (+ contacts[]) | `reachflow_groups` |
| Template | `reachflow_templates` |
| Variable | `reachflow_variables` |
| SendLog | `reachflow_send_logs` |
| Application | `reachflow_applications` |
| Resume | `reachflow_resumes` |
| CanonicalProfile | `reachflow_canonical_profiles` |
| ResumeAnalysis | `reachflow_resume_analyses` |
| GeneratedResume | `reachflow_generated_resumes` |
| AISettings | `reachflow_ai_settings` |
| Roadmap | `reachflow_roadmaps` |
| RoadmapStage | `reachflow_roadmap_stages` |
| RoadmapItem | `reachflow_roadmap_items` |

### Resume Lab subsystem
- **Cortex** (`src/services/cortexClient.js`): external Python LLM service. `/extract` timeout 5 min, `/generate/document` 3 min.
- **LaTeX compiler** (`src/services/latexCompiler.js`): Docker container `reachflow-latex`.
- **BYOK**: AI provider stored encrypted in `reachflow_ai_settings`. `resolveUserLlm()` enforces validation before any LLM call (HTTP 402 if not configured/validated).
- **JD cache**: in-memory, keyed `userId:profileVersion:sha256(jd)[:16]`, TTL 30 min, max 200 entries.

### Frontend
- `App.jsx` → `AppProvider` → `RouterProvider` → `AuthGate` → `AppShell` + `PageRouter`.
- Contexts: `AppContext` (auth + global), `ResumeLabContext`, `RoadmapContext`. State + API calls live in contexts.
- Styles: plain CSS in `src/styles/` (tokens, base, components, pages). No Tailwind, no CSS-in-JS.
- Firebase config + `VITE_API_BASE` (default `http://localhost:4000`) set via env.

## Conventions
- Backend: **CommonJS** (`require`/`module.exports`). Frontend: **ESM**. Never mix.
- Never log plaintext sensitive content (emails, names, body HTML).
- New sensitive fields → encrypted envelope (Mixed type) + migration in `src/db.js` + wire into `runMigrations.js`.
- Mongoose indexes defined in `src/db.js` alongside schemas (`autoIndex: true` on connect).
- New collections: always use `reachflow_` prefix.

## Specs-Driven Development
All features are documented in `.claude/specs/` (product truth) and `.claude/tasks/` (engineering truth).
Read the relevant spec + task files before implementing any feature change.

| # | Feature | Spec | Tasks |
|---|---|---|---|
| 1 | Compose | `.claude/specs/01-compose.spec.md` | `.claude/tasks/01-compose.tasks.md` |
| 2 | Contacts | `.claude/specs/02-contacts.spec.md` | `.claude/tasks/02-contacts.tasks.md` |
| 3 | Applications | `.claude/specs/03-applications.spec.md` | `.claude/tasks/03-applications.tasks.md` |
| 4 | Resume Lab | `.claude/specs/04-resume-lab.spec.md` | `.claude/tasks/04-resume-lab.tasks.md` |
| 5 | Roadmap Lab | `.claude/specs/05-roadmap-lab.spec.md` | `.claude/tasks/05-roadmap-lab.tasks.md` |
| 6 | Settings | `.claude/specs/06-settings.spec.md` | `.claude/tasks/06-settings.tasks.md` |
| 7 | Authentication | `.claude/specs/07-authentication.spec.md` | `.claude/tasks/07-authentication.tasks.md` |
| 8 | Gmail Integration | `.claude/specs/08-gmail-integration.spec.md` | `.claude/tasks/08-gmail-integration.tasks.md` |
| 9 | Templates | `.claude/specs/09-templates.spec.md` | `.claude/tasks/09-templates.tasks.md` |
| 10 | Drafts | `.claude/specs/10-drafts.spec.md` | `.claude/tasks/10-drafts.tasks.md` |
| 11 | Groups | `.claude/specs/11-groups.spec.md` | `.claude/tasks/11-groups.tasks.md` |
| 12 | Global UI/UX | `.claude/specs/12-global-ui.spec.md` | `.claude/tasks/12-global-ui.tasks.md` |
| 13 | AI/LLM Orchestration | `.claude/specs/13-ai-llm-orchestration.spec.md` | `.claude/tasks/13-ai-llm-orchestration.tasks.md` |
