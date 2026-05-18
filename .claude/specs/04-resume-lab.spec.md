# Resume Lab · Spec

## Overview
Resume Lab is an AI-powered resume tooling system. Users upload resumes, build a unified Career Profile from them, analyze job descriptions for match scoring, and generate tailored, ATS-optimized resumes as PDF. It also maintains a full history of all analyses and generated outputs.

## Goals
- Build a rich Career Profile from one or more uploaded resumes (no "base resume" concept — all resumes contribute equally)
- Analyze any job description against the career profile
- Generate a tailored resume (LaTeX → PDF) for each job
- Track the full history of analyses, generated resumes, LaTeX, prompts, and ATS scores
- Allow users to generate cover letters and HR outreach emails from the same workflow
- Keep all AI calls under BYOK (Bring Your Own Key) — user must configure a validated AI provider in Settings

## User Stories
- As a user I can upload multiple resumes and all of them contribute to my Career Profile
- As a user I can view and manually edit my Career Profile (add experience, education, certs, projects)
- As a user I can paste a job description and get a match score + gap analysis
- As a user I can generate a tailored resume PDF for a job
- As a user I can see a unified timeline of all my experience, education, certifications, and projects
- As a user I can view the full history of every analysis and generated resume, and click to reopen the workspace state
- As a user I can generate a cover letter for a job
- As a user I can generate an HR outreach email for a job, then open it in Compose pre-filled
- As a user I can tweak generation with a custom prompt and aggressiveness level
- As a user I cannot use Resume Lab until I configure and validate an AI provider in Settings

## Key Concept Changes (new requirements)
- **Remove base resume concept** — all uploaded resumes are equal contributors to the Career Profile
- **Rename "Canonical Profile" → "Career Profile"** everywhere in UI and API responses
- **Allow manual additions** to the Career Profile (add experience/education/cert/project entries without uploading a resume)
- **Unlimited resumes** — no cap on number of resumes a user can upload
- **Unified timeline view** in Career Profile showing all items (experience + education + certs + projects) in chronological order
- **History entries are clickable** and reopen the workspace to the exact state (analysis + generated resume) of that history entry
- **Cover letter generation** as a new output type from Workspace
- **HR email generation** as a new output type; "Open in Compose" button pre-fills Compose with subject + body
- **Rewrite with AI** button in Compose body area (separate feature, cross-referenced here)
- **Personalization settings** for global AI behavior (tone, verbosity, formatting preferences)

## Sub-pages / Sections
1. **Vault** — upload and manage all uploaded resumes
2. **Career Profile** — view and edit the merged career profile; unified timeline view
3. **Workspace** — analyze a JD, generate outputs (resume, cover letter, HR email)
4. **History** — chronological feed of all past activities; click to restore

## Flows

### Upload & Profile Build
1. User uploads a resume (PDF/DOC/DOCX, max 10 MB).
2. Cortex `/extract` parses it → structured profile data.
3. Cortex `/merge` merges into existing Career Profile.
4. User sees updated profile stats (skills, experience entries, education, projects, certs).

### Manual Profile Edit (new)
1. User opens Career Profile tab.
2. Clicks "Add Experience / Education / Certification / Project".
3. Fills form → entry added to Career Profile without requiring a resume upload.
4. Unified timeline updates.

### JD Analysis
1. User pastes job description in Workspace.
2. Optionally provides job title and company name.
3. Clicks Analyze → Cortex `analyzeResumeMatch` called.
4. Results: match score, missing keywords, recommended additions/removals, ATS keyword clusters.
5. Analysis saved to history.

### Resume Generation
1. From Workspace after analysis, user selects template type and aggressiveness.
2. Optionally adds a custom tweak prompt.
3. Clicks Generate → Cortex `generateOptimizedResume` called → LaTeX injected → PDF compiled.
4. Generated resume shown with LaTeX source, PDF download, before/after match scores.
5. Generation saved to history.

### Cover Letter Generation (new)
1. From Workspace, after analysis, user clicks "Generate Cover Letter".
2. AI generates a personalized cover letter body.
3. Shown inline with copy/download option.
4. Saved to history.

### HR Email Generation (new)
1. From Workspace, user clicks "Generate HR Email".
2. AI generates a cold outreach email body + suggested subject for a recruiter/HR contact.
3. "Open in Compose" button → navigates to Compose with subject and body pre-filled.
4. Saved to history.

### History Restore (new requirement)
1. User views History page.
2. Clicks any history entry.
3. Workspace opens with that analysis context (JD, match score, generated outputs) restored.

## UX Expectations
- Sub-nav within Resume Lab (Vault / Career Profile / Workspace / History)
- Vault shows all uploaded resumes; delete allowed; no "base resume" designation
- Career Profile shows stats + unified chronological timeline of all career items
- Timeline supports manual add/edit/delete of entries
- Workspace: left panel for JD input; right panel for results; sticky analysis results while generating
- History: grouped by date; each item shows type (analysis/resume/cover letter/HR email), job title, company, score
- Clicking history item restores full workspace context
- BYOK gate: if AI not configured → prominent banner linking to Settings

## Validations
- AI provider must be configured and validated before any LLM call (402 response otherwise)
- Resume upload: PDF/DOC/DOCX only, max 10 MB
- JD max 20,000 characters
- Custom prompt max 1,000 characters
- Career Profile manual entry: title required for experience/education/cert/project

## Integrations
- Cortex (external Python LLM service): extract, merge, analyze, generate, ping
- LaTeX compiler (Docker): compile LaTeX to PDF
- Settings: BYOK AI provider config
- Compose: HR email "Open in Compose" pre-fills the compose page
- AI personalization settings (new): global tone/style preferences fed into generation prompts

## States
- BYOK not configured (gate state)
- Vault: empty / has resumes / uploading / parsing
- Career Profile: empty / has profile / editing entry
- Workspace: idle / analyzing / generating / results shown
- History: empty / populated / loading history item

## Edge Cases
- Resume extraction fails → resume stored as `status: failed`; user can retry rebuild
- PDF compilation fails → resume still generated (LaTeX available for download); PDF error shown
- Cortex timeout (5 min extract, 3 min generate) → user sees loading state throughout
- JD analysis cache hit (same JD + same profile version within 30 min) → instant result, no LLM call
- Profile rebuild: resumes without accessible files on disk are skipped
- Multiple resumes: duplicated experience/education merged by Cortex (not exact duplicate detection)

## Non-Goals
- LinkedIn profile import
- Real-time collaborative editing
- Sending resumes directly via email from within Resume Lab (use Compose + HR email flow instead)

## Acceptance Criteria
- [ ] Multiple resumes can be uploaded; all contribute to Career Profile
- [ ] Career Profile shows unified timeline with experience, education, certs, projects
- [ ] Manual entries can be added to Career Profile without uploading a resume
- [ ] JD analysis produces match score and gap report
- [ ] Resume PDF generated and downloadable
- [ ] Cover letter generated and copyable
- [ ] HR email generated; "Open in Compose" pre-fills Compose
- [ ] History entries clickable and restore workspace state
- [ ] BYOK gate enforced; clear path to Settings
- [ ] "Canonical Profile" renamed to "Career Profile" throughout UI
