// ============================================================
// tests/unit/limits.test.ts
// ============================================================
import { describe, it, expect } from 'vitest';
import { truncateStatement, isCodeTooLarge, trimForDiagnostics, LIMITS } from '../../src/shared/limits';

describe('truncateStatement', () => {
  it('should not truncate short text', () => {
    const { text, truncated } = truncateStatement('short text');
    expect(text).toBe('short text');
    expect(truncated).toBe(false);
  });

  it('should truncate long text with a marker', () => {
    const long = 'a'.repeat(LIMITS.MAX_STATEMENT_CHARS + 100);
    const { text, truncated } = truncateStatement(long);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(long.length);
    expect(text).toContain('[...content truncated');
  });

  it('should truncate at exactly the limit', () => {
    const atLimit = 'x'.repeat(LIMITS.MAX_STATEMENT_CHARS);
    const { truncated } = truncateStatement(atLimit);
    expect(truncated).toBe(false);
  });
});

describe('isCodeTooLarge', () => {
  it('should return false for short code', () => {
    expect(isCodeTooLarge('short code')).toBe(false);
  });

  it('should return true for code over the limit', () => {
    const large = 'x'.repeat(LIMITS.MAX_CODE_CHARS + 1);
    expect(isCodeTooLarge(large)).toBe(true);
  });

  it('should return false for code at exactly the limit', () => {
    const atLimit = 'x'.repeat(LIMITS.MAX_CODE_CHARS);
    expect(isCodeTooLarge(atLimit)).toBe(false);
  });
});

describe('trimForDiagnostics', () => {
  it('should not trim short text', () => {
    const result = trimForDiagnostics('short');
    expect(result).toBe('short');
  });

  it('should trim to 200 chars by default', () => {
    const long = 'a'.repeat(300);
    const result = trimForDiagnostics(long);
    expect(result.length).toBeLessThanOrEqual(201); // 200 + ellipsis
    expect(result).toContain('…');
  });

  it('should trim to custom length', () => {
    const result = trimForDiagnostics('hello world', 5);
    expect(result).toBe('hello…');
  });
});
