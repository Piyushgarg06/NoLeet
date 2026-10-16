import type { ParsedSections, StructuredAnalysis } from './types';

const SECTION_HEADINGS: Array<{ key: keyof ParsedSections; heading: string }> = [
  { key: 'approach', heading: '## Approach' },
  { key: 'timeComplexity', heading: '## Time Complexity' },
  { key: 'spaceComplexity', heading: '## Space Complexity' },
  { key: 'correctness', heading: '## Correctness' },
  { key: 'edgeCases', heading: '## Edge Cases' },
  { key: 'optimizations', heading: '## Optimization Suggestions' },
];

/**
 * Strip the sentinel line from the response.
 * Searches for "END-OF-ANALYSIS-<nonce>" at the end and removes it.
 */
export function stripSentinel(markdown: string, nonce: string): string {
  const sentinel = `END-OF-ANALYSIS-${nonce}`;
  const idx = markdown.lastIndexOf(sentinel);
  if (idx === -1) return markdown;
  return markdown.slice(0, idx).replace(/\s+$/, '');
}

/**
 * Clean residual duplicated/triplicated math artifacts from KaTeX rendering.
 * e.g. "O(n)O(n)O(n)" -> "O(n)", "nnn" -> "n", "O(n2)O(n^2)O(n2)" -> "O(n^2)"
 */
export function cleanDuplicatedMath(text: string): string {
  let cleaned = text;

  // 1. Clean Big-O duplicates: e.g. O(n)O(n)O(n) or O(1)O(1)O(1)
  cleaned = cleaned.replace(/(O\([^)]+\))\1+/g, '$1');

  // 2. Clean mixed KaTeX artifacts like O(n2)O(n^2)O(n2) -> O(n^2)
  cleaned = cleaned.replace(/O\([a-zA-Z0-9^]+\)O\(([^)]+)\)O\([a-zA-Z0-9^]+\)/g, 'O($1)');

  // 3. Clean variable triplication like "where nnn is the length" -> "where n is the length"
  cleaned = cleaned.replace(/\b([a-zA-Z])\1{2}\b/g, '$1');

  // 4. Clean duplicated arithmetic like "n-1n-1n-1" -> "n - 1", "n=2n = 2n=2" -> "n = 2"
  cleaned = cleaned.replace(/([a-zA-Z0-9]+(?:\s*[-+*=]\s*[a-zA-Z0-9]+)+)\s*\1+/g, '$1');

  return cleaned;
}

/**
 * Extract and clean JSON summary block from markdown if present.
 */
export function extractJsonSummaryBlock(text: string): { jsonStr: string | null; cleanedMarkdown: string } {
  const match = /```(?:json:summary|json)\s*([\s\S]*?)\s*```/i.exec(text);
  if (!match) {
    return { jsonStr: null, cleanedMarkdown: text };
  }
  const jsonStr = match[1].trim();
  const cleanedMarkdown = text.replace(match[0], '').trim();
  return { jsonStr, cleanedMarkdown };
}

/**
 * Normalize Big-O complexity string for clean UI display.
 */
export function normalizeComplexity(str?: string): string {
  if (!str) return 'O(N)';
  let cleaned = cleanDuplicatedMath(str.trim());
  const match = /O\([^)]+\)/i.exec(cleaned);
  if (match) {
    cleaned = match[0];
  }
  // Standardize capitalization inside O(...) e.g. O(n) -> O(N), O(logn) -> O(log N)
  cleaned = cleaned.replace(/O\((.*?)\)/i, (_, inner: string) => {
    let norm = inner.trim();
    norm = norm.replace(/\bn\b/g, 'N');
    norm = norm.replace(/\blog\s*n\b/gi, 'log N');
    norm = norm.replace(/\bn\s*\^\s*2\b|\bn2\b/gi, 'N²');
    norm = norm.replace(/\bn\s*log\s*n\b/gi, 'N log N');
    return `O(${norm})`;
  });
  return cleaned;
}

const APPROACH_PATTERNS = [
  { pattern: /\bhash\s*(?:table|map)\b/i, name: 'Hash Table' },
  { pattern: /\btwo\s*pointers?\b/i, name: 'Two Pointers' },
  { pattern: /\bsliding\s*window\b/i, name: 'Sliding Window' },
  { pattern: /\bbinary\s*search\b/i, name: 'Binary Search' },
  { pattern: /\bdynamic\s*programming\b|\bDP\b/i, name: 'Dynamic Programming' },
  { pattern: /\bdepth[\s-]first\s*search\b|\bDFS\b/i, name: 'DFS' },
  { pattern: /\bbreadth[\s-]first\s*search\b|\bBFS\b/i, name: 'BFS' },
  { pattern: /\bmonotonic\s*(?:stack|queue)\b/i, name: 'Monotonic Stack' },
  { pattern: /\bheap\b|\bpriority\s*queue\b/i, name: 'Heap / Priority Queue' },
  { pattern: /\btrie\b/i, name: 'Trie' },
  { pattern: /\bgreedy\b/i, name: 'Greedy' },
  { pattern: /\bbacktrack(?:ing)?\b/i, name: 'Backtracking' },
  { pattern: /\bprefix\s*sum\b/i, name: 'Prefix Sum' },
  { pattern: /\bbit\s*manipulation\b/i, name: 'Bit Manipulation' },
  { pattern: /\bdivide\s*and\s*conquer\b/i, name: 'Divide and Conquer' },
  { pattern: /\bbrute\s*force\b/i, name: 'Brute Force' },
  { pattern: /\bsort(?:ing)?\b/i, name: 'Sorting' },
  { pattern: /\bsimulation\b/i, name: 'Simulation' },
];

/**
 * Heuristically detect approach name from text.
 */
export function detectApproach(text?: string, fallback = 'Standard Algorithm'): string {
  if (!text) return fallback;
  for (const { pattern, name } of APPROACH_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  // Try taking first heading or short sentence
  const firstLine = text.split('\n')[0].replace(/^[#*\s-]+/, '').trim();
  if (firstLine && firstLine.length <= 30 && !firstLine.includes('.')) {
    return firstLine;
  }
  return fallback;
}

/**
 * Parse StructuredAnalysis from JSON summary block or fallback heuristics.
 */
export function parseStructuredAnalysis(
  rawJsonStr: string | null,
  sections: ParsedSections
): StructuredAnalysis {
  if (rawJsonStr) {
    try {
      const parsed = JSON.parse(rawJsonStr);
      if (typeof parsed === 'object' && parsed !== null) {
        const verdictRaw = String(parsed.verdict ?? '').toLowerCase();
        const verdict = ['optimal', 'good', 'suboptimal', 'buggy'].includes(verdictRaw)
          ? (verdictRaw as StructuredAnalysis['verdict'])
          : 'optimal';

        const currentTimeComplexity = normalizeComplexity(parsed.currentTimeComplexity || sections.timeComplexity);
        const suggestedTimeComplexity = normalizeComplexity(parsed.suggestedTimeComplexity || currentTimeComplexity);
        const currentSpaceComplexity = normalizeComplexity(parsed.currentSpaceComplexity || sections.spaceComplexity || 'O(1)');
        const suggestedSpaceComplexity = normalizeComplexity(parsed.suggestedSpaceComplexity || currentSpaceComplexity);

        const currentApproach = String(parsed.currentApproach || detectApproach(sections.approach));
        const suggestedApproach = String(parsed.suggestedApproach || currentApproach);

        const headline = String(parsed.headline || (
          verdict === 'optimal'
            ? "Congratulations! You achieved optimal time and space complexity."
            : "Analysis complete — review efficiency and edge cases below."
        ));

        const keyIdea = String(parsed.keyIdea || extractKeyIdea(sections.approach));
        const efficiencyComment = String(parsed.efficiencyComment || (
          verdict === 'optimal'
            ? 'Perfect solution. You achieved the optimal time and space complexity.'
            : 'Review suggested time and space optimizations.'
        ));

        let codeSnippet: StructuredAnalysis['codeSnippet'] = undefined;
        if (parsed.codeSnippet && typeof parsed.codeSnippet === 'object') {
          codeSnippet = {
            language: String(parsed.codeSnippet.language ?? 'python3'),
            code: String(parsed.codeSnippet.code ?? '').trim(),
          };
        } else {
          codeSnippet = extractCodeSnippet(sections.optimizations);
        }

        return {
          verdict,
          headline,
          currentApproach,
          suggestedApproach,
          keyIdea,
          currentTimeComplexity,
          suggestedTimeComplexity,
          currentSpaceComplexity,
          suggestedSpaceComplexity,
          efficiencyComment,
          codeSnippet,
        };
      }
    } catch {
      // Fallback below
    }
  }

  // --- Fallback heuristic extraction ---
  const currentTimeComplexity = normalizeComplexity(sections.timeComplexity);
  const currentSpaceComplexity = normalizeComplexity(sections.spaceComplexity || 'O(1)');
  const currentApproach = detectApproach(sections.approach);

  // Check optimizations for suggested approach and complexity
  const optText = sections.optimizations ?? '';
  const optComplexity = extractFirstComplexity(optText);
  const suggestedTimeComplexity = optComplexity ? normalizeComplexity(optComplexity) : currentTimeComplexity;
  const suggestedSpaceComplexity = currentSpaceComplexity;

  let suggestedApproach = currentApproach;
  for (const { pattern, name } of APPROACH_PATTERNS) {
    if (name !== currentApproach && pattern.test(optText)) {
      suggestedApproach = name;
      break;
    }
  }

  // Detect verdict
  const correctnessText = sections.correctness ?? '';
  const hasBugWords = /(?:bug|fails?|incorrect|error|off-by-one|fails on)\b/i.test(correctnessText);
  const hasClearNoBugs = /(?:no bugs? found|solution is correct|correctness:\s*correct|no logical bugs?)/i.test(correctnessText);

  let verdict: StructuredAnalysis['verdict'] = 'optimal';
  if (hasBugWords && !hasClearNoBugs) {
    verdict = 'buggy';
  } else if (suggestedTimeComplexity !== currentTimeComplexity || suggestedApproach !== currentApproach) {
    verdict = 'suboptimal';
  } else if (optText && !/(?:none|already optimal|perfect|no optimization)/i.test(optText)) {
    verdict = 'good';
  }

  let headline = "Congratulations! You achieved optimal time and space complexity.";
  if (verdict === 'buggy') {
    headline = "Potential bug or edge case issue identified in code.";
  } else if (verdict === 'suboptimal') {
    headline = "Working solution, but a more optimal approach exists.";
  } else if (verdict === 'good') {
    headline = "Solid solution! Passed with good efficiency.";
  }

  const keyIdea = extractKeyIdea(sections.approach);
  const efficiencyComment = verdict === 'optimal'
    ? 'Perfect solution. You achieved the optimal time and space complexity.'
    : (extractFirstSentence(optText) || 'Review suggested time and space optimizations.');

  const codeSnippet = extractCodeSnippet(sections.optimizations);

  return {
    verdict,
    headline,
    currentApproach,
    suggestedApproach,
    keyIdea,
    currentTimeComplexity,
    suggestedTimeComplexity,
    currentSpaceComplexity,
    suggestedSpaceComplexity,
    efficiencyComment,
    codeSnippet,
  };
}

function extractKeyIdea(approachText?: string): string {
  if (!approachText) return 'Single-pass approach with auxiliary data structures.';
  const cleaned = approachText
    .replace(/^##\s+.*$/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/[`*]/g, '')
    .trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(' ').trim() || 'Single-pass algorithm with efficient lookups.';
}

function extractFirstSentence(text?: string): string {
  if (!text) return '';
  const cleaned = text.replace(/^##\s+.*$/gm, '').replace(/^[-*]\s+/gm, '').replace(/[`*]/g, '').trim();
  const match = cleaned.match(/^([^.!?\n]+[.!?])/);
  return match ? match[1].trim() : cleaned.slice(0, 100).trim();
}

function extractCodeSnippet(text?: string): StructuredAnalysis['codeSnippet'] {
  if (!text) return undefined;
  const match = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/.exec(text);
  if (match && match[2].trim()) {
    return {
      language: match[1] || 'code',
      code: match[2].trim(),
    };
  }
  return undefined;
}

/**
 * Parse the Gemini response Markdown into named sections and structured card data.
 */
export function parseAnalysis(
  markdown: string,
  nonce: string
): {
  sections: ParsedSections;
  structured: StructuredAnalysis;
  hasAllSections: boolean;
  formatDeviation: boolean;
} {
  const stripped = cleanDuplicatedMath(stripSentinel(markdown, nonce).trim());
  const { jsonStr, cleanedMarkdown } = extractJsonSummaryBlock(stripped);

  const sections: ParsedSections = {};

  // Find positions of each heading
  type HeadingMatch = { key: keyof ParsedSections; start: number };
  const matches: HeadingMatch[] = [];

  for (const { key, heading } of SECTION_HEADINGS) {
    const re = new RegExp(`^${escapeRegex(heading)}\\s*$`, 'mi');
    const match = re.exec(cleanedMarkdown);
    if (match && match.index !== undefined) {
      matches.push({ key, start: match.index });
    }
  }

  // Sort by position in the document
  matches.sort((a, b) => a.start - b.start);

  // Extract content for each found section
  for (let i = 0; i < matches.length; i++) {
    const { key, start } = matches[i];
    const headingLine = cleanedMarkdown.indexOf('\n', start);
    const contentStart = headingLine === -1 ? cleanedMarkdown.length : headingLine + 1;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].start : cleanedMarkdown.length;
    const rawContent = cleanedMarkdown.slice(contentStart, contentEnd).trim();
    sections[key] = cleanDuplicatedMath(rawContent);
  }

  const hasAllSections = SECTION_HEADINGS.every(({ key }) => sections[key] !== undefined);
  const formatDeviation = !hasAllSections || matches.length < SECTION_HEADINGS.length;

  const structured = parseStructuredAnalysis(jsonStr, sections);

  return { sections, structured, hasAllSections, formatDeviation };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Heuristically extract a one-line summary from the time/space complexity sections.
 */
export function extractComplexitySummary(sections: ParsedSections): string | undefined {
  const time = extractFirstComplexity(sections.timeComplexity ?? '');
  const space = extractFirstComplexity(sections.spaceComplexity ?? '');
  if (!time && !space) return undefined;
  const parts: string[] = [];
  if (time) parts.push(`Time: ${normalizeComplexity(time)}`);
  if (space) parts.push(`Space: ${normalizeComplexity(space)}`);
  return parts.join(' · ');
}

function extractFirstComplexity(text: string): string | undefined {
  const match = /O\([^)]+\)/.exec(text);
  return match ? match[0] : undefined;
}

