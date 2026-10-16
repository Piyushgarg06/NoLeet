// ============================================================
// tests/unit/prompt.test.ts
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  buildPrompt,
  escapeSentinelCollision,
  neutralizeXmlTags,
  generateNonce,
} from '../../src/shared/prompt';

describe('generateNonce', () => {
  it('should produce 12 hex characters', () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[0-9a-f]{12}$/);
  });

  it('should produce unique nonces', () => {
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(nonces.size).toBe(100);
  });
});

describe('escapeSentinelCollision', () => {
  it('should not escape text without sentinel', () => {
    const result = escapeSentinelCollision('hello world');
    expect(result.escaped).toBe('hello world');
    expect(result.changed).toBe(false);
  });

  it('should escape sentinel prefix', () => {
    const result = escapeSentinelCollision('some END-OF-ANALYSIS-abc code');
    expect(result.escaped).toBe('some END-OF-ANALYSIS_abc code');
    expect(result.changed).toBe(true);
  });

  it('should escape multiple occurrences', () => {
    const result = escapeSentinelCollision('END-OF-ANALYSIS-a and END-OF-ANALYSIS-b');
    expect(result.escaped).toBe('END-OF-ANALYSIS_a and END-OF-ANALYSIS_b');
    expect(result.changed).toBe(true);
  });
});

describe('neutralizeXmlTags', () => {
  it('should not modify text without dangerous tags', () => {
    const result = neutralizeXmlTags('some code with <div> and </div>');
    expect(result.neutralized).toBe('some code with <div> and </div>');
    expect(result.changed).toBe(false);
  });

  it('should neutralize </code>', () => {
    const result = neutralizeXmlTags('var x = "</code>";');
    expect(result.neutralized).toBe('var x = "<\\/code>";');
    expect(result.changed).toBe(true);
  });

  it('should neutralize </problem>', () => {
    const result = neutralizeXmlTags('x = "</problem>"');
    expect(result.neutralized).toBe('x = "<\\/problem>"');
    expect(result.changed).toBe(true);
  });
});

describe('buildPrompt', () => {
  const base = {
    title: 'Two Sum',
    difficulty: 'Easy',
    statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    languageLabel: 'Python3',
    code: 'def twoSum(self, nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i',
    nonce: 'aabbccddeeff',
  };

  it('should include the sentinel at the end', () => {
    const { prompt, sentinel } = buildPrompt(base);
    expect(sentinel).toBe('END-OF-ANALYSIS-aabbccddeeff');
    expect(prompt.endsWith(sentinel)).toBe(true);
  });

  it('should include title and difficulty', () => {
    const { prompt } = buildPrompt(base);
    expect(prompt).toContain('title="Two Sum"');
    expect(prompt).toContain('difficulty="Easy"');
  });

  it('should use "unknown" when difficulty not provided', () => {
    const { prompt } = buildPrompt({ ...base, difficulty: undefined });
    expect(prompt).toContain('difficulty="unknown"');
  });

  it('should include the code verbatim', () => {
    const { prompt } = buildPrompt(base);
    expect(prompt).toContain(base.code);
  });

  it('should preserve Python indentation', () => {
    const pythonCode = '    if x:\n        for i in range(n):\n            pass\n';
    const { prompt } = buildPrompt({ ...base, code: pythonCode });
    expect(prompt).toContain('    if x:\n        for i in range(n):\n            pass');
  });

  it('should preserve blank lines', () => {
    const codeWithBlanks = 'def foo():\n\n    x = 1\n\n    return x';
    const { prompt } = buildPrompt({ ...base, code: codeWithBlanks });
    expect(prompt).toContain('def foo():\n\n    x = 1\n\n    return x');
  });

  it('should escape sentinel collision in code', () => {
    const codeWithSentinel = 'print("END-OF-ANALYSIS-fake")';
    const { prompt, sentinelCollisionEscaped } = buildPrompt({ ...base, code: codeWithSentinel });
    expect(sentinelCollisionEscaped).toBe(true);
    expect(prompt).toContain('END-OF-ANALYSIS_fake');
    expect(prompt).not.toContain('END-OF-ANALYSIS-fake');
  });

  it('should neutralize </code> in code', () => {
    const codeWithTag = 'print("</code>")';
    const { prompt, xmlTagsNeutralized } = buildPrompt({ ...base, code: codeWithTag });
    expect(xmlTagsNeutralized).toBe(true);
    expect(prompt).toContain('print("<\\/code>")');
    expect(prompt).not.toContain('print("</code>")');
  });

  it('should include all six section headings', () => {
    const { prompt } = buildPrompt(base);
    expect(prompt).toContain('## Approach');
    expect(prompt).toContain('## Time Complexity');
    expect(prompt).toContain('## Space Complexity');
    expect(prompt).toContain('## Correctness');
    expect(prompt).toContain('## Edge Cases');
    expect(prompt).toContain('## Optimization Suggestions');
  });

  it('should work with C++ code containing angle brackets', () => {
    const cppCode = 'vector<int> result = {1, 2, 3};\nmap<string, int> m;';
    const { prompt } = buildPrompt({ ...base, languageLabel: 'C++', code: cppCode });
    expect(prompt).toContain('vector<int>');
    expect(prompt).toContain('map<string, int>');
  });

  it('should work with code containing backticks', () => {
    const jsCode = 'const str = `template ${literal}`;';
    const { prompt } = buildPrompt({ ...base, languageLabel: 'JavaScript', code: jsCode });
    expect(prompt).toContain(jsCode);
  });

  it('should work with Unicode in code', () => {
    const unicodeCode = '# 解两数之和\ndef solve(nums): pass';
    const { prompt } = buildPrompt({ ...base, code: unicodeCode });
    expect(prompt).toContain('解两数之和');
  });
});
