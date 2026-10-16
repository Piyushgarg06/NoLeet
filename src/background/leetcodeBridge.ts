// ============================================================
// background/leetcodeBridge.ts — Extract from LeetCode tab
// ============================================================
import { CONFIG } from '../shared/config';
import type { LeetCodeEditorState, LeetCodeProblemContent } from '../shared/types';
import {
  extractEditorStateMainWorld,
  extractProblemContentIsolatedWorld,
  getLanguageLabel,
} from '../injected/leetcodeExtract';
import { truncateStatement, isCodeTooLarge } from '../shared/limits';

export class ExtractionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly diagnostics?: unknown
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Validate the tab URL matches a LeetCode problem page.
 * Returns the slug if valid, throws ExtractionError otherwise.
 */
export function validateLeetCodeUrl(url: string | undefined): string {
  if (!url) throw new ExtractionError('NOT_A_PROBLEM_PAGE', 'Tab has no URL');
  const match = CONFIG.LEETCODE_PROBLEMS_PATTERN.exec(url);
  if (!match) throw new ExtractionError('NOT_A_PROBLEM_PAGE', `Not a problem page: ${url}`);
  return match[1];
}

/**
 * Extract the editor state from the LeetCode tab using MAIN world injection.
 */
export async function extractEditorState(tabId: number): Promise<{
  editorState: LeetCodeEditorState;
  warning?: string;
}> {
  // Inject the self-contained function into MAIN world
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: extractEditorStateMainWorld,
  });

  const result = results[0]?.result;
  if (!result) {
    throw new ExtractionError('EDITOR_NOT_FOUND', 'executeScript returned no result');
  }

  if (!result.ok) {
    if (result.error === 'EDITOR_AMBIGUOUS') {
      throw new ExtractionError(
        'EDITOR_AMBIGUOUS',
        `Multiple editors found (${result.editorCount ?? '?'}) — cannot determine code editor`,
        { editorCount: result.editorCount }
      );
    }
    throw new ExtractionError('EDITOR_NOT_FOUND', result.error ?? 'Editor not found', {
      editorCount: result.editorCount,
      warning: result.warning,
    });
  }

  const code = result.code ?? '';

  // Check if whitespace-only
  if (!code.trim()) {
    throw new ExtractionError('EDITOR_EMPTY', 'Editor is empty or contains only whitespace');
  }

  // Check code size
  if (isCodeTooLarge(code)) {
    throw new ExtractionError(
      'CODE_TOO_LARGE',
      `Code exceeds ${20_000} character limit (${code.length} chars)`
    );
  }

  const languageId = result.languageId ?? 'unknown';
  const languageLabel = getLanguageLabel(languageId);

  return {
    editorState: { code, languageId, languageLabel },
    warning: result.warning,
  };
}

/**
 * Convert statement HTML to Markdown-like plain text.
 * Handles: examples, constraints, <pre>, <sup>, <code>, drops images/scripts/styles.
 * This is a best-effort extraction running in the background (not injected).
 */
export function htmlToStatementMarkdown(html: string): string {
  // Simple HTML-to-text conversion using browser DOM
  // Note: this runs in the service worker which doesn't have DOM access.
  // We use a regex-based approach for portability.

  let text = html;

  // Drop scripts and styles
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Handle images
  text = text.replace(/<img[^>]*>/gi, '[image omitted]');

  // Handle <sup> → ^
  text = text.replace(/<sup>([\s\S]*?)<\/sup>/gi, '^$1');

  // Handle <code> → backticks
  text = text.replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');

  // Handle <pre> blocks → fenced code blocks
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, content: string) => {
    // Strip tags inside pre
    const clean = content.replace(/<[^>]+>/g, '').trim();
    return '\n```\n' + clean + '\n```\n';
  });

  // Handle <strong> and <b>
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');

  // Handle <em> and <i>
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '_$1_');
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '_$1_');

  // Handle headings
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, content: string) => {
    const hashes = '#'.repeat(parseInt(level));
    return `\n${hashes} ${content.replace(/<[^>]+>/g, '')}\n`;
  });

  // Handle paragraphs and divs
  text = text.replace(/<\/(p|div|section|article|li|ul|ol)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Handle list items
  text = text.replace(/<li[^>]*>/gi, '- ');

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&le;/g, '≤')
    .replace(/&ge;/g, '≥')
    .replace(/&ne;/g, '≠')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(parseInt(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));

  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

/**
 * Extract problem content from the LeetCode tab.
 * Returns partial=true if statement could not be extracted.
 */
export async function extractProblemContent(tabId: number, expectedSlug: string): Promise<{
  problem: LeetCodeProblemContent;
  partial: boolean;
}> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: extractProblemContentIsolatedWorld,
  });

  const result = results[0]?.result;
  if (!result || !result.ok) {
    // Fallback: use slug
    return {
      problem: {
        slug: expectedSlug,
        title: expectedSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        statementMarkdown: '',
        statementTruncated: false,
      },
      partial: true,
    };
  }

  const statementHTML = result.statementHTML ?? '';
  let statementMarkdown = htmlToStatementMarkdown(statementHTML);

  const { text: truncated, truncated: didTruncate } = truncateStatement(statementMarkdown);
  statementMarkdown = truncated;

  return {
    problem: {
      slug: result.slug ?? expectedSlug,
      title: result.title ?? expectedSlug,
      difficulty: result.difficulty,
      statementMarkdown,
      statementTruncated: didTruncate,
    },
    partial: result.partial === true,
  };
}
