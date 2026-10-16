// ============================================================
// tests/unit/parseAnalysis.test.ts
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  parseAnalysis,
  stripSentinel,
  extractComplexitySummary,
  cleanDuplicatedMath,
} from '../../src/shared/parseAnalysis';

const nonce = 'testnonceab12';

function makeResponse(sections: Record<string, string>, addSentinel = true): string {
  const lines: string[] = [];
  for (const [heading, content] of Object.entries(sections)) {
    lines.push(`## ${heading}`);
    lines.push(content);
    lines.push('');
  }
  if (addSentinel) {
    lines.push(`END-OF-ANALYSIS-${nonce}`);
  }
  return lines.join('\n');
}

describe('stripSentinel', () => {
  it('should strip the sentinel from the end', () => {
    const md = `Some text\nEND-OF-ANALYSIS-${nonce}`;
    expect(stripSentinel(md, nonce)).toBe('Some text');
  });

  it('should return unchanged text when sentinel not present', () => {
    const md = 'Some text without sentinel';
    expect(stripSentinel(md, nonce)).toBe('Some text without sentinel');
  });
});

describe('parseAnalysis', () => {
  it('should parse all six sections from well-formed output', () => {
    const md = makeResponse({
      'Approach': 'Uses a hash map.',
      'Time Complexity': 'O(n)',
      'Space Complexity': 'O(n)',
      'Correctness': 'No bugs found.',
      'Edge Cases': 'Handles empty array.',
      'Optimization Suggestions': 'Could use two pointers.',
    });

    const { sections, hasAllSections, formatDeviation } = parseAnalysis(md, nonce);
    expect(hasAllSections).toBe(true);
    expect(formatDeviation).toBe(false);
    expect(sections.approach).toBe('Uses a hash map.');
    expect(sections.timeComplexity).toBe('O(n)');
    expect(sections.spaceComplexity).toBe('O(n)');
    expect(sections.correctness).toBe('No bugs found.');
    expect(sections.edgeCases).toBe('Handles empty array.');
    expect(sections.optimizations).toBe('Could use two pointers.');
  });

  it('should detect missing sections', () => {
    const md = makeResponse({
      'Approach': 'Some approach.',
      'Time Complexity': 'O(n)',
    });
    const { hasAllSections, formatDeviation } = parseAnalysis(md, nonce);
    expect(hasAllSections).toBe(false);
    expect(formatDeviation).toBe(true);
  });

  it('should handle extra headings gracefully', () => {
    const md = `## Approach\nGood approach.\n\n## Extra Section\nIgnored.\n\n## Time Complexity\nO(n)\n\n## Space Complexity\nO(1)\n\n## Correctness\nOK\n\n## Edge Cases\nHandled\n\n## Optimization Suggestions\nNone\n\nEND-OF-ANALYSIS-${nonce}`;
    const { sections } = parseAnalysis(md, nonce);
    expect(sections.approach).toBeTruthy();
    expect(sections.timeComplexity).toBe('O(n)');
  });

  it('should handle code blocks containing ##', () => {
    const md = makeResponse({
      'Approach': '```python\n## This is a comment\npass\n```',
      'Time Complexity': 'O(n)',
      'Space Complexity': 'O(1)',
      'Correctness': 'OK',
      'Edge Cases': 'Handled',
      'Optimization Suggestions': 'None',
    });
    const { sections, hasAllSections } = parseAnalysis(md, nonce);
    // The ## inside code block should not break parsing
    expect(hasAllSections).toBe(true);
    expect(sections.approach).toContain('## This is a comment');
  });

  it('should strip sentinel before parsing', () => {
    const md = `## Approach\nContent.\nEND-OF-ANALYSIS-${nonce}`;
    const { sections } = parseAnalysis(md, nonce);
    expect(sections.approach).not.toContain('END-OF-ANALYSIS');
  });

  it('should return formatDeviation true when sections are missing', () => {
    const { formatDeviation } = parseAnalysis('No sections here', nonce);
    expect(formatDeviation).toBe(true);
  });
});

describe('extractComplexitySummary', () => {
  it('should extract time and space from sections', () => {
    const sections = {
      timeComplexity: 'The time complexity is O(n log n) due to sorting.',
      spaceComplexity: 'The auxiliary space is O(n) for the hash map.',
    };
    const summary = extractComplexitySummary(sections);
    expect(summary).toBe('Time: O(N log N) · Space: O(N)');
  });

  it('should return undefined when neither is available', () => {
    const summary = extractComplexitySummary({});
    expect(summary).toBeUndefined();
  });

  it('should handle only time complexity', () => {
    const summary = extractComplexitySummary({ timeComplexity: 'O(1)' });
    expect(summary).toBe('Time: O(1)');
  });
});

describe('cleanDuplicatedMath', () => {
  it('should clean triplicated Big-O notation', () => {
    expect(cleanDuplicatedMath('Average case: O(n)O(n)O(n)')).toBe('Average case: O(n)');
    expect(cleanDuplicatedMath('O(1)O(1)O(1) average time')).toBe('O(1) average time');
  });

  it('should clean mixed KaTeX exponent artifacts', () => {
    expect(cleanDuplicatedMath('O(n2)O(n^2)O(n2)')).toBe('O(n^2)');
  });

  it('should clean triplicated single-letter variables in math context', () => {
    expect(cleanDuplicatedMath('where nnn is the length of nums')).toBe('where n is the length of nums');
  });

  it('should clean duplicated arithmetic expressions', () => {
    expect(cleanDuplicatedMath('stores up to n-1n-1n-1 elements')).toBe('stores up to n-1 elements');
  });

  it('should clean duplicated time and space in single text', () => {
    const raw = 'The current approach is already optimal (O(n)O(n)O(n) time, O(n)O(n)O(n) space).';
    expect(cleanDuplicatedMath(raw)).toBe('The current approach is already optimal (O(n) time, O(n) space).');
  });
});

describe('parseStructuredAnalysis', () => {
  it('should parse JSON summary block when present', () => {
    const jsonBlock = JSON.stringify({
      verdict: 'optimal',
      headline: 'Congratulations! You achieved optimal time and space complexity.',
      currentApproach: 'Hash Table',
      suggestedApproach: 'Hash Table',
      keyIdea: 'Use a hash table to store visited numbers and their indices for O(1) lookups.',
      currentTimeComplexity: 'O(N)',
      suggestedTimeComplexity: 'O(N)',
      currentSpaceComplexity: 'O(N)',
      suggestedSpaceComplexity: 'O(N)',
      efficiencyComment: 'Perfect solution. You achieved the optimal time and space complexity.',
    });

    const md = `\`\`\`json:summary\n${jsonBlock}\n\`\`\`\n\n## Approach\nUses a hash table.\n\n## Time Complexity\nO(n)\n\n## Space Complexity\nO(n)\n\n## Correctness\nNo bugs.\n\n## Edge Cases\nHandles all.\n\n## Optimization Suggestions\nNone.\n\nEND-OF-ANALYSIS-${nonce}`;

    const { structured } = parseAnalysis(md, nonce);
    expect(structured.verdict).toBe('optimal');
    expect(structured.currentApproach).toBe('Hash Table');
    expect(structured.suggestedApproach).toBe('Hash Table');
    expect(structured.currentTimeComplexity).toBe('O(N)');
    expect(structured.suggestedTimeComplexity).toBe('O(N)');
    expect(structured.keyIdea).toContain('hash table');
  });

  it('should fallback to heuristics when JSON summary is missing', () => {
    const md = makeResponse({
      'Approach': 'The solution implements a Hash Table single-pass algorithm to find complements.',
      'Time Complexity': 'O(n) where n is the length of the array.',
      'Space Complexity': 'O(n) for the dictionary.',
      'Correctness': 'The solution is correct and passes all tests.',
      'Edge Cases': 'Handles empty lists and duplicates.',
      'Optimization Suggestions': 'The approach is already optimal.',
    });

    const { structured } = parseAnalysis(md, nonce);
    expect(structured.verdict).toBe('optimal');
    expect(structured.currentApproach).toBe('Hash Table');
    expect(structured.currentTimeComplexity).toBe('O(N)');
    expect(structured.currentSpaceComplexity).toBe('O(N)');
  });
});
