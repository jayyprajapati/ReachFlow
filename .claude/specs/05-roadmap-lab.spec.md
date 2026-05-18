# Roadmap Lab · Spec

## Overview
Roadmap Lab is a personal learning roadmap tool. Users create structured learning plans with stages (columns) and items (resources). Progress is tracked automatically as items are marked complete.

## Goals
- Help users plan and track self-directed learning journeys
- Support multiple concurrent roadmaps (e.g. "Backend Engineer", "System Design")
- Make adding resources as friction-free as possible (new requirement)
- Provide progress visualization per roadmap and per stage

## User Stories
- As a user I can create a roadmap with a title, description, and domain
- As a user I can add stages (columns) to a roadmap
- As a user I can add learning resources (items) to each stage
- As a user I can mark items as planned / active / completed / skipped
- As a user I can see overall progress and per-stage progress
- As a user I can reorder stages and items via drag-and-drop
- As a user I can edit or delete stages and items
- As a user I can view all my roadmaps in a dashboard with progress rings

## Resource Types
- YouTube playlist
- YouTube video
- Course
- Article
- Book
- GitHub repo
- Custom

## Flows

### Create roadmap
1. User clicks "New Roadmap".
2. Fills title (required), description, domain, icon, color theme.
3. Roadmap created with `status: active`.

### Add stage
1. User opens a roadmap board.
2. Clicks "Add Stage" → inline input → stage created.

### Add item (simplified — new requirement)
1. User clicks "Add Resource" in a stage.
2. Simplified form: title (required), URL (optional), resource type (auto-detected from URL if possible), status.
3. Advanced fields (estimated hours, notes, tags, priority) accessible via edit.
4. Item created and appears in stage.

### Mark item complete
1. User clicks status toggle on an item card.
2. Status cycles or user picks from dropdown: planned → active → completed / skipped.
3. Progress ring updates immediately.

### Edit item (improved UX — new requirement)
1. User clicks edit icon on an item.
2. Slide-out panel or in-place edit (not a full-page modal) with all fields.
3. Save button persists changes.

## UX Expectations
- Dashboard shows all roadmaps as cards with progress rings
- Board view: horizontal Kanban-style layout with stages as columns
- Improve horizontal navigation for smaller screens (new requirement)
- Resource cards show title, URL chip, type badge, status, estimated hours
- Progress ring on dashboard: percentage of non-skipped items completed
- Stage headers show stage-level completion percentage
- Empty stage shows "Add Resource" prompt
- Status colors: planned (gray), active (blue), completed (green), skipped (muted)

## Validations
- Roadmap title required
- Stage title required; cannot be empty
- Item title required; cannot be empty
- Resource type must be one of the defined values
- Status must be one of `planned`, `active`, `completed`, `skipped`
- Priority must be `low`, `medium`, or `high`

## Integrations
- No external integrations currently
- URL auto-detection for resource type (planned enhancement)

## States
- Dashboard: empty / has roadmaps
- Board: loading / loaded
- Adding stage inline
- Adding item (simplified form)
- Editing item (slide-out or in-place)
- Reordering (drag active)

## Edge Cases
- Deleting a stage also deletes all its items
- Skipped items excluded from progress percentage
- Roadmap with no items shows 0% progress
- Reorder endpoint uses bulk write; order values reassigned from 0

## Non-Goals
- AI-generated roadmap suggestions
- Collaborative roadmaps (multi-user)
- Integration with external learning platforms

## Acceptance Criteria
- [ ] Roadmap dashboard shows all roadmaps with progress rings
- [ ] Board view renders stages and items correctly
- [ ] Items can be added with minimal friction (title + URL minimum)
- [ ] Status changes update progress rings immediately
- [ ] Drag-and-drop reorders stages and items
- [ ] Edit UX is smooth (no full-page navigation)
- [ ] Horizontal navigation works on smaller laptop screens
- [ ] Deleting a stage removes its items
