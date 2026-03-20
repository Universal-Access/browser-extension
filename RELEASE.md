# RELEASE.md

Pre-launch checklist for shipping Lucid as a real Chrome extension.

## Extension Shell

- [ ] Add `manifest.json` (MV3) with correct permissions, content_scripts, and action fields
- [ ] Add `background.js` (service worker) for extension lifecycle
- [ ] Add `content-script.js` injected on matching product pages
- [ ] Add `popup.html` for the extension badge/icon popup
- [ ] Verify extension loads without errors in `chrome://extensions` (developer mode)
- [ ] Confirm content script activates on a real e-commerce page

## Schema.org Parser

- [ ] Implement JSON-LD extraction for `@type: Product` structured data
- [ ] Implement microdata extraction as fallback
- [ ] Map extracted fields to Product Mode (title, price, description, images, specs, reviews)
- [ ] Handle missing/partial data gracefully (fallback labels, no crashes)
- [ ] Test on at least 3 live product pages (Amazon, Best Buy, a Shopify store)

## Accessibility

- [ ] Screen reader smoke test (VoiceOver / NVDA) on Product Mode and NLWeb panel
- [ ] Keyboard-only navigation test: toolbar → Product Mode → NLWeb → close
- [ ] Verify Low Vision and Dyslexia themes apply correctly inside the extension popup

## Distribution

- [ ] Create 128×128 and 48×48 extension icons
- [ ] Write Chrome Web Store description and screenshots
- [ ] Review Chrome Web Store developer policies for compliance
