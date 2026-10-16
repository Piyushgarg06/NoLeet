// ============================================================
// content/gemini/extractResponse.ts — DOM → Markdown conversion
//
// Converts the last response element's rendered HTML to clean Markdown.
// Uses Turndown for HTML→Markdown conversion.
// Strips UI chrome (copy buttons, feedback icons, etc.)
// Does NOT read outside the response element.
// ============================================================
import TurndownService from 'turndown';
import { SELECTOR_GROUPS } from './selectors';
import { getResponseElements } from './completion';
import { cleanDuplicatedMath, stripSentinel } from '../../shared/parseAnalysis';
import { debugLog } from '../../shared/config';

let turndownService: TurndownService | null = null;

function getTurndownService(): TurndownService {
  if (turndownService) return turndownService;

  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  // Custom rule: preserve code blocks with language class
  td.addRule('fencedCodeBlock', {
    filter: (node: HTMLElement) => {
      return (
        node.nodeName === 'PRE' &&
        node.firstElementChild?.nodeName === 'CODE'
      );
    },
    replacement: (_content: string, node: HTMLElement) => {
      const codeEl = node.querySelector('code');
      if (!codeEl) return _content;

      // Extract language from class (e.g. "language-python")
      const cls = codeEl.className ?? '';
      const langMatch = /language-(\w+)/.exec(cls);
      const lang = langMatch ? langMatch[1] : '';

      const code = codeEl.textContent ?? '';
      return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    },
  });

  // Custom rule: inline code
  td.addRule('inlineCode', {
    filter: 'code',
    replacement: (content: string) => `\`${content}\``,
  });

  // Custom rule: KaTeX math elements (prevent nested DOM duplication)
  td.addRule('katexMath', {
    filter: (node: HTMLElement) => {
      return (
        node.classList?.contains('katex') ||
        node.classList?.contains('katex-display') ||
        node.nodeName === 'MATH'
      );
    },
    replacement: (_content: string, node: HTMLElement) => {
      const annotation = node.querySelector('annotation');
      if (annotation && annotation.textContent) {
        return annotation.textContent.trim();
      }
      const htmlPart = node.querySelector('.katex-html');
      if (htmlPart && htmlPart.textContent) {
        return htmlPart.textContent.trim();
      }
      return node.textContent?.trim() || '';
    },
  });

  turndownService = td;
  return td;
}

/**
 * Clean KaTeX and MathML duplicate structures before HTML→Markdown conversion.
 * KaTeX renders formulas in 3 layers: MathML with <annotation>, HTML visual spans, and screen-reader spans.
 * This function extracts the clean TeX string and replaces the .katex node with a single text node.
 */
function cleanMathElements(el: Element): void {
  // Process all .katex and .katex-display elements
  el.querySelectorAll('.katex, .katex-display').forEach(katexEl => {
    // 1. Try to extract raw TeX formula from annotation
    const annotation = katexEl.querySelector('annotation');
    const tex = annotation?.textContent?.trim();
    if (tex) {
      katexEl.replaceWith(document.createTextNode(tex));
      return;
    }

    // 2. Fallback: use visible HTML part only, remove mathml
    const htmlEl = katexEl.querySelector('.katex-html');
    if (htmlEl && htmlEl.textContent) {
      katexEl.replaceWith(document.createTextNode(htmlEl.textContent.trim()));
      return;
    }

    // 3. Last fallback: remove mathml and keep text
    katexEl.querySelectorAll('.katex-mathml').forEach(m => m.remove());
  });

  // Process standalone <math> tags
  el.querySelectorAll('math').forEach(mathEl => {
    const tex = mathEl.querySelector('annotation')?.textContent?.trim();
    if (tex) {
      mathEl.replaceWith(document.createTextNode(tex));
    }
  });

  // Remove MathJax previews
  el.querySelectorAll('.MathJax_Preview').forEach(m => m.remove());
}

/**
 * Extract the response as clean Markdown from the response element.
 *
 * @param responseEl - the exact element identified by completion detection
 * @param baselineCount - number of response elements before the run (fallback query)
 * @param nonce - the nonce to use for sentinel stripping
 * @param fallbackText - plain text snapshot captured during completion detection
 */
export function extractResponseMarkdown(
  responseEl: Element | null,
  baselineCount: number,
  nonce: string,
  fallbackText?: string
): string {
  // 1. Determine target element
  let target: Element | null = responseEl;
  if (!target) {
    const elements = getResponseElements();
    const newElements = elements.slice(baselineCount);
    target = newElements.length > 0 ? newElements[newElements.length - 1] : (elements.length > 0 ? elements[elements.length - 1] : null);
  }

  if (!target) {
    debugLog('extractResponse: no target element, using fallbackText');
    return cleanDuplicatedMath(stripSentinel(fallbackText || '', nonce).trim());
  }

  // 2. Clone and clean
  const cloned = target.cloneNode(true) as Element;
  removeUiChrome(cloned);
  cleanMathElements(cloned);

  // 3. Find markdown root
  const markdownRoot = findMarkdownRoot(cloned) ?? cloned;

  // 4. Convert HTML to Markdown via Turndown
  let markdown = '';
  try {
    const td = getTurndownService();
    const html = markdownRoot.innerHTML;
    if (html && html.trim().length > 0) {
      markdown = td.turndown(html);
    }
  } catch (e) {
    debugLog('extractResponse: turndown conversion threw, using text content fallback', e);
  }

  // 5. Fallback to raw text if Turndown produced empty or whitespace
  if (!markdown || markdown.trim().length === 0) {
    markdown = (markdownRoot.textContent || target.textContent || fallbackText || '').replace(/\r\n/g, '\n');
  }

  // 6. Strip sentinel line
  markdown = stripSentinel(markdown, nonce);

  // 7. If sentinel stripping or empty response left it blank, use fallbackText
  if (!markdown.trim() && fallbackText) {
    markdown = stripSentinel(fallbackText, nonce);
  }

  return cleanDuplicatedMath(markdown.trim());
}

/**
 * Remove UI chrome elements (copy buttons, feedback icons, etc.) from the cloned element.
 */
function removeUiChrome(el: Element): void {
  const chromeSelectors = SELECTOR_GROUPS['uiChrome']?.candidates ?? [];

  for (const sel of chromeSelectors) {
    try {
      el.querySelectorAll(sel).forEach(node => node.remove());
    } catch {
      // Invalid selector — skip
    }
  }

  // Also remove common UI elements by aria-label
  const uiLabels = ['Copy', 'Share', 'Thumbs up', 'Thumbs down', 'Like', 'Dislike', 'More options', 'Show drafts', 'Listen'];
  for (const label of uiLabels) {
    try {
      el.querySelectorAll(`[aria-label="${label}"]`).forEach(node => node.remove());
    } catch {
      // skip
    }
  }
}

/**
 * Find the markdown content root within a response element.
 */
function findMarkdownRoot(el: Element): Element | null {
  const selectors = [
    'message-content',
    '.message-content',
    '.markdown',
    '.model-response-text',
    '.markdown-main-panel',
    '.response-content',
  ];
  for (const sel of selectors) {
    const found = el.querySelector(sel);
    if (found) return found;
  }
  return null;
}
