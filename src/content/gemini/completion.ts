// ============================================================
// content/gemini/completion.ts — Response completion detection
//
// Detects when Gemini has finished generating its response:
// 1. Sentinel detection: response contains END-OF-ANALYSIS-<nonce>
// 2. Stability detection: stop button gone, text stable (≥1.5s), and text received
//
// Hidden-tab note: MutationObserver fires in hidden tabs.
// Timers use timestamps, not tick counts, for accuracy.
// ============================================================
import { CONFIG, debugLog } from '../../shared/config';
import { resolve } from './selectors';

export interface CompletionResult {
  complete: boolean;
  incomplete: boolean;
  text: string;
  hadSentinel: boolean;
  elapsedMs: number;
  error?: string;
  responseElement?: Element;
}

/**
 * Get all model/assistant response elements currently in the DOM.
 * Specifically excludes user queries so baseline count is always consistent.
 */
export function getResponseElements(): Element[] {
  // 1. Primary: model-response custom element
  const modelResponses = Array.from(document.querySelectorAll('model-response'));
  if (modelResponses.length > 0) {
    return modelResponses;
  }

  // 2. Class-based model responses
  const classResponses = Array.from(
    document.querySelectorAll('.model-response, [data-response-id], .response-container')
  );
  if (classResponses.length > 0) {
    return classResponses;
  }

  // 3. Any message-content that is NOT part of a user query
  const messageContents = Array.from(document.querySelectorAll('message-content, .message-content'))
    .filter(el => !el.closest('user-query, .user-query, [data-user-query]'));
  if (messageContents.length > 0) {
    return messageContents;
  }

  return [];
}

/**
 * Count current response elements for baseline.
 */
export function countResponseElements(): number {
  return getResponseElements().length;
}

/**
 * Get the text from a response element (message-content or markdown root preferred).
 */
export function getResponseText(responseEl: Element, _sentinel?: string): string {
  // Try inner message content or markdown container
  const contentEl = responseEl.querySelector(
    'message-content, .message-content, .markdown, .model-response-text, .response-content'
  );
  if (contentEl && contentEl.textContent && contentEl.textContent.trim().length > 0) {
    return contentEl.textContent.replace(/\r\n/g, '\n').trim();
  }

  // Fallback: full response element text
  return (responseEl.textContent ?? '').replace(/\r\n/g, '\n').trim();
}

/**
 * Wait for the Gemini response to complete.
 *
 * @param baselineCount - number of response elements before sending
 * @param nonce - the nonce to look for in the sentinel
 * @param signal - AbortSignal for cancellation
 * @param onProgress - callback for progress updates
 */
export async function waitForCompletion(
  baselineCount: number,
  nonce: string,
  signal: AbortSignal,
  onProgress: (chars: number, elapsedMs: number) => void
): Promise<CompletionResult> {
  const startTime = Date.now();
  const sentinel = `END-OF-ANALYSIS-${nonce}`;

  // First: wait for a new response element to appear (beyond baseline)
  const newResponse = await waitForNewResponse(baselineCount, signal, startTime);
  if (!newResponse) {
    return {
      complete: false,
      incomplete: true,
      text: '',
      hadSentinel: false,
      elapsedMs: Date.now() - startTime,
      error: 'No new response appeared',
    };
  }

  // Now wait for generation to complete
  return await waitForGenerationComplete(newResponse, sentinel, signal, startTime, onProgress);
}

/**
 * Wait for a new response element to appear beyond baseline.
 */
async function waitForNewResponse(
  baselineCount: number,
  signal: AbortSignal,
  startTime: number
): Promise<Element | null> {
  const timeout = startTime + CONFIG.FIRST_RESPONSE_TIMEOUT_MS;

  return new Promise<Element | null>(resolve_fn => {
    if (signal.aborted) {
      resolve_fn(null);
      return;
    }

    const check = () => {
      const elements = getResponseElements();

      // Case 1: Count increased beyond baseline
      if (elements.length > baselineCount) {
        cleanup();
        resolve_fn(elements[elements.length - 1]);
        return;
      }

      // Case 2: Stop button is active or text is already streaming into the last response element
      const { element: stopBtn } = resolve('stopButton');
      if (elements.length > 0) {
        const lastEl = elements[elements.length - 1];
        const text = getResponseText(lastEl);
        if (stopBtn || (text && text.trim().length > 0)) {
          cleanup();
          resolve_fn(lastEl);
          return;
        }
      }

      if (Date.now() > timeout || signal.aborted) {
        cleanup();
        resolve_fn(null);
        return;
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const pollInterval = setInterval(check, 200);

    const onAbort = () => {
      cleanup();
      resolve_fn(null);
    };
    signal.addEventListener('abort', onAbort, { once: true });

    function cleanup() {
      observer.disconnect();
      clearInterval(pollInterval);
      signal.removeEventListener('abort', onAbort);
    }

    check();
  });
}

/**
 * Wait for the response generation to complete by monitoring:
 * 1. Stop button gone
 * 2. Text stability
 * 3. Sentinel present
 */
async function waitForGenerationComplete(
  responseEl: Element,
  sentinel: string,
  signal: AbortSignal,
  startTime: number,
  onProgress: (chars: number, elapsedMs: number) => void
): Promise<CompletionResult> {
  const generationDeadline = startTime + CONFIG.GENERATION_TOTAL_TIMEOUT_MS;

  let lastText = '';
  let lastChangeTime = Date.now();
  let stabilityReachedAt: number | null = null;
  let lastProgressReport = 0;
  let hasReceivedAnyText = false;

  return new Promise<CompletionResult>(resolve_fn => {
    if (signal.aborted) {
      resolve_fn(done(false, lastText, sentinel, startTime, responseEl));
      return;
    }

    const check = () => {
      if (signal.aborted || Date.now() > generationDeadline) {
        cleanup();
        resolve_fn(done(false, lastText, sentinel, startTime, responseEl));
        return;
      }

      const now = Date.now();
      const currentText = getResponseText(responseEl, sentinel);

      if (currentText && currentText.trim().length > 0) {
        hasReceivedAnyText = true;
      }

      // Report progress
      if (now - lastProgressReport > CONFIG.PROGRESS_REPORT_INTERVAL_MS) {
        onProgress(currentText.length, now - startTime);
        lastProgressReport = now;
      }

      // Track text changes
      if (currentText !== lastText) {
        lastText = currentText;
        lastChangeTime = now;
        stabilityReachedAt = null;
      }

      // Check stop button
      const { element: stopBtn } = resolve('stopButton');
      const stopGone = !stopBtn;

      // Check stability (text unchanged for stability window: 1.5s)
      const stable = now - lastChangeTime >= CONFIG.STABILITY_WINDOW_MS;
      if (stable && !stabilityReachedAt) {
        stabilityReachedAt = now;
      }

      // Check for Gemini error message
      const { element: errorEl } = resolve('errorMessage');
      if (
        errorEl &&
        errorEl.closest('model-response, .response-container, [data-response-id]') ===
          responseEl.closest('model-response, .response-container, [data-response-id]')
      ) {
        cleanup();
        resolve_fn({
          complete: false,
          incomplete: true,
          text: currentText,
          hadSentinel: currentText.includes(sentinel),
          elapsedMs: now - startTime,
          error: 'GEMINI_ERROR_MESSAGE',
          responseElement: responseEl,
        });
        return;
      }

      // 1. Fast Sentinel Detection:
      // The moment the sentinel arrives, Gemini has emitted its final line!
      if (currentText.includes(sentinel)) {
        debugLog('completion: sentinel detected in output');
        cleanup();
        resolve_fn(done(true, currentText, sentinel, startTime, responseEl));
        return;
      }

      // 2. Natural completion:
      // Text was received, stop button is gone, and text has been stable for >=1.5s
      if (hasReceivedAnyText && stopGone && stable && lastText.trim().length > 20) {
        debugLog('completion: natural completion detected (stable text + stop button gone)');
        cleanup();
        resolve_fn(done(true, lastText, sentinel, startTime, responseEl));
        return;
      }

      // 3. Stall detection: text unchanged for too long while stop button still present
      if (!stopGone && now - lastChangeTime > CONFIG.STALL_DETECTION_MS) {
        cleanup();
        resolve_fn({
          complete: false,
          incomplete: true,
          text: lastText,
          hadSentinel: false,
          elapsedMs: now - startTime,
          error: 'RESPONSE_STALLED',
          responseElement: responseEl,
        });
        return;
      }
    };

    // MutationObserver for immediate text changes
    const observer = new MutationObserver(check);
    observer.observe(responseEl, { childList: true, subtree: true, characterData: true });
    observer.observe(document.body, { childList: true, subtree: true });

    // Safety-net polling
    const pollInterval = setInterval(check, 200);

    const onAbort = () => {
      cleanup();
      resolve_fn(done(false, lastText, sentinel, startTime, responseEl));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    function cleanup() {
      observer.disconnect();
      clearInterval(pollInterval);
      signal.removeEventListener('abort', onAbort);
    }

    check();
  });
}

function done(
  complete: boolean,
  text: string,
  sentinel: string,
  startTime: number,
  responseElement?: Element
): CompletionResult {
  return {
    complete,
    incomplete: !complete,
    text,
    hadSentinel: text.includes(sentinel),
    elapsedMs: Date.now() - startTime,
    responseElement,
  };
}
