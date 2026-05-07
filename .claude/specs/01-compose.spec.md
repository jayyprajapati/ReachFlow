# Compose · Spec

## Overview
The Compose page is the primary email campaign creator. Users write a subject and rich-text body, add recipients (individually or via a group import), optionally attach files, preview before sending, and either send immediately or schedule for a future time.

## Goals
- Allow personalized bulk email sends via Gmail
- Prevent mis-sends with previews and confirmation dialogs
- Support template-based composition and variable substitution
- Save work automatically as drafts

## User Stories
- As a user I can write an email with a rich-text editor and send it to one or more recipients
- As a user I can insert `{{name}}` and custom variables so each email is personalized
- As a user I can import contacts from a group to bulk-populate the recipient list
- As a user I can preview how the email renders for a specific recipient before sending
- As a user I can schedule the email to send at a future date/time
- As a user I can save my compose session as a draft and resume it later
- As a user I can load a template into the editor
- As a user I can attach files (PDF, DOC, DOCX, TXT, PNG, JPG) up to 20 MB total

## Flows

### Standard send
1. User opens Compose. Empty state shown.
2. User enters subject, writes body.
3. User adds recipients manually (name + email) or imports a group.
4. User optionally inserts variables via the variable token UI.
5. User clicks Preview to verify rendering.
6. User clicks Send Now → confirmation dialog for >5 recipients → emails sent → campaign saved as `status: sent`.

### Draft save/load
1. Compose auto-saves periodically or on explicit "Save Draft" click.
2. Draft appears in the Drafts panel. Clicking loads it into the editor.

### Schedule send
1. User fills compose form, picks a date/time in the future.
2. Clicks "Schedule" → campaign saved `status: scheduled`.
3. Background worker sends at the scheduled time.
4. User can cancel schedule from Drafts / Scheduled panel.

### Template load
1. User opens Templates panel inside Compose.
2. Selects a template → subject + body populated, variables re-detected.

## UX Expectations
- Rich text editor (Quill) with font, size, bold/italic/underline, lists, alignment, color, links
- Variable tokens rendered inline as styled chips (`{{name}}`, `{{custom_var}}`)
- Name format selector: **First name only** vs **Full name** (currently a toggle — replace with radio buttons per new requirements)
- Recipient table with inline validation; duplicate email detection
- Bulk add mode: paste CSV/newline-separated email list
- Attachment list with per-file size display; total limit 20 MB, max 3 files
- Scheduled send: datetime picker, future-only validation
- Preview pane renders real HTML with variables resolved
- Error states: Gmail not connected, rate limit hit, validation failures
- "Rewrite with AI" button in compose body (new requirement — not yet implemented)

## Validations
- Subject required
- Body required
- At least 1 recipient; max 50
- Each recipient email must be valid format
- Variables: must be known (`{{name}}` always allowed + up to 2 user-defined custom vars); unmatched `{{` / `}}` blocked
- Attachments: PDF/DOC/DOCX/TXT/PNG/JPG only; each file ≤ portion of 20 MB total; max 3 files
- Scheduled time must be in the future

## Integrations
- Gmail (OAuth): required to send or preview
- Templates: loads template content into editor
- Groups: imports contacts as recipients
- Variables: user-defined custom vars available for insertion
- History: sent campaigns recorded
- Drafts: unsent campaigns saved

## States
- Empty (new compose)
- In-progress (editing)
- Previewing
- Sending (loading)
- Sent (success toast)
- Scheduled (success toast)
- Rate limited (429 with retry info)
- Auth error (Gmail not connected banner)
- Draft loaded

## Edge Cases
- Gmail token expired mid-send → show reconnect prompt
- All recipients fail → campaign reverts to draft
- Partial failure → campaign still marked sent, failure count reported
- Duplicate recipient emails → deduped or blocked
- Variables used in body but not defined → blocked at send time
- Bulk mode: malformed CSV rows skipped, valid ones added
- Schedule: server clock drift edge case → validated server-side

## Non-Goals
- Multi-Gmail-account sending
- Tracking opens/clicks
- HTML import from external sources

## Acceptance Criteria
- [ ] User can send a personalized email to each recipient via their connected Gmail
- [ ] Preview renders correctly with variables resolved
- [ ] Bulk send >5 requires explicit confirmation
- [ ] Rate limits (15/min, 100/day) enforced with clear user messaging
- [ ] Draft auto-saves and can be resumed
- [ ] Scheduled campaign fires within 60 s of scheduled time
- [ ] All validation errors shown inline before send is attempted
- [ ] Name format radio buttons (not toggle) control first vs. full name resolution
