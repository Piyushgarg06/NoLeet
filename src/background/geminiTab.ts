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
 * Find an existing Gemini tab (by stored ID), or create a new one.
 * The tab is created inactive (active: false) in the same window as the LeetCode tab.
 * Returns the tab ID.
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
      debugLog('geminiTab: stored tab gone, creating new one');
    }
  }

  // Check if user already has an open Gemini tab in the browser
  try {
    const existing = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
    if (existing.length > 0 && existing[0].id) {
      debugLog('geminiTab: reusing existing open Gemini tab', existing[0].id);
      return existing[0].id;
    }
  } catch {
    // ignore
  }

  // Create a new inactive tab
  const newTab = await chrome.tabs.create({
    url: CONFIG.GEMINI_APP_URL,
    active: false,
    windowId: leetcodeWindowId,
  });

  if (!newTab.id) {
    throw new GeminiTabError('GEMINI_TAB_LOST', 'Failed to create Gemini tab');
  }

  debugLog('geminiTab: created new tab', newTab.id);
  return newTab.id;
}

/**
 * Navigate the Gemini tab to a fresh chat URL and wait for it to be ready.
 * Throws GeminiTabError if navigation fails or times out.
 */
export async function navigateToFreshChat(geminiTabId: number): Promise<void> {
  debugLog('geminiTab: navigating to fresh chat', geminiTabId);

  // Navigate to the app URL (fresh chat)
  await chrome.tabs.update(geminiTabId, { url: CONFIG.GEMINI_APP_URL });

  // Wait for tab to complete loading
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

    // 2. Unfreeze requestAnimationFrame when tab is hidden
    const origRAF = window.requestAnimationFrame.bind(window);
    let lastTime = 0;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      let fired = false;
      const fallbackTimer = setTimeout(() => {
        if (!fired) {
          fired = true;
          const now = performance.now();
          const next = Math.max(0, 16 - (now - lastTime));
          lastTime = now + next;
          callback(lastTime);
        }
      }, 25);

      return origRAF((time) => {
        if (!fired) {
          fired = true;
          clearTimeout(fallbackTimer);
          callback(time);
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

