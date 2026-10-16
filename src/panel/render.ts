// ============================================================
// panel/render.ts — marked + DOMPurify rendering pipeline
// ============================================================
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Configure DOMPurify — safe profile
DOMPurify.addHook('afterSanitizeAttributes', node => {
  // Force all links to open in new tab safely
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Render Markdown to safe HTML.
 * - Converts Markdown → HTML with marked
 * - Sanitizes with DOMPurify (removes scripts, event handlers, javascript: URLs)
 */
export function renderMarkdown(markdown: string): string {
  const rawHtml = marked.parse(markdown) as string;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'strong', 'em', 'del', 's',
      'code', 'pre',
      'a',
      'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button'],
    FORBID_ATTR: [
      'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
      'onfocus', 'onblur', 'onchange', 'onsubmit', 'style',
    ],
    FORCE_BODY: false,
  });
}

/**
 * Set element's inner HTML safely (using DOMPurify).
 * Never use innerHTML directly on user-provided content.
 */
export function setSafeInnerHTML(el: Element, markdown: string): void {
  el.innerHTML = renderMarkdown(markdown);
  el.classList.add('markdown-body');
}
