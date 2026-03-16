# ReachFlow

ReachFlow is a privacy-first outreach platform for composing personalized emails, managing contacts by company, and running controlled campaign sends through your own Gmail account. It combines drafts, reusable templates, variables, and group workflows while enforcing server-side encryption and user-scoped data access.

## Core Features

- Personalized compose flow with variables like {{name}} and custom fields.
- Group management with company-based organization.
- Bulk contact ingest via paste and CSV import.
- Duplicate detection using normalized email hashing.
- Auto-grouping by inferred company/domain key.
- CSV export of merged contacts.
- Draft and sent-item lifecycle in one outreach collection model.
- Reusable templates for fast campaign setup.
- Recipient-level preview before send.
- Gmail OAuth send flow with explicit user-triggered sending.

## Security and Privacy Highlights

- Sensitive user content encrypted at rest with AES-256-GCM envelopes.
- Versioned encryption envelopes with key id, nonce, auth tag, and ciphertext.
- Server-side HMAC-derived email hashes for dedupe lookups.
- Hybrid storage model: encrypted sensitive payloads plus minimal operational metadata.
- User-owned data queries scoped by user identity.
- ReachFlow-prefixed MongoDB collections for app-owned data domains.
- Migrations are explicit commands, not part of normal app startup.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Auth: Firebase Auth
- Email: Gmail OAuth + Gmail API

## Repository Structure

- frontend: React client application
- backend: API server, Mongo models, migration scripts, encryption utilities
- env: local Python virtual environment utilities (project-local tooling)

## Backend Commands

Run these commands from backend.

- Install dependencies:
  - npm install
- Start development server:
  - npm run dev
- Start production mode:
  - npm start
- Run test suite:
  - npm test
- Run migrations explicitly:
  - npm run migrate

## Frontend Commands

Run these commands from frontend.

- Install dependencies:
  - npm install
- Start development server:
  - npm run dev
- Build production bundle:
  - npm run build
- Preview production bundle:
  - npm run preview

## Environment Variables

### Backend Required

- PORT
- FRONTEND_ORIGIN
- MONGO_URI
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI
- TOKEN_ENC_KEY
- DATA_ENC_KEY
- DATA_ENC_KEY_ID
- DATA_HASH_KEY

See backend/.env.example for expected format and defaults.

## Data Model Notes

- reachflow_users
  - User profile, auth linkage, encrypted sensitive profile fields.
- reachflow_groups
  - Group metadata and encrypted contact payloads.
- reachflow_templates
  - Encrypted template payload content.
- reachflow_variables
  - Encrypted variable payload content plus normalized key metadata.
- reachflow_outreach_items
  - Encrypted compose snapshots with draft/sent status lifecycle.
- reachflow_send_logs
  - Operational send event metadata.

## Migration Workflow

1. Configure backend environment variables.
2. Run explicit migration command:
   - npm run migrate
3. Start backend normally:
   - npm run dev

Migrations are intentionally decoupled from regular application startup.

## Functional Coverage

Current implementation supports:

- Groups and contacts
- Bulk paste and CSV import/export
- Dedupe and auto-grouping behavior
- Draft save/restore
- Template save/load
- Variable management
- Preview and send workflows

## Notes

- ReachFlow does not perform client-side encryption.
- Backend decrypts only as needed for authorized app operations.
- Avoid logging plaintext sensitive content in operational logs.
