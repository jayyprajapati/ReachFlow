# Authentication · Tasks

## Current State
Fully implemented. Firebase Admin SDK verifies tokens server-side. `requireAuth` middleware upserts User docs. Firebase client SDK handles sign-in. `AuthGate` component gates the app. `/auth/me`, `/auth/me/preferences`, and `/auth/me` DELETE all implemented.

## Gaps vs. Spec
- No known functional gaps
- [ ] Landing page icon treatment (per global UI spec — no icons on About/Privacy/Terms)

---

## Frontend Changes

### Remove icons from static pages
- **Files**: `frontend/src/components/AboutPage.jsx`, `frontend/src/components/PrivacyPolicyPage.jsx`, `frontend/src/components/TermsOfUsePage.jsx`
- Remove any icon imports and usages
- Keep clean typographic layout

---

## Backend Changes
- None needed

---

## Routes (existing)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/me` | requireAuth | Get user profile + Gmail status |
| PATCH | `/auth/me/preferences` | requireAuth | Update sender display name |
| DELETE | `/auth/me` | requireAuth | Delete all app data |
| GET | `/health` | none | Health check |

---

## DB Impact
- `reachflow_users`: no changes needed
- User upsert on every auth call ensures doc stays current

---

## Testing Checklist
- [ ] Sign in with Google creates user doc in MongoDB
- [ ] All API routes return 401 without valid token
- [ ] `/auth/me` returns correct profile
- [ ] Static pages (About, Privacy, Terms) render without icons
- [ ] Session persists across page reloads

---

## Done Definition
- Auth fully functional (already is)
- Static pages icon-free
