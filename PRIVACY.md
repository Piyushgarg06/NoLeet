# Privacy Policy — LeetCode AI Analyzer (Unofficial)

## What this extension does

LeetCode AI Analyzer is an unofficial browser extension that reads your LeetCode solution code and problem statement, and submits them to Google Gemini through your own signed-in Gemini web session.

## Data handling

### What is sent to Google
When you click "Analyze Code":
- The LeetCode problem title, difficulty (if available), and problem statement
- Your current code from the editor (including unsaved edits)
- The selected programming language

This data is typed into your Gemini chat, exactly as if you had pasted it yourself.

### What is NOT sent anywhere else
- **No backend server:** This extension has no server. All processing happens in your browser.
- **No analytics:** We collect zero analytics, telemetry, or usage data.
- **No third-party requests:** The extension makes no network requests of its own. The only network activity is the Gemini tab your browser opens.

### Gemini history
Each analysis creates a new chat in your Google Gemini account history. This is the same as if you had manually pasted your code into Gemini. You can delete these chats from Gemini at any time.

### Local storage
- `chrome.storage.local` stores only: your consent acceptance (a version number) and settings.
- `chrome.storage.session` stores run state while an analysis is in progress. This is automatically cleared when the browser closes. **Your code, the problem statement, and the Gemini response are never written to persistent storage.**

### Console logging
In production builds, your code and prompts are never logged to the browser console.

## Your control

- You can revoke consent at any time by uninstalling the extension.
- You can delete Gemini chats created by the extension from your Gemini account.
- No data can be recovered by the extension author — nothing is sent anywhere.

## Disclaimer

This is an unofficial, independent tool not affiliated with LeetCode or Google. It automates the Gemini web interface, not an official API. Use at your own risk. Please review [Google's Terms of Service](https://policies.google.com/terms) and [LeetCode's Terms of Service](https://leetcode.com/terms/) before using this tool.
