# SPIKE_FINDINGS.md

## Phase 0 — Feasibility Spike Findings

**Date:** 2026-10-16  
**Status:** ⏳ Pending live browser inspection

> **IMPORTANT:** The selectors in `selectors.ts` are initial hypotheses based on visual inspection of the Gemini UI. They must be verified against the live site before relying on them in production. Run the Phase 0 manual spike and update this document with actual findings.

---

## Gate Summary

| Gate | Status | Notes |
|------|--------|-------|
| GATE A — LeetCode Monaco extraction | ⏳ PENDING | Must test on real problem page |
| GATE B — Gemini background-tab flow | ⏳ PENDING | Must test hidden-tab behavior |
| GATE C — Prompt insertion fidelity | ⏳ PENDING | Must verify whitespace preservation |

---

## 7.1 LeetCode Findings (to be verified)

### `window.monaco` availability
- **Hypothesis:** `window.monaco` exists in MAIN world on problem pages
- **Status:** ⏳ Needs verification

### Monaco API
- **Hypothesis:** `monaco.editor.getEditors()` returns editor instances
- **Discriminator hypothesis:** Filter by DOM container (exclude testcase/custom-input panes)
- **Status:** ⏳ Needs verification

### Unsaved edits
- **Hypothesis:** `model.getValue()` includes unsaved edits
- **Test:** Type without saving, call `getValue()` → should include typed text
- **Status:** ⏳ Needs verification

### Language detection
- **Hypothesis:** `model.getLanguageId()` returns the Monaco language ID
- **Status:** ⏳ Needs verification

### Problem content
- **Primary selector hypothesis:** `[data-track-load="description_content"]`
- **Status:** ⏳ Needs verification

---

## 7.2 Gemini Findings (to be verified)

### Prompt input
- **Hypothesis:** `rich-textarea div[contenteditable="true"]` or `div[role="textbox"]`
- **Status:** ⏳ Needs verification

### Text insertion
- **Hypothesis:** `document.execCommand("insertText")` works; paste event as fallback
- **Whitespace test:** Insert Python code with leading spaces and blank lines
- **Status:** ⏳ Needs verification

### Send button
- **Hypothesis:** `button[aria-label="Send message"]`
- **Status:** ⏳ Needs verification

### Generation signals
- **Hypothesis:** `button[aria-label="Stop response"]` appears during generation
- **Status:** ⏳ Needs verification

### Response container
- **Hypothesis:** `model-response` custom element
- **Status:** ⏳ Needs verification

### New chat
- **Hypothesis:** Navigate to `https://gemini.google.com/app` for fresh chat
- **Status:** ⏳ Needs verification

### Auth/consent states
- **Status:** ⏳ Needs verification

---

## 7.3 Background-tab behavior (to be verified)

- **Question:** Does Gemini load fully in a background tab?
- **Question:** Does `MutationObserver` keep firing when hidden?
- **Question:** Are timers throttled? To what interval?
- **Status:** ⏳ All need testing

**Testing approach:**
1. Open Chrome DevTools on the Gemini tab
2. Use `chrome.tabs.create({ url: 'https://gemini.google.com/app', active: false })` from DevTools on LeetCode
3. Insert a prompt programmatically and observe generation
4. Test with short (10s) and long (2-3min) responses

---

## To update this document

After running the manual spike:
1. Replace all ⏳ entries with ✅ PASS or ❌ FAIL
2. Record the exact selectors that matched
3. Record insertion method that worked
4. Record any background-tab throttling observations
5. Save DOM snapshots to `tests/fixtures/`
6. Update `selectors.ts` with verified selectors and dates
