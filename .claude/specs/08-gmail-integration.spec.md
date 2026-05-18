# Gmail Integration · Spec

## Overview
ReachFlow sends emails through the user's own Gmail account via OAuth 2.0. Users connect Gmail once and all campaign sends are dispatched via the Gmail API using their account.

## Goals
- Allow users to send personalized email campaigns from their own Gmail
- Handle OAuth token lifecycle (connect, refresh, disconnect, reconnect)
- Enforce rate limits to prevent Gmail abuse
- Surface Gmail connection status clearly throughout the app

## User Stories
- As a user I can connect my Gmail account via OAuth
- As a user I can see which Gmail account is connected
- As a user I can disconnect or reconnect my Gmail account
- As a user I cannot send emails until Gmail is connected
- As a user I see clear errors if Gmail authorization expires mid-send

## OAuth Flow
1. User clicks "Connect Gmail" → POST `/gmail/connect`.
2. If existing valid token → return `alreadyConnected`.
3. If stale/missing → server generates a random `state`, stores on user, redirects to Google consent URL.
4. Google redirects to `/auth/google/callback` with `code` and `state`.
5. Server validates `state` (must match user record, must not be expired).
6. Server exchanges `code` for refresh token → encrypts and stores.
7. `gmailConnected = true` → redirect to frontend with `?gmail=success`.

## Required OAuth Scopes
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/userinfo.email`

## Rate Limits
- **Per-minute**: max 15 emails in a rolling 60-second window
- **Per-day**: max 100 emails in a rolling 24-hour window
- Bypass: `RATE_LIMIT_BYPASS_EMAILS` env var (comma-separated, for testing)
- Rate limit state stored in `reachflow_send_logs` (timestamp-based rolling window)

## UX Expectations
- Gmail connection status badge visible in Settings and Compose header
- If not connected → banner in Compose blocking send; clear "Connect Gmail" CTA
- OAuth callback success/error reflected in the frontend via query params (`?gmail=success` / `?gmail=error`)
- Reconnect flow available if token expires
- Connected Gmail email address shown in Settings

## Validations
- OAuth `state` must match stored value (CSRF protection)
- OAuth `state` expires after 10 minutes
- Token exchange only valid with authorization code (single-use)
- Bulk send >5 recipients requires `confirm_bulk_send: true` in request

## Integrations
- Gmail API: `messages.send` via MIME encoding
- Campaigns: all sends routed through Gmail
- Send logs: each successful send recorded for rate limiting

## States
- Not connected
- Connecting (OAuth in progress)
- Connected (email shown)
- Token expired / revoked → reconnect required
- Rate limited (minute or day)

## Edge Cases
- Token revoked by user in Google account → next send fails with `invalid_grant` → frontend shows reconnect prompt
- Multiple tabs: `alreadyConnected` check prevents duplicate OAuth flows
- Attachments: validated before send (type and size)
- Partial send failure: sent emails recorded, failed ones logged; campaign not fully reverted unless 0 sent

## Non-Goals
- Reading Gmail (inbox access)
- Gmail drafts
- Multiple Gmail accounts per user
- Custom SMTP providers

## Acceptance Criteria
- [ ] Gmail OAuth connect flow completes successfully
- [ ] Refresh token stored encrypted
- [ ] Emails sent via Gmail API using user's connected account
- [ ] Rate limits enforced (15/min, 100/day)
- [ ] Expired token detected and reconnect prompted
- [ ] Disconnect clears token; reconnect re-initiates OAuth
- [ ] OAuth state mismatch / expiry returns meaningful error to user
