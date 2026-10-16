# MANUAL_TEST_CHECKLIST.md

## Manual Live Test Checklist

Run this checklist against real sites with a signed-in Gemini account before releasing.

---

### Setup
- [ ] Load extension via "Load unpacked" in `chrome://extensions/`
- [ ] Verify extension appears in the toolbar
- [ ] Open DevTools → Service Workers to monitor the background worker

---

### Happy Path

- [ ] Navigate to `leetcode.com/problems/two-sum/`
- [ ] Open the side panel (click extension icon)
- [ ] Verify problem title and language shown in panel
- [ ] Click **Analyze Code** — consent screen appears on first run
- [ ] Accept consent
- [ ] Verify step list progresses: Reading → Opening Gemini → Sending → Waiting → Capturing
- [ ] **Verify the active tab never changes** (LeetCode stays focused throughout)
- [ ] Analysis completes with all six sections (Approach, Time, Space, Correctness, Edge Cases, Optimizations)
- [ ] Copy full analysis button works
- [ ] Re-analyze creates a fresh chat (verify only one new chat in Gemini history)

---

### Language Coverage

- [ ] Python3 solution (verify indentation preserved in prompt)
- [ ] C++ solution
- [ ] Java solution
- [ ] JavaScript solution
- [ ] Unsaved edit: type in editor, don't save, click Analyze → unsaved edit is captured

---

### Large/Complex Solutions

- [ ] A solution ~300 lines long
- [ ] A solution with Python code that has deep indentation (4+ levels)
- [ ] A problem with images and math in the statement

---

### Background-tab behavior

- [ ] Analysis completes while LeetCode tab is active (Gemini tab hidden)
- [ ] Analysis completes with another browser tab active (both LeetCode and Gemini hidden)
- [ ] Analysis completes with Chrome window minimized
- [ ] Long analysis (2-3 minute expected generation time): verify no stall detection false positive
- [ ] Memory Saver enabled: verify tab isn't discarded mid-run or that recovery works

---

### Error Cases

- [ ] **Signed-out Gemini**: Analysis starts, error shows "Not signed in", "Open Gemini to sign in" button works
- [ ] **Gemini rate limited**: Appropriate error shown
- [ ] **Gemini tab manually closed mid-run**: Error `GEMINI_TAB_LOST` shown, retry creates new tab
- [ ] **LeetCode navigation mid-run**: Analysis continues with snapshotted code
- [ ] **Offline (disable network)**: Appropriate timeout or error
- [ ] **Cancel mid-generation**: Analysis stops, panel shows cancelled state

---

### Panel Recovery

- [ ] Close side panel mid-run, reopen → panel shows live running state
- [ ] Analysis completes while panel is closed → reopening shows result

---

### Gemini tab management

- [ ] Run analysis twice: verify Gemini tab is reused (not creating multiple tabs)
- [ ] Each run starts a fresh chat (verify in Gemini history)
- [ ] "Open a LeetCode problem to begin" shown when on non-problem page

---

### Appearance

- [ ] Light theme (system light mode): UI looks correct
- [ ] Dark theme (system dark mode): UI looks correct, sufficient contrast
- [ ] Panel width 320px and 480px: no overflow

---

### Accessibility

- [ ] Tab through all interactive elements: all reachable by keyboard
- [ ] Focus states visible on all buttons
- [ ] Status updates announced to screen reader (aria-live region)

---

### Privacy verification

- [ ] Open DevTools → Application → Storage → check `chrome.storage.local`: only `consentVersion` and settings
- [ ] After run: `chrome.storage.session` has run record but NO code/prompt/response text beyond run lifetime
- [ ] Open DevTools → Network: no requests from the extension itself (only Gemini tab's own network)
- [ ] Console has no code/prompt output in production build

---

### Result: Record date and any issues found

| Test | Date | Result | Notes |
|------|------|--------|-------|
| Happy path | | | |
| Python indentation | | | |
| Background tab (3min) | | | |
| Signed-out error | | | |
| Cancel | | | |
| Panel recovery | | | |
| Dark mode | | | |
