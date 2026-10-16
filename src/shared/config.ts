// ============================================================
// shared/config.ts — All timeouts, URLs, and configurable constants
// ============================================================

export const CONFIG = {
  // URLs
  GEMINI_APP_URL: 'https://gemini.google.com/app',
  GEMINI_HOST: 'gemini.google.com',
  LEETCODE_PROBLEMS_PATTERN: /^https:\/\/leetcode\.com\/problems\/([^/]+)\//,

  // Timeouts (ms)
  GEMINI_TAB_LOAD_TIMEOUT_MS: 30_000,        // Wait for Gemini tab to load/be ready
  PROMPT_INSERTION_TIMEOUT_MS: 15_000,       // Wait for prompt insertion + Send enabled
  FIRST_RESPONSE_TIMEOUT_MS: 45_000,         // Wait for first response element after send
  GENERATION_TOTAL_TIMEOUT_MS: 180_000,      // Max time for generation (3 min)
  STALL_DETECTION_MS: 45_000,               // Response unchanged for this long → stalled
  OVERALL_RUN_CAP_MS: 240_000,              // 4 min hard cap

  // Completion detection
  STABILITY_WINDOW_MS: 1_500,              // Response must be unchanged for this long
  COMPLETION_GRACE_MS: 10_000,             // Extra grace period if sentinel missing after stop
  PROGRESS_REPORT_INTERVAL_MS: 1_000,     // Max frequency of GEMINI_PROGRESS messages

  // Keep-alive heartbeat interval (ms) — keep MV3 worker alive
  HEARTBEAT_INTERVAL_MS: 20_000,

  // Content script readiness ping retry
  CONTENT_SCRIPT_PING_TIMEOUT_MS: 10_000,
  CONTENT_SCRIPT_PING_RETRIES: 5,
  CONTENT_SCRIPT_PING_INTERVAL_MS: 1_000,

  // UI
  SLOW_HINT_AFTER_MS: 60_000,             // Show "Gemini is still working…" after this

  // Storage keys
  STORAGE_SESSION_RUN_KEY: 'currentRun',
  STORAGE_LOCAL_CONSENT_KEY: 'consentVersion',
  STORAGE_LOCAL_SETTINGS_KEY: 'settings',

  // Consent version — bump this to re-show consent
  CONSENT_VERSION: 1,

  // Debug logging (replaced at build time by Vite's define)
  // Usage: if (DEBUG_LOG) { console.log(...) }
} as const;

// Debug logging helper — gated behind __DEV__ build flag
declare const __DEV__: boolean;
export const DEBUG_LOG = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export function debugLog(...args: unknown[]): void {
  if (DEBUG_LOG) {
    // eslint-disable-next-line no-console
    console.log('[LCA]', ...args);
  }
}
