# Templates · Spec

## Overview
Templates allow users to save and reuse email subject + body combinations in the Compose flow. They support the same variable syntax as campaigns.

## Goals
- Reduce repetition when sending similar emails to different targets
- Allow variables in templates for personalization
- Quick-load from the Compose editor

## User Stories
- As a user I can create a named email template with a subject and HTML body
- As a user I can edit and delete my templates
- As a user I can load a template into the Compose editor
- As a user I can see all my templates in a list

## Flows

### Create template
1. User opens Templates page or the Templates panel in Compose.
2. Enters title, subject, and body (rich text).
3. Saves → template stored encrypted.

### Load in Compose
1. User opens Templates panel in Compose.
2. Clicks a template → subject and body replaced in editor.
3. Variables in the template body become active in the variable system.

### Edit / Delete
1. User selects a template → opens edit form.
2. Updates title, subject, body → saves.
3. Or deletes → removed from list.

## UX Expectations
- Template list shows: title, subject preview, last updated
- Load template in Compose with single click
- Confirm before deleting
- Templates sorted by last updated descending

## Validations
- Title is required
- Subject and body stored even if empty (templates can be partial)
- Variable syntax in body must be well-formed (same validation as campaigns)

## Integrations
- Compose: templates loaded directly into the editor
- Variables: templates can reference user-defined variables

## Edge Cases
- Template loaded in Compose overwrites existing content without undo
- Variables referenced in template but not yet defined → Compose shows warning

## Non-Goals
- Shared/public templates across users
- Template versioning

## Acceptance Criteria
- [ ] Templates can be created, edited, and deleted
- [ ] Loading a template into Compose replaces subject and body
- [ ] Template list sorted by recency
- [ ] Templates stored encrypted
