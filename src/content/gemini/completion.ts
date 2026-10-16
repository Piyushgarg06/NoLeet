// ============================================================
// content/gemini/completion.ts — Response completion detection
//
// The response is complete ONLY when ALL hold:
// 1. Stop button is absent (or send button returned to idle state)
// 2. Response text unchanged for stability window (≥3s, measured by timestamps)
// 3. Response text ends with the sentinel line END-OF-ANALYSIS-<nonce>
//
// Hidden-tab note: MutationObserver fires even in hidden tabs.
// Timers may be throttled (≥1s) under heavy throttling.
// We use timestamps, not tick counts, for all timing.
// ============================================================
import { CONFIG } from '../../shared/config';
import { resolve, resolveAll } from './selectors';

export interface CompletionResult {
  complete: boolean;
  incomplete: boolean;
  text: string;
  hadSentinel: boolean;
  elapsedMs: number;
  error?: string;
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
      complete: false, incomplete: true, text: '', hadSentinel: false,
      elapsedMs: Date.now() - startTime, error: 'No new response appeared',
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
    if (signal.aborted) { resolve_fn(null); return; }

    const check = () => {
      const { elements } = resolveAll('responseContainer');
      if (elements.length > baselineCount) {
        cleanup();
        resolve_fn(elements[elements.length - 1]);
        return;
      }
      if (Date.now() > timeout || signal.aborted) {
        cleanup();
        resolve_fn(null);
        return;
      }
    };

    // MutationObserver for immediate detection
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });

    // Safety net polling (handles hidden-tab throttling)
    const pollInterval = setInterval(check, 300);

    const onAbort = () => { cleanup(); resolve_fn(null); };
    signal.addEventListener('abort', onAbort, { once: true });

    function cleanup() {
      observer.disconnect();
      clearInterval(pollInterval);
      signal.removeEventListener('abort', onAbort);
    }

    // Initial check
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
  let stopButtonGoneAt: number | null = null;
  let lastProgressReport = 0;

  return new Promise<CompletionResult>(resolve_fn => {
    if (signal.aborted) {
      resolve_fn(done(false, lastText, sentinel, startTime));
      return;
    }

    const check = () => {
      if (signal.aborted || Date.now() > generationDeadline) {
        cleanup();
        resolve_fn(done(false, lastText, sentinel, startTime));
        return;
      }

      const now = Date.now();
      const currentText = getResponseText(responseEl, sentinel);

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
      if (stopGone && !stopButtonGoneAt) {
        stopButtonGoneAt = now;
      }
      if (!stopGone) {
        stopButtonGoneAt = null;
      }

      // Check stability (text unchanged for stability window)
      const stable = now - lastChangeTime >= CONFIG.STABILITY_WINDOW_MS;
      if (stable && !stabilityReachedAt) {
        stabilityReachedAt = now;
      }

      // Check for Gemini error message
      const { element: errorEl } = resolve('errorMessage');
      if (errorEl && errorEl.closest('model-response, .response-container, [data-response-id]') === responseEl.closest('model-response, .response-container, [data-response-id]')) {
        cleanup();
        resolve_fn({
          complete: false, incomplete: true,
          text: currentText,
          hadSentinel: currentText.includes(sentinel),
          elapsedMs: now - startTime,
          error: 'GEMINI_ERROR_MESSAGE',
        });
        return;
      }

      // Fast Sentinel Detection:
      // The moment the sentinel arrives, Gemini has emitted its final line!
      if (currentText.includes(sentinel)) {
        cleanup();
        resolve_fn(done(true, currentText, sentinel, startTime));
        return;
      }

      // Fallback: stop button gone and text stable (handles missing sentinel)
      if (stopGone && stable) {
        cleanup();
        resolve_fn(done(true, lastText, sentinel, startTime));
        return;
      }

      // Stall detection: text unchanged for too long while stop button still present
      if (!stopGone && now - lastChangeTime > CONFIG.STALL_DETECTION_MS) {
        cleanup();
        resolve_fn({
          complete: false, incomplete: true,
          text: lastText, hadSentinel: false,
          elapsedMs: now - startTime,
          error: 'RESPONSE_STALLED',
        });
        return;
      }
    };

    // MutationObserver for immediate text changes
    const observer = new MutationObserver(check);
    observer.observe(responseEl, { childList: true, subtree: true, characterData: true });
    // Also observe for stop button changes
    observer.observe(document.body, { childList: true, subtree: false });

    // Safety-net polling (handles hidden tab timer throttling)
    const pollInterval = setInterval(check, 300);

    const onAbort = () => { cleanup(); resolve_fn(done(false, lastText, sentinel, startTime)); };
    signal.addEventListener('abort', onAbort, { once: true });

    function cleanup() {
      observer.disconnect();
      clearInterval(pollInterval);
      signal.removeEventListener('abort', onAbort);
    }

    // Initial check
    check();
  });
}

function done(complete: boolean, text: string, sentinel: string, startTime: number): CompletionResult {
  return {
    complete,
    incomplete: !complete,
    text,
    hadSentinel: text.includes(sentinel),
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Get the text from a response element (markdown root preferred).
 * Only looks WITHIN the provided element, never the whole page.
 */
function getResponseText(responseEl: Element, _sentinel: string): string {
  // Try markdown root inside the response
  const markdownSelectors = [
    '.markdown',
    '.model-response-text',
    '.markdown-main-panel',
    '.response-content',
  ];

  for (const sel of markdownSelectors) {
    const el = responseEl.querySelector(sel);
    if (el) return (el.textContent ?? '').replace(/\r\n/g, '\n');
  }

  // Fallback: full response element text
  return (responseEl.textContent ?? '').replace(/\r\n/g, '\n');
}

/**
 * Count current response elements for baseline.
 */
export function countResponseElements(): number {
  return resolveAll('responseContainer').elements.length;
}
