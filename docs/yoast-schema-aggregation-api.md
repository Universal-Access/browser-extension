# Yoast Schema Aggregation API Reference

## REST Endpoints

All endpoints are served from the WordPress REST API namespace `yoast/v1/schema-aggregator`.

### XML Schemamap Index

```
GET /wp-json/yoast/v1/schema-aggregator/get-xml
```

Returns an XML urlset listing all available schema endpoints, one per post type. This is the entry point for discovery.

**Response format:** XML (sitemap-style urlset)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/wp-json/yoast/v1/schema-aggregator/get-schema/page</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/wp-json/yoast/v1/schema-aggregator/get-schema/post</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- ... one <url> per post type, plus pagination pages -->
</urlset>
```

### Schema Data per Post Type

```
GET /wp-json/yoast/v1/schema-aggregator/get-schema/{post_type}[/{page}]
```

Returns all Schema.org entities for the given post type.

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `post_type` | Yes | WordPress post type slug (e.g., `post`, `page`, `product`) |
| `page` | No | Page number for paginated results (default: 1) |

**Response format:** NDJSON (newline-delimited JSON) — each line is a self-contained JSON-LD object.

**Cache control:** `Cache-Control: max-age=300` (5 minutes)

### Pagination

Collections are paginated based on post type:

- **Standard types** (post, page, etc.): 1000 entities per page
- **"Big" types** (product): 100 entities per page

Paginated endpoints appear as separate entries in the XML index (e.g., `get-schema/post`, `get-schema/post/2`).

## Response Examples

### Article (from `get-schema/post`)

Each line in the NDJSON response is one entity. A single post typically produces multiple linked entities (Article, WebPage, ImageObject):

```json
{"@context":"https://schema.org","@type":"Article","@id":"https://example.com/my-post/#article","isPartOf":{"@id":"https://example.com/my-post/"},"author":{"name":"Jane Doe","@id":"https://example.com/#/schema/person/abc123"},"headline":"My Post Title","datePublished":"2025-01-15T10:00:00+00:00","dateModified":"2025-06-20T14:30:00+00:00","mainEntityOfPage":{"@id":"https://example.com/my-post/"},"wordCount":1500,"commentCount":12,"publisher":{"@id":"https://example.com/#organization"},"image":{"@id":"https://example.com/my-post/#primaryimage"},"thumbnailUrl":"https://example.com/uploads/featured.png","keywords":["SEO","Schema.org"],"inLanguage":"en-US","copyrightYear":"2025","copyrightHolder":{"@id":"https://example.com/#organization"},"description":"A description of the post."}
```

**Key properties:** `@id`, `isPartOf`, `author` (with `@id` reference), `headline`, `datePublished`, `dateModified`, `wordCount`, `commentCount`, `publisher`, `image`, `thumbnailUrl`, `keywords[]`, `inLanguage`, `copyrightYear`, `copyrightHolder`, `description`

### Product (from `get-schema/product`)

```json
{"@context":"https://schema.org","@id":"https://example.com/product/my-app/#product","@type":["Product","WebApplication"],"name":"My App","sku":"my-app-premium","mpn":"my-app-premium","brand":{"@id":"https://example.com/#organization"},"description":"Product description.","operatingSystem":"WordPress","applicationCategory":"BusinessApplication","manufacturer":{"@id":"https://example.com/#organization"},"offers":{"@type":"Offer","availability":"https://schema.org/InStock","priceCurrency":"USD","price":"49.00","url":"https://example.com/product/my-app/"},"aggregateRating":{"@type":"AggregateRating","worstRating":1,"bestRating":5,"ratingValue":4.8,"ratingCount":"200","reviewCount":"200"}}
```

**Key properties:** `@type: [Product, WebApplication]`, `name`, `sku`, `operatingSystem`, `description`, `offers` (with `price`, `availability`), `aggregateRating` (with `ratingValue`, `reviewCount`), `brand`, `manufacturer`

## robots.txt Integration

Sites with Schema Aggregation enabled add a `Schemamap:` directive to their robots.txt:

```
Schemamap: https://example.com/wp-json/yoast/v1/schema-aggregator/get-xml
```

This follows the same pattern as the `Sitemap:` directive and serves as the primary discovery mechanism.

## WP-CLI Commands

Yoast provides CLI commands for managing the schema aggregation cache:

```bash
# Regenerate the aggregated schema for the entire site
wp yoast aggregate_site_schema

# Clear the schema aggregator cache
wp yoast clear_schema_aggregator_cache
```

## WordPress Filters

Key filters for customizing Schema Aggregation behavior:

| Filter | Description |
|--------|-------------|
| `wpseo_schema_aggregator_post_types` | Modify which post types are included in the schemamap |
| `wpseo_schema_aggregator_schema_output` | Modify the schema output for a specific post |
| `wpseo_schema_aggregator_cache_time` | Customize the cache TTL (default: 300 seconds) |

## Live Example: yoast.com

Yoast's own site has Schema Aggregation enabled and can be used for testing:

```bash
# Check robots.txt for Schemamap directive
curl -s https://yoast.com/robots.txt | grep Schemamap

# Fetch the XML schemamap index
curl -s https://yoast.com/wp-json/yoast/v1/schema-aggregator/get-xml

# Fetch articles (page 1)
curl -s https://yoast.com/wp-json/yoast/v1/schema-aggregator/get-schema/post

# Fetch products
curl -s https://yoast.com/wp-json/yoast/v1/schema-aggregator/get-schema/product
```

The XML index lists 15 endpoints covering standard types (`page`, `post`, `product`) and custom types (`wpkb-article`, `yoast_employees`, `yoast_events`, `yoast_courses`, `yoast_podcast`, `yoast_videos`, `yoast_webinar`, `yoast_feature`, `yoast_developer_blog`, `yoast_ask_yoasie`, `yoast_care_fund`).
