# Settings · Spec

## Overview
The Settings page covers user profile preferences and AI provider configuration (BYOK). It is the control center for personalizing ReachFlow's behavior.

## Goals
- Allow users to configure their sender display name
- Allow users to configure and validate their AI provider for Resume Lab
- Provide account management (data deletion)
- Future: global AI personalization settings (tone, style, verbosity)

## User Stories
- As a user I can set my sender display name (used in Gmail "From" field)
- As a user I can configure my AI provider (OpenAI, Ollama Cloud, Ollama Local)
- As a user I can enter and encrypt my API key
- As a user I can test my AI connection before using Resume Lab
- As a user I can see which AI model is selected
- As a user I can delete all my app data
- As a user I can configure personalization settings for AI generation (tone, verbosity, formatting — new requirement)

## Flows

### Profile / Sender Name
1. User enters a display name.
2. Saves → stored encrypted (`senderDisplayNameEnc`).
3. Used as the "From" display name in outbound Gmail.

### AI Provider Setup
1. User picks provider: OpenAI, Ollama Cloud, or Ollama Local.
2. Enters API key (encrypted on save; only masked preview shown after).
3. Selects model from dropdown (provider-specific list).
4. For Ollama Local: enters local endpoint URL.
5. Clicks "Test Connection" → step-by-step diagnostic shown → pass/fail.
6. Only after passing test can Resume Lab features be used.

### AI Personalization (new requirement)
1. User opens AI personalization section.
2. Sets global preferences: tone (professional/casual/concise), verbosity level, formatting style.
3. Preferences stored per user and fed as context into Resume Lab generation prompts.

### Account Deletion
1. User clicks "Delete All App Data".
2. Confirmation dialog.
3. All user data deleted from MongoDB (campaigns, groups, contacts, templates, variables, applications, resumes, canonical profile, AI settings, roadmaps).
4. Firebase identity NOT deleted (user can re-register).

## UX Expectations
- Settings organized into clear sections: Profile, Gmail, AI · Resume Lab, AI Personalization, Account
- AI test connection shows step-by-step diagnostic timeline
- API key masked after save; "show" toggle not available (security)
- Validation state (isValid) shown with timestamp of last successful test
- Destructive actions (delete data) require confirmation

## Validations
- Provider must be one of: `openai`, `ollama_cloud`, `ollama_local`
- Any settings change resets `isValid` to false (must re-test)
- API key stored encrypted; never returned in plaintext
- Model must be from provider's supported list (or custom for ollama_local)

## Integrations
- Gmail: connect/disconnect/reconnect triggers shown here (OAuth flows)
- Resume Lab: AI settings gated behind this configuration
- AI personalization: feeds into Cortex generation calls

## States
- Not configured (no AI settings)
- Configured but not validated
- Validated (green status, timestamp)
- Test in progress (step-by-step loading)
- Test failed (red with error details per step)

## Edge Cases
- API key decryption failure → user prompted to re-save
- Cortex unreachable during test → specific error shown
- Ollama Local timeout → clear message about checking local service
- Changing provider resets validation; user must re-test

## Non-Goals
- Per-campaign AI settings
- Multi-account management
- Billing / subscription management

## Acceptance Criteria
- [ ] Sender display name saves and reflects in Gmail From header
- [ ] AI provider can be configured for all three provider types
- [ ] Test connection shows diagnostic steps and clear pass/fail
- [ ] API key never returned in plaintext to frontend
- [ ] Account data deletion removes all user data
- [ ] Validation resets when any setting changes
- [ ] AI personalization preferences saved and applied to generation
