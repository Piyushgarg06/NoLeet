# DECISIONS.md

## Design Decisions

### D-001 — No CRXJS; plain Vite multi-entry build
**Date:** 2026-10-16  
**Decision:** Use plain Vite with `rollupOptions.input` for multi-entry bundling, without CRXJS.  
**Rationale:** CRXJS adds plugin lock-in and complex hot-reload behavior. Plain Vite gives full control over output structure matching MV3 expectations. Trade-off: no HMR for extension pages, but `--watch` mode rebuilds quickly.

### D-002 — MAIN world injection for Monaco
**Date:** 2026-10-16  
**Decision:** Use `chrome.scripting.executeScript({ world: "MAIN" })` to access Monaco.  
**Rationale:** MV3 content scripts run in an ISOLATED world and cannot see `window.monaco`. MAIN world injection is the only standard way to access page globals. Functions must be self-contained (no module imports) and return serializable data.

### D-003 — Fresh chat per run via URL navigation
**Date:** 2026-10-16  
**Decision:** Navigate the Gemini tab to `https://gemini.google.com/app` at the start of each run.  
**Rationale:** This is the most reliable way to guarantee a fresh chat. The alternative (clicking "New chat" button) is fragile to UI changes and may be slow. URL navigation is a single reliable operation.

### D-004 — Long-lived port for Gemini content script communication
**Date:** 2026-10-16  
**Decision:** Use `chrome.tabs.connect` for background ↔ Gemini content script messaging during a run.  
**Rationale:** Long-lived ports generate message traffic that keeps the MV3 service worker alive. One-shot `sendMessage` would not maintain the worker for 1-3 minute analyses. Progress heartbeats are sent over this port.

### D-005 — Three-strategy contenteditable insertion
**Date:** 2026-10-16  
**Decision:** Try (A) execCommand, (B) paste event, (C) direct DOM + input event, in order.  
**Rationale:** Gemini's rich-text input is framework-controlled. No single strategy works across all versions. The ordered fallback ensures we try the safest, most reliable method first. If all fail, we surface `INPUT_FAILED` with diagnostics.

### D-006 — Sentinel for completion detection
**Date:** 2026-10-16  
**Decision:** Include `END-OF-ANALYSIS-<nonce>` as the last line of the prompt. Complete only when this sentinel is found in the response.  
**Rationale:** "Generation stopped" signals from the UI are unreliable — stop button may vanish early, or responses can appear done but be truncated. The sentinel provides a definitive end-of-response marker. The nonce prevents false positives from old responses.

### D-007 — chrome.storage.session for run state; never localStorage
**Date:** 2026-10-16  
**Decision:** All run state (including `codeSnapshot`) lives in `chrome.storage.session`. Code is cleared from the run record before persistence once the run ends.  
**Rationale:** Session storage is cleared when the browser closes, limiting exposure. Code and prompts must never reach `chrome.storage.local` (persistent). This satisfies the privacy requirement.

### D-008 — No background-tab visibility spoofing
**Date:** 2026-10-16  
**Decision:** Never spoof `document.visibilityState`, user-agent, or any visibility signals.  
**Rationale:** Explicitly prohibited by operating rules. If Phase 0 shows the background tab is unreliable, fall back to the unfocused popup window approach (Section 9.8), not deception.

### D-009 — Panel as a pure view
**Date:** 2026-10-16  
**Decision:** The side panel owns no state; it subscribes to STATE_UPDATE from the background.  
**Rationale:** If the panel is closed and reopened, it can recover by requesting current state from the background. This avoids state synchronization bugs.

### D-010 — DOMPurify allowlist for rendered Markdown
**Date:** 2026-10-16  
**Decision:** Use DOMPurify with an explicit allowlist of safe tags (no `<script>`, `<style>`, no event handler attributes).  
**Rationale:** Gemini's response is untrusted input (it may contain prompt injection or malicious HTML). All rendered content must be sanitized before being set as `innerHTML`.
