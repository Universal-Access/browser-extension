# NLWeb Endpoint Discovery

There is no formal discovery protocol yet. Below are the known patterns for detecting NLWeb support on a website.

## Proposed / Emerging Standards

### Link Element (proposed, not yet standardized)
```html
<link rel="nlweb" href="https://example.com/nlweb/ask">
```
Would allow browser extensions and agents to discover the endpoint via DOM inspection.

### Well-Known URL
`/.well-known/nlweb` — Logical convention, but not yet adopted. Testing against news.microsoft.com returned 404.

## WordPress Plugin Detection

Sites using the NLWeb WordPress plugin expose several detectable signals:

- **JavaScript variable:** `nlweb_search_data` global object containing `plugin_url` and other config
- **DOM elements:** `[data-nlweb-search-input]` attribute on search input elements
- **REST endpoint:** `/wp-json/nlweb/v1/ask`
- **Example:** news.microsoft.com/source/ uses an iframe-based search powered by the `nlweb-search` WordPress plugin

## Cloudflare Integration

NLWeb can be deployed as a Cloudflare Worker with:
- Custom domain with `/ask` endpoint
- Embeddable widget: `NLWebDropdownChat` JavaScript component

## Discovery Strategy for This Extension

Since no universal discovery mechanism exists, practical detection should try multiple signals:

1. Check for `<link rel="nlweb">` in the document head
2. Check for `/.well-known/nlweb` (future-proofing)
3. Check for WordPress plugin signals (`nlweb_search_data`, `[data-nlweb-search-input]`)
4. Allow users to manually configure known endpoints
5. Maintain a list of known public endpoints (e.g., `glama.ai/nlweb/ask`)
