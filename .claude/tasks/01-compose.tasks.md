# Compose · Tasks

## Current State
Fully implemented. Rich Quill editor, variable tokens, recipient management, group import, template load, preview, send now, schedule, draft save/load, attachment support.

## Gaps vs. Spec
- [ ] Name format is a toggle; needs to be radio buttons
- [ ] Font selection has a known Quill registration bug (fonts not applying correctly)
- [ ] "Rewrite with AI" button not implemented
- [ ] No auto-save (only manual "Save Draft")

---

## Frontend Changes

### Fix name format toggle → radio buttons
- **File**: `frontend/src/pages/ComposePage.jsx`
- Replace `nameFormat` toggle switch with `<input type="radio">` group
- Options: "First name only" (value `first`) / "Full name" (value `full`)
- Apply same CSS tokens as other form controls

### Fix Quill font selection bug
- **File**: `frontend/src/pages/ComposePage.jsx`
- Issue: Font whitelist registered but fonts may not apply because CSS `@font-face` or `.ql-font-*` classes are missing
- Add CSS classes for each whitelisted font in `src/styles/` (or inline in component)
- Pattern: `.ql-font-arial { font-family: Arial, sans-serif; }`
- Verify Quill `register` call order (must be before `ReactQuill` mount)

### Add "Rewrite with AI" button (new feature)
- **File**: `frontend/src/pages/ComposePage.jsx`
- Button in the Quill toolbar area or below the editor
- On click: sends current body HTML + subject to a new backend endpoint
- Receives rewritten HTML body back → replaces editor content
- Requires BYOK check: show "Configure AI in Settings" if not configured
- Loading state during rewrite

---

## Backend Changes

### POST /api/campaigns/rewrite-body (new)
- **File**: `backend/src/routes/campaigns.js`
- Accepts: `{ subject, body_html, context?: string }`
- Calls Cortex with user's LLM override to rewrite the email body
- Returns: `{ body_html: string }`
- Requires `resolveUserLlm` (BYOK gate)
- Rate-limit: tie to existing API rate limiter

---

## Routes
| Method | Path | Description |
|---|---|---|
| POST | `/api/campaigns` | Create draft |
| PATCH | `/api/campaigns/:id` | Update draft |
| GET | `/api/campaigns` | List (view=drafts\|scheduled\|history\|all) |
| GET | `/api/campaigns/:id` | Get single campaign |
| POST | `/api/campaigns/send-now` | Send without saving draft first |
| POST | `/api/campaigns/:id/send` | Send existing draft |
| POST | `/api/campaigns/schedule-send` | Schedule a campaign |
| DELETE | `/api/campaigns/:id/cancel-schedule` | Cancel scheduled send |
| POST | `/api/campaigns/preview` | Preview without saving |
| POST | `/api/campaigns/:id/preview` | Preview saved campaign |
| POST | `/api/campaigns/rewrite-body` | **NEW** — AI rewrite |

---

## DB Impact
- No schema changes for radio buttons or font fix
- No schema changes for AI rewrite (stateless endpoint)
- Campaigns collection: `reachflow_outreach_items`

---

## State Impact
- `nameFormat` state in `ComposePage`: currently `'first' | 'full'` — no change
- AI rewrite: add `isRewriting` boolean state + `rewriteError` string

---

## Dependencies
- Quill CSS classes must be added for font fix
- AI rewrite depends on: `cortexClient.js` having a compose-rewrite Cortex endpoint, OR a simple chat-completion call
- Cortex must be running for rewrite to work

---

## Migration Needs
- None

---

## Testing Checklist
- [ ] Radio buttons render and correctly set `nameFormat`
- [ ] `first` format sends first name only in rendered email
- [ ] `full` format sends full name in rendered email
- [ ] Font selector applies correct font family in editor and preview
- [ ] AI rewrite sends current body + gets back rewritten body
- [ ] AI rewrite blocked with 402 if BYOK not configured
- [ ] All existing send flows unaffected

---

## Done Definition
- Name format UI uses radio buttons
- Font selection correctly applies in Quill editor and email preview
- "Rewrite with AI" button present and functional (BYOK gated)
