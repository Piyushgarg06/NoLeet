// ============================================================
// tests/unit/errors.test.ts
// ============================================================
import { describe, it, expect } from 'vitest';
import { ERROR_DEFINITIONS, getErrorDef, isWarning } from '../../src/shared/errors';
import type { ErrorCode } from '../../src/shared/types';

const ALL_CODES: ErrorCode[] = [
  'NOT_A_PROBLEM_PAGE', 'EDITOR_NOT_FOUND', 'EDITOR_AMBIGUOUS', 'EDITOR_EMPTY',
  'PROBLEM_NOT_FOUND', 'EXTRACTION_PARTIAL', 'CODE_TOO_LARGE', 'GEMINI_NOT_SIGNED_IN',
  'GEMINI_CHALLENGE', 'GEMINI_UNAVAILABLE', 'GEMINI_TAB_LOST', 'GEMINI_RATE_LIMITED',
  'GEMINI_ERROR_MESSAGE', 'SELECTORS_OUTDATED', 'INPUT_FAILED', 'SUBMIT_FAILED',
  'RESPONSE_STALLED', 'RESPONSE_INCOMPLETE', 'FORMAT_DEVIATION', 'TIMEOUT',
  'CANCELLED', 'WORKER_RESTARTED', 'UNKNOWN',
];

describe('errors taxonomy', () => {
  it('should have definitions for all error codes', () => {
    for (const code of ALL_CODES) {
      expect(ERROR_DEFINITIONS[code], `Missing definition for ${code}`).toBeDefined();
    }
  });

  it('every error should have non-empty title and body', () => {
    for (const code of ALL_CODES) {
      const def = ERROR_DEFINITIONS[code];
      expect(def.title.length, `${code} missing title`).toBeGreaterThan(0);
      expect(def.body.length, `${code} missing body`).toBeGreaterThan(0);
    }
  });

  it('retryable field should be a boolean for all errors', () => {
    for (const code of ALL_CODES) {
      expect(typeof ERROR_DEFINITIONS[code].retryable, `${code} retryable type`).toBe('boolean');
    }
  });

  it('warnings should be non-retryable or warning-type', () => {
    const warnings: ErrorCode[] = ['EXTRACTION_PARTIAL', 'RESPONSE_INCOMPLETE', 'FORMAT_DEVIATION'];
    for (const code of warnings) {
      expect(isWarning(code), `${code} should be a warning`).toBe(true);
    }
  });

  it('getErrorDef should return UNKNOWN for an unknown code', () => {
    const def = getErrorDef('NOT_A_REAL_CODE' as ErrorCode);
    expect(def.code).toBe('UNKNOWN');
  });

  it('non-retryable errors should not be retried', () => {
    const nonRetryable: ErrorCode[] = ['NOT_A_PROBLEM_PAGE', 'GEMINI_CHALLENGE', 'EDITOR_EMPTY', 'CODE_TOO_LARGE', 'CANCELLED'];
    for (const code of nonRetryable) {
      expect(ERROR_DEFINITIONS[code].retryable, `${code} should not be retryable`).toBe(false);
    }
  });
});
