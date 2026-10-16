// ============================================================
// content/gemini/index.ts — Content script entry (Gemini tab)
//
// Listens for messages from the background service worker.
// Runs the analysis driver on GEMINI_RUN, reports progress and results.
// Uses a long-lived port for the run (GEMINI_PROGRESS, GEMINI_RESULT, GEMINI_ERROR).
// ============================================================
import { diagnosePage, runAnalysis, DriverError } from './driver';
import {
  makeGeminiPingResponse,
  makeGeminiProgress,
  makeGeminiResult,
  makeGeminiError,
} from '../../shared/messages';
import { debugLog } from '../../shared/config';
import type { GeminiRunMessage } from '../../shared/types';

debugLog('gemini content script: loaded on', window.location.href);

// Current run abort controller
let currentAbort: AbortController | null = null;

// ---- Handle one-shot messages (GEMINI_PING) ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'GEMINI_PING') {
    const diagnosis = diagnosePage();
    const ready = diagnosis.status === 'ready';
    sendResponse(makeGeminiPingResponse(diagnosis, ready));
    return true; // async response
  }
});

// ---- Handle long-lived port connections (GEMINI_RUN) ----
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'gemini-run') return;
  debugLog('gemini content script: port connected');

  port.onMessage.addListener(async (msg: unknown) => {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as { type: string };

    if (m.type === 'GEMINI_CANCEL') {
      debugLog('gemini content script: cancel received');
      if (currentAbort) currentAbort.abort();
      return;
    }

    if (m.type === 'GEMINI_RUN') {
      const runMsg = msg as GeminiRunMessage;
      debugLog('gemini content script: GEMINI_RUN received, nonce', runMsg.nonce);

      // Cancel any existing run
      if (currentAbort) currentAbort.abort();
      currentAbort = new AbortController();
      const signal = currentAbort.signal;

      try {
        const result = await runAnalysis(
          runMsg.prompt,
          runMsg.nonce,
          signal,
          (chars, elapsedMs) => {
            try {
              port.postMessage(makeGeminiProgress(chars, elapsedMs));
            } catch {
              // Port may have disconnected
            }
          }
        );

        debugLog('gemini content script: analysis complete');
        try {
          port.postMessage(makeGeminiResult(result.markdown, result.incomplete, result.formatDeviation));
        } catch {
          // Port may have disconnected
        }
      } catch (e) {
        if (signal.aborted) {
          debugLog('gemini content script: run aborted');
          return;
        }

        let code = 'UNKNOWN';
        let message = String(e);
        let retryable = true;
        let diagnostics: unknown = undefined;

        if (e instanceof DriverError) {
          code = e.code;
          message = e.message;
          retryable = e.retryable;
          diagnostics = e.diagnostics;
        }

        debugLog('gemini content script: error', code, message);
        try {
          port.postMessage(makeGeminiError(
            code as import('../../shared/types').ErrorCode,
            message,
            retryable,
            diagnostics
          ));
        } catch {
          // Port may have disconnected
        }
      }
    }
  });

  port.onDisconnect.addListener(() => {
    debugLog('gemini content script: port disconnected');
    if (currentAbort) currentAbort.abort();
    currentAbort = null;
  });
});
