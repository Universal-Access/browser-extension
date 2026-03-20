# PROJECT.md

## Product Name

Universal Access

## Elevator Pitch

A browser extension that detects NLWeb-configured sites and schema.org product pages, offering two independent features: a natural language chat interface (NLWeb Chat) and a structured, accessibility-first Product Mode that transforms cluttered e-commerce pages into clean, readable layouts.

## Architecture

- **Browser Extension** (Chrome/MV3-compatible structure)
- **Content Script** — detects product pages, injects Product Mode overlay
- **Popup** — extension badge/icon popup with quick controls
- **Static Prototype** — single HTML file demo showcasing all states

## Tech Stack

- Vanilla HTML/CSS/JS (no framework dependencies)
- CSS custom properties for theming (default, low-vision, dyslexia)
- CSS animations/transitions for mode switching
- Schema.org JSON-LD parsing for structured data extraction

## Business Logic

1. Content script scans page for schema.org `Product` structured data
2. If found, shows a subtle "Product detected" badge
3. User activates "Product Mode" — original page fades, clean overlay renders
4. Overlay populated with extracted structured data
5. Accessibility presets (Low Vision, Dyslexia) can be toggled at any time
6. AI assistant panel can be opened for contextual Q&A
