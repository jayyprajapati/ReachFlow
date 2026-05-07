# Gmail Integration · Tasks

## Current State
Fully implemented. OAuth connect/disconnect/reconnect. Token stored encrypted. Rate limiting via send logs. MIME email sending. Scope introspection. Attachment support.

## Gaps vs. Spec
- No known functional gaps
- [ ] Gmail connection status could be more prominently surfaced in UI (Settings + Compose header)
- [ ] Reconnect flow UX could be clearer when token expires

---

## Frontend Changes

### Gmail status visibility
- **File**: `frontend/src/pages/SettingsPage.jsx`
- Show connected Gmail email address prominently
- Show "Reconnect" button if `gmailConnected` is false or scopes are insufficient
- Scopes check: compare `grantedScopes` vs `requiredScopes` from `/auth/me`

### Compose Gmail banner
- **File**: `frontend/src/pages/ComposePage.jsx`
- Already implemented — verify it shows correctly when not connected
- Add specific message when token is expired vs. never connected

---

## Backend Changes
- None needed

---

## Routes (existing)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/gmail/connect` | requireAuth | Start OAuth or return alreadyConnected |
| POST | `/gmail/disconnect` | requireAuth | Clear token |
| POST | `/gmail/reconnect` | requireAuth | Clear + restart OAuth |
| GET | `/auth/google/callback` | none (public) | OAuth callback handler |

---

## DB Impact
- `reachflow_users`: `encryptedRefreshToken`, `gmailConnected`, `gmailState`, `gmailStateExpiresAt`, `gmailEmailEnc`
- `reachflow_send_logs`: timestamp per send for rate limiting

---

## Dependencies
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` env vars
- `TOKEN_ENC_KEY` for refresh token encryption

---

## Testing Checklist
- [ ] OAuth connect flow completes end-to-end
- [ ] Sending email via connected account works
- [ ] Rate limit (15/min, 100/day) blocks when exceeded
- [ ] Expired token detected on send → 401 with reconnect prompt
- [ ] Disconnect clears token; reconnect re-initiates OAuth
- [ ] OAuth state mismatch returns meaningful error

---

## Done Definition
- Gmail integration fully functional (already is)
- Connection status prominently shown in Settings
