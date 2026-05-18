# Drafts · Tasks

## Current State
Drafts are campaigns with `status: draft`. `loadDrafts` and `draftsLoading` states in AppContext. Compose loads drafts. Scheduled campaigns shown separately. Cancel schedule endpoint exists.

## Gaps vs. Spec
- [ ] No auto-save on timer (only manual save)
- [ ] Draft list UX: verify sort, preview text, clear indicators

---

## Frontend Changes

### Draft list in Compose sidebar
- **File**: `frontend/src/pages/ComposePage.jsx`
- Draft cards: subject (or "Untitled" if empty), recipient count, last updated time
- Scheduled cards: subject, scheduled time, recipient count
- Clear visual distinction between draft and scheduled
- One-click load (with confirm if current editor is dirty)

### Optional: Periodic auto-save
- Save draft every 60 seconds if content has changed and no draft ID yet
- Show "Auto-saved" indicator
- Avoid saving on every keystroke (debounce or interval)

---

## Backend Changes
- No new endpoints needed
- Ensure `GET /api/campaigns?view=drafts` and `?view=scheduled` return correct data

---

## Routes (existing)
| Method | Path | Description |
|---|---|---|
| GET | `/api/campaigns?view=drafts` | List draft campaigns |
| GET | `/api/campaigns?view=scheduled` | List scheduled campaigns |
| PATCH | `/api/campaigns/:id` | Update draft |
| DELETE | `/api/campaigns/:id/cancel-schedule` | Cancel scheduled |

---

## DB Impact
- No changes — drafts are campaigns with `status: draft`

---

## Testing Checklist
- [ ] Draft saves on "Save Draft" click
- [ ] Loading draft restores all fields
- [ ] Scheduled campaigns show scheduled time
- [ ] Cancel schedule reverts to draft
- [ ] Auto-save (if implemented) doesn't spam API

---

## Done Definition
- Draft save/load works reliably
- Scheduled campaign management works
