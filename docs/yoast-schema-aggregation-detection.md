# Yoast Schema Aggregation Detection

How to detect whether a website supports Yoast Schema Aggregation and discover its schema endpoints.

## Detection Signals

### 1. robots.txt — `Schemamap:` Directive

The most reliable signal. Sites with Schema Aggregation add a `Schemamap:` directive to their robots.txt:

```
Schemamap: https://example.com/wp-json/yoast/v1/schema-aggregator/get-xml
```

**How to check:**

```bash
curl -s https://example.com/robots.txt | grep -i "^Schemamap:"
```

This is analogous to the `Sitemap:` directive and is the intended discovery mechanism for crawlers and agents.

### 2. Well-Known Endpoint

Even without checking robots.txt, the XML schemamap endpoint follows a predictable path on any WordPress site running Yoast SEO 27.1+:

```
GET /wp-json/yoast/v1/schema-aggregator/get-xml
```

A successful response (HTTP 200 with XML content) confirms Schema Aggregation is active.

**How to check:**

```bash
curl -s -o /dev/null -w "%{http_code}" https://example.com/wp-json/yoast/v1/schema-aggregator/get-xml
# 200 = Schema Aggregation enabled
# 404 = not available
```

### 3. WordPress Detection (prerequisite)

Schema Aggregation is a WordPress-specific feature (Yoast SEO plugin). Confirming WordPress first narrows the search:

- Check for `/wp-json/` REST API availability
- Check for `<meta name="generator" content="WordPress ...">` in HTML
- Check for `/wp-content/` or `/wp-includes/` in page source

## Parsing the Schemamap

Once you have the XML index URL, parse it to discover available post type endpoints.

**Step 1:** Fetch the XML schemamap

```bash
curl -s https://example.com/wp-json/yoast/v1/schema-aggregator/get-xml
```

**Step 2:** Extract endpoint URLs from the `<loc>` elements

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/wp-json/yoast/v1/schema-aggregator/get-schema/page</loc>
  </url>
  <url>
    <loc>https://example.com/wp-json/yoast/v1/schema-aggregator/get-schema/post</loc>
  </url>
  <!-- ... -->
</urlset>
```

**Step 3:** The post type slug is the last path segment (e.g., `page`, `post`, `product`). Pagination pages appear as `get-schema/post/2`, `get-schema/post/3`, etc.

**Step 4:** Fetch individual endpoints to get NDJSON schema data

```bash
curl -s https://example.com/wp-json/yoast/v1/schema-aggregator/get-schema/post
```

Each line in the response is a self-contained JSON-LD object. Parse line by line.

## Detection Strategy for This Extension

Since Schema Aggregation is discoverable and WordPress-specific, detection can be layered:

1. **On page load** — Check if the current site is WordPress (look for `/wp-json/` or WordPress meta tags)
2. **If WordPress** — Probe the schemamap endpoint (`/wp-json/yoast/v1/schema-aggregator/get-xml`)
3. **If schemamap exists** — Parse the XML index and surface available post type endpoints in the extension UI
4. **User action** — Let users browse and inspect schema data per post type, with pagination support
5. **Fallback** — If schemamap is not available, continue with per-page JSON-LD extraction as usual

This complements the existing NLWeb detection flow. A site may support Schema Aggregation (Yoast), NLWeb, both, or neither:

| Signal | Indicates |
|--------|-----------|
| `Schemamap:` in robots.txt | Yoast Schema Aggregation available |
| `<link rel="nlweb">` or `/wp-json/nlweb/v1/ask` | NLWeb available |
| Both | Full agentic web support |
| Neither | Fall back to per-page JSON-LD extraction |

## Live Example: yoast.com

Walk through detection on yoast.com:

```bash
# Step 1: Check robots.txt
curl -s https://yoast.com/robots.txt | grep -i schemamap
# Output: Schemamap: https://yoast.com/wp-json/yoast/v1/schema-aggregator/get-xml

# Step 2: Fetch the schemamap index
curl -s https://yoast.com/wp-json/yoast/v1/schema-aggregator/get-xml
# Returns XML with 15 post type endpoints

# Step 3: Fetch schema for a specific type
curl -s https://yoast.com/wp-json/yoast/v1/schema-aggregator/get-schema/product
# Returns NDJSON with Product entities

# Step 4: Parse one line of NDJSON
curl -s https://yoast.com/wp-json/yoast/v1/schema-aggregator/get-schema/product | head -1 | jq .
# Pretty-printed JSON-LD for first product
```
