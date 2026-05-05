'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');

// Use /tmp so Docker Desktop on macOS can bind-mount the directory.
// (os.tmpdir() returns /var/folders/... on macOS which Docker cannot see.)
const LATEX_TEMP_DIR = process.env.LATEX_TEMP_DIR || '/tmp/reachflow-latex';
// Default PDF output is ~/.reachflow/pdfs — outside the project directory.
// Override with PDF_OUTPUT_DIR for production (e.g. a mounted DO Volume).
const PDF_OUTPUT_DIR = process.env.PDF_OUTPUT_DIR || path.join(os.homedir(), '.reachflow', 'pdfs');
const COMPILE_TIMEOUT_MS = 30_000;
const DOCKER_COMPILE_TIMEOUT_MS = 120_000; // first run pulls the image
const DOCKER_LATEX_IMAGE = process.env.DOCKER_LATEX_IMAGE || 'blang/latex:ubuntu';

const TEMPLATE_DIR = path.join(__dirname, '../resume_templates');

// Template files for each type; 'custom' falls back to fullstack layout.
const TEMPLATE_FILES = {
  frontend: 'frontend.tex',
  backend: 'backend.tex',
  fullstack: 'fullstack.tex',
  custom: 'fullstack.tex',
};

// In-process template cache — templates are static; no need to re-read from disk.
const _templateCache = new Map();

function readTemplate(templateFile) {
  if (_templateCache.has(templateFile)) return _templateCache.get(templateFile);
  const src = fs.readFileSync(path.join(TEMPLATE_DIR, templateFile), 'utf8');
  _templateCache.set(templateFile, src);
  return src;
}

/**
 * Validate a populated LaTeX source string before compilation.
 * Returns an array of error strings; empty array means the source looks valid.
 */
function validateLatex(src) {
  const errors = [];
  if (!src.includes('\\begin{document}')) errors.push('missing \\begin{document}');
  if (!src.includes('\\end{document}')) errors.push('missing \\end{document}');
  const unresolved = src.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolved?.length) errors.push(`unresolved placeholders: ${[...new Set(unresolved)].join(', ')}`);
  if (src.length < 400) errors.push('suspiciously short — possible LLM truncation');
  return errors;
}

// ── LaTeX special character escaping ────────────────────────────────────────

// Single-pass replace — avoids double-escaping (e.g. {} in \textbackslash{}).
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

// ── Section formatters ───────────────────────────────────────────────────────

function formatSkills(skills) {
  if (!skills || !skills.length) return '\\textit{N/A}';
  const items = skills.map(s => escapeLaTeX(String(s || ''))).filter(Boolean);
  // Bullet-separated inline list, wraps naturally at line width.
  return items.join(' \\textbullet\\ ');
}

function formatExperience(experience) {
  if (!experience || !experience.length) return '\\textit{N/A}';
  return experience.map((job) => {
    const company = escapeLaTeX(job.company || '');
    const title = escapeLaTeX(job.title || '');
    const dateRange = escapeLaTeX(job.date_range || '');
    const location = job.location ? ` \\textbar\\ ${escapeLaTeX(job.location)}` : '';
    const bullets = Array.isArray(job.bullets) ? job.bullets.filter(Boolean) : [];

    let block = `\\textbf{${company}} \\hfill \\textit{${dateRange}}\\\\`;
    block += `\n\\textit{${title}}${location}\\\\[-2pt]`;

    if (bullets.length) {
      block += '\n\\begin{itemize}';
      for (const b of bullets) {
        block += `\n  \\item ${escapeLaTeX(String(b))}`;
      }
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
    const dateRange = proj.date_range ? ` \\hfill \\textit{${escapeLaTeX(proj.date_range)}}` : '';
    const url = proj.url ? ` --- \\href{${escapeLaTeX(proj.url)}}{link}` : '';

    let block = `\\textbf{${name}}${dateRange}\\\\`;
    if (techs) block += `\n\\textit{${techs}}${url}\\\\[-2pt]`;
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
    const gpa = edu.gpa ? ` \\textbar\\ GPA: ${escapeLaTeX(edu.gpa)}` : '';

    let line = `\\textbf{${institution}} \\hfill \\textit{${dateRange}}\\\\`;
    if (degree || field) {
      const degreeField = [degree, field].filter(Boolean).join(', ');
      line += `\n\\textit{${degreeField}}${gpa}`;
    }
    return line;
  }).join('\n\n\\medskip\n');
}

// ── Template injection ───────────────────────────────────────────────────────

/**
 * Load a .tex template and inject all content placeholders.
 * @param {object} opts
 * @param {string} opts.templateType    frontend | backend | fullstack | custom
 * @param {string} opts.name            Candidate display name (from User.displayName)
 * @param {string} [opts.contact]       Optional contact line (email / LinkedIn / location)
 * @param {object} opts.generated       Cortex /generate/document response
 * @param {object} opts.canonicalProfile  Canonical profile (used for education section)
 * @returns {string}  Populated LaTeX source
 */
function injectTemplate({ templateType, name, contact = '', generated, canonicalProfile }) {
  const templateFile = TEMPLATE_FILES[templateType] || TEMPLATE_FILES.fullstack;
  const source = readTemplate(templateFile);

  const filled = source
    .replace(/\{\{NAME\}\}/g, escapeLaTeX(name || 'Candidate'))
    .replace(/\{\{CONTACT\}\}/g, escapeLaTeX(contact))
    .replace(/\{\{SUMMARY\}\}/g, escapeLaTeX(generated.summary || ''))
    .replace(/\{\{SKILLS\}\}/g, formatSkills(generated.skills))
    .replace(/\{\{EXPERIENCE\}\}/g, formatExperience(generated.experience))
    .replace(/\{\{PROJECTS\}\}/g, formatProjects(generated.projects))
    .replace(/\{\{EDUCATION\}\}/g, formatEducation(canonicalProfile?.education));

  return filled;
}

// ── PDF compilation ──────────────────────────────────────────────────────────

/**
 * Compile a LaTeX source string to PDF.
 * Returns the absolute path to the output PDF on success.
 * Throws with a descriptive message on failure.
 * @param {object} opts
 * @param {string} opts.latexSource
 * @param {string} opts.userId      Used to partition the output directory.
 * @param {string} opts.outputName  Basename for the output file (no extension).
 */
async function compileToPdf({ latexSource, userId, outputName }) {
  const tmpId = crypto.randomBytes(8).toString('hex');
  const tmpDir = path.join(LATEX_TEMP_DIR, tmpId);
  const texFile = path.join(tmpDir, 'resume.tex');

  const userPdfDir = path.join(PDF_OUTPUT_DIR, String(userId));
  const finalPdf = path.join(userPdfDir, `${outputName}.pdf`);

  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(userPdfDir, { recursive: true });

  try {
    fs.writeFileSync(texFile, latexSource, 'utf8');

    await runPdflatex(tmpDir, texFile);

    const compiledPdf = path.join(tmpDir, 'resume.pdf');
    if (!fs.existsSync(compiledPdf)) {
      throw new Error('pdflatex exited cleanly but no PDF was produced');
    }

    fs.renameSync(compiledPdf, finalPdf);
    return finalPdf;
  } finally {
    // Always clean up the temp directory — even on failure.
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// Common TeX Live installation paths to try on macOS / Linux.
const TEX_EXTRA_PATHS = [
  '/Library/TeX/texbin',
  '/usr/local/texlive/2024/bin/universal-darwin',
  '/usr/local/texlive/2023/bin/universal-darwin',
  '/usr/local/texlive/2024/bin/x86_64-linux',
  '/usr/local/texlive/2023/bin/x86_64-linux',
  '/opt/homebrew/bin',
  '/usr/bin',
].join(':');

function extractLatexErrors(stdout, stderr) {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split('\n');
  const errorLines = lines.filter(l =>
    l.startsWith('!') || l.includes('Fatal error') || l.includes('Emergency stop') ||
    l.includes('Undefined control sequence') || l.includes('Missing')
  );
  if (errorLines.length > 0) return errorLines.slice(0, 5).join(' | ');
  // Fall back to last non-empty lines from stdout for diagnostics
  return lines.filter(Boolean).slice(-6).join(' | ');
}

function runPdflatex(workDir, texFile) {
  return new Promise((resolve, reject) => {
    const envPath = `${process.env.PATH || ''}:${TEX_EXTRA_PATHS}`;

    const proc = spawn('pdflatex', [
      '-interaction=nonstopmode',
      '-halt-on-error',
      `-output-directory=${workDir}`,
      texFile,
    ], {
      cwd: workDir,
      env: { ...process.env, PATH: envPath },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`pdflatex timed out after ${COMPILE_TIMEOUT_MS / 1000}s`));
    }, COMPILE_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const tail = extractLatexErrors(stdout, stderr);
        reject(new Error(`pdflatex exited with code ${code}${tail ? ': ' + tail : ''}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        // pdflatex not on PATH — try Docker fallback
        runPdflatexDocker(workDir, path.basename(texFile)).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

function runPdflatexDocker(workDir, texFilename) {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', [
      'run', '--rm',
      '--network=none',
      '-v', `${workDir}:/workspace`,
      '-w', '/workspace',
      DOCKER_LATEX_IMAGE,
      'pdflatex',
      '-interaction=nonstopmode',
      '-halt-on-error',
      texFilename,
    ], { cwd: workDir });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Docker pdflatex timed out after ${DOCKER_COMPILE_TIMEOUT_MS / 1000}s`));
    }, DOCKER_COMPILE_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const tail = extractLatexErrors(stdout, stderr);
        reject(new Error(`pdflatex exited with code ${code}${tail ? ': ' + tail : ''}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error(
          `pdflatex not found and Docker is not available. ` +
          `Install TeX Live (brew install --cask basictex) or Docker Desktop.`
        ));
      } else {
        reject(err);
      }
    });
  });
}

module.exports = { injectTemplate, compileToPdf, escapeLaTeX, validateLatex, TEMPLATE_FILES };
