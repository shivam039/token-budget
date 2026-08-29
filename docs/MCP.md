# MCP: built, as a testing/demo surface — not a production consumption path

**Update:** [`token-budget-mcp`](../packages/token-budget-mcp) exists now.
This doc originally said "not now, and why" — the reasoning below for
*why an MCP server isn't the right way to consume token-budget in
production* still holds and is preserved as-is. What changed is the
purpose: this was built as a testing/demo surface (so the library can be
driven interactively from Claude Code, Claude Desktop, or any other MCP
client without writing TypeScript), not as a reversal of the original
architectural argument.

## Why an MCP server doesn't fit as a *production* consumption path

MCP (Model Context Protocol) servers expose *tools* to an agent — a
filesystem, a database, a search API. `token-budget` isn't a tool an
agent calls; it's the buffer-management layer the agent's own message
loop runs through, on every turn, invisibly. Wrapping it as an MCP
server for production use would mean an agent calling out to a separate
process to ask "what should my own context look like" — an awkward,
latency-adding detour for something that's currently a synchronous (or
simple async) in-process library call. There's no natural "tool" shape
here for that use case: no single request/response that maps to
`getContext()`, because the whole point is that it's called against the
*same* growing buffer, turn after turn, with state (pinned messages,
priorities, the buffer itself) that would have to live somewhere across
those calls anyway.

**In production, keep using the library directly** — `token-budget`
itself, or one of the provider adapters (`token-budget-openai`,
`token-budget-anthropic`, `token-budget-vercel-ai`,
`token-budget-langchain`). `token-budget-mcp` is not a substitute for
that; see its own README for what it's for.

## What `token-budget-mcp` actually is

A session-oriented MCP server: `create_budget` returns a `sessionId`,
and `add_message`/`get_context`/`explain`/`stats` all act on that same
`TokenBudget` instance across separate tool calls — mirroring how a real
agent loop uses one long-lived instance, just made callable one
operation at a time. The point isn't to run it in production in front of
a real agent; it's to let a human (or an MCP-capable AI assistant) poke
at the real library interactively — create a budget, add messages,
watch eviction actually happen, read the `explain()` trace — instead of
only reading about the behavior in this README.

Concretely this solves a real, previously-true gap: before this package,
trying token-budget's actual eviction/pinning/tool-pairing behavior
required writing a small TypeScript script. Now it's a few tool calls
away from any MCP client, including Claude Code itself.

## The other opportunity this doc originally described: MCP client middleware

The place MCP genuinely intersects the *problem* this library solves is
upstream of MCP servers, not downstream: when an agent calls an MCP
*tool* and gets back a large result (a file dump, a big query result, a
verbose log), that result becomes tool-call/tool-result content in the
agent's message buffer — exactly the shape `token-budget` already
manages. This is a different, still-unbuilt thing from
`token-budget-mcp`:

```
Agent
 ↓
token-budget middleware      ← the still-open opportunity: wraps the MCP
 ↓                             client, applying truncateToolOutput() /
MCP client                     eviction to what comes back, before it
 ↓                             becomes unbounded context
MCP server
 ↓
tool
 ↓
large result
 ↓
token-budget                 ← same buffer management this library
 ↓                             already does, just triggered by MCP
managed context                 responses specifically
 ↓
LLM
```

This would be a thin adapter — similar in spirit to
`token-budget-openai`/`token-budget-anthropic` — that wraps an MCP
*client's* tool-call responses, applying `truncateToolOutput()` to
oversized results and/or feeding them into an existing `TokenBudget`
instance with the right `toolCallId` pairing already set. Still not
built: per `docs/DO_NOT_BUILD_YET.md`, new adapters are deferred until a
real user's actual code shows the need, and no concrete MCP-client
project has driven this one yet.
