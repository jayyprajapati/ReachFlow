# Groups · Spec

## Overview
Groups are company-scoped contact containers. Each group represents a company and holds a list of contacts (people) at that company. Groups are used as the source for campaign recipient imports.

## Goals
- Organize contacts by company for targeted outreach
- Enable bulk import of a company's contacts into a campaign
- Track per-contact outreach metrics within a company context

## User Stories
- As a user I can create a group for a company with its name, logo URL, and careers page URL
- As a user I can add contacts to a group with name, email, role, LinkedIn URL
- As a user I can edit or delete contacts within a group
- As a user I can import an entire group's contacts into a campaign
- As a user I can track how many emails and LinkedIn touches were made to each contact
- As a user I can see a contact's connection status and email quality rating

## Flows

### Create group
1. User clicks "New Group".
2. Enters company name (required), logo URL, careers page URL.
3. Group created with `companyKey` derived from name (normalized).

### Add contacts
1. User opens a group → clicks "Add Contact".
2. Enters name (required), email, role, LinkedIn URL, connection status, email status.
3. Contact added; email hash computed for deduplication.

### Import to campaign
1. In Compose, user clicks "Import Group".
2. Selects a group → all contacts with valid emails added as campaign recipients.
3. `group_imports` metadata recorded on campaign.

### Edit contact
1. User clicks contact in group → edit form.
2. Updates fields → saved encrypted.

## UX Expectations
- Group list: company name, logo, contact count, last updated
- Group detail: list of contacts with their stats
- Contact row: name, role, email (masked or shown), connection status badge, email status badge, email count, LinkedIn count, last contacted
- Max 300 contacts per group

## Validations
- Company name required for group
- Contact name required
- Email must be valid format if provided
- No duplicate emails within a group (hash-based deduplication)
- Max 300 contacts per group

## Integrations
- Campaigns: groups imported as recipient sources
- Contacts page: contacts displayed across all groups
- Send tracking: `bumpContactTracking` increments `emailCount` after sends

## Edge Cases
- Group with same company name as another → both allowed (no dedup at group level)
- Contact without email → valid (LinkedIn-only outreach)
- Logo URL not validated (any string accepted)
- Group delete doesn't cascade to linked applications (snapshot preserved)

## Non-Goals
- CSV import directly into groups (done via Chrome extension or manual)
- Company data enrichment (logo auto-fetch, headcount, etc.)

## Acceptance Criteria
- [ ] Groups can be created with company name
- [ ] Contacts can be added, edited, deleted within a group
- [ ] Duplicate email within group blocked (409)
- [ ] Group import into campaign works
- [ ] Email count increments after successful campaign sends
- [ ] Max 300 contacts per group enforced
