# Applications · Tasks

## Current State
`ApplicationsPage.jsx` component exists. Full backend CRUD at `/api/applications` including bulk import. Kanban board rendering implemented. Pipeline stages: applied, oa, interviewing, rejected, offer, ghosted, on_hold.

## Gaps vs. Spec
- [ ] Horizontal kanban navigation on smaller screens needs improvement
- [ ] `overflow: hidden` may clip kanban on narrow viewports — needs fixing

---

## Frontend Changes

### Kanban horizontal navigation
- **File**: `frontend/src/components/ApplicationsPage.jsx` (or wherever kanban is rendered)
- Remove `overflow: hidden` from kanban container — allow horizontal scroll
- Add CSS `overflow-x: auto` with styled scrollbar
- On touch devices: swipe-to-scroll native behavior
- On laptop: show subtle horizontal scroll arrows or gradient fade hints at edges
- Ensure each column has a minimum width so cards don't collapse

### General responsiveness
- **Files**: relevant CSS in `frontend/src/styles/`
- Ensure kanban wrapper does not have fixed height clipping
- Test at 1024px, 1280px viewport widths

---

## Backend Changes
- No backend changes needed for kanban layout
- Bulk import endpoint exists: `POST /api/applications/bulk`

---

## Routes
| Method | Path | Description |
|---|---|---|
| GET | `/api/applications` | List all applications |
| POST | `/api/applications` | Create application |
| POST | `/api/applications/bulk` | Bulk create |
| PATCH | `/api/applications/:id` | Update (status change, field edit) |
| DELETE | `/api/applications/:id` | Delete |

---

## DB Impact
- `reachflow_applications` collection
- Schema includes: `userId`, `status`, `jobTitle`, `jobId`, `companyGroupId`, `companyNameSnapshot`, `appliedDate`, `encryptedPayload`
- No schema changes needed

---

## State Impact
- Application state lives in `AppContext` or local state in page component
- Status updates trigger PATCH and local state mutation

---

## Dependencies
- Groups: `companyGroupId` linkage for logo display

---

## Migration Needs
- None

---

## Testing Checklist
- [ ] Kanban renders all 7 columns
- [ ] Cards appear in correct column per status
- [ ] Status drag-and-drop (or click) updates status via PATCH
- [ ] Horizontal scroll works at 1024px without content clipping
- [ ] Add application form validates correctly
- [ ] Bulk import from Chrome extension works
- [ ] Company logo shown if group has logoUrl

---

## Done Definition
- Kanban horizontal scroll works on smaller screens
- No overflow clipping
- All 7 pipeline stages render correctly
