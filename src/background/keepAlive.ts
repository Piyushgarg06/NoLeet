// ============================================================
// background/keepAlive.ts — MV3 service worker keep-alive
//
// MV3 service workers are suspended after ~30s idle.
// An analysis can take 1–3 minutes.
// Strategy: maintain active message traffic via the panel port and
// Gemini content-script port. Additionally, use a self-ping via
// chrome.runtime.connect/disconnect cycle.
// ============================================================
import { CONFIG, debugLog } from '../shared/config';

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the keep-alive heartbeat.
 * Call this at the start of a run; stop it when the run ends.
 * The heartbeat just touches chrome.storage (a no-op read) to
 * keep the worker alive.
 */
export function startKeepAlive(): void {
  if (keepAliveInterval !== null) return;

  debugLog('keepAlive: starting');
  keepAliveInterval = setInterval(() => {
    // Reading from storage keeps the worker awake
    chrome.storage.session.get(CONFIG.STORAGE_SESSION_RUN_KEY).catch(() => undefined);
    debugLog('keepAlive: heartbeat');
  }, CONFIG.HEARTBEAT_INTERVAL_MS);
}

export function stopKeepAlive(): void {
  if (keepAliveInterval !== null) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    debugLog('keepAlive: stopped');
  }
}
