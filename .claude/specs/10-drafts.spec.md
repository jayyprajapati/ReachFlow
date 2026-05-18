# Drafts · Spec

## Overview
Drafts are campaigns with `status: draft` or `status: scheduled`. They persist between sessions so users can resume composing or cancel a scheduled send.

## Goals
- Prevent work loss between compose sessions
- Allow users to manage scheduled sends

## User Stories
- As a user my in-progress compose is saved as a draft so I can return to it
- As a user I can see all my drafts and scheduled sends in one place
- As a user I can open a draft and continue editing it
- As a user I can cancel a scheduled campaign and return it to draft

## Flows

### Save draft
1. User clicks "Save Draft" in Compose → POST or PATCH to `/api/campaigns` with current content.
2. Campaign created/updated with `status: draft`.
3. Appears in Drafts list.

### Load draft
1. User clicks a draft in the Drafts panel → Compose populated with draft's subject, body, recipients, etc.
2. Draft ID retained so subsequent saves update the same document.

### Cancel scheduled
1. User sees scheduled campaign in Drafts/Scheduled tab.
2. Clicks "Cancel Schedule" → DELETE `/api/campaigns/:id/cancel-schedule`.
3. Campaign reverts to `status: draft`; attachments stripped.

## UX Expectations
- Drafts and Scheduled shown in separate tabs within Compose's side panel
- Draft cards show: subject preview, recipient count, last updated
- Scheduled cards show: subject, scheduled time, recipient count
- One-click to load into editor

## Validations
- Only `draft` status campaigns can be loaded for editing
- Cancel schedule only works on `status: scheduled` campaigns

## Integrations
- Compose: bidirectional — drafts load into Compose, Compose saves to drafts
- Scheduled worker: processes scheduled campaigns independently

## Edge Cases
- Scheduled campaign whose time has passed before manual cancel → worker will have sent it already
- Draft with recipients that no longer exist in groups → recipients still stored in campaign

## Non-Goals
- Auto-save on every keystroke (too noisy; explicit save or periodic)
- Draft history / versions

## Acceptance Criteria
- [ ] Draft saves correctly and appears in drafts list
- [ ] Loading a draft restores all fields (subject, body, recipients, variables)
- [ ] Scheduled campaigns visible with scheduled time
- [ ] Cancel schedule reverts to draft
