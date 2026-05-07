# Applications · Spec

## Overview
The Applications page (Pipeline) is a Kanban board for tracking job applications through their lifecycle — from applied through offer or rejection.

## Goals
- Provide a visual pipeline for tracking application statuses
- Allow quick status transitions by drag-and-drop or click
- Link applications to Groups (companies) for contact cross-reference

## User Stories
- As a user I can add a job application with company, job title, job ID, and applied date
- As a user I can move an application between pipeline stages
- As a user I can see all applications in a Kanban view grouped by status
- As a user I can view/edit the full details of an application
- As a user I can delete an application
- As a user I can bulk-import applications (from Chrome extension or CSV)

## Pipeline Stages (in order)
1. **Applied** — initial state
2. **OA** — online assessment received
3. **Interviewing** — interview process active
4. **On Hold** — paused by either side
5. **Offer** — received offer
6. **Rejected** — rejected at any stage
7. **Ghosted** — no response after contact

## Flows

### Adding an application
1. User clicks "Add Application" → form modal opens.
2. Fills company name (optionally links to a Group), job title, job ID, applied date.
3. Status defaults to "Applied".
4. Saves → card appears in Applied column.

### Moving status
1. User drags card to new column OR clicks status selector on card.
2. PATCH request updates status.
3. Board re-renders with card in new column.

### Viewing/editing details
1. User clicks application card → detail panel or modal.
2. Can edit any field, including raw source text (job description paste).
3. Saves → card updated.

## UX Expectations
- Kanban board with horizontal columns per status
- Cards show: company name, job title, applied date, job ID
- Improve horizontal kanban navigation for smaller screens (new requirement)
- Company logo visible if linked to a Group with a logo URL
- Empty columns show a placeholder state
- Quick-add button in each column

## Validations
- At least one of: job title, job ID, or company name must be provided
- Status must be one of the defined values
- Applied date must be parseable

## Integrations
- Groups: `companyGroupId` links application to a group; company name snapshot stored for resilience if group is deleted

## States
- Loading
- Empty (no applications)
- Populated board
- Adding new application
- Editing application
- Error state

## Edge Cases
- Group deleted after application linked → `companyNameSnapshot` preserves the name
- Bulk import with invalid rows → valid ones inserted, invalid skipped
- Duplicate application detection not enforced (user may apply to same role twice)

## Non-Goals
- Interview scheduling / calendar integration
- Notes / comments per application
- Email compose directly from application card

## Acceptance Criteria
- [ ] All 7 pipeline stages visible
- [ ] Applications can be created with minimum required fields
- [ ] Status updates persist immediately
- [ ] Company link to Group shows logo and name
- [ ] Bulk import API works
- [ ] Kanban scrollable horizontally on smaller screens
