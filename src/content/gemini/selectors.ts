// ============================================================
// content/gemini/selectors.ts — ALL Gemini UI selectors
//
// Phase 0 spike findings (observed 2026-10-16 on gemini.google.com):
// - Prompt input: div[contenteditable="true"] inside rich-textarea, also p.ql-placeholder
// - Send button: button[aria-label="Send message"] or button[data-mat-icon-name="send"]
// - Stop button: button[aria-label="Stop response"] or button[aria-label="Stop generating"]
// - Response container: model-response or .response-container or [data-response-id]
// - New chat: a[href="/app"] or button[aria-label="New chat"]
// - Sign-in indicator: absence of the prompt box, redirect to accounts.google.com
//
// NOTE: All selectors are HYPOTHESES based on Phase 0 visual inspection.
// They are organized with fallbacks and include a health-check utility.
// When Gemini updates, update this file and the health-check will surface failures fast.
// ============================================================

export interface SelectorGroup {
  name: string;
  candidates: string[];
  verifiedDate: string;
  notes: string;
}

export const SELECTOR_GROUPS: Record<string, SelectorGroup> = {
  promptInput: {
    name: 'promptInput',
    candidates: [
      // Primary: contenteditable div inside rich-textarea (most stable semantic approach)
      'rich-textarea div[contenteditable="true"]',
      // Fallback 1: any contenteditable textbox role
      'div[role="textbox"][contenteditable="true"]',
      // Fallback 2: Quill editor pattern
      '.ql-editor[contenteditable="true"]',
      // Fallback 3: broad contenteditable
      'div[contenteditable="true"]',
    ],
    verifiedDate: '2026-10-16',
    notes: 'Gemini uses a rich-text contenteditable div, not a textarea. Insertion must use execCommand or DataTransfer.',
  },
  sendButton: {
    name: 'sendButton',
    candidates: [
      // Primary: aria-label "Send message"
      'button[aria-label="Send message"]',
      'button.send-button',
      '.send-button-container button',
      'button[aria-label*="send" i]',
      'button[aria-label*="submit" i]',
      'button[data-mat-icon-name="send"]',
      'button mat-icon[data-mat-icon-name="send"]',
      'button:has(mat-icon[data-mat-icon-name="send"])',
      'rich-textarea ~ * button',
      'div:has(> rich-textarea) button',
    ],
    verifiedDate: '2026-10-16',
    notes: 'Send button is disabled until input has content. Watch for aria-disabled or :disabled attribute.',
  },
  stopButton: {
    name: 'stopButton',
    candidates: [
      'button[aria-label="Stop response"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label*="stop" i]',
      // Fallback: mat-icon stop
      'button[data-mat-icon-name="stop"]',
    ],
    verifiedDate: '2026-10-16',
    notes: 'Stop button appears during generation and disappears when done.',
  },
  responseContainer: {
    name: 'responseContainer',
    candidates: [
      // Primary: model-response custom element
      'model-response',
      '.response-container',
      'message-content',
      '[data-response-id]',
      '.message-content',
      'div[class*="response-container"]',
      'div[class*="model-response"]',
      '.model-response-text',
    ],
    verifiedDate: '2026-10-16',
    notes: 'Each response is a separate element. Count them for baseline detection.',
  },
  responseMarkdownRoot: {
    name: 'responseMarkdownRoot',
    candidates: [
      // Primary: markdown-chunk inside model-response
      'model-response .markdown',
      // Fallback 1: message-content markdown
      '.message-content .markdown',
      // Fallback 2: response body text
      'model-response .model-response-text',
      // Fallback 3: any markdown div in last response
      '.markdown-main-panel',
    ],
    verifiedDate: '2026-10-16',
    notes: 'The actual rendered Markdown HTML is inside the response container.',
  },
  uiChrome: {
    name: 'uiChrome',
    candidates: [
      // Elements to REMOVE from response before extraction
      '.response-options',
      '.copy-button',
      '.message-actions',
      'thumbs-up',
      'thumbs-down',
      '[aria-label="Copy"]',
      '[aria-label="Show drafts"]',
      '.feedback-buttons',
    ],
    verifiedDate: '2026-10-16',
    notes: 'UI chrome elements inside the response container to strip before Markdown conversion.',
  },
  signInIndicator: {
    name: 'signInIndicator',
    candidates: [
      // Presence of sign-in button means user is NOT signed in
      'a[href*="ServiceLogin"]',
      'a[href*="InteractiveLogin"]',
      'button[aria-label*="Sign in" i]',
      'a[aria-label*="Sign in" i]',
      '.sign-in-button',
      'a.sign-in',
    ],
    verifiedDate: '2026-10-16',
    notes: 'If any of these exist, user is not authenticated. Do not use generic accounts.google.com which matches user profile links.',
  },
  consentInterstitial: {
    name: 'consentInterstitial',
    candidates: [
      '[data-p13n-type="CONSENT"]',
      'terms-of-service',
      '.terms-container',
    ],
    verifiedDate: '2026-10-16',
    notes: 'Terms/consent interstitials that block usage.',
  },
  errorMessage: {
    name: 'errorMessage',
    candidates: [
      // Gemini "something went wrong" messages in the response area
      '.error-message',
      '[data-error-type]',
      // Rate limit / try again later messages
      'model-response [class*="error"]',
      '.response-error',
    ],
    verifiedDate: '2026-10-16',
    notes: 'Error messages that Gemini displays in the response area.',
  },
};

/**
 * Resolve a selector group — try candidates in order, return the first matching element.
 */
export function resolve(groupName: string, context: ParentNode = document): {
  element: Element | null;
  matchedSelector: string | null;
  groupName: string;
} {
  const group = SELECTOR_GROUPS[groupName];
  if (!group) {
    return { element: null, matchedSelector: null, groupName };
  }

  for (const sel of group.candidates) {
    try {
      const el = context.querySelector(sel);
      if (el) return { element: el, matchedSelector: sel, groupName };
    } catch {
      // Invalid selector — skip
    }
  }

  return { element: null, matchedSelector: null, groupName };
}

/**
 * Resolve all elements matching a group (for response containers, etc.)
 */
export function resolveAll(groupName: string, context: ParentNode = document): {
  elements: Element[];
  matchedSelector: string | null;
  groupName: string;
} {
  const group = SELECTOR_GROUPS[groupName];
  if (!group) {
    return { elements: [], matchedSelector: null, groupName };
  }

  for (const sel of group.candidates) {
    try {
      const els = Array.from(context.querySelectorAll(sel));
      if (els.length > 0) return { elements: els, matchedSelector: sel, groupName };
    } catch {
      // Invalid selector — skip
    }
  }

  return { elements: [], matchedSelector: null, groupName };
}

export interface SelectorHealthReport {
  ok: boolean;
  results: Array<{
    group: string;
    found: boolean;
    matchedSelector: string | null;
  }>;
  failedGroups: string[];
}

/**
 * Run a health check — test required selector groups and return a report.
 * Required groups: promptInput, sendButton, responseContainer.
 */
export function selectorHealthCheck(): SelectorHealthReport {
  // Only promptInput is strictly required before text is entered and sent.
  // sendButton is frequently hidden or disabled until text is in the input.
  // responseContainer only exists after Gemini has generated a response.
  const required = ['promptInput'];
  const allGroups = ['promptInput', 'sendButton', 'responseContainer'];
  const results = allGroups.map(group => {
    const { element, matchedSelector } = resolve(group);
    return { group, found: !!element, matchedSelector };
  });

  const failedGroups = results.filter(r => required.includes(r.group) && !r.found).map(r => r.group);

  return {
    ok: failedGroups.length === 0,
    results,
    failedGroups,
  };
}

/**
 * Get a trimmed DOM outline for diagnostics.
 */
export function getDomOutline(maxDepth = 3, maxChildren = 5): string {
  function outline(el: Element, depth: number): string {
    if (depth > maxDepth) return '';
    const tag = el.tagName.toLowerCase();
    const attrs: string[] = [];
    for (const attr of ['id', 'class', 'role', 'aria-label', 'contenteditable', 'data-mat-icon-name']) {
      const val = el.getAttribute(attr);
      if (val) attrs.push(`${attr}="${val.slice(0, 30)}"`);
    }
    const children = Array.from(el.children).slice(0, maxChildren);
    const childStr = children.map(c => outline(c, depth + 1)).filter(Boolean).join('');
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${childStr}</${tag}>`;
  }
  return outline(document.body, 0).slice(0, 2000);
}
