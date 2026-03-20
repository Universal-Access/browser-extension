# PLAN.md

## Goal

Build a high-fidelity, demo-ready HTML prototype of Lucid — a browser extension that transforms cluttered e-commerce pages into clean, accessibility-first product interfaces.

## Phases

- [x] Phase 1: Core Prototype HTML/CSS/JS

  Single-file high-fidelity prototype covering: before/after transition, Product Mode layout, Low Vision and Dyslexia presets, AI assistant panel, all interaction states. Delivered as index.html. Code review: all JS references verified, ARIA roles and live regions added throughout, no undefined references, transitions scoped with pointer-events:none during animation to prevent double-activation. Keyboard nav (Escape) and focus management included.

- [x] Phase 2: NLWeb Sidebar Redesign

  Replaced the chat-bubble AI panel with a context fetch and navigation tool. User submits a query; the panel returns ranked page cards with excerpts, an "On this page" badge for the current page, and Highlight / Visit actions. Removed all chat CSS and JS (bubbles, typing indicator, AI_RESPONSES). Added NLWEB_MOCK_DATA (4 query keys, 3–4 results each), shimmer loading bar, staggered card animation, and event delegation for suggestion chips. Input moved to the top of the panel with role="search". Code review: no undefined references, all old chat symbols removed, inline onclick handlers eliminated, aria-live and aria-busy wired correctly.

- [x] Phase 3: Voice Input + Dynamic Follow-up Suggestions

  Added mic button (🎤) in `.ai-input-row` with ghost style at rest, red pulse animation while listening. Uses Web Speech API (SpeechRecognition); hidden via `.unsupported` class in browsers that lack support. On speech end, auto-submits transcript. Added `NLWEB_FOLLOWUPS` (4 keys × 3 chips); after each search, `renderFollowups(matchKey)` appends a "Follow up" chip section below results. Existing event delegation picks up the chips with no extra wiring. `renderResults` signature updated to accept `matchKey`. Code review: `$aiMic` DOM ref verified, `state.listening` guard prevents double-activation, all CSS uses existing design tokens, no undefined references.

- [x] Phase 4: Live Schema Extraction + Dynamic Product Rendering

  Embed a real Product JSON-LD (Sony WH-1000XM5 with nested AggregateRating, Offer, Brand, Review nodes) in `#before-page`. Ported `extractJsonLd()`, `classifyEntities()`, `buildGraphIndex()`, `resolveRef()`, `resolveEntity()` from the extension. Field helpers: `extractPrice()`, `extractRating()`, `extractBrand()`, `extractAvailability()`, `escapeHtml()`, `formatDate()`, `renderStars()`, `buildSection()`. `renderProduct(entity)` generates the full hero and all three sections (Specs, Description, Reviews) from extracted data; `activateProductMode()` calls it before showing the overlay. `updateToolbar()` reads `state.detectedType`. `extractAll()` runs on init. Max-height for open sections bumped to 3000px to handle long review content. Code review: all string insertions use `escapeHtml()`, `$flash`/`$toolbar`/`$before`/`$productMode` refs verified, no undefined references, onclick attributes use globals already defined in scope.

- [ ] Phase 5: NLWeb Streaming Simulation + Enhanced Result Cards

  Replace the single-setTimeout mock in `submitNLWebQuery()` with a multi-step streaming simulation mirroring the extension's chunk protocol. Chunk flow: `intermediate_message` × 2 (updating loading label in place) → `nlws` (summary card above results) → `result` × N (staggered card appends) → `similar_results` (replaces current `renderFollowups()`). New rendering functions: `renderIntermediateMessage(text)`, `renderSummaryCard(text, query)`, `renderResultCard(item)` (replaces current card renderer). Add `NLWEB_SUMMARIES` — one short AI-style answer string per query key. Store pending timeout IDs in `state.streamingTimeouts` and cancel them on new query submission. Add `.nlweb-summary-card` CSS. Done when the full streaming sequence plays, summary card appears above results, and cancellation on re-submit is clean.

- [ ] Phase 6: Enhanced Speech Recognition

  Replace the current simplified `toggleVoice()` with a full controller ported from speech-recognition.js. New HTML: `<p id="speech-status">` below `.ai-input-row` for status text. Controller: `continuous=true`, `interimResults=true`, keep-listening (restarts on `end` if `speechShouldKeepListening` is true). Status messages: "Listening…" on start, "Transcribing…" on speechstart, mapped error strings for `not-allowed` / `no-speech` / `network`. `speechController.setDisabled(bool)` called by `submitNLWebQuery` to block mic during streaming. Done when continuous dictation works, status messages display correctly, and mic is auto-disabled during query streaming.
