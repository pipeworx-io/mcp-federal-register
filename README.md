# Federal Register — US Government Regulatory Documents

The Federal Register is the official daily publication of US federal proposed rules, final rules, notices, executive orders, and presidential documents. Every regulatory action — proposed and adopted — flows through it. Free, no auth, full-text searchable.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1679+ live data sources.

## Why this matters for AI agents

For regulatory landscape mapping, agents need to answer questions like "what rules are pending that affect industry X?" or "did the EPA finalize the proposed standard?" Federal Register is the canonical source. The data is structured by agency, document type, comment period, effective date.

Common flows:

- **Search.** `search_documents({query: "EV charging tax credit"})` → matching documents.
- **Specific document.** `get_document({number: "2024-12345"})` → full record including PDF link and comment-period status.
- **By agency.** Filter to documents from EPA, SEC, NHTSA, etc.
- **Comment-period status.** Find rules currently open for public comment.

Used by the `regulatory_landscape`, `lobbying_activity`, and `environmental_risk` recipes.

## Auth

None. Federal Register API is fully public.

## Document types

| Type | Meaning |
|---|---|
| **Proposed rule** | Draft rule open for public comment. The actionable category for "what's coming." |
| **Final rule** | Adopted rule with effective date. The "what was decided." |
| **Notice** | Non-rulemaking action (meetings, inventory adjustments, FOIA notices, etc.) |
| **Presidential document** | Executive orders, proclamations |
| **Rule withdrawn / Notice of correction** | Edit history on prior actions |

For agent-driven regulatory monitoring, the proposed-rule category is highest signal.

## Comment periods

Proposed rules have a public comment window (typically 30–60 days). The `comments_close_on` field tells you when. Companies that want to influence a rule submit comments via Regulations.gov before that date.

## Common pitfalls

- **CFR citations.** Proposed and final rules amend the Code of Federal Regulations (e.g., "40 CFR 80.40"). The Federal Register record has the action; the CFR has the resulting text. For "what does the rule actually require," follow the CFR citation.
- **Withdrawal + republish.** Agencies sometimes withdraw a proposed rule and republish a substantially-identical version with minor changes. Track the withdrawal note to avoid double-counting.
- **Significant vs non-significant.** Rules tagged "significant regulatory action" go through OMB review. "Non-significant" rules don't. The classification doesn't always match impact — search for substance, not status.
- **NAICS-level relevance.** Proposed rules often reference industry codes. To find rules affecting a specific industry, search NAICS code as part of the query, not just keywords.
- **Lag.** Documents publish on weekdays around 9 AM Eastern. Federal Register's API surfaces them within a few hours. For breaking-rule news, layer Bloomberg or Politico on top.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "federal-register": {
      "url": "https://gateway.pipeworx.io/federal-register/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/federal-register/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1679+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/federal_register_search_documents \
  -H 'Content-Type: application/json' \
  -d '{"query":"clean energy tax credit"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/federal_register_search_documents`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "federal-register": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-federal-register"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-federal-register
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Federal Register data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
