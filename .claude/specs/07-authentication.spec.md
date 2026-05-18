# Authentication · Spec

## Overview
ReachFlow uses Firebase Authentication for identity. Every API call is authenticated via a Firebase ID token. User records are auto-created in MongoDB on first auth.

## Goals
- Secure all API routes with Firebase token verification
- Transparently create user records on first login
- Support Google Sign-In via Firebase

## User Stories
- As a new user I can sign in with Google via Firebase and my account is created automatically
- As an existing user my session persists via Firebase token refresh
- As a user I see a landing page when not authenticated
- As a user I am redirected to the app after successful sign-in

## Flows

### Sign In
1. User visits app; not authenticated → `AuthGate` shows landing/sign-in page.
2. User clicks "Sign in with Google" → Firebase Google provider flow.
3. Firebase returns ID token → stored in client.
4. Client calls `/auth/me` with Bearer token → server verifies token, upserts User doc, returns profile.
5. User enters the app.

### Session Persistence
1. On page load, Firebase SDK hydrates the session from storage.
2. `AppContext` calls `hydrateProfile` → `/auth/me` → user state populated.
3. Token auto-refreshed by Firebase SDK.

### Sign Out
1. User clicks Sign Out → Firebase `signOut()` called → local state cleared → landing page shown.

## UX Expectations
- Landing page shown for unauthenticated users (with About/Privacy/Terms links)
- No username/password — Google OAuth only
- Session persists across browser restarts (Firebase handles this)
- If token expires mid-session → API returns 401 → user prompted to re-authenticate

## Validations
- Firebase ID token verified server-side on every request
- Token must contain `uid` and `email` fields
- Expired/revoked tokens rejected with 401

## Integrations
- Firebase Admin SDK (server): `admin.auth().verifyIdToken()`
- Firebase client SDK (frontend): sign-in, token management
- MongoDB: User upsert on every auth (`firebaseUid` as unique key)

## Edge Cases
- Same Google account signs in from two browsers → same MongoDB user, same `firebaseUid`
- Firebase project misconfigured → server fails to start (env var assertion)
- Token not yet expired but user deleted from Firebase → server still succeeds until token TTL (Firebase behavior)

## Non-Goals
- Email/password auth
- Magic link auth
- Multi-provider linking
- RBAC / user roles

## Acceptance Criteria
- [ ] Google sign-in works and creates user record in MongoDB
- [ ] All `/api/*` routes reject requests without valid Firebase token
- [ ] `/auth/me` returns correct user profile after sign-in
- [ ] Landing page shown to unauthenticated users
- [ ] Session persists across page reloads
