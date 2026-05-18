# Groups · Tasks

## Current State
Fully implemented. Group CRUD, contact CRUD within groups, email hash deduplication, encryption, contact metrics tracking. `GroupManager.jsx` and `ImportGroupModal.jsx` exist.

## Gaps vs. Spec
- [ ] `ImportGroupModal.jsx` — verify UX is smooth
- [ ] 300 contact limit clearly communicated in UI

---

## Frontend Changes

### Group Manager UX
- **File**: `frontend/src/components/GroupManager.jsx`
- Show current contact count and 300-contact limit clearly
- Error state when limit reached: "This group has reached the 300 contact limit"
- Logo URL: show preview if URL is valid image

### Import Group Modal
- **File**: `frontend/src/components/ImportGroupModal.jsx`
- Ensure modal handles groups with 0 contacts gracefully (show empty state)
- Show how many contacts will be imported from each group

---

## Backend Changes
- None needed

---

## Routes (existing)
| Method | Path | Description |
|---|---|---|
| GET | `/api/groups` | List all groups |
| POST | `/api/groups` | Create group |
| GET | `/api/groups/:id` | Get group with contacts |
| PATCH | `/api/groups/:id` | Update group |
| DELETE | `/api/groups/:id` | Delete group |
| POST | `/api/groups/:id/contacts` | Add contact |
| PATCH | `/api/groups/:id/contacts/:contactId` | Update contact |
| DELETE | `/api/groups/:id/contacts/:contactId` | Delete contact |

---

## DB Impact
- `reachflow_groups`: contacts as embedded subdocuments
- Email hash and company key indexed on contacts

---

## Testing Checklist
- [ ] Group create/edit/delete works
- [ ] Contact add/edit/delete works
- [ ] Duplicate email blocked (409)
- [ ] 300 contact limit enforced
- [ ] Group import in Compose correctly imports all contacts

---

## Done Definition
- Groups fully functional (already are)
- Limit shown clearly in UI
