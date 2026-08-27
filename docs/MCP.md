# MCP: not now, and why

**Decision: no MCP server. Not built, not planned until real demand
says otherwise.**

## Why an MCP server doesn't fit

MCP (Model Context Protocol) servers expose *tools* to an agent — a
filesystem, a database, a search API. `token-budget` isn't a tool an
agent calls; it's the buffer-management layer the agent's own message
loop runs through, on every turn, invisibly. Wrapping it as an MCP
server would mean an agent calling out to a separate process to ask
"what should my own context look like" — an awkward, latency-adding
detour for something that's currently a synchronous (or simple async)
in-process library call. There's no natural "tool" shape here: no
single request/response that maps to `getContext()`, because the whole
point is that it's called against the *same* growing buffer, turn after
turn, with state (pinned messages, priorities, the buffer itself) that
would have to live somewhere across those calls anyway.

## The eventual opportunity: MCP client middleware, not an MCP server

The place MCP genuinely intersects this problem is upstream of MCP
servers, not downstream: when an agent calls an MCP *tool* and gets back
a large result (a file dump, a big query result, a verbose log), that
result becomes tool-call/tool-result content in the agent's message
buffer — exactly the shape this library already manages.

```
Agent
 ↓
token-budget middleware      ← the eventual opportunity: wraps the MCP
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

Concretely, this would be a thin adapter — similar in spirit to
`token-budget-openai`/`token-budget-anthropic` — that wraps an MCP
client's tool-call responses, applying `truncateToolOutput()` to
oversized results and/or feeding them into an existing `TokenBudget`
instance with the right `toolCallId` pairing already set. Not a new
core capability; a new adapter package, using APIs that already exist.

## Why this isn't built yet

- No adapter package has been requested or attempted — there's no
  evidence yet that MCP-specific tool-output shapes need anything the
  existing `ContentBlock`/`toolCallId` model plus `truncateToolOutput()`
  don't already cover.
- Building an MCP-client adapter without a concrete MCP-using project
  driving the requirements risks guessing at an API shape that doesn't
  match how real MCP clients structure tool responses.
- Per `docs/DO_NOT_BUILD_YET.md`, new adapters are explicitly deferred
  until a real user's actual code shows the need.

## What would change this decision

A concrete report from a real user (found via `docs/FIRST_USERS.md`'s
outreach, or an inbound issue) building an MCP-based agent who has hit
the tool-output-size problem specifically through an MCP client, with
enough detail about the actual response shape to design against. At
that point, an `token-budget-mcp` (or similarly named) adapter package
following the same peer-dependency, structural-typing pattern as the
other adapters is a small, well-scoped addition — not a rewrite.
