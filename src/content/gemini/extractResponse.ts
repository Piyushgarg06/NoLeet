// ============================================================
// content/gemini/extractResponse.ts — DOM → Markdown conversion
//
// Converts the last response element's rendered HTML to clean Markdown.
// Uses Turndown for HTML→Markdown conversion.
// Strips UI chrome (copy buttons, feedback icons, etc.)
// Does NOT read outside the response element.
// ============================================================
import TurndownService from 'turndown';
import { resolveAll, SELECTOR_GROUPS } from './selectors';
import { cleanDuplicatedMath } from '../../shared/parseAnalysis';

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
 * Extract the response as clean Markdown from the last response element beyond baseline.
 *
 * @param baselineCount - number of response elements before the run
 * @param nonce - the nonce to use for sentinel stripping
 */
export function extractResponseMarkdown(baselineCount: number, nonce: string): string {
  const { elements } = resolveAll('responseContainer');

  // Get only elements beyond the baseline
  const newElements = elements.slice(baselineCount);
  if (newElements.length === 0) return '';

  // Take the last one
  const lastResponse = newElements[newElements.length - 1];

  // Remove UI chrome elements and deduplicate math before extraction
  const cloned = lastResponse.cloneNode(true) as Element;
  removeUiChrome(cloned);
  cleanMathElements(cloned);

  // Find the markdown root within the response
  const markdownRoot = findMarkdownRoot(cloned) ?? cloned;

  // Convert to Markdown
  const td = getTurndownService();
  let markdown = td.turndown(markdownRoot.innerHTML || markdownRoot.textContent || '');

  // Strip sentinel line
  const sentinel = `END-OF-ANALYSIS-${nonce}`;
  const sentinelIdx = markdown.lastIndexOf(sentinel);
  if (sentinelIdx !== -1) {
    markdown = markdown.slice(0, sentinelIdx).replace(/\s+$/, '');
  }

  // Clean any remaining duplicated math tokens
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
  const uiLabels = ['Copy', 'Share', 'Thumbs up', 'Thumbs down', 'Like', 'Dislike', 'More options'];
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
  const selectors = ['.markdown', '.model-response-text', '.markdown-main-panel', '.response-content'];
  for (const sel of selectors) {
    const found = el.querySelector(sel);
    if (found) return found;
  }
  return null;
}
