# Global UI/UX System · Spec

## Overview
Defines the global design language, layout system, navigation patterns, and cross-cutting UI behaviors that apply throughout ReachFlow.

## Goals
- Consistent visual identity across all pages
- Accessible, responsive layouts (laptop and mobile)
- Dark mode that feels premium (deep blacks, vibrant blue accents)
- Clean navigation without icon clutter on static pages

## Design Tokens
- Colors: deep black backgrounds (`#0a0a0a`, `#0f0f0f`) in dark mode; vibrant blue (`#2563EB` or similar) for primary accents and interactive elements
- Typography: system-native font stack; consistent size scale (sm/base/lg/xl)
- Spacing: consistent padding/gap scale
- Border radius: subtle rounding on cards, inputs, buttons

## Layout System

### App Shell
- Sidebar (left) — primary navigation
- Main content area (right of sidebar)
- Page-level header with consistent title treatment

### Page Titles
- Consistent format: `Feature Name · ReachFlow` or just feature name in header
- Use dot separator (` · `) — not colon or dash (new requirement)
- No icons in page headers for About, Privacy, Terms pages (new requirement)

### Sidebar
- Primary nav items: Compose, Contacts, Applications, Resume Lab, Roadmap, Settings
- Active state clearly indicated
- Collapsed state on small screens

## Responsive Behavior
- **Small laptops (1024–1280px)**: sidebar collapses or narrows; content area uses full width; kanban columns scroll horizontally with visible scrollbar/arrows (new requirement)
- **Mobile (<768px)**: sidebar becomes bottom nav or hamburger; single-column layouts; touch targets ≥ 44px
- **Remove `overflow: hidden`** on containers that clip content on smaller screens (new requirement)

## Dark Mode
- Deep blacks: `#080808` background, `#111111` surface, `#1a1a1a` elevated surface
- Vibrant blue accents: primary actions, links, active states, focus rings
- Avoid gray-on-gray patterns; sufficient contrast ratios (WCAG AA)
- No hidden overflow clipping content

## Component Standards

### Inputs
- Consistent height, border, focus ring
- Error state: red border + error message below
- Labels always visible (no placeholder-only inputs)

### Buttons
- Primary: filled blue
- Secondary: outlined or ghost
- Danger: red (destructive actions)
- Loading state: spinner replaces icon or text

### Dialogs / Modals
- Common `Dialog` component (`components/common/Dialog.jsx`)
- Overlay dims background
- Close on Escape and overlay click (unless confirmation required)
- Focus trap inside modal

### Toast Notifications
- Common `Toast` component
- Auto-dismiss after 4–5 seconds
- Error toasts persist until dismissed

### Font Selection (fix required)
- Current font selector in Compose has a bug (font not correctly applying)
- Fix Quill font whitelist registration to correctly apply selected font

### Name Format (fix required)
- Replace First/Last name toggle switch with radio button group
- Labels: "First name only" / "Full name"

## Navigation Patterns
- Custom `pushState` router (`src/router.jsx`) — no React Router
- Active route highlighted in sidebar
- Resume Lab and Roadmap Lab have sub-navigation within their section

## Static Pages
- About, Privacy Policy, Terms of Use: accessible without auth
- Remove icons from these pages (new requirement)
- Clean typographic layout only

## Cross-Feature Patterns
- Empty states: consistent illustration/icon + message + CTA button
- Loading states: spinner or skeleton; never blank
- Error states: message + retry action where applicable
- Confirmation dialogs: required for all destructive actions

## Accessibility
- All interactive elements keyboard-accessible
- ARIA labels on icon-only buttons
- Focus visible styles enabled
- Form fields have associated labels

## Acceptance Criteria
- [ ] Dot separator used consistently in page titles
- [ ] No icons on About/Privacy/Terms pages
- [ ] Dark mode uses deep blacks + vibrant blue accents
- [ ] Kanban boards scroll horizontally on smaller screens
- [ ] `overflow: hidden` removed where it clips content
- [ ] Font selection works correctly in Compose
- [ ] Name format uses radio buttons instead of toggle
- [ ] Mobile layout functional with accessible touch targets
- [ ] Dialogs trap focus and close on Escape
- [ ] Empty, loading, and error states consistent across all pages
