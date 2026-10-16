// ============================================================
// shared/limits.ts — Size limits and truncation
// ============================================================

export const LIMITS = {
  MAX_STATEMENT_CHARS: 12_000,
  MAX_CODE_CHARS: 20_000,
  TRUNCATION_MARKER: '\n\n[...content truncated due to length limit...]',
  GEMINI_ERROR_SNIPPET_MAX: 200,
} as const;

/**
 * Truncate statement text to the limit, appending a marker.
 * Code is NEVER truncated — caller should throw CODE_TOO_LARGE instead.
 */
export function truncateStatement(text: string): { text: string; truncated: boolean } {
  if (text.length <= LIMITS.MAX_STATEMENT_CHARS) {
    return { text, truncated: false };
  }
  const truncated = text.slice(0, LIMITS.MAX_STATEMENT_CHARS) + LIMITS.TRUNCATION_MARKER;
  return { text: truncated, truncated: true };
}

/**
 * Check if code exceeds the limit.
 */
export function isCodeTooLarge(code: string): boolean {
  return code.length > LIMITS.MAX_CODE_CHARS;
}

/**
 * Trim a snippet for diagnostics (never include full code/prompt).
 */
export function trimForDiagnostics(text: string, maxLen: number = LIMITS.GEMINI_ERROR_SNIPPET_MAX): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}
