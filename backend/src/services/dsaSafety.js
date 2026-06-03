'use strict';

/**
 * DSA submissions are analyzed as inert text only. This guard rejects code that
 * reaches outside ordinary algorithmic Java into process, filesystem, network,
 * reflection, native, or script-engine APIs before any LLM call is made.
 */

const UNSAFE_CODE_PATTERNS = [
  { label: 'process execution', pattern: /\bRuntime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(/i },
  { label: 'process execution', pattern: /\bnew\s+ProcessBuilder\s*\(/i },
  { label: 'process execution', pattern: /\bProcessBuilder\s*\([^)]*\)\s*\.\s*start\s*\(/i },
  { label: 'process termination', pattern: /\bSystem\s*\.\s*exit\s*\(/i },
  { label: 'file deletion or mutation', pattern: /\bFiles\s*\.\s*(delete|deleteIfExists|write|writeString|copy|move|createFile|createDirectory|createDirectories|setPosixFilePermissions)\s*\(/i },
  { label: 'network access', pattern: /\bjava\s*\.\s*net\s*\./i },
  { label: 'network access', pattern: /\b(Socket|ServerSocket|DatagramSocket|HttpURLConnection|URL)\s*\(/i },
  { label: 'reflection', pattern: /\bClass\s*\.\s*forName\s*\(/i },
  { label: 'reflection', pattern: /\b(getDeclaredMethod|getDeclaredField|setAccessible|MethodHandles)\s*\(/i },
  { label: 'native library loading', pattern: /\bSystem\s*\.\s*load(?:Library)?\s*\(/i },
  { label: 'native code', pattern: /\bnative\s+[\w<>\[\]]+\s+\w+\s*\(/i },
  { label: 'script execution', pattern: /\bjavax\s*\.\s*script\s*\./i },
  { label: 'script execution', pattern: /\bScriptEngineManager\s*\(/i },
  { label: 'dynamic execution', pattern: /\b(eval|exec|__import__)\s*\(/i },
  { label: 'Python process or filesystem access', pattern: /\b(os|subprocess|shutil|socket)\s*\./i },
];

function findUnsafeDsaCodeReason(code) {
  const source = String(code || '');
  if (!source.trim()) return null;

  const match = UNSAFE_CODE_PATTERNS.find(({ pattern }) => pattern.test(source));
  if (!match) return null;

  return `ReachFlow never executes pasted code. This submission contains ${match.label}, which is outside safe DSA analysis, so it was rejected before analysis.`;
}

module.exports = {
  findUnsafeDsaCodeReason,
};
