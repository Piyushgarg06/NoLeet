// ============================================================
// background/index.ts — Service worker entry point
// ============================================================
import { CONFIG, debugLog } from '../shared/config';
import {
  initOrchestrator,
  getCurrentRun,
  startRun,
  cancelRun,
  registerPanelPort,
  handleTabRemoved,
  handleTabUpdated,
  transitionError,
} from './orchestrator';
import { activateGeminiTabForSignIn, prewarmGeminiTab } from './geminiTab';
import { makeStateUpdate } from '../shared/messages';

// ---- Set up side panel behavior ----
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(e => console.error('sidePanel.setPanelBehavior failed:', e));

// ---- Initialize orchestrator on startup ----
initOrchestrator().catch(e => console.error('initOrchestrator failed:', e));

// ---- Listen for panel connections ----
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'panel') {
    debugLog('background: panel connected');
    registerPanelPort(port);

    // Silently pre-warm Gemini in the background so it is already loaded before user clicks Analyze!
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(tabs => {
      const active = tabs[0];
      if (active?.windowId && active.url && CONFIG.LEETCODE_PROBLEMS_PATTERN.test(active.url)) {
        prewarmGeminiTab(active.windowId);
      }
    }).catch(() => {});

    port.onMessage.addListener(async (msg: unknown) => {
      debugLog('background: message from panel', msg);

      if (!msg || typeof msg !== 'object') return;
      const m = msg as { type: string };

      if (m.type === 'PANEL_GET_STATE') {
        port.postMessage(makeStateUpdate(getCurrentRun()));
        return;
      }

      if (m.type === 'PANEL_START') {
        let leetcodeTabId: number | undefined;

        // 1. Check if the currentRun already has a valid leetcodeTabId
        const current = getCurrentRun();
        if (current?.leetcodeTabId) {
          try {
            const t = await chrome.tabs.get(current.leetcodeTabId);
            if (t?.id && t.url && CONFIG.LEETCODE_PROBLEMS_PATTERN.test(t.url)) {
              leetcodeTabId = t.id;
            }
          } catch {
            // tab was closed
          }
        }

        // 2. Query active tab in the last-focused browser window
        if (!leetcodeTabId) {
          try {
            const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            const activeTab = activeTabs[0];
            if (activeTab?.id && activeTab.url && CONFIG.LEETCODE_PROBLEMS_PATTERN.test(activeTab.url)) {
              leetcodeTabId = activeTab.id;
            }
          } catch {
            // ignore
          }
        }

        // 3. Fallback: Query active tab across all windows
        if (!leetcodeTabId) {
          try {
            const activeTabs = await chrome.tabs.query({ active: true });
            const match = activeTabs.find(t => t.url && CONFIG.LEETCODE_PROBLEMS_PATTERN.test(t.url));
            if (match?.id) {
              leetcodeTabId = match.id;
            }
          } catch {
            // ignore
          }
        }

        // 4. Fallback: Query any open LeetCode problem tab in the browser
        if (!leetcodeTabId) {
          try {
            const allLeetCode = await chrome.tabs.query({ url: 'https://leetcode.com/problems/*' });
            if (allLeetCode[0]?.id) {
              leetcodeTabId = allLeetCode[0].id;
            }
          } catch {
            // ignore
          }
        }

        if (!leetcodeTabId) {
          debugLog('background: no LeetCode problem tab found');
          if (current) {
            await transitionError(
              current,
              'NOT_A_PROBLEM_PAGE',
              'No active LeetCode problem tab found. Please navigate to a problem (e.g. leetcode.com/problems/two-sum/) and click Retry.',
              true
            );
          }
          return;
        }

        await startRun(leetcodeTabId);
        return;
      }

      if (m.type === 'PANEL_CANCEL') {
        await cancelRun();
        return;
      }

      if (m.type === 'PANEL_OPEN_GEMINI_SIGNIN') {
        const run = getCurrentRun();
        if (run?.geminiTabId) {
          await activateGeminiTabForSignIn(run.geminiTabId);
        } else {
          // Create a new Gemini tab and activate it
          const tabs = await chrome.tabs.query({ currentWindow: true });
          const windowId = tabs[0]?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
          const newTab = await chrome.tabs.create({
            url: CONFIG.GEMINI_APP_URL,
            active: true,
            windowId,
          });
          debugLog('background: opened Gemini tab for sign-in', newTab.id);
        }
        return;
      }
    });
  }
});

// ---- Listen for Gemini content script connections ----
// (The content script driver connects back to the background via port)
// This is handled via chrome.runtime.onConnect in the content script's own port
// The orchestrator manages the gemini port directly.

// ---- Tab lifecycle events ----
chrome.tabs.onRemoved.addListener((tabId, _info) => {
  handleTabRemoved(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  handleTabUpdated(tabId, changeInfo, tab);

  // When user opens or navigates to a LeetCode problem, silently pre-warm Gemini in the background
  if (changeInfo.status === 'complete' && tab.url && CONFIG.LEETCODE_PROBLEMS_PATTERN.test(tab.url)) {
    if (tab.windowId) {
      prewarmGeminiTab(tab.windowId);
    }
  }
});

// ---- Handle extension icon click (fallback if sidePanel API not available) ----
chrome.action.onClicked.addListener(_tab => {
  // sidePanel.setPanelBehavior handles this automatically, but as a fallback:
  debugLog('background: action clicked');
});

debugLog('background: service worker started');
