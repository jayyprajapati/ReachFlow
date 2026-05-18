# Contacts · Spec

## Overview
The Contacts page is a CRM-like view showing all contacts across all groups. Users can view, search, and manage individual contacts and their outreach history. Contacts live inside Groups (company-scoped containers).

## Goals
- Provide a unified view of all contacts regardless of which group they belong to
- Track outreach history (email sends, LinkedIn touches) per contact
- Manage contact status (email quality, LinkedIn connection status)

## User Stories
- As a user I can see all my contacts in a table with their company, role, email, and outreach stats
- As a user I can search/filter contacts by name, company, or email
- As a user I can view a contact's full outreach history
- As a user I can update a contact's email status or connection status
- As a user I can delete a contact

## Flows

### Viewing contacts
1. User opens Contacts page.
2. Flat table renders all contacts across all groups, sorted by last updated.
3. Each row shows: name, company (group), role, email, email status, connection status, email count, LinkedIn count, last contacted date.

### Editing a contact
1. User clicks a contact row → inline edit or modal opens.
2. Updates name, role, email status, connection status, LinkedIn URL.
3. Saves → contact updated in its parent group.

### Viewing outreach history
1. Contact row expanded or detail view opened.
2. History timeline shows each email and LinkedIn touch with date.

## UX Expectations
- Sortable, searchable table
- Email status badges: `verified`, `tentative`, `not_valid`
- Connection status badges: `not_connected`, `request_sent`, `connected`
- Outreach counts visible per row
- Last contacted date shown
- Empty state when no contacts exist

## Validations
- Name is required for a contact
- Email must be valid format if provided
- No duplicate emails within the same group (enforced at group level)

## Integrations
- Groups: contacts belong to groups; editing here updates the group document
- Campaigns: email sends automatically bump `emailCount` and record history entries via `bumpContactTracking`

## States
- Loading
- Empty (no contacts yet)
- Populated table
- Editing a contact
- Error state

## Edge Cases
- Contact with no email (LinkedIn-only) — still valid
- Email hash collision (extremely rare, treated as duplicate)
- Contacts imported from Chrome extension vs. manually added

## Non-Goals
- Importing contacts from CSV directly on this page (done via Group import flow)
- Sending emails directly from this page

## Acceptance Criteria
- [ ] All contacts across all groups displayed in one view
- [ ] Search filters correctly by name/company/email
- [ ] Outreach stats reflect actual send history
- [ ] Contact edit updates persisted correctly
- [ ] Email/connection status badges accurate
