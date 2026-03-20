# NLWeb Protocol Overview

NLWeb is an open protocol from Microsoft for adding natural language interfaces to websites. It enables users to ask questions of any website in plain language and receive structured, Schema.org-based responses.

- **GitHub repos:** github.com/nlweb-ai/NLWeb, github.com/microsoft/NLWeb
- **Status:** Early-stage open protocol; early adopters include TripAdvisor, Shopify, Eventbrite

## Architecture

NLWeb uses a multi-agent architecture:

- **AskAgent** — Orchestrates the query flow; receives the user's natural language question
- **AgentFinder** — Discovers which NLWeb-enabled sites/endpoints can answer the query
- **DataFinder** — Retrieves and ranks relevant Schema.org data from the target site's index
- **ModelRouter** — Routes LLM calls to appropriate models based on task complexity

## Key Design Principles

- **Built on Schema.org** — All responses use Schema.org vocabulary. Sites that already publish structured data (JSON-LD, Microdata, RDFa) have a head start.
- **Every NLWeb instance is also an MCP server** — The same server that exposes the `/ask` REST endpoint also exposes an `/mcp` endpoint, making it compatible with the Model Context Protocol ecosystem.
- **Streaming by default** — Responses are streamed as NDJSON (newline-delimited JSON) for real-time UI updates.

## Relevance to This Extension

Our Schema.org Explorer extension already extracts structured data from web pages. NLWeb is the natural next step: using that same structured data vocabulary to enable natural language queries against websites that support the protocol.
