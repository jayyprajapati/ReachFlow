# Frontend Reference

## Purpose

React SPA for all user interactions. Custom pushState router, no React Router. Firebase Auth client-side. Plain CSS (no Tailwind, no CSS-in-JS).

## Read This When

- Adding a new page or route
- Modifying global state (auth, Gmail, templates, groups)
- Working on Resume Lab or Roadmap Lab UI
- Touching authentication or token management
- Changing styles or theming
- Integrating with a backend API endpoint

## Feature Map

| Route path | Page | Component |
|---|---|---|
| `/` | Dashboard | `pages/HomePage.jsx` |
| `/compose` | Outreach compose | `pages/ComposePage.jsx` |
| `/pipeline` | Application kanban | `pages/PipelinePage.jsx` |
| `/contacts` | Contacts & groups | `pages/ContactsPage.jsx` |
| `/templates` | Email templates | `pages/TemplatesPage.jsx` |
| `/resources` | Resource library | `pages/ResourcesPage.jsx` |
| `/history` | Send history | `pages/HistoryPage.jsx` |
| `/settings` | Settings & AI setup | `pages/SettingsPage.jsx` |
| `/resume-lab/*` | Resume Lab suite | `pages/ResumeLab/index.jsx` |
| `/dsa-lab/*` | DSA Lab | `pages/DsaLab/index.jsx` |
| `/roadmaps/*` | Roadmap Lab | `pages/RoadmapLab/index.jsx` |

Static pages (no auth): `/about`, `/privacy-policy`, `/terms-of-use`

## Critical Files

### App.jsx
Component tree root: `AppProvider → RouterProvider → AuthGate → ResumeLabProvider → AppShell → PageRouter`. `PageRouter` is a switch on `path` from `useRouter()`. `AuthGate` shows landing page when `appUser` is null.

### router.jsx
Custom pushState router. No React Router. `RouterProvider` exposes `{ path, search, navigateTo }` via `useRouter()`. Navigate with `navigateTo('/path')`. Handles `popstate` for browser back/forward.

### contexts/AppContext.jsx
Global state. Exports `useApp()`. Manages:
- Firebase Auth: `appUser`, `idToken`, `authLoading`, `signIn`, `signOut`
- Gmail: `gmailConnected`, `gmailActionLoading`, `grantedScopes`, `requiredScopes`
- Sender name: `senderName`, `savedSenderName`, `savingSenderName`
- Shared data: `groups`, `templates`, `variables`, `history`, `drafts`, `scheduled`
- UI: `notice` (toast), `warningDialog`, `theme`
- LinkedIn extension: `postToLinkedinExtension` via `VITE_LINKEDIN_EXTENSION_ID`
- All API calls use `authedFetch` (injects `Authorization: Bearer <idToken>`)

### contexts/ResumeLabContext.jsx
Resume Lab state. Exposes everything Resume Lab pages need: resumes, canonical profile, analyses, generated docs, workspace state, active analysis, loading flags, and API call methods. Pages do not fetch directly — they read/call through this context.

### contexts/RoadmapContext.jsx
Roadmap Lab state. Roadmaps list, active roadmap, stages, items, CRUD operations. Drag-and-drop order mutations go through this context.

### services/resumeLabApi.js
`makeResumeLabApi(authedFetch)` — all `/api/resumelab/*` calls. `uploadResumeFile` and `downloadResumePdf` use `idToken` directly (not `authedFetch`) because multipart/binary handling differs.

### services/roadmapApi.js
All `/api/roadmaps/*` calls. Consumed by `RoadmapContext`.

### services/dsaApi.js
All `/api/dsa/*` calls. Consumed by DSA Lab pages.

### services/resourcesApi.js
`makeResourcesApi(authedFetch)` for list/delete plus `uploadResourceFile(idToken, file, source)` and `downloadResourceFile(idToken, resource)` for multipart upload / binary download. Used by `ResourcesPage` and Compose's attachment picker.

### styles/tokens.css
All CSS custom properties (`--rf-*`). Retheme by editing here. Supports dark/light via `[data-theme]` attribute on `<html>`.

## Dependencies

**Uses:**
- Firebase (firebase/app, firebase/auth) — auth
- lucide-react — icons
- Backend REST API via `authedFetch`

**Contexts consumed by pages:**
- `useApp()` — all pages
- `useRouter()` — navigation anywhere
- `useResumeLab()` — Resume Lab pages only
- `useRoadmap()` — Roadmap Lab pages only

## Known Gotchas

- **No React Router**: Never add react-router. Use `useRouter().navigateTo('/path')` for navigation.
- **Auth token refresh**: `AppContext` uses `onIdTokenChanged` to keep `idToken` current. Don't call `getIdToken()` directly in pages — always use `authedFetch`.
- **`authedFetch` vs direct fetch**: `authedFetch` always sets `Content-Type: application/json`. For multipart form uploads or binary downloads, use `idToken` directly as in `uploadResumeFile`.
- **Static pages bypass auth**: `/about`, `/privacy-policy`, `/terms-of-use` render without auth in `AuthGate` — no `AppShell`.
- **ResumeLabProvider placement**: It wraps only authenticated pages inside `AuthGate`. DSA Lab uses Brain too but has no dedicated context — it fetches inline via `dsaApi.js`.
- **Theme**: Stored in `localStorage` as `reachflow-theme` (`dark` | `light`). Set via `setTheme` from `useApp()`.

## Read Next

- `ARCHITECTURE.md` — full system flows
- `.claude/specs/` — product specs for the feature you're touching

## File Reference

### pages/ResumeLab/index.jsx
Purpose: Sub-router for Resume Lab. Manages which sub-page (Vault/Profile/Analyze/Workspace/Generated/History) is active.

### pages/ResumeLab/VaultPage.jsx
Purpose: Resume upload list + file management.

### pages/ResumeLab/ProfilePage.jsx
Purpose: Career Profile viewer and manual editor (add experience, education, certs, projects).

### pages/ResumeLab/AnalyzePage.jsx
Purpose: JD paste and analysis trigger; shows match score, gaps, ATS clusters.

### pages/ResumeLab/WorkspacePage.jsx
Purpose: Resume generation controls (intensity, user prompt, template type).

### pages/ResumeLab/GeneratedPage.jsx
Purpose: Generated resume/cover letter/HR email preview + PDF download.

### pages/ResumeLab/HistoryPage.jsx
Purpose: Full history of analyses and generated documents. Click to restore workspace state.

### pages/ResourcesPage.jsx
Purpose: Resource library UI — upload, search/filter, dedup notice, per-row source badges (`Compose` / `Resume Vault` / `Resources`), download, delete (disabled when linked to Resume Vault).

### pages/DsaLab/AnalyzePage.jsx
Purpose: Problem input + code editor + analysis trigger.

### pages/DsaLab/HistoryPage.jsx
Purpose: Past DSA analyses with full result restore.

### pages/RoadmapLab/DashboardPage.jsx
Purpose: Roadmap list with per-roadmap progress rings.

### pages/RoadmapLab/BoardPage.jsx
Purpose: Kanban board for a single roadmap — stages and items with drag-and-drop.

### components/layout/AppShell.jsx
Purpose: Top-level authenticated shell — sidebar + main content area.

### components/layout/Sidebar.jsx
Purpose: Navigation sidebar with route links.

### components/layout/CommandPalette.jsx
Purpose: Keyboard-accessible command palette for fast navigation.

### components/common/Toast.jsx
Purpose: Global toast notification system. Triggered via `notice` in AppContext.

### components/common/Dialog.jsx
Purpose: Modal dialog component. Used for `warningDialog` in AppContext.

### components/Editor.jsx
Purpose: Rich text editor for email body composition (HTML output).

### components/GroupManager.jsx
Purpose: Contact group CRUD and contact management UI.

### components/ApplicationsPage.jsx
Purpose: Mobile-friendly version of the application pipeline view, rendered as a component (used inside ContactsPage-style bottom-sheet pattern).

### components/dsa/CodeBlock.jsx
Purpose: Syntax-highlighted code display for DSA analysis results.

### components/dsa/CodeEditor.jsx
Purpose: Code input editor used on the DSA Analyze page.

### components/dsa/DsaResult.jsx
Purpose: Renders full DSA analysis result — approaches, complexity, explanations.

### styles/resumelab.css
Purpose: All Resume Lab page styles.

### styles/roadmaplab.css
Purpose: All Roadmap Lab page styles.

### styles/dsa.css
Purpose: All DSA Lab page styles.

### styles/layout.css
Purpose: AppShell, Sidebar, and layout grid styles.

### styles/components.css
Purpose: Shared component styles (buttons, inputs, cards, badges).

### styles/pages.css
Purpose: Page-level styles for core app pages (Compose, Pipeline, Contacts, etc.).
