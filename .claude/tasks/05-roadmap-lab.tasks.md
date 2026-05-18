# Roadmap Lab · Tasks

## Current State
Full CRUD for roadmaps, stages, and items implemented. Dashboard and Board views exist. Reorder endpoint exists. Progress calculation automatic.

## Gaps vs. Spec
- [ ] Adding resources has too much friction (complex form with many required fields)
- [ ] Edit UX is not smooth (may involve full-page navigation or complex modal)
- [ ] Horizontal kanban navigation on smaller screens needs improvement
- [ ] `overflow: hidden` may clip board on narrow viewports

---

## Frontend Changes

### Simplify "Add Resource" form
- **File**: `frontend/src/pages/RoadmapLab/BoardPage.jsx`
- Current form likely requires title + resource type + URL + status + priority all at once
- New simplified form: title (required) + URL (optional)
- Resource type auto-detected from URL domain (YouTube → `youtube_video`, GitHub → `github`, etc.)
- Status defaults to `planned`; priority defaults to `medium`
- "Advanced" toggle reveals: description, estimated hours, notes, tags, priority
- Reduces cognitive load for quick adds

### Improve edit UX
- **File**: `frontend/src/pages/RoadmapLab/BoardPage.jsx`
- Edit item should open as a slide-out panel or in-place expanded card, not a page navigation
- All fields editable including advanced ones
- Save button at bottom of panel
- Close button (or Escape) dismisses without saving

### Horizontal navigation fix
- **File**: `frontend/src/pages/RoadmapLab/BoardPage.jsx` + relevant CSS
- Remove `overflow: hidden` from board container
- Add `overflow-x: auto` with `scroll-behavior: smooth`
- Min column width: 280px so cards are always readable
- Gradient fade or arrow buttons at edges on smaller viewports (1024–1280px)

---

## Backend Changes
- No new endpoints needed
- Ensure PATCH `/api/roadmaps/items/:itemId` handles partial updates correctly (already does)

---

## Routes (existing)
| Method | Path | Description |
|---|---|---|
| POST | `/api/roadmaps` | Create roadmap |
| GET | `/api/roadmaps` | List roadmaps |
| GET | `/api/roadmaps/:id` | Get roadmap + stages + items |
| PATCH | `/api/roadmaps/:id` | Update roadmap |
| DELETE | `/api/roadmaps/:id` | Delete roadmap + cascade |
| POST | `/api/roadmaps/:id/stages` | Add stage |
| PATCH | `/api/roadmaps/stages/:stageId` | Update stage |
| DELETE | `/api/roadmaps/stages/:stageId` | Delete stage + its items |
| POST | `/api/roadmaps/:id/items` | Add item |
| PATCH | `/api/roadmaps/items/:itemId` | Update item |
| DELETE | `/api/roadmaps/items/:itemId` | Delete item |
| POST | `/api/roadmaps/:id/reorder` | Reorder stages or items |
| GET | `/api/roadmaps/:id/progress` | Get progress breakdown |

---

## DB Impact
- No schema changes needed
- `resourceType` auto-detection is frontend-only

---

## State Impact (`RoadmapContext`)
- Add `editingItemId` state for slide-out panel
- Progress data already maintained via `recalcProgress` after every mutation

---

## Dependencies
- URL-based resource type detection: simple domain matching (no external API needed)
  ```js
  if (url.includes('youtube.com/playlist')) return 'youtube_playlist';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube_video';
  if (url.includes('github.com')) return 'github';
  ```

---

## Migration Needs
- None

---

## Testing Checklist
- [ ] Quick add (title + URL) creates item with correct auto-detected type
- [ ] Advanced fields accessible via toggle
- [ ] Edit slide-out panel shows all fields
- [ ] Save from panel persists changes via PATCH
- [ ] Board scrolls horizontally on 1024px screen
- [ ] No content clipped by overflow hidden
- [ ] Status change updates progress ring immediately
- [ ] Deleting stage cascades to items

---

## Done Definition
- Add resource requires only title (URL optional)
- Resource type auto-detected from URL
- Edit panel is slide-out (no page nav)
- Horizontal scroll works on smaller screens
