# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

- `backend/` — Node.js + Express API server (CommonJS, `src/app.js` entry).
- `frontend/` — React + Vite SPA. No external router lib — see `src/router.jsx` (custom history-based router used by `App.jsx`'s `PageRouter` switch).
- `backend/docker/latex/` — Dockerfile for the `reachflow-latex` image used by the LaTeX compiler service.
- `env/` — local Python venv tooling (unrelated to the Node app).

## Commands

### Backend (run from `backend/`)
- `npm run dev` — nodemon dev server on `PORT` (default 4000).
- `npm start` — production start.
- `npm test` — runs all tests in `test/` and `src/test/` via `node --test` (uses Node's built-in test runner — no Jest/Mocha).
- Run a single test file: `node --test src/test/resumelab.test.js` (or any specific path).
- `npm run migrate` — runs `src/scripts/runMigrations.js`. Migrations are explicitly decoupled from app startup and must be run manually.

### Frontend (run from `frontend/`)
- `npm run dev` — Vite dev server on port 5173.
- `npm run build` / `npm run preview` — production build / preview.

### LaTeX image (resume PDF compilation)
- Build: `docker build -t reachflow-latex ./backend/docker/latex` — required before Resume Lab PDF generation works locally. Image name is overridable via `DOCKER_LATEX_IMAGE`.

## Required Environment Variables (Backend)

Crypto config is asserted on boot via `assertDataSecurityConfig()` — the server will not start without these:
- `DATA_ENC_KEY` (32 bytes, hex or base64), `DATA_ENC_KEY_ID`, `DATA_HASH_KEY` — used by `src/utils/dataSecurity.js` for AES-256-GCM envelope encryption and HMAC email hashing.
- `TOKEN_ENC_KEY` — used by `src/utils/crypto.js` for Gmail refresh-token encryption.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (use `\n` escapes for newlines).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — Gmail OAuth.
- `MONGO_URI`, `FRONTEND_ORIGIN`, `PORT`.

Optional:
- `CORTEX_BASE_URL` (default `http://localhost:8000`), `CORTEX_EXTRACT_TIMEOUT_MS`, `CORTEX_GENERATE_TIMEOUT_MS` — external LLM service (Cortex) used by Resume Lab.
- `RESUME_UPLOAD_DIR`, `PDF_OUTPUT_DIR`, `LATEX_TEMP_DIR` — Resume Lab file storage paths. Defaults live under `~/.reachflow/` (outside the repo). `LATEX_TEMP_DIR` defaults to `/tmp/reachflow-latex` because Docker Desktop on macOS cannot bind-mount `os.tmpdir()` (`/var/folders/...`).
- `RATE_LIMIT_BYPASS_EMAILS` — comma-separated allowlist for campaign send rate limits.

## Architecture

### Backend request flow
1. `src/app.js` boots: initializes Firebase Admin, asserts crypto config, mounts Helmet/CORS/rate limiters (`/auth/` and `/api/` have separate limits), then attaches routes.
2. All `/api/*` routes go through `requireAuth`, which verifies a Firebase ID token (`Bearer` header) and **upserts a `User` doc keyed by `firebaseUid`** before setting `req.user`. Any new auth path will create a user row — keep this in mind when reasoning about user creation.
3. Routes are split per domain in `src/routes/` (`campaigns`, `groups`, `recipients`, `templates`, `variables`, `applications`, `resumelab`, `roadmaps`, `settings`).
4. Gmail OAuth callback `/auth/google/callback` is **public** (no `requireAuth`) — it correlates by a server-issued `gmailState` stored on the user row. Token exchange happens in `src/gmail.js::exchangeCodeForUser`.
5. A `setInterval` worker (`processScheduledCampaigns`, every 60s) drives scheduled campaign sends. It is started after Mongo connects.

### Encryption model (read this before touching any model)

ReachFlow uses **server-side AES-256-GCM envelope encryption** for sensitive fields. Envelopes are JSON objects of shape `{ v, alg, kid, iv, tag, ct }` — see `isEncryptedEnvelope()` in `src/utils/dataSecurity.js`. Helpers: `encryptJson`/`decryptJson`, `encryptString`/`decryptString`.

- Sensitive payloads live in `encryptedPayload` (or `*Enc`) Mixed-type fields on each model. Plaintext columns alongside them (e.g. `subject`, `body_html`, `gmailEmail`, `senderDisplayName`) are **legacy** and being phased out — new writes should encrypt and `unset` the plaintext counterpart (see `migrateUserSensitiveFields`, `migrateTemplateSensitiveFields`, etc. in `src/db.js` for the canonical pattern).
- Lookup-by-content uses HMAC-derived hashes, never plaintext: `computeEmailHash(email)` for recipient/contact dedupe (`emailHash` index), `normalizeCompanyKey` / `deriveCompanyKeyFromEmail` for group keys (`companyKey` index).
- Gmail refresh tokens use a **separate** crypto module (`src/utils/crypto.js`, key `TOKEN_ENC_KEY`) — do not conflate it with `dataSecurity.js`.

### Mongoose models & collection naming

All collections are prefixed `reachflow_*` (e.g. `reachflow_users`, `reachflow_outreach_items` for campaigns, `reachflow_send_logs`). Models are defined and exported from `src/db.js`. The `migrateCollectionNames()` migration renames or merges legacy unprefixed collections — keep using prefixed names for any new model.

Major collections: `reachflow_users`, `reachflow_groups` (with embedded `contacts[]`), `reachflow_outreach_items` (campaigns/drafts), `reachflow_templates`, `reachflow_variables`, `reachflow_send_logs`, `reachflow_applications`, `reachflow_resumes`, `reachflow_canonical_profiles`, `reachflow_resume_analyses`, `reachflow_generated_resumes`, `reachflow_ai_settings`, `reachflow_roadmaps`, `reachflow_roadmap_stages`, `reachflow_roadmap_items`.

### Resume Lab subsystem

Resume Lab is the AI-driven resume tooling under `/api/resumelab` and `frontend/src/pages/ResumeLab/`. It depends on:
- **Cortex** — external Python LLM service (`src/services/cortexClient.js`). It must be reachable at `CORTEX_BASE_URL`. `/extract` and `/generate/document` have long timeouts (5min / 3min) because they make multiple LLM calls.
- **LaTeX compiler** (`src/services/latexCompiler.js`) — invokes a Docker container (`reachflow-latex`) to compile populated `.tex` templates from `src/resume_templates/` into PDFs. Has retry logic and a fallback path; for the Docker path to work the image must be built first.
- AI provider settings are BYOK and stored encrypted in `reachflow_ai_settings`.

### Frontend

- `App.jsx` → `AppProvider` (auth + global app state) → `RouterProvider` → `AuthGate` (handles unauthenticated landing + static legal pages) → `AppShell` + `PageRouter`.
- Routing is a hand-rolled `pushState` wrapper in `src/router.jsx` — do not assume React Router.
- API base is `VITE_API_BASE` (default `http://localhost:4000`); Firebase config + optional `VITE_LINKEDIN_EXTENSION_ID` for the companion Chrome extension messaging in `AppContext.jsx`.
- Styles are plain CSS files under `src/styles/` (tokens, base, components, layout, pages, plus per-feature `resumelab.css` / `roadmaplab.css`). No CSS-in-JS, no Tailwind.
- Major contexts: `AppContext`, `ResumeLabContext`, `RoadmapContext`. Most state and API calls live in these contexts rather than per-page hooks.

## Conventions

- Backend is **CommonJS** (`require`/`module.exports`), frontend is **ESM**. Don't mix.
- Avoid logging plaintext sensitive content (emails, names, body HTML) in operational logs — existing code follows this; preserve it.
- New sensitive fields should be added as encrypted envelope payloads (Mixed type), never raw strings, and a corresponding migration in `src/db.js` should backfill existing rows. Wire any new migration into `src/scripts/runMigrations.js`.
- Mongoose indexes are defined alongside schemas in `src/db.js`; `autoIndex: true` is on at connect time.
