# Contacts · Tasks

## Current State
`ContactsTable.jsx` component exists. Contacts stored as encrypted subdocuments within Group documents. Groups route handles all CRUD. No standalone contacts API.

## Gaps vs. Spec
- [ ] Contacts table responsiveness on small screens
- [ ] Outreach history timeline view per contact (if not already in UI)
- [ ] Search/filter across all groups by name/email/company

---

## Frontend Changes

### ContactsTable improvements
- **File**: `frontend/src/components/ContactsTable.jsx`
- Ensure all contacts across groups are flattened into one view
- Add search input: filter by name, email, company (client-side filter)
- Responsive: horizontal scroll or collapsible columns on narrow screens
- Email status badge colors: `verified` = green, `tentative` = yellow, `not_valid` = red
- Connection status badge: styled chips

### Contact detail / edit
- **File**: `frontend/src/pages/ContactsPage.jsx`
- Clicking a contact row opens inline edit or slide-out panel
- Fields: name, role, email status, connection status, LinkedIn URL
- Save calls PATCH `/api/groups/:id/contacts/:contactId`
- Delete button with confirmation

---

## Backend Changes
- No new routes needed — all contact CRUD via groups routes
- Consider adding `GET /api/contacts` as a flattened view for the contacts page (currently frontend probably fetches all groups and flattens client-side)

### Optional: GET /api/contacts (new convenience route)
- **File**: `backend/src/routes/recipients.js` or new `contacts.js`
- Aggregates all contacts across all groups for the current user
- Returns flattened array with `groupId`, `companyName` added to each contact
- Enables server-side search/filter in future

---

## Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/groups` | List all groups (used to load contacts) |
| GET | `/api/groups/:id` | Get group with contacts |
| POST | `/api/groups/:id/contacts` | Add contact |
| PATCH | `/api/groups/:id/contacts/:contactId` | Update contact |
| DELETE | `/api/groups/:id/contacts/:contactId` | Delete contact |
| GET | `/api/contacts` | **NEW** — flattened contacts list |

---

## DB Impact
- Contacts stored as embedded subdocuments in `reachflow_groups`
- `emailHash` and `companyKey` indexed on each contact
- No schema changes needed

---

## State Impact
- `AppContext` already loads groups; contacts table derives from groups
- Add `contactsSearch` local state in ContactsPage

---

## Dependencies
- Groups must be loaded before contacts can be displayed
- `computeEmailHash` used for dedup on frontend if needed

---

## Migration Needs
- None

---

## Testing Checklist
- [ ] All contacts from all groups appear in one view
- [ ] Search filters correctly
- [ ] Edit contact saves correctly
- [ ] Delete contact removes from group
- [ ] Email/connection status badges render correct colors
- [ ] Outreach counts reflect actual send history

---

## Done Definition
- Unified contacts view with search
- Inline contact editing
- Correct badge rendering for status fields
