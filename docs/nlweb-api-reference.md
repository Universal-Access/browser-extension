# NLWeb API Reference

## REST Endpoint: `/ask`

The primary endpoint for natural language queries. The path is flexible — implementations may use `/ask`, `/nlweb/ask`, or other paths.

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | Yes | — | Natural language question |
| `site` | No | — | Backend data subset token (selects which data collection to query) |
| `mode` | No | `list` | Response mode: `list`, `summarize`, or `generate` |
| `streaming` | No | `true` | Whether to stream the response as NDJSON |
| `prev` | No | — | Comma-separated previous queries for conversational context |
| `decontextualized_query` | No | — | Pre-processed full query (resolves pronouns/references from `prev`) |
| `query_id` | No | auto-generated | Unique identifier for the query |

### Response Format

JSON object with:

```json
{
  "query_id": "string",
  "results": [
    {
      "url": "https://example.com/page",
      "name": "Result Title",
      "site": "example",
      "score": 0.95,
      "description": "LLM-generated summary of the result",
      "schema_object": { /* raw Schema.org JSON-LD data */ }
    }
  ]
}
```

### Streaming

When `streaming=true` (the default), the response is NDJSON — one JSON object per line, streamed as results become available.

### Response Modes

- **`list`** — Returns ranked results with descriptions (default)
- **`summarize`** — Returns a single synthesized summary across results
- **`generate`** — Returns generated content based on the query and data

## MCP Endpoint: `/mcp`

The same server exposes an MCP (Model Context Protocol) endpoint. The MCP method name is `ask` and accepts the same parameters as the REST endpoint.

## WordPress Plugin Variant

WordPress sites using the NLWeb plugin expose the endpoint at:

```
POST /wp-json/nlweb/v1/ask
```

Same parameters and response format as the standard REST endpoint.

## Known Public Endpoints

- `https://glama.ai/nlweb/ask` — Public NLWeb endpoint by Glama
