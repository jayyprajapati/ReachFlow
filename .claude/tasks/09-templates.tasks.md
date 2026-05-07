# Templates · Tasks

## Current State
Templates backend fully implemented (`/api/templates`). `TemplatesPage.jsx` exists. Template loading into Compose implemented.

## Gaps vs. Spec
- [ ] Verify template list sorted by `updatedAt` descending
- [ ] Confirm delete requires confirmation dialog

---

## Frontend Changes

### TemplatesPage
- **File**: `frontend/src/pages/TemplatesPage.jsx`
- Ensure delete confirmation dialog present (use `Dialog` component)
- Sort by `updatedAt` descending (should already be default from API)
- Show subject preview in list (truncated)

---

## Backend Changes
- None needed

---

## Routes (existing)
| Method | Path | Description |
|---|---|---|
| GET | `/api/templates` | List templates (sorted by updatedAt) |
| POST | `/api/templates` | Create template |
| GET | `/api/templates/:id` | Get template |
| PATCH | `/api/templates/:id` | Update template |
| DELETE | `/api/templates/:id` | Delete template |

---

## DB Impact
- `reachflow_templates`: `userId`, `encryptedPayload` (title, subject, body_html)
- Index: `{ userId: 1, updatedAt: -1 }`

---

## Testing Checklist
- [ ] Template CRUD works end-to-end
- [ ] Loading template into Compose replaces subject and body
- [ ] Delete requires confirmation
- [ ] Templates sorted by recency

---

## Done Definition
- Templates fully functional
- Confirmation on delete
