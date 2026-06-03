'use strict';

/**
 * brainPrompts.js — ReachFlow's resume-domain prompts and schemas.
 *
 * Brain (the LLM/RAG service) is application-agnostic: it knows nothing about
 * resumes, JDs, or ATS scoring. ALL of that domain knowledge lives here. Each
 * builder returns `{ system, prompt }` strings that are sent to Brain's generic
 * `/v1/generate` endpoint (with `response_format: 'json'` for structured calls).
 */

const TONE_MAP = {
  professional: 'professional, polished, and confident',
  casual: 'warm, approachable, and conversational',
  concise: 'concise, direct, and to the point',
};
const VERBOSITY_MAP = {
  brief: 'Keep output short — favor the highest-impact points only.',
  standard: 'Use a standard, balanced level of detail.',
  detailed: 'Be thorough; include supporting detail where it adds value.',
};
const FORMAT_MAP = {
  bullet_heavy: 'Prefer bullet points over paragraphs.',
  prose: 'Prefer flowing prose over bullet lists.',
  mixed: 'Mix concise prose with bullets where each fits best.',
};

/**
 * Build an optional style block from a user's personalization prefs + freeform
 * system prompt. Returns '' when nothing is configured. Style never overrides
 * grounding/accuracy — that is stated explicitly so a small model can't be
 * steered into fabrication.
 */
function buildStyleBlock(personalizationPrefs, userSystemPrompt) {
  const lines = [];
  const p = personalizationPrefs || {};
  if (p.tone && TONE_MAP[p.tone]) lines.push(`Tone: ${TONE_MAP[p.tone]}.`);
  if (p.verbosity && VERBOSITY_MAP[p.verbosity]) lines.push(VERBOSITY_MAP[p.verbosity]);
  if (p.formatPreference && FORMAT_MAP[p.formatPreference]) lines.push(FORMAT_MAP[p.formatPreference]);
  const extra = (userSystemPrompt || '').trim();
  if (extra) lines.push(`Additional user guidance: ${extra}`);
  if (!lines.length) return '';
  return (
    '\n\nStyle preferences (apply where natural; never at the expense of factual ' +
    'accuracy or grounding):\n- ' + lines.join('\n- ')
  );
}

const JSON_RULE =
  'Output ONLY a single valid JSON object — no markdown, no code fences, no commentary.';

// ── Resume extraction (file text → structured profile) ───────────────────────

function resumeExtractPrompt({ resumeText }) {
  const system =
    'You are a meticulous resume parser. Extract structured data STRICTLY from ' +
    'the resume text provided. Never invent facts, dates, employers, or skills ' +
    'that are not present. Leave fields empty when unknown. ' + JSON_RULE;

  const schema = `Return this exact JSON shape:
{
  "contact": { "name": "", "email": "", "phone": "", "location": "", "links": [] },
  "summary": "",
  "skills": ["string"],
  "experience": [ { "company": "", "title": "", "start": "", "end": "", "location": "", "bullets": ["string"] } ],
  "education": [ { "institution": "", "degree": "", "field": "", "start": "", "end": "" } ],
  "projects": [ { "name": "", "description": "", "tech": ["string"], "bullets": ["string"] } ],
  "certifications": [ { "name": "", "issuer": "", "date": "" } ],
  "sectioned_resume_source": { "summary": "", "skills": "", "experience": "", "education": "", "projects": "" },
  "confidence": 0.0
}
Rules:
- "sectioned_resume_source" holds the VERBATIM text of each section as it appears in the resume (used later for faithful rewrites).
- "confidence" is your 0–1 estimate of extraction quality given the text clarity.
- Dates: keep as written (e.g. "Jan 2022", "2020", "Present").`;

  const prompt = `${schema}\n\nResume text:\n"""\n${resumeText}\n"""`;
  return { system, prompt };
}

// ── Cumulative career-profile merge (dedup + accumulate over time) ────────────

function mergeProfilePrompt({ existingProfile, incomingProfile }) {
  const system =
    'You merge a candidate\'s newly-parsed resume into their cumulative Career ' +
    'Profile. The profile GROWS over time: keep everything already in the ' +
    'existing profile even if it is absent from the incoming resume (older roles ' +
    'and skills are never dropped). Deduplicate semantically — the same job, ' +
    'school, project, or skill described differently across resumes must collapse ' +
    'into ONE entry, merging their bullets/details (union, no repetition). ' + JSON_RULE;

  const rules = `Return this exact JSON shape:
{
  "canonical_profile": {
    "contact": { "name": "", "email": "", "phone": "", "location": "", "links": [] },
    "summary": "",
    "skills": ["string"],
    "experience": [ { "canonical_key": "", "company": "", "title": "", "start": "", "end": "", "location": "", "bullets": ["string"], "showcase_prompt": null } ],
    "education": [ { "canonical_key": "", "institution": "", "degree": "", "field": "", "start": "", "end": "" } ],
    "projects": [ { "canonical_key": "", "name": "", "description": "", "tech": ["string"], "bullets": ["string"], "showcase_prompt": null } ],
    "certifications": [ { "canonical_key": "", "name": "", "issuer": "", "date": "" } ]
  },
  "added_items": { "skills": 0, "experience": 0, "education": 0, "projects": 0, "certifications": 0 },
  "merged_duplicates": { "skills": 0, "experience": 0, "education": 0, "projects": 0, "certifications": 0 }
}
Rules:
- "canonical_key" is a stable lowercase slug per item: experience → "company-title", education → "institution-degree", projects → "name", certifications → "name-issuer". Reuse the existing item's canonical_key when merging into it.
- PRESERVE any existing "showcase_prompt" value; do not null it out during merge.
- "added_items" counts brand-new items from the incoming resume; "merged_duplicates" counts incoming items that collapsed into an existing entry.
- Prefer the most complete/recent phrasing when merging, but never lose distinct factual bullets.`;

  const prompt = `${rules}

EXISTING career profile (may be empty {}):
${JSON.stringify(existingProfile || {}, null, 2)}

INCOMING parsed resume:
${JSON.stringify(incomingProfile || {}, null, 2)}`;
  return { system, prompt };
}

// ── JD analysis scoped to ONE selected resume ─────────────────────────────────

function analyzePrompt({ jobDescription, baseResume, canonicalProfile, styleBlock }) {
  const system =
    'You are an ATS (Applicant Tracking System) and recruiting expert. Compare a ' +
    'job description against ONE specific resume the candidate selected. The match ' +
    'score and all keyword findings MUST reflect ONLY that selected resume — do not ' +
    'credit skills/experience that exist elsewhere in the broader Career Profile but ' +
    'are absent from the selected resume. Use the Career Profile only as secondary ' +
    'context for "existing_but_missing_from_resume" (things the candidate genuinely ' +
    'has but did not put on this resume). ' + JSON_RULE + (styleBlock || '');

  const shape = `Return this exact JSON shape:
{
  "match_score": 0,
  "role_seniority": "",
  "domain_fit": "",
  "required_keywords": ["string"],
  "missing_keywords": ["string"],
  "existing_but_missing_from_resume": ["string"],
  "irrelevant_content": ["string"],
  "recommended_additions": ["string"],
  "recommended_removals": ["string"],
  "section_rewrites": { "summary": "", "experience": "" },
  "ats_keyword_clusters": { "cluster_name": ["string"] }
}
Definitions:
- "match_score": integer 0–100, how well the SELECTED resume matches the JD (ATS-style).
- "required_keywords": key skills/terms the JD demands.
- "missing_keywords": JD-required terms absent from the selected resume.
- "existing_but_missing_from_resume": terms the candidate HAS (per Career Profile) but the selected resume omits.
- "irrelevant_content": resume content not relevant to this JD (candidates to trim).
- "ats_keyword_clusters": JD keywords grouped by theme.`;

  const selected = baseResume
    ? JSON.stringify(baseResume, null, 2)
    : '(no specific resume selected — fall back to the Career Profile below)';

  const prompt = `${shape}

JOB DESCRIPTION:
"""
${jobDescription}
"""

SELECTED RESUME (the ONLY basis for match_score and keyword presence):
${selected}

CAREER PROFILE (secondary context only):
${JSON.stringify(canonicalProfile || {}, null, 2)}`;
  return { system, prompt };
}

// ── Cover letter ──────────────────────────────────────────────────────────────

function coverLetterPrompt({ jobDescription, canonicalProfile, analysisSummary, userPrompt, styleBlock }) {
  const system =
    'You write tailored, sincere cover letters grounded ONLY in the candidate\'s ' +
    'real Career Profile. Never fabricate achievements. Produce a complete letter ' +
    'body (no placeholders like [Company]). ' + JSON_RULE + (styleBlock || '');

  const shape =
    'Return: { "cover_letter_text": "string", "word_count": 0 }. ' +
    '"cover_letter_text" is the full letter body as plain text with paragraph breaks.';

  const extras = [];
  if (analysisSummary) extras.push(`Match analysis (for emphasis):\n${JSON.stringify(analysisSummary)}`);
  if (userPrompt) extras.push(`Extra instructions from the user: ${userPrompt}`);

  const prompt = `${shape}

JOB DESCRIPTION:
"""
${jobDescription}
"""

CAREER PROFILE:
${JSON.stringify(canonicalProfile || {}, null, 2)}
${extras.length ? '\n' + extras.join('\n\n') : ''}`;
  return { system, prompt };
}

// ── HR / recruiter outreach email ─────────────────────────────────────────────

function hrEmailPrompt({ jobDescription, canonicalProfile, recipientName, analysisSummary, userPrompt, styleBlock }) {
  const system =
    'You write short, high-signal cold outreach emails to a recruiter/HR contact ' +
    'about a specific role. Grounded ONLY in the candidate\'s real Career Profile. ' +
    'Keep it under ~150 words, with a crisp subject line. ' + JSON_RULE + (styleBlock || '');

  const shape =
    'Return: { "subject": "string", "body": "string", "word_count": 0 }. ' +
    '"body" is plain text with paragraph breaks; no signature placeholders.';

  const extras = [];
  if (recipientName) extras.push(`Recipient name: ${recipientName}`);
  if (analysisSummary) extras.push(`Match analysis (for emphasis):\n${JSON.stringify(analysisSummary)}`);
  if (userPrompt) extras.push(`Extra instructions from the user: ${userPrompt}`);

  const prompt = `${shape}

JOB DESCRIPTION:
"""
${jobDescription}
"""

CAREER PROFILE:
${JSON.stringify(canonicalProfile || {}, null, 2)}
${extras.length ? '\n' + extras.join('\n\n') : ''}`;
  return { system, prompt };
}

// ── Compose body rewrite ──────────────────────────────────────────────────────

function rewritePrompt({ instruction, bodyHtml, subject, styleBlock }) {
  const system =
    'You refine an email body according to the user\'s instruction. Preserve the ' +
    'original intent and any concrete facts. Return clean, valid HTML suitable for ' +
    'a rich-text editor (use <p>, <ul>/<li>, <strong>, <em>, <a>; no <html>/<body> ' +
    'wrappers, no inline styles, no scripts). ' + JSON_RULE + (styleBlock || '');

  const shape = 'Return: { "rewritten_html": "string" }.';

  const prompt = `${shape}

${subject ? `Email subject (context): ${subject}\n\n` : ''}Instruction: ${instruction}

Current email body (HTML):
"""
${bodyHtml}
"""`;
  return { system, prompt };
}

// ── DSA / algorithm analysis ──────────────────────────────────────────────────
// Two modes from one schema:
//   • problem only        → 2–3 approaches (brute force → optimal), each with
//                           how-to-think, simple explanation, complexity, and
//                           Java + Python code.
//   • problem + user code → the above PLUS a review of the user's code
//                           (correctness, bugs, improvements, its complexity, and
//                           whether it's already optimal).
// The model also gates non-DSA input: if the text isn't a genuine algorithmic /
// data-structures problem it must refuse with is_dsa_problem=false + a reason.

const DSA_LANGUAGES = ['java', 'python'];
const DSA_LANG_LABEL = { java: 'Java', python: 'Python' };

function dsaAnalysisPrompt({ problemStatement, userCode, language, outputLanguages }) {
  const hasCode = !!(userCode && String(userCode).trim());
  const lang = DSA_LANGUAGES.includes(language) ? language : 'java';

  // Which language(s) the generated solutions should be written in (user prefs).
  const outLangs = Array.isArray(outputLanguages)
    ? outputLanguages.filter((l) => DSA_LANGUAGES.includes(l))
    : [];
  const langs = outLangs.length ? outLangs : DSA_LANGUAGES;
  const langLabels = langs.map((l) => DSA_LANG_LABEL[l]).join(' and ');
  // The "code" object only carries the requested languages, e.g. { "java": "" }.
  const codeShape = '{ ' + langs.map((l) => `"${l}": ""`).join(', ') + ' }';

  const system =
    'You are an expert competitive-programming and Data Structures & Algorithms ' +
    'tutor. You explain in plain, simple language a beginner can follow — avoid ' +
    'jargon, and when a technical term is unavoidable, explain it in a few words.\n\n' +
    'STEP 1 — GATEKEEP: First decide whether the user input is a genuine ' +
    'algorithmic / data-structures problem (something with inputs, expected ' +
    'output, and an algorithm/efficiency angle — e.g. arrays, strings, trees, ' +
    'graphs, DP, searching/sorting, etc.). If it is NOT a DSA problem (e.g. a ' +
    'general coding/setup question, an essay, trivia, or nonsense), respond with ' +
    'ONLY this JSON and nothing else: ' +
    '{ "is_dsa_problem": false, "rejection_reason": "<one short sentence on why>" }.\n\n' +
    'STEP 2 — If it IS a DSA problem, analyze it. Always provide 2–3 distinct ' +
    'approaches ordered from brute force to most optimal, each with working, ' +
    'compilable code in ' + langLabels + ' only (do not include any other ' +
    'language), and its time & space complexity. ' +
    (hasCode
      ? 'The user ALSO submitted their own solution (in ' + lang + '): review it — ' +
        'state whether it is correct, list concrete bugs/edge-cases it misses, ' +
        'suggest improvements, give ITS time & space complexity, and decide whether ' +
        'it is already optimal. If it is already optimal, set review.is_optimal=true ' +
        'and put a brief, encouraging acknowledgement in review.optimality_note ' +
        '(do not invent a "better" solution than one that is already optimal). If it ' +
        'is not optimal, the optimal approach in "approaches" is the improved version.'
      : 'No user code was submitted — focus on teaching how to think about the ' +
        'problem from brute force toward the optimal solution.') +
    '\n\n' + JSON_RULE;

  const shape = `Return this exact JSON shape:
{
  "is_dsa_problem": true,
  "rejection_reason": "",
  "problem_title": "",
  "problem_summary": "",
  "has_user_code": ${hasCode},
  "review": ${hasCode ? `{
    "language": "${lang}",
    "verdict": "correct | incorrect | partially_correct",
    "verdict_explanation": "",
    "bugs": [ { "issue": "", "fix": "" } ],
    "improvements": ["string"],
    "complexity": { "time": "O(...)", "space": "O(...)", "explanation": "" },
    "is_optimal": false,
    "optimality_note": ""
  }` : 'null'},
  "approaches": [
    {
      "name": "Brute force",
      "is_optimal": false,
      "how_to_think": "",
      "explanation": "",
      "complexity": { "time": "O(...)", "space": "O(...)", "explanation": "" },
      "code": ${codeShape}
    }
  ],
  "optimal_complexity": { "time": "O(...)", "space": "O(...)" }
}
Rules:
- "approaches" MUST be ordered brute force → optimal and contain 2 or 3 items; mark the best one with "is_optimal": true.
- Every approach's "code" MUST include a working ${langLabels} implementation that actually solves the problem (not pseudocode). Include ONLY these language key(s): ${langs.map((l) => `"${l}"`).join(', ')} — no others.
- "how_to_think" is the intuition/derivation for reaching that approach, in simple words.
- "complexity.explanation" briefly says WHY the time/space bounds hold, without heavy jargon.
- "optimal_complexity" mirrors the complexity of the approach marked is_optimal.
- Keep all code as valid JSON string values: escape newlines and quotes properly.${hasCode ? '\n- "review" reflects ONLY the user\'s submitted code, not the approaches.' : '\n- "review" MUST be null when no user code is provided.'}`;

  const codeBlock = hasCode
    ? `\n\nUSER'S SUBMITTED SOLUTION (${lang}):\n"""\n${userCode}\n"""`
    : '';

  const prompt = `${shape}

PROBLEM STATEMENT:
"""
${problemStatement}
"""${codeBlock}`;

  return { system, prompt };
}

module.exports = {
  buildStyleBlock,
  resumeExtractPrompt,
  mergeProfilePrompt,
  analyzePrompt,
  coverLetterPrompt,
  hrEmailPrompt,
  rewritePrompt,
  dsaAnalysisPrompt,
  DSA_LANGUAGES,
};
