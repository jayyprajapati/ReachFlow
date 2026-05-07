# Global UI/UX System · Tasks

## Current State
Custom CSS in `src/styles/` with CSS tokens. No Tailwind. `AppShell.jsx` and `Sidebar.jsx` for layout. `Dialog.jsx` and `Toast.jsx` for common components. Dark mode present.

## Gaps vs. Spec
- [ ] Dark mode not deep enough (may use medium grays instead of deep blacks)
- [ ] Blue accent not vibrant enough in dark mode
- [ ] Page title dot separator not consistently applied
- [ ] Icons present on About/Privacy/Terms pages
- [ ] Font selection bug in Compose (Quill)
- [ ] Name format toggle should be radio buttons (tracked in compose tasks)
- [ ] `overflow: hidden` clips content on smaller screens (kanban, roadmap board)
- [ ] Mobile responsiveness needs improvement
- [ ] Small laptop (1024–1280px) layouts need review

---

## Frontend Changes

### Dark mode tokens update
- **File**: `frontend/src/styles/` (tokens file, likely `tokens.css` or similar)
- Update background colors:
  - `--rf-bg`: `#080808` or `#0a0a0a`
  - `--rf-surface`: `#111111`
  - `--rf-surface-elevated`: `#1a1a1a`
- Update blue accent:
  - `--rf-accent`: `#2563EB` (vibrant blue)
  - `--rf-accent-hover`: `#1d4ed8`
- Update text colors for sufficient contrast on deep blacks

### Page title dot separator
- **Files**: Page components and `AppShell.jsx`
- Standardize `<title>` tags and page header `<h1>` text to use ` · ` separator
- Example: "Resume Lab · ReachFlow" or just "Resume Lab" in the header h1
- Apply consistently across all pages

### Remove icons from static pages
- **Files**: `frontend/src/components/AboutPage.jsx`, `PrivacyPolicyPage.jsx`, `TermsOfUsePage.jsx`
- Remove lucide icon imports and usages
- Keep clean text-only layout

### Overflow / responsiveness fixes
- **Files**: `frontend/src/styles/` + specific page components
- Find and remove `overflow: hidden` on kanban and roadmap board wrappers
- Replace with `overflow-x: auto` where horizontal scroll is needed
- Test at 1024px, 1280px, 768px, 375px breakpoints

### Small laptop responsiveness
- **File**: `frontend/src/styles/` breakpoint rules
- Add `@media (max-width: 1280px)` rules:
  - Sidebar: narrow (icon-only) or collapse to hidden
  - Content area: full width
  - Reduce padding/margin on page containers
  - Kanban: min column width 260px with horizontal scroll

### Mobile responsiveness
- **File**: `frontend/src/styles/` breakpoint rules
- `@media (max-width: 768px)`:
  - Sidebar → bottom nav tabs or hamburger menu
  - Single-column layouts for all pages
  - Touch targets ≥ 44px
  - Form fields full-width
  - Tables → horizontal scroll or card view

---

## Backend Changes
- None

---

## CSS Architecture Notes
- CSS tokens (`--rf-*`) should be updated globally — all components will inherit
- Avoid hardcoding colors in component-level CSS; use tokens
- Dark mode should be default (app appears to be dark-first)

---

## Testing Checklist
- [ ] Deep black backgrounds visible in dark mode
- [ ] Vibrant blue accent on buttons, links, active states
- [ ] Dot separator in page titles
- [ ] No icons on About/Privacy/Terms pages
- [ ] Kanban scrolls horizontally at 1024px without clipping
- [ ] Roadmap board scrolls horizontally at 1024px
- [ ] Mobile: sidebar replaced with bottom nav or hamburger
- [ ] Mobile: all interactive elements have adequate touch targets
- [ ] Dialog traps focus and closes on Escape

---

## Done Definition
- Dark mode is deep black with vibrant blue accents throughout
- Page titles use dot separator
- Static pages icon-free
- Kanban and board pages scroll horizontally on smaller screens
- Mobile layout functional
