// Defensive regex helpers. The goal is to reject patterns and inputs that are
// susceptible to catastrophic backtracking before they reach the regex engine.
//
// JavaScript's RegExp runs synchronously on the main thread, so a truly bad
// pattern can freeze the Node event loop. We mitigate with three cheap checks:
//   1. Cap pattern length
//   2. Cap input length
//   3. Reject the most common ReDoS-friendly shapes (nested quantifiers)
//
// This is not a perfect ReDoS defence — for that we would need re2 or a worker
// with a hard timeout. It blocks the easy attacks while the heavier option
// stays a deferred follow-up.

export const MAX_PATTERN_LENGTH = 500;
export const MAX_REGEX_INPUT_LENGTH = 10_000;

// Detect nested quantifiers like `(a+)+`, `(a*)*`, `(a+)*`, `(a*)+`, `(.+)+$`, etc.
// These are the classic catastrophic-backtracking shapes.
const NESTED_QUANTIFIER_RE = /\([^)]*[+*][^)]*\)[+*]/;

export function validateRegexPattern(pattern: string): { ok: true } | { ok: false; error: string } {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, error: `Regex pattern exceeds ${MAX_PATTERN_LENGTH} characters` };
  }
  if (NESTED_QUANTIFIER_RE.test(pattern)) {
    return { ok: false, error: 'Regex pattern contains nested quantifiers (potential ReDoS)' };
  }
  return { ok: true };
}

export function runSafeRegex(
  pattern: string,
  flags: string,
  input: string,
  op: (re: RegExp, s: string) => string | boolean,
): { ok: true; value: string | boolean } | { ok: false } {
  if (input.length > MAX_REGEX_INPUT_LENGTH) return { ok: false };
  const patternCheck = validateRegexPattern(pattern);
  if (!patternCheck.ok) return { ok: false };
  try {
    const re = new RegExp(pattern, flags);
    return { ok: true, value: op(re, input) };
  } catch {
    return { ok: false };
  }
}
