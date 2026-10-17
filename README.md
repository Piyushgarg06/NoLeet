<p align="center">
  <img src="logo.png" alt="NoLeet Logo" width="96" height="96" />
</p>

<h1 align="center">NoLeet ⚡</h1>

<p align="center">
  <strong>A Chrome extension for free AI-powered LeetCode code analysis. No API keys, no manual tab juggling, no LeetCode Premium. Just click Analyze.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
  <img src="https://img.shields.io/badge/Manifest-V3-success.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Chrome-114%2B-orange.svg" alt="Chrome 114+" />
  <img src="https://img.shields.io/badge/Privacy-No%20NoLeet%20Servers-purple.svg" alt="No NoLeet Servers" />
</p>

---

## 📺 Demo

<p align="center">
  <img src="demo.gif?raw=true" alt="NoLeet Demo" width="100%" style="border-radius: 8px;" />
</p>

<p align="center">
  <sub><em>(Brief 1–2s automatic switch to Gemini during analysis is a Chrome throttling workaround — see <a href="#how-it-works">How It Works</a> below).</em></sub>
</p>

---

## 💡 Why NoLeet?

LeetCode Premium charges over **$35/month** just to get AI code explanations, approach tips, and complexity analysis. Alternatively, copying and pasting code back and forth between LeetCode and ChatGPT or Claude breaks your focus and flow.

**NoLeet provides a free alternative to LeetCode Premium's AI analysis**, right inside Chrome's native Side Panel:
- ❌ **No API Keys** (uses your existing Google Gemini web session)
- ❌ **No Manual Tab Switching** (analysis streams directly alongside your problem in the Side Panel)
- ❌ **No Subscription Fees** (100% free and open-source)
- ❌ **No NoLeet Servers** (zero middleman backends or databases — your code goes only to your own Gemini session)

---

## ✨ Features

- ⚡ **LeetCode Premium Aesthetic**: Sleek dark-mode card interface styled with violet accents and emerald highlights.
- 📈 **Dynamic Big-O Complexity Graph**: An interactive SVG curve chart ($O(1)$, $O(\log N)$, $O(N)$, $O(N \log N)$, $O(N^2)$, $O(2^N)$) where your solution's active curve illuminates and glows.
- 🪢 **Algorithm & Approach Detection**: Automatically identifies algorithms (Hash Table, Two Pointers, Sliding Window, Binary Search, DP, DFS/BFS, Monotonic Stack, etc.) and highlights optimal alternatives.
- 💡 **Refined Code Snippets**: Provides clean, actionable code improvements with a single-click copy button.
- 📖 **Deep-Dive Invariants & Edge Cases**: Collapsible drawer with correctness checks, edge cases, and auxiliary space breakdown without cluttering your screen with walls of text.
- 🚀 **Fast Turnaround**: Typically a few seconds, depending on Gemini and your connection.

---

## 📥 How to Install (For General Users)

You do **not** need to wait for the Chrome Web Store or know any programming to use NoLeet! Follow these quick steps:

### Step 1: Download NoLeet
1. Go to the [**Releases**](https://github.com/Piyushgarg06/NoLeet/releases) page on this GitHub repository.
2. Under the latest release, download the **`noleet.zip`** file.

### Step 2: Unzip the File
1. Locate `noleet.zip` in your Downloads folder.
2. Right-click the `.zip` file and select **Extract All...** (or double-click to unzip).
3. Choose a folder where you want to keep the extension files (do not delete this folder after installation).

### Step 3: Load into Chrome
1. Open Google Chrome (or any Chromium browser: Brave, Edge, Arc, Opera, Vivaldi).
2. In the URL bar, go to:
   ```text
   chrome://extensions
   or
   brave://extensions
   ```
3. In the top-right corner, toggle on **Developer mode**.
4. In the top-left corner, click the **Load unpacked** button.
5. In the file picker, select the unzipped `noleet` folder (the folder containing `manifest.json`).
6. Click **Select Folder**.

🎉 **That's it!** NoLeet is now installed. Click the puzzle icon (🧩) in your Chrome toolbar and pin **NoLeet** for quick access.

---

## 🎯 How to Use

1. **Sign in to Gemini**: Make sure you are signed in to [gemini.google.com](https://gemini.google.com) in your browser. (NoLeet uses your existing free Gemini session).
2. **Open LeetCode**: Go to any problem on [leetcode.com/problems/...](https://leetcode.com/problems/).
3. **Open NoLeet**: Click the NoLeet extension icon in your Chrome toolbar to open the Side Panel.
4. **Click Analyze**: Hit the **✨ Analyze Code** button. NoLeet reads your current editor code (including unsaved edits) and displays your analysis cards in seconds!
   *(Note: The brief 1–2 second tab focus to Gemini is fully automated to bypass browser background throttling when inserting prompt information).*

---

## 💻 For Developers: Build from Source

If you prefer to build the extension yourself:

```bash
# 1. Clone the repository
git clone https://github.com/Piyushgarg06/NoLeet.git
cd NoLeet

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build

# 4. (Optional) Run tests and CI checks
npm run ci

# 5. (Optional) Package into a release zip
npm run package
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the **`dist/`** directory.

---

## 🔒 Privacy & Permissions

NoLeet was designed with a transparent, privacy-first architecture:

- **No NoLeet Servers**: NoLeet operates with **zero external or middleman servers**, databases, or proxy backends. Your code goes strictly to Google Gemini through **your own signed-in browser session** (identical to you manually opening Gemini and pasting your code).
- **No Telemetry or Tracking**: No cookies, no trackers, and no external analytics libraries.
- **Zero Retention by NoLeet**: Your code is held in memory only while creating the prompt and is discarded immediately after sending. Google handles the prompt according to your account's Gemini privacy settings and chat history.
- **Minimal Permissions**:
  - `sidePanel`: Displays the analysis interface alongside LeetCode.
  - `scripting`: Extracts code from the Monaco editor in your active LeetCode tab.
  - `storage`: Preserves temporary run state during analysis.
  - `https://leetcode.com/*`: Reads problem titles and editor code.
  - `https://gemini.google.com/*`: Automates query input in your own signed-in Gemini tab.

---

## ⚠️ Limitations

- **Gemini Web UI Dependency**: Depends on the Gemini web UI, so a Gemini update may temporarily break it until an extension patch is released.

---

<a id="how-it-works"></a>
## ⚙️ How It Works & FAQ

### Why does NoLeet briefly switch to the Gemini tab for 1–2 seconds?
When you click **Analyze Code**, you will notice Chrome briefly bring your Gemini tab into focus for about 1–2 seconds before returning to LeetCode.

This is **100% automated by the extension** (not done manually). Chromium browsers aggressively throttle background tabs, timers, and DOM events. In an inactive background tab, scripts cannot reliably or immediately insert text into complex rich editors like Gemini's input field. Bringing the tab to the foreground for just a moment bypasses this browser throttling limit so the prompt is submitted instantly. Once submitted, your analysis streams cleanly straight into your LeetCode Side Panel.

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<p align="center">
  Made with ❤️ for algorithm enthusiasts and interview prep.
</p>
