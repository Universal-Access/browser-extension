# Schema.org Explorer — Universal Access Browser Extension

A Chrome extension that extracts and displays Schema.org structured data from any web page, with built-in support for [NLWeb](https://github.com/microsoft/nlweb) natural language queries and voice input.

Originally created for the **CloudFest Hackathon 2026**.

## Features

- **Schema.org Extraction** — Detects and displays structured data in JSON-LD, Microdata, and RDFa formats, rendered as collapsible tree views in a side panel.
- **NLWeb Integration** — Discovers NLWeb-enabled sites and lets you ask natural language questions with real-time streaming responses.
- **Speech-to-Text** — Voice input for NLWeb queries via the Web Speech API, with visual feedback and accessibility support.
- **Badge Counter** — Shows the number of structured data items found on the current page.

## Installation

No build step required — the extension runs as vanilla JavaScript.

1. Clone the repository:
   ```bash
   git clone https://github.com/Universal-Access/browser-extension.git
   ```
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project root directory.

## Usage

1. Navigate to any web page.
2. Click the extension icon to open the side panel.
3. View extracted Schema.org data in collapsible tree sections (JSON-LD, Microdata, RDFa).
4. If the site supports NLWeb, a query form appears — type a question or use the microphone button for voice input.

### Dev Tools (Raw Schema Data)

For developers and debugging purposes, a hidden "Dev Tools" section displays raw schema data with the ability to inspect and copy all extracted JSON.

**To activate:**
- Press **Ctrl+Shift+D** (Windows/Linux)
- Press **Cmd+Shift+D** (macOS)

The Dev Tools section will toggle on/off and remain visible until toggled again. Your preference is saved across sessions.

## How It Works

**Schema.org extraction:** Content scripts run on every page, parsing JSON-LD (`<script type="application/ld+json">`), Microdata (`itemscope`/`itemprop` attributes), and RDFa (`typeof`/`property` attributes). Extracted data is sent to the service worker, cached, and forwarded to the side panel for display.

**NLWeb queries:** The extension discovers NLWeb endpoints through several methods — `<link rel="nlweb">` tags, WordPress plugin signals, and `.well-known/nlweb` endpoints. Queries are sent as streaming NDJSON requests, and results render in real time as they arrive.

## Development

Edit any file directly — changes take effect after reloading the extension from `chrome://extensions/`.

## Browser Compatibility

- Chrome / Chromium (Manifest V3)
- Microphone permission required for speech-to-text
