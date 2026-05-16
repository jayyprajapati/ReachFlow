# ReachFlow

ReachFlow is a privacy-first job search platform that combines outreach, application tracking, AI-powered resume tooling, and self-directed learning — all running through your own accounts and keys, with server-side encryption throughout.

## Features

### Outreach (Compose)
- Personalized email compose with `{{variable}}` substitution and custom fields.
- Recipient-level preview before any send.
- Draft save and restore — compose sessions persist across browser sessions.
- Reusable templates for fast campaign setup.
- Gmail OAuth send flow with explicit user-triggered sending.
- Scheduled send support with a background campaign worker.

### Contacts & Groups
- Company-based group organization with auto-grouping by inferred domain key.
- Bulk contact ingest via paste or CSV import.
- Duplicate detection using server-side normalized email hashing.
- CSV export of merged contacts.

### Application Pipeline
- Kanban board for tracking job applications through their full lifecycle.
- Pipeline stages: Applied → OA → Interviewing → On Hold → Offer → Rejected → Ghosted.
- Drag-and-drop or click-based status transitions.
- Links applications to Groups for contact cross-reference.
- Per-application detail panel with job description paste and notes.

### Resume Lab
- Upload multiple resumes (PDF/DOC/DOCX) — all contribute equally to a unified Career Profile.
- Manual Career Profile editing: add experience, education, certifications, and projects without a file upload.
- Unified chronological timeline view of the full career history.
- JD analysis: paste a job description to get a match score, keyword gaps, and ATS cluster breakdown.
- In-memory JD analysis cache (30-min TTL, keyed by profile version + JD hash) to avoid redundant LLM calls.
- Tailored resume generation: LaTeX → PDF, with configurable aggressiveness (conservative / balanced / aggressive).
- Cover letter generation from the same JD + Career Profile context.
- HR outreach email generation with one-click "Open in Compose" pre-fill.
- Full history of all analyses, generated resumes, cover letters, and HR emails — click any entry to restore that workspace state.
- Requires BYOK AI provider configured and validated in Settings before use.

### Roadmap Lab
- Create multiple learning roadmaps with title, description, domain, icon, and color theme.
- Kanban-style board with drag-and-drop stages and items.
- Resource types: YouTube playlist, video, course, article, book, GitHub repo, or custom.
- Item status lifecycle: planned → active → completed / skipped.
- Per-roadmap and per-stage progress rings on the dashboard.
- URL-based resource type auto-detection for fast item entry.

### Settings
- Sender display name stored encrypted and used in Gmail "From" field.
- BYOK AI provider setup: OpenAI, Ollama Cloud, or Ollama Local.
- Step-by-step AI connection diagnostics with pass/fail status before enabling Resume Lab.
- AI personalization settings: tone (professional / casual / concise), verbosity, and formatting preference — applied as context across all generation calls.
- Full account data deletion (MongoDB only; Firebase identity preserved).

### Gmail Integration
- Gmail OAuth flow with server-side refresh token encryption.
- Connection status visible in the UI; re-auth flow when token expires.
- Send rate limiting with per-user bypass list for testing.

## Security and Privacy

- All sensitive fields stored as AES-256-GCM envelopes: `{ v, alg, kid, iv, tag, ct }`.
- Separate encryption keys for user data (`DATA_ENC_KEY`) and Gmail tokens (`TOKEN_ENC_KEY`).
- Server-side HMAC-derived email hashes for dedupe lookups — plaintext emails never indexed directly.
- User-scoped queries enforced at the route layer via Firebase ID token verification.
- Migrations are explicit commands, never run automatically on startup.
- No client-side encryption; backend decrypts only for authorized app operations.

## Tech Stack

- **Frontend:** React + Vite, custom `pushState` router (no React Router)
- **Backend:** Node.js + Express (CommonJS)
- **Database:** MongoDB + Mongoose
- **Auth:** Firebase Auth
- **Email:** Gmail OAuth + Gmail API
- **AI:** External Python Cortex service; BYOK (OpenAI, Ollama Cloud, Ollama Local)
- **PDF:** Docker + LaTeX (`reachflow-latex` image)

## Repository Structure

- `frontend/` — React client application
- `backend/` — API server, Mongoose models, migration scripts, encryption utilities
- `backend/docker/latex/` — Dockerfile for the `reachflow-latex` PDF compiler image

## Setup

### LaTeX Image (required for Resume Lab PDF generation)

```
docker build -t reachflow-latex ./backend/docker/latex
```

### Backend (from `backend/`)

```
npm install
npm run migrate   # run once after configuring env vars
npm run dev       # port 4000
```

### Frontend (from `frontend/`)

```
npm install
npm run dev       # port 5173
```

## Environment Variables

### Backend Required

- `PORT`, `FRONTEND_ORIGIN`, `MONGO_URI`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `TOKEN_ENC_KEY` — Gmail refresh token encryption
- `DATA_ENC_KEY`, `DATA_ENC_KEY_ID`, `DATA_HASH_KEY` — AES-256-GCM + HMAC

### Backend Optional

- `CORTEX_BASE_URL` — default `http://localhost:8000`
- `RESUME_UPLOAD_DIR`, `PDF_OUTPUT_DIR`, `LATEX_TEMP_DIR` — default to `~/.reachflow/`
- `RATE_LIMIT_BYPASS_EMAILS` — comma-separated emails exempt from send rate limits

See `backend/.env.example` for expected format and defaults.

## Data Model

All collections use the `reachflow_` prefix.

| Collection | Purpose |
|---|---|
| `reachflow_users` | Auth linkage, encrypted profile and sender name |
| `reachflow_groups` | Group metadata and encrypted contact payloads |
| `reachflow_outreach_items` | Draft/sent campaign snapshots |
| `reachflow_send_logs` | Operational send event metadata |
| `reachflow_templates` | Encrypted template content |
| `reachflow_variables` | Encrypted variable values with normalized key metadata |
| `reachflow_applications` | Job application pipeline entries |
| `reachflow_resumes` | Uploaded resume files and metadata |
| `reachflow_canonical_profiles` | Merged Career Profile (experience, education, certs, projects) |
| `reachflow_resume_analyses` | JD match analysis history |
| `reachflow_generated_resumes` | Generated resume LaTeX/PDF history |
| `reachflow_ai_settings` | Encrypted BYOK provider config and personalization prefs |
| `reachflow_roadmaps` | Roadmap headers |
| `reachflow_roadmap_stages` | Roadmap columns |
| `reachflow_roadmap_items` | Learning resources within stages |

## Migration Workflow

1. Configure all required backend environment variables.
2. Run migrations:
   ```
   npm run migrate
   ```
3. Start the backend normally:
   ```
   npm run dev
   ```

Migrations are intentionally decoupled from application startup.
