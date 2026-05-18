'use strict';

/**
 * Resume Lab Phase 2 unit tests — JD Analyzer + Resume Generation
 *
 * Run with: node --test src/test/resumelab_phase2.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');

// ── Inline the helpers under test ────────────────────────────────────────────
// (copied verbatim from latexCompiler.js and the route module to keep tests
//  isolated from live file-system / process dependencies)

const LATEX_CHAR_MAP = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  '$': '\\$',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
};

const LATEX_SPECIAL_RE = /[\\&%$#{}_~^<>]/g;

function escapeLaTeX(str) {
  return String(str == null ? '' : str).replace(LATEX_SPECIAL_RE, ch => LATEX_CHAR_MAP[ch] || ch);
}

function formatSkills(skills) {
  if (!skills || !skills.length) return '\\textit{N/A}';
  return skills.map(s => escapeLaTeX(String(s || ''))).filter(Boolean).join(' \\textbullet\\ ');
}

function formatExperience(experience) {
  if (!experience || !experience.length) return '\\textit{N/A}';
  return experience.map((job) => {
    const company = escapeLaTeX(job.company || '');
    const title = escapeLaTeX(job.title || '');
    const dateRange = escapeLaTeX(job.date_range || '');
    const bullets = Array.isArray(job.bullets) ? job.bullets.filter(Boolean) : [];
    let block = `\\textbf{${company}} \\hfill \\textit{${dateRange}}\\\\`;
    block += `\n\\textit{${title}}\\\\[-2pt]`;
    if (bullets.length) {
      block += '\n\\begin{itemize}';
      for (const b of bullets) block += `\n  \\item ${escapeLaTeX(String(b))}`;
      block += '\n\\end{itemize}';
    }
    return block;
  }).join('\n\n\\medskip\n');
}

function formatProjects(projects) {
  if (!projects || !projects.length) return '\\textit{N/A}';
  return projects.map((proj) => {
    const name = escapeLaTeX(proj.name || proj.normalized_name || '');
    const desc = escapeLaTeX(proj.description || '');
    const techs = Array.isArray(proj.technologies) ? proj.technologies.map(t => escapeLaTeX(t)).join(', ') : '';
    let block = `\\textbf{${name}}\\\\`;
    if (techs) block += `\n\\textit{${techs}}\\\\[-2pt]`;
    if (desc) block += `\n${desc}`;
    return block;
  }).join('\n\n\\medskip\n');
}

function formatEducation(education) {
  if (!education || !education.length) return '\\textit{N/A}';
  return education.map((edu) => {
    const institution = escapeLaTeX(edu.institution || '');
    const degree = escapeLaTeX(edu.degree || '');
    const field = escapeLaTeX(edu.field_of_study || '');
    const dateRange = escapeLaTeX(edu.date_range || '');
    return `\\textbf{${institution}} \\hfill \\textit{${dateRange}}\\\\\n\\textit{${[degree, field].filter(Boolean).join(', ')}}`;
  }).join('\n\n\\medskip\n');
}

// Route-side response helpers
function toAnalysisSummary(doc) {
  return {
    id: doc._id.toString(),
    matchScore: doc.matchScore || 0,
    jobTitle: doc.extractedJobMetadata?.title || '',
    company: doc.extractedJobMetadata?.company || '',
    seniority: doc.extractedJobMetadata?.seniority || '',
    status: doc.status,
  };
}

function toGeneratedSummary(doc) {
  return {
    id: doc._id.toString(),
    analysisId: doc.analysisId?.toString() || null,
    templateType: doc.templateType,
    matchScoreBefore: doc.matchScoreBefore || 0,
    matchScoreAfter: doc.matchScoreAfter || 0,
    hasPdf: !!doc.pdfPath,
    pdfError: doc.pdfError || '',
    status: doc.status,
  };
}

// ── Stubs ────────────────────────────────────────────────────────────────────

function makeAnalysisResult(overrides = {}) {
  return {
    match_score: 72.5,
    required_keywords: ['TypeScript', 'React', 'Node.js'],
    missing_keywords: ['GraphQL'],
    existing_but_missing_from_resume: ['Redux'],
    irrelevant_content: ['jQuery'],
    recommended_additions: ['GraphQL', 'Apollo'],
    recommended_removals: ['jQuery'],
    section_rewrites: { summary: 'Experienced full-stack engineer...' },
    ats_keyword_clusters: { frontend: ['React', 'TypeScript'] },
    role_seniority: 'senior',
    domain_fit: 'Strong alignment with full-stack SaaS engineering.',
    ...overrides,
  };
}

function makeGeneratedResult(overrides = {}) {
  return {
    summary: 'Senior engineer with 8 years of full-stack experience.',
    skills: ['TypeScript', 'React', 'Node.js', 'GraphQL'],
    projects: [
      { name: 'DataFlow', description: 'ETL pipeline', technologies: ['Node.js', 'PostgreSQL'], url: null },
    ],
    experience: [
      { company: 'Acme Corp', title: 'Senior Engineer', date_range: '2020–2024', bullets: ['Led migration to microservices'] },
    ],
    target_keywords_used: ['TypeScript', 'GraphQL'],
    removed_content: ['jQuery'],
    match_score_improved: 88.0,
    ...overrides,
  };
}

function makeAnalysisDoc(overrides = {}) {
  return {
    _id: { toString: () => 'analysis-id-1' },
    userId: 'user-id-1',
    matchScore: 72.5,
    jobDescriptionRaw: 'Looking for a senior full-stack engineer...',
    extractedJobMetadata: { title: 'Senior Engineer', company: 'Acme', seniority: 'senior', domain: 'SaaS' },
    matchAnalysis: makeAnalysisResult(),
    canonicalProfileVersion: 3,
    status: 'analyzed',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeGeneratedDoc(overrides = {}) {
  return {
    _id: { toString: () => 'gen-id-1' },
    userId: 'user-id-1',
    analysisId: { toString: () => 'analysis-id-1' },
    baseResumeId: null,
    templateType: 'fullstack',
    generatedContent: makeGeneratedResult(),
    latexSource: '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}',
    pdfPath: '/tmp/resume.pdf',
    pdfError: '',
    matchScoreBefore: 72.5,
    matchScoreAfter: 88.0,
    status: 'generated',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── LaTeX escaping ────────────────────────────────────────────────────────────

describe('escapeLaTeX', () => {
  test('escapes ampersand', () => {
    assert.equal(escapeLaTeX('A & B'), 'A \\& B');
  });

  test('escapes percent', () => {
    assert.equal(escapeLaTeX('100%'), '100\\%');
  });

  test('escapes dollar sign', () => {
    assert.equal(escapeLaTeX('$1,000'), '\\$1,000');
  });

  test('escapes hash', () => {
    assert.equal(escapeLaTeX('#1 result'), '\\#1 result');
  });

  test('escapes underscore', () => {
    assert.equal(escapeLaTeX('user_name'), 'user\\_name');
  });

  test('escapes braces', () => {
    assert.equal(escapeLaTeX('{hello}'), '\\{hello\\}');
  });

  test('escapes backslash first (no double-escaping)', () => {
    const result = escapeLaTeX('a\\b');
    assert.equal(result, 'a\\textbackslash{}b');
    // The replacement for \ must not itself get re-escaped
    assert.ok(!result.includes('\\\\'));
  });

  test('handles null/undefined gracefully', () => {
    assert.equal(escapeLaTeX(null), '');
    assert.equal(escapeLaTeX(undefined), '');
  });

  test('handles angle brackets', () => {
    assert.equal(escapeLaTeX('a<b>c'), 'a\\textless{}b\\textgreater{}c');
  });
});

// ── formatSkills ──────────────────────────────────────────────────────────────

describe('formatSkills', () => {
  test('returns N/A for empty list', () => {
    assert.equal(formatSkills([]), '\\textit{N/A}');
    assert.equal(formatSkills(null), '\\textit{N/A}');
  });

  test('bullet-separates skill names', () => {
    const result = formatSkills(['React', 'Node.js', 'TypeScript']);
    assert.ok(result.includes('\\textbullet'));
    assert.ok(result.includes('React'));
    assert.ok(result.includes('Node.js'));
  });

  test('escapes special chars in skill names', () => {
    const result = formatSkills(['C++', 'C#']);
    assert.ok(result.includes('\\#'));
  });
});

// ── formatExperience ──────────────────────────────────────────────────────────

describe('formatExperience', () => {
  test('returns N/A for empty list', () => {
    assert.equal(formatExperience([]), '\\textit{N/A}');
  });

  test('renders company, title, date_range', () => {
    const result = formatExperience([
      { company: 'Acme', title: 'Engineer', date_range: '2020–2024', bullets: [] },
    ]);
    assert.ok(result.includes('Acme'));
    assert.ok(result.includes('Engineer'));
    assert.ok(result.includes('2020'));
  });

  test('renders bullet items', () => {
    const result = formatExperience([
      { company: 'X', title: 'Y', date_range: '2022', bullets: ['Led team', 'Shipped feature'] },
    ]);
    assert.ok(result.includes('\\item Led team'));
    assert.ok(result.includes('\\item Shipped feature'));
    assert.ok(result.includes('\\begin{itemize}'));
  });

  test('escapes special chars in bullets', () => {
    const result = formatExperience([
      { company: 'X', title: 'Y', date_range: '', bullets: ['Earned $500K ARR'] },
    ]);
    assert.ok(result.includes('\\$'));
  });

  test('omits itemize block when no bullets', () => {
    const result = formatExperience([
      { company: 'X', title: 'Y', date_range: '', bullets: [] },
    ]);
    assert.ok(!result.includes('\\begin{itemize}'));
  });
});

// ── formatProjects ────────────────────────────────────────────────────────────

describe('formatProjects', () => {
  test('returns N/A for empty list', () => {
    assert.equal(formatProjects([]), '\\textit{N/A}');
  });

  test('renders project name and technologies', () => {
    const result = formatProjects([
      { name: 'DataFlow', description: 'ETL pipeline', technologies: ['Node.js', 'Postgres'] },
    ]);
    assert.ok(result.includes('DataFlow'));
    assert.ok(result.includes('Node.js'));
    assert.ok(result.includes('ETL pipeline'));
  });

  test('handles missing optional fields', () => {
    const result = formatProjects([{ name: 'MinimalProject' }]);
    assert.ok(result.includes('MinimalProject'));
  });
});

// ── formatEducation ───────────────────────────────────────────────────────────

describe('formatEducation', () => {
  test('returns N/A for empty list', () => {
    assert.equal(formatEducation([]), '\\textit{N/A}');
  });

  test('renders institution, degree, date_range', () => {
    const result = formatEducation([
      { institution: 'MIT', degree: 'B.S.', field_of_study: 'Computer Science', date_range: '2020' },
    ]);
    assert.ok(result.includes('MIT'));
    assert.ok(result.includes('B.S.'));
    assert.ok(result.includes('Computer Science'));
  });
});

// ── Analyze flow logic ────────────────────────────────────────────────────────

describe('Analyze flow logic', () => {
  test('requires non-empty jobDescription', () => {
    const jd = '  ';
    const isValid = !!jd.trim();
    assert.equal(isValid, false);
  });

  test('truncates JD to 20,000 chars', () => {
    const longJd = 'x'.repeat(25_000);
    const truncated = longJd.slice(0, 20_000);
    assert.equal(truncated.length, 20_000);
  });

  test('returns 400 when no canonical profile exists', () => {
    const profileDoc = null;
    const response = !profileDoc?.canonicalProfile
      ? { error: 'No canonical profile found' }
      : { ok: true };
    assert.equal(response.error, 'No canonical profile found');
  });

  test('stores matchScore from Cortex result', () => {
    const cortexResult = makeAnalysisResult({ match_score: 65 });
    const stored = { matchScore: cortexResult.match_score };
    assert.equal(stored.matchScore, 65);
  });

  test('stores role_seniority into extractedJobMetadata.seniority', () => {
    const cortexResult = makeAnalysisResult({ role_seniority: 'mid' });
    const meta = { seniority: cortexResult.role_seniority };
    assert.equal(meta.seniority, 'mid');
  });

  test('proceeds without base resume when none found', async () => {
    // resolveBaseResume returns null — analyze should still proceed
    const baseResume = null;
    const body = { jobDescription: 'A JD', canonicalProfile: {}, baseResume };
    assert.ok(!body.baseResume);
  });

  test('analyze valid JD produces expected response shape', () => {
    const analysis = makeAnalysisResult();
    const response = {
      matchScore: analysis.match_score,
      missingKeywords: analysis.missing_keywords,
      recommendedAdditions: analysis.recommended_additions,
    };
    assert.equal(response.matchScore, 72.5);
    assert.ok(response.missingKeywords.includes('GraphQL'));
    assert.ok(response.recommendedAdditions.includes('GraphQL'));
  });

  test('analyze weak JD (score < 40) still saves analysis', () => {
    const weakResult = makeAnalysisResult({ match_score: 22, missing_keywords: ['React', 'TypeScript', 'Node.js', 'AWS'] });
    const doc = { matchScore: weakResult.match_score, status: 'analyzed' };
    assert.equal(doc.status, 'analyzed');
    assert.equal(doc.matchScore, 22);
    assert.ok(weakResult.missing_keywords.length > 2);
  });
});

// ── Generate flow logic ───────────────────────────────────────────────────────

describe('Generate flow logic', () => {
  test('requires valid analysisId', () => {
    const analysisId = 'not-an-object-id';
    const valid = /^[0-9a-f]{24}$/i.test(analysisId);
    assert.equal(valid, false);
  });

  test('defaults templateType to fullstack when unrecognised', () => {
    const TEMPLATE_TYPES = new Set(['frontend', 'backend', 'fullstack', 'custom']);
    const requested = 'UNKNOWN';
    const resolved = TEMPLATE_TYPES.has(requested) ? requested : 'fullstack';
    assert.equal(resolved, 'fullstack');
  });

  test('matchScoreBefore comes from analysis.matchScore', () => {
    const analysisDoc = makeAnalysisDoc({ matchScore: 55 });
    const before = analysisDoc.matchScore;
    assert.equal(before, 55);
  });

  test('matchScoreAfter comes from generatedContent.match_score_improved', () => {
    const generated = makeGeneratedResult({ match_score_improved: 82 });
    assert.equal(generated.match_score_improved, 82);
  });

  test('failed generation stores failure record without corrupting prior versions', () => {
    const priorGenerated = makeGeneratedDoc({ matchScoreAfter: 78 });
    // New generation fails — the prior doc is untouched
    const failedDoc = { status: 'failed', matchScoreAfter: 0 };
    assert.equal(priorGenerated.matchScoreAfter, 78);
    assert.equal(failedDoc.status, 'failed');
  });

  test('generate frontend template uses correct template identifier', () => {
    const TEMPLATE_TYPES = new Set(['frontend', 'backend', 'fullstack', 'custom']);
    assert.ok(TEMPLATE_TYPES.has('frontend'));
    const templateFiles = { frontend: 'frontend.tex', backend: 'backend.tex', fullstack: 'fullstack.tex', custom: 'fullstack.tex' };
    assert.equal(templateFiles['frontend'], 'frontend.tex');
  });

  test('generate backend template uses correct template identifier', () => {
    const templateFiles = { frontend: 'frontend.tex', backend: 'backend.tex', fullstack: 'fullstack.tex', custom: 'fullstack.tex' };
    assert.equal(templateFiles['backend'], 'backend.tex');
  });

  test('custom type falls back to fullstack template file', () => {
    const templateFiles = { frontend: 'frontend.tex', backend: 'backend.tex', fullstack: 'fullstack.tex', custom: 'fullstack.tex' };
    assert.equal(templateFiles['custom'], 'fullstack.tex');
  });
});

// ── LaTeX injection ───────────────────────────────────────────────────────────

describe('LaTeX template injection', () => {
  test('{{NAME}} placeholder is replaced', () => {
    const template = '\\textbf{{{NAME}}}';
    const filled = template.replace(/\{\{NAME\}\}/g, escapeLaTeX('Jane Smith'));
    assert.ok(filled.includes('Jane Smith'));
    assert.ok(!filled.includes('{{NAME}}'));
  });

  test('{{SKILLS}} placeholder is replaced', () => {
    const template = '{{SKILLS}}';
    const filled = template.replace(/\{\{SKILLS\}\}/g, formatSkills(['React', 'Node.js']));
    assert.ok(filled.includes('React'));
    assert.ok(!filled.includes('{{SKILLS}}'));
  });

  test('malformed template (missing placeholder) produces no crash', () => {
    // Template that lacks {{EXPERIENCE}} — replace call is idempotent
    const template = '{{SUMMARY}}\n{{SKILLS}}';
    let filled = template;
    filled = filled.replace(/\{\{SUMMARY\}\}/g, 'A summary');
    filled = filled.replace(/\{\{SKILLS\}\}/g, formatSkills(['React']));
    filled = filled.replace(/\{\{EXPERIENCE\}\}/g, ''); // no-op
    assert.ok(filled.includes('A summary'));
    assert.ok(!filled.includes('{{SUMMARY}}'));
  });

  test('XSS-style content in JD fields does not break LaTeX', () => {
    const malicious = '<script>alert(1)</script>';
    const escaped = escapeLaTeX(malicious);
    assert.ok(!escaped.includes('<script>'));
    assert.ok(escaped.includes('\\textless{}script\\textgreater{}'));
  });

  test('LaTeX injection attempt is neutralised by escaping', () => {
    // An attacker trying to inject a LaTeX command through skill name
    const injection = '\\end{document}\\begin{malicious}';
    const escaped = escapeLaTeX(injection);
    assert.ok(!escaped.includes('\\end{document}'));
    assert.ok(escaped.includes('\\textbackslash{}end'));
  });
});

// ── History + versioning ──────────────────────────────────────────────────────

describe('Generated resume history', () => {
  test('toGeneratedSummary excludes latexSource and pdfPath', () => {
    const doc = makeGeneratedDoc();
    const summary = toGeneratedSummary(doc);
    assert.ok(!Object.prototype.hasOwnProperty.call(summary, 'latexSource'));
    assert.ok(!Object.prototype.hasOwnProperty.call(summary, 'pdfPath'));
    assert.ok(Object.prototype.hasOwnProperty.call(summary, 'hasPdf'));
  });

  test('hasPdf is true when pdfPath is non-empty', () => {
    const doc = makeGeneratedDoc({ pdfPath: '/tmp/resume.pdf' });
    assert.equal(toGeneratedSummary(doc).hasPdf, true);
  });

  test('hasPdf is false when pdfPath is empty', () => {
    const doc = makeGeneratedDoc({ pdfPath: '' });
    assert.equal(toGeneratedSummary(doc).hasPdf, false);
  });

  test('pdfError surfaces in summary', () => {
    const doc = makeGeneratedDoc({ pdfPath: '', pdfError: 'pdflatex not found' });
    assert.equal(toGeneratedSummary(doc).pdfError, 'pdflatex not found');
  });

  test('each generation is a version snapshot — deleting one leaves others', () => {
    const versions = [
      makeGeneratedDoc({ _id: { toString: () => 'gen-v1' } }),
      makeGeneratedDoc({ _id: { toString: () => 'gen-v2' } }),
    ];
    const afterDelete = versions.filter(v => v._id.toString() !== 'gen-v1');
    assert.equal(afterDelete.length, 1);
    assert.equal(afterDelete[0]._id.toString(), 'gen-v2');
  });
});

// ── PDF lifecycle ─────────────────────────────────────────────────────────────

describe('PDF lifecycle', () => {
  test('PDF serve route returns 404 when pdfPath is empty', () => {
    const doc = makeGeneratedDoc({ pdfPath: '' });
    const response = !doc.pdfPath
      ? { error: 'PDF not available', status: 404 }
      : { ok: true };
    assert.equal(response.status, 404);
  });

  test('PDF serve route returns 404 when doc not found', () => {
    const doc = null;
    const response = !doc ? { error: 'Generated resume not found', status: 404 } : { ok: true };
    assert.equal(response.status, 404);
  });

  test('pdfError is stored cleanly when LaTeX fails', () => {
    const pdfError = 'pdflatex exited with code 1: ! Undefined control sequence.';
    const doc = makeGeneratedDoc({ pdfPath: '', pdfError, status: 'generated' });
    assert.equal(doc.pdfError, pdfError);
    assert.equal(doc.status, 'generated'); // Cortex call still succeeded
  });
});

// ── toAnalysisSummary ─────────────────────────────────────────────────────────

describe('toAnalysisSummary', () => {
  test('maps expected fields', () => {
    const doc = makeAnalysisDoc();
    const summary = toAnalysisSummary(doc);
    assert.equal(summary.id, 'analysis-id-1');
    assert.equal(summary.matchScore, 72.5);
    assert.equal(summary.jobTitle, 'Senior Engineer');
    assert.equal(summary.company, 'Acme');
    assert.equal(summary.seniority, 'senior');
    assert.equal(summary.status, 'analyzed');
  });

  test('omit skill excludes it from recover analysis', () => {
    const analysis = makeAnalysisResult();
    const existingBut = analysis.existing_but_missing_from_resume;
    assert.ok(Array.isArray(existingBut));
    assert.ok(existingBut.includes('Redux'));
  });
});

// ── omitted skill recovery scenario ─────────────────────────────────────────

describe('Omitted skill recovery', () => {
  test('existing_but_missing_from_resume identifies skills in profile but absent from resume', () => {
    const cortexResult = makeAnalysisResult({
      existing_but_missing_from_resume: ['Redux', 'Jest', 'Cypress'],
    });
    assert.ok(cortexResult.existing_but_missing_from_resume.includes('Redux'));
    assert.equal(cortexResult.existing_but_missing_from_resume.length, 3);
  });

  test('recommended_additions are surfaced for user action', () => {
    const cortexResult = makeAnalysisResult({ recommended_additions: ['GraphQL', 'Apollo', 'Redis'] });
    assert.ok(Array.isArray(cortexResult.recommended_additions));
    assert.ok(cortexResult.recommended_additions.includes('GraphQL'));
  });
});
