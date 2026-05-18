# AI / LLM Orchestration · Spec

## Overview
ReachFlow's AI features (Resume Lab) route all LLM calls through Cortex, an external Python service. The AI system is BYOK (Bring Your Own Key) — users must supply and validate their own AI provider credentials. A global personalization layer (new) allows users to configure tone and style preferences applied across all AI outputs.

## Goals
- Strict BYOK enforcement — no shared API key fallback
- Support multiple providers: OpenAI, Ollama Cloud, Ollama Local
- Provide fast, reliable LLM calls for resume extraction, profile merging, JD analysis, and resume generation
- Add global personalization settings that influence generation tone and style

## BYOK Enforcement
- Before any LLM call, `resolveUserLlm(userId)` checks:
  1. `AISettings` doc exists
  2. `isValid === true` (must have passed the test connection)
  3. API key can be decrypted
- If any check fails → HTTP 402 with `code: LLM_NOT_CONFIGURED | LLM_NOT_VALIDATED | LLM_KEY_ERROR`
- Frontend shows BYOK gate with link to Settings

## Supported Providers
| Provider | Value | Notes |
|---|---|---|
| OpenAI | `openai` | Models: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo |
| Ollama Cloud | `ollama_cloud` | Models: gpt-oss:120b, llama3.3:70b, llama3.1:70b, mistral:7b |
| Ollama Local | `ollama_local` | User provides endpoint; models discovered dynamically |

## Cortex Operations
| Operation | Endpoint | Timeout | Purpose |
|---|---|---|---|
| Extract resume | `/extract` | 5 min | Parse resume file into structured profile data |
| Merge profile | Internal | — | Merge incoming resume data into existing Career Profile |
| Analyze JD | `/analyze` | — | Match JD against Career Profile; produce match score + gaps |
| Generate resume | `/generate/document` | 3 min | Produce tailored resume content |
| LLM ping | `/llm/ping` | 30 s | Test connection (single-token call) |
| Cover letter | TBD (new) | — | Generate cover letter from JD + profile |
| HR email | TBD (new) | — | Generate recruiter outreach email from JD + profile |

## JD Analysis Cache
- In-memory cache keyed by `userId:profileVersion:sha256(jd)[:16]`
- TTL: 30 minutes
- Max entries: 200 (LRU eviction)
- Hit returns cached analysis without an LLM call

## Generation Modes
- `canonical_only` — generate resume purely from Career Profile
- `modify_existing` — use `sectionedResumeSource` from an uploaded resume as starting structure

## Aggressiveness Levels
- `conservative` — minimal changes, preserve existing content
- `balanced` — recommended, moderate optimization
- `aggressive` — maximize ATS score, significant rewrite

## Personalization Settings (new)
- Stored per user in a new field on `AISettings` (or separate doc)
- Fields: `tone` (professional/casual/concise), `verbosity` (brief/standard/detailed), `formatPreference` (bullet-heavy/prose/mixed)
- Fed as system prompt context into all Cortex generation calls
- Set via Settings → AI Personalization section

## User Stories
- As a user I can configure my own OpenAI or Ollama API key
- As a user I can test my connection before using AI features
- As a user I cannot use AI features with an untested/invalid key
- As a user I can set my preferred tone and verbosity for AI outputs
- As a user the AI respects my personalization preferences in all generated content

## Validations
- Provider must be one of the defined values
- API key stored encrypted; decryption failure = typed error
- Model must be valid for provider (or custom for ollama_local)
- Any settings change resets `isValid`

## States
- Not configured (no AISettings doc)
- Configured but not validated
- Validated + active
- Test in progress
- Key decryption error

## Edge Cases
- Cortex ECONNREFUSED → specific error message about Cortex not running
- LLM timeout → upstream timeout propagated as 502
- LaTeX validation fails on first generation → automatic retry once
- JD cache invalidated when profile version increments

## Non-Goals
- Streaming LLM responses to the frontend
- Prompt caching (Anthropic-specific feature)
- Fine-tuning or model training
- Shared AI keys across users

## Acceptance Criteria
- [ ] BYOK gate blocks all LLM calls for unconfigured users
- [ ] All three provider types work end-to-end
- [ ] Test connection provides step-by-step diagnostic
- [ ] JD analysis cache reduces redundant LLM calls
- [ ] Generation modes (canonical_only / modify_existing) produce different outputs
- [ ] Personalization settings applied to all generation prompts
- [ ] Cover letter generation endpoint implemented
- [ ] HR email generation endpoint implemented
