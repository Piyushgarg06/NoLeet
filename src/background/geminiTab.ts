// ============================================================
// background/geminiTab.ts — Gemini tab lifecycle management
//
// Rules:
// - Never activate the Gemini tab during a normal run (user stays on LeetCode)
// - Always start a fresh chat per run
// - Detect and report auth/challenge states
// - Handle tab closed/discarded mid-run
// ============================================================
import { CONFIG, debugLog } from '../shared/config';
import { makeGeminiPing } from '../shared/messages';
import type { GeminiDiagnosis } from '../shared/types';

export class GeminiTabError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly diagnostics?: unknown
  ) {
    super(message);
    this.name = 'GeminiTabError';
  }
}

/**
 * Close the Gemini tab to ensure memory is released and every future
 * analysis runs completely fresh from scratch.
 */
export async function closeGeminiTab(geminiTabId: number | undefined): Promise<void> {
  if (geminiTabId === undefined) return;
  try {
    await chrome.tabs.remove(geminiTabId);
    debugLog('geminiTab: closed tab', geminiTabId);
  } catch {
    // Tab might already be closed
  }
}

/**
 * Find an existing Gemini tab (by stored ID), or create a fresh dedicated one.
 * The tab is created inactive (active: false) in the same window as the LeetCode tab.
 * Does not hijack existing user tabs to prevent polluting user conversations or accumulating context.
 */
export async function findOrCreateGeminiTab(
  leetcodeWindowId: number,
  storedGeminiTabId: number | undefined
): Promise<number> {
  // Check if stored tab still exists and is on gemini.google.com
  if (storedGeminiTabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(storedGeminiTabId);
      if (tab && tab.url && new URL(tab.url).host === CONFIG.GEMINI_HOST) {
        debugLog('geminiTab: reusing tab', storedGeminiTabId);
        return storedGeminiTabId;
      }
    } catch {
      // Tab doesn't exist anymore
      debugLog('geminiTab: stored tab gone, creating fresh one');
    }
  }

  // Create a fresh dedicated inactive tab
  const newTab = await chrome.tabs.create({
    url: CONFIG.GEMINI_APP_URL,
    active: false,
    windowId: leetcodeWindowId,
  });

  if (!newTab.id) {
    throw new GeminiTabError('GEMINI_TAB_LOST', 'Failed to create Gemini tab');
  }

  debugLog('geminiTab: created fresh dedicated tab', newTab.id);
  return newTab.id;
}

/**
 * Navigate the Gemini tab to a fresh chat URL, or cleanly reset via DOM if already loaded.
 * Avoiding full page reload saves 15-20 seconds of cold Angular/Wasm re-hydration in background tabs.
 */
export async function navigateToFreshChat(geminiTabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(geminiTabId);
    if (tab && tab.url && new URL(tab.url).host === CONFIG.GEMINI_HOST && tab.status === 'complete') {
      debugLog('geminiTab: tab already open and loaded, resetting chat via DOM instead of full reload');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: geminiTabId },
          func: () => {
            const newChatBtn = document.querySelector(
              'a[href="/app"], button[aria-label="New chat"], [data-test-id="new-chat-button"], button[aria-label*="New chat" i]'
            );
            if (newChatBtn instanceof HTMLElement) {
              newChatBtn.click();
            }
          },
        });
      } catch {
        // ignore
      }
      return;
    }
  } catch {
    // Tab check threw, proceed with full navigation
  }

  debugLog('geminiTab: navigating to fresh chat', geminiTabId);
  await chrome.tabs.update(geminiTabId, { url: CONFIG.GEMINI_APP_URL });
  await waitForTabComplete(geminiTabId, CONFIG.GEMINI_TAB_LOAD_TIMEOUT_MS);
}

/**
 * Wait for a tab to reach status 'complete'.
 */
async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new GeminiTabError('TIMEOUT', `Gemini tab did not load within ${timeoutMs}ms`));
    }, timeoutMs);

    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    // Also check if already complete
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      } else {
        chrome.tabs.onUpdated.addListener(listener);
      }
    }).catch(e => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new GeminiTabError('GEMINI_TAB_LOST', `Tab not found: ${e}`));
    });
  });
}

/**
 * Ping the Gemini content script to check if it's ready and what the page diagnosis is.
 * Retries up to CONFIG.CONTENT_SCRIPT_PING_RETRIES times with a delay.
 */
export async function pingGeminiContentScript(
  geminiTabId: number
): Promise<GeminiDiagnosis> {
  const maxRetries = CONFIG.CONTENT_SCRIPT_PING_RETRIES;
  const intervalMs = CONFIG.CONTENT_SCRIPT_PING_INTERVAL_MS;
  const timeoutMs = CONFIG.CONTENT_SCRIPT_PING_TIMEOUT_MS;

  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  let lastDiagnosis: GeminiDiagnosis | undefined;

  for (let i = 0; i < maxRetries && Date.now() < deadline; i++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await chrome.tabs.sendMessage(geminiTabId, makeGeminiPing()) as any;
      if (response && response.type === 'GEMINI_PING_RESPONSE') {
        const diag = response.diagnosis as GeminiDiagnosis;
        lastDiagnosis = diag;
        if (diag.status === 'ready' || diag.status === 'not_signed_in' || diag.status === 'challenge' || diag.status === 'consent_interstitial') {
          return diag;
        }
        debugLog('geminiTab: page loading (status unknown), waiting...', i + 1);
      }
    } catch (e) {
      lastError = e;
      debugLog('geminiTab: ping failed, retry', i + 1, e);
    }

    if (i < maxRetries - 1) {
      await sleep(intervalMs);
    }
  }

  // If we can't reach the content script, try programmatic injection
  try {
    await chrome.scripting.executeScript({
      target: { tabId: geminiTabId },
      files: ['content/gemini/index.js'],
    });
    await sleep(500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await chrome.tabs.sendMessage(geminiTabId, makeGeminiPing()) as any;
    if (response && response.type === 'GEMINI_PING_RESPONSE') {
      return response.diagnosis as GeminiDiagnosis;
    }
  } catch (e) {
    debugLog('geminiTab: injection fallback failed', e);
  }

  if (lastDiagnosis) {
    return lastDiagnosis;
  }

  throw new GeminiTabError(
    'SELECTORS_OUTDATED',
    `Gemini content script unreachable after ${maxRetries} retries`,
    { lastError }
  );
}

/**
 * Activate the Gemini tab (only for user-triggered sign-in flow).
 * This is the ONLY place we intentionally activate the Gemini tab.
 */
export async function activateGeminiTabForSignIn(geminiTabId: number): Promise<void> {
  await chrome.tabs.update(geminiTabId, { active: true });
  await chrome.windows.update(
    (await chrome.tabs.get(geminiTabId)).windowId,
    { focused: true }
  );
}

/**
 * Injected into the Gemini tab (MAIN world) to prevent background tab throttling.
 * Chromium aggressively throttles timers, freezes requestAnimationFrame, and
 * pauses web app rendering when a tab is hidden/backgrounded.
 */
export function unthrottleGeminiTab(): void {
  try {
    // 1. Spoof visibilityState and hidden so Gemini's web client continues rendering
    Object.defineProperty(Document.prototype, 'visibilityState', {
      get: () => 'visible',
      configurable: true,
    });
    Object.defineProperty(Document.prototype, 'hidden', {
      get: () => false,
      configurable: true,
    });
    try {
      Document.prototype.hasFocus = () => true;
      document.hasFocus = () => true;
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('focus'));

    // 2. Audio keepalive to signal Chrome C++ that tab is active/audible
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001; // inaudible
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
      }
    } catch {
      // ignore
    }

    // 3. Unfreeze requestAnimationFrame using MessageChannel (immune to 1000ms timer throttling)
    // In background tabs, setTimeout/setInterval is clamped to 1000ms.
    // MessageChannel port messaging runs on the microtask/event queue without timer clamping.
    const rafCallbacks = new Set<FrameRequestCallback>();
    const channel = new MessageChannel();
    let isScheduling = false;

    channel.port1.onmessage = () => {
      isScheduling = false;
      const now = performance.now();
      const current = Array.from(rafCallbacks);
      rafCallbacks.clear();
      for (const cb of current) {
        try {
          cb(now);
        } catch {
          // ignore callback error
        }
      }
    };

    const origRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      rafCallbacks.add(callback);
      if (!isScheduling) {
        isScheduling = true;
        channel.port2.postMessage(null);
      }

      // Also call original RAF for when tab is foregrounded
      return origRAF((time) => {
        if (rafCallbacks.has(callback)) {
          rafCallbacks.delete(callback);
          try {
            callback(time);
          } catch {
            // ignore callback error
          }
        }
      });
    };
  } catch {
    // ignore
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

