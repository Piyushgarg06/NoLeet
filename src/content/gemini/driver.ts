// ============================================================
// content/gemini/driver.ts — Main Gemini interaction driver
//
// Flow:
// 1. diagnosePage() — classify state (ready / not-signed-in / challenge / etc.)
// 2. selectorHealthCheck() — fail fast with SELECTORS_OUTDATED if input missing
// 3. Snapshot baselineResponseCount
// 4. insertText() — insert prompt with strategy from spike
// 5. Click send / Enter fallback
// 6. waitForCompletion() — complete detection with progress streaming
// 7. extractResponseMarkdown() — DOM → Markdown
// ============================================================
import { resolve, selectorHealthCheck, getDomOutline } from './selectors';
import { insertTextIntoContentEditable } from './insertText';
import { waitForCompletion, countResponseElements } from './completion';
import { extractResponseMarkdown } from './extractResponse';
import { debugLog } from '../../shared/config';
import type { GeminiDiagnosis } from '../../shared/types';

export class DriverError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly diagnostics?: unknown,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'DriverError';
  }
}

/**
 * Diagnose the current Gemini page state.
 */
export function diagnosePage(): GeminiDiagnosis {
  const url = window.location.href;

  // 1. If prompt input is already present, the user is signed in and ready!
  const { element: inputEl } = resolve('promptInput');
  if (inputEl) {
    return { status: 'ready' };
  }

  // 2. Redirected to Google sign-in
  if (url.includes('accounts.google.com') || url.includes('signin') || url.includes('ServiceLogin')) {
    return { status: 'not_signed_in', detail: `Redirected to: ${url}` };
  }

  // 3. Marketing/About page (shown to unauthenticated users)
  if (url.includes('gemini.google.com/about')) {
    return { status: 'not_signed_in', detail: 'On Gemini about page (not authenticated)' };
  }

  // 4. Check for explicit sign-in button or link
  const { element: signInBtn } = resolve('signInIndicator');
  if (signInBtn) {
    return { status: 'not_signed_in', detail: 'Sign-in button found on page' };
  }

  // 5. Check for consent/terms interstitial
  const { element: consentEl } = resolve('consentInterstitial');
  if (consentEl) {
    return { status: 'consent_interstitial', detail: 'Consent/terms interstitial detected' };
  }

  // 6. Check for challenge/CAPTCHA (look for unusual-traffic or captcha-related elements)
  const challengeIndicators = [
    document.querySelector('[data-p13n-type="CHALLENGE"]'),
    document.querySelector('iframe[src*="captcha"]'),
    document.querySelector('[aria-label*="captcha" i]'),
    document.querySelector('.captcha-container'),
  ];
  if (challengeIndicators.some(Boolean)) {
    return { status: 'challenge', detail: 'Challenge or CAPTCHA detected' };
  }

  // 7. Check if we're on a non-gemini page
  if (!url.includes('gemini.google.com')) {
    return { status: 'unavailable', detail: `Not on Gemini: ${url}` };
  }

  // 8. Page on Gemini is still loading its components (Angular/Lit initializing)
  return { status: 'unknown', detail: 'Waiting for Gemini prompt input to load...' };
}

/**
 * Main driver: insert prompt, send, wait, extract.
 */
export async function runAnalysis(
  prompt: string,
  nonce: string,
  signal: AbortSignal,
  onProgress: (chars: number, elapsedMs: number) => void
): Promise<{ markdown: string; incomplete: boolean; formatDeviation: boolean }> {
  // Step 1: Diagnose page
  const diagnosis = diagnosePage();
  debugLog('driver: diagnosis', diagnosis);

  if (diagnosis.status === 'not_signed_in') {
    throw new DriverError('GEMINI_NOT_SIGNED_IN', 'Not signed in to Gemini', diagnosis, true);
  }
  if (diagnosis.status === 'challenge') {
    throw new DriverError('GEMINI_CHALLENGE', 'CAPTCHA/challenge detected', diagnosis, false);
  }
  if (diagnosis.status === 'unavailable') {
    throw new DriverError('GEMINI_UNAVAILABLE', 'Gemini unavailable', diagnosis, true);
  }

  // Step 2: Selector health check
  const health = selectorHealthCheck();
  if (!health.ok) {
    throw new DriverError(
      'SELECTORS_OUTDATED',
      `Selectors outdated — failed groups: ${health.failedGroups.join(', ')}`,
      { health, domOutline: getDomOutline() },
      false
    );
  }

  checkSignal(signal);

  // Step 3: Snapshot baseline response count
  const baselineCount = countResponseElements();
  debugLog('driver: baseline response count', baselineCount);

  // Step 4: Find input and insert text
  const { element: inputEl } = resolve('promptInput');
  if (!inputEl || !(inputEl instanceof HTMLElement)) {
    throw new DriverError('INPUT_FAILED', 'Prompt input element not found', { health }, true);
  }

  debugLog('driver: inserting prompt, length', prompt.length);
  const insertResult = await insertTextIntoContentEditable(inputEl, prompt);
  debugLog('driver: insert result', insertResult);

  if (!insertResult.ok) {
    throw new DriverError(
      'INPUT_FAILED',
      `Prompt insertion failed (strategy: ${insertResult.strategy}): ${insertResult.warning}`,
      { insertResult },
      true
    );
  }

  // Wait a bit for the send button to enable
  await waitForSendEnabled(signal);
  checkSignal(signal);

  // Step 5: Click Send button (fallback: Enter key)
  await clickSend(signal);
  debugLog('driver: send clicked');

  // Step 6: Wait for completion
  checkSignal(signal);
  const completion = await waitForCompletion(baselineCount, nonce, signal, onProgress);
  debugLog('driver: completion result', { ...completion, text: `[${completion.text.length} chars]` });

  if (completion.error === 'GEMINI_ERROR_MESSAGE') {
    throw new DriverError('GEMINI_ERROR_MESSAGE', 'Gemini returned an error in the response', {}, true);
  }
  if (completion.error === 'RESPONSE_STALLED') {
    throw new DriverError('RESPONSE_STALLED', 'Response stalled mid-generation', {}, true);
  }

  // Step 7: Extract response markdown
  const markdown = extractResponseMarkdown(baselineCount, nonce);
  debugLog('driver: extracted markdown length', markdown.length);

  const formatDeviation = !markdown.includes('## Approach') || !markdown.includes('## Time Complexity');

  return {
    markdown,
    incomplete: completion.incomplete && !completion.hadSentinel,
    formatDeviation,
  };
}

/**
 * Wait briefly for the Send button to become enabled (up to 1,000ms max).
 */
async function waitForSendEnabled(signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 1000;
  const { element: inputEl } = resolve('promptInput');

  return new Promise<void>((resolve_fn, reject) => {
    const check = () => {
      if (signal.aborted) { reject(new DriverError('CANCELLED', 'Cancelled')); return; }

      const { element: btn } = resolve('sendButton');
      if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
        cleanup();
        resolve_fn();
        return;
      }

      // Re-trigger input event to wake up Angular form control if still idle
      if (inputEl instanceof HTMLElement) {
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
      }

      if (Date.now() > deadline) {
        cleanup();
        resolve_fn(); // Proceed to clickSend immediately
        return;
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, subtree: true, childList: true });
    const poll = setInterval(check, 80);
    const onAbort = () => { cleanup(); reject(new DriverError('CANCELLED', 'Cancelled')); };
    signal.addEventListener('abort', onAbort, { once: true });

    function cleanup() {
      observer.disconnect();
      clearInterval(poll);
      signal.removeEventListener('abort', onAbort);
    }

    check();
  });
}

/**
 * Click the Send button and dispatch Enter key events.
 */
async function clickSend(signal: AbortSignal): Promise<void> {
  checkSignal(signal);

  const { element: primarySendBtn } = resolve('sendButton');
  const { element: inputEl } = resolve('promptInput');

  debugLog('driver: clickSend executing, primarySendBtn found:', Boolean(primarySendBtn));

  let sendTriggered = false;

  // Gather all plausible send buttons on the page
  const candidateButtons: HTMLElement[] = [];
  if (primarySendBtn instanceof HTMLElement) {
    candidateButtons.push(primarySendBtn);
  }
  const additionalButtons = document.querySelectorAll(
    'button[aria-label*="Send" i], button[aria-label*="Submit" i], button.send-button, .send-button-container button, rich-textarea ~ * button, div:has(> rich-textarea) button'
  );
  additionalButtons.forEach(btn => {
    if (btn instanceof HTMLElement && !candidateButtons.includes(btn)) {
      candidateButtons.push(btn);
    }
  });

  // Attempt clicking candidates
  for (const btn of candidateButtons) {
    try {
      btn.removeAttribute('disabled');
      btn.setAttribute('aria-disabled', 'false');
      btn.classList.remove('disabled');

      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
      btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
      btn.click();
      sendTriggered = true;
      debugLog('driver: sendBtn clicked', btn);
    } catch (e) {
      debugLog('driver: sendBtn click threw', e);
    }
  }

  // Also dispatch Enter on inputEl and its inner <p> elements
  if (inputEl instanceof HTMLElement) {
    const targets = [inputEl.querySelector('p'), inputEl].filter((el): el is HTMLElement => el instanceof HTMLElement);
    for (const target of targets) {
      try {
        target.focus();
        const enterOpts = {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
        };
        target.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        target.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        target.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
        sendTriggered = true;
        debugLog('driver: Enter key dispatched on', target.tagName);
      } catch (e) {
        debugLog('driver: Enter key dispatch threw', e);
      }
    }
  }

  if (!sendTriggered) {
    throw new DriverError('SUBMIT_FAILED', 'Could not find Send button or input to send', {}, true);
  }
}

function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DriverError('CANCELLED', 'Cancelled');
  }
}
