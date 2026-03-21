# Yoast Schema Aggregation Overview

Yoast SEO 27.1 (March 2026) introduced Schema Aggregation, a feature that consolidates a WordPress site's entire structured data into a single, crawlable endpoint called a "schemamap." Built in partnership with Microsoft, it provides a site-wide index of Schema.org data — complementing per-page JSON-LD with a centralized, machine-readable feed.

- **Yoast announcement:** yoast.com/features/schema-aggregator/
- **Status:** Shipping in Yoast SEO 27.1+; enabled by default on sites running Yoast SEO Premium

## The Schemamap Concept

A schemamap is to structured data what a sitemap is to URLs. Instead of requiring crawlers to visit every page and extract JSON-LD, the schemamap provides a single XML index that lists endpoints for each post type. Each endpoint returns all Schema.org entities for that type in one response.

```
robots.txt
  └── Schemamap: /wp-json/yoast/v1/schema-aggregator/get-xml
        └── XML index (urlset)
              ├── get-schema/page
              ├── get-schema/post
              ├── get-schema/post/2
              ├── get-schema/product
              └── get-schema/{custom_type}
```

## How It Differs from Per-Page JSON-LD

| | Per-page JSON-LD | Schema Aggregation |
|---|---|---|
| **Scope** | Single page | Entire site |
| **Discovery** | Crawl every page | Single XML index |
| **Format** | `<script type="application/ld+json">` in HTML | NDJSON via REST API |
| **Entity linking** | `@id` references within a page | `@id` references across the entire site graph |
| **Freshness** | Re-crawl needed | Cached, sub-100ms responses |

## Key Properties

- **Deduplication** — Entities are deduplicated across pages. A shared author or organization appears once with a stable `@id`.
- **Entity linking** — All entities use `@id` references, forming a connected graph across the site.
- **Cached responses** — Responses are cached with `max-age=300` (5 minutes) for sub-100ms delivery.
- **Pagination** — Large collections are paginated: 1000 entities per page (standard), 100 per page for "big" types like products.
- **NDJSON format** — Schema endpoints return newline-delimited JSON, one entity per line.

## Supported Entity Types

Schema Aggregation outputs structured data for these core Schema.org types:

- **Article** — Blog posts, news articles
- **Product** — E-commerce products (often as `[Product, WebApplication]`)
- **Event** — Events with dates, locations, performers
- **Person** — Authors, team members
- **Organisation** — Publisher, brand entities
- **Recipe** — Cooking recipes with ingredients, instructions
- **WebPage** — Page-level metadata
- **WebSite** — Site-level metadata

Custom post types registered with Yoast SEO are also included (e.g., `wpkb-article`, `yoast_courses`).

## Relationship to NLWeb and the Agentic Web

Schema Aggregation was built in partnership with Microsoft specifically to feed NLWeb and similar agentic systems. The connection is direct:

1. **NLWeb needs Schema.org data** — NLWeb's DataFinder agent retrieves and ranks Schema.org entities. Schema Aggregation provides exactly this data in bulk.
2. **Schemamap as discovery** — The `Schemamap:` directive in robots.txt gives agents a single entry point to discover all structured data on a site, without crawling.
3. **Same vocabulary** — Both systems use Schema.org JSON-LD, so data flows directly from Yoast's aggregated output into NLWeb's index.

## Relevance to This Extension

Our Schema.org Explorer extension currently extracts structured data from individual pages. Schema Aggregation opens up a new capability: detecting the schemamap on WordPress sites and browsing the site's entire structured data graph from a single entry point — without navigating page by page.
