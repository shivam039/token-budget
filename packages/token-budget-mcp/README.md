# token-budget-mcp

An MCP (Model Context Protocol) server that exposes
[`token-budget`](https://github.com/shivam039/token-budget) as callable
tools — for testing and driving the library interactively from
[Claude Code](https://claude.com/claude-code), Claude Desktop, or any
other MCP client, without writing a line of TypeScript.

## What this is for (and isn't)

This is a **testing and demonstration surface**, not the recommended way
to use `token-budget` in a real agent. In production, `token-budget` is
an in-process library call your own message loop makes on every turn —
see the [root README](../../README.md) and the other adapter packages
(`token-budget-openai`, `token-budget-anthropic`, ...) for that. This
package exists so you (or an MCP-capable AI assistant) can poke at the
real library — create a budget, add messages, watch eviction happen,
read the `explain()` trace — one tool call at a time, to see the
behavior directly instead of reading about it.

## Install

```sh
npm install -g @shivam.dixit/token-budget-mcp
```

Or run it without installing, via `npx`.

**Not on npm yet?** If `npx @shivam.dixit/token-budget-mcp` 404s, this
package hasn't been published yet — see
[docs/RELEASE_STATUS.md](../../docs/RELEASE_STATUS.md) in the repo root
for current status. Until then, use the "Run it from a local clone"
steps below instead — everything else on this page (tools, examples,
Inspector) works identically either way.

## Use it with Claude Code

```sh
claude mcp add token-budget -- npx -y @shivam.dixit/token-budget-mcp
```

## Use it with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "token-budget": {
      "command": "npx",
      "args": ["-y", "@shivam.dixit/token-budget-mcp"]
    }
  }
}
```

## Run it from a local clone (works today, before or after publishing)

```sh
git clone https://github.com/shivam039/token-budget.git
cd token-budget
npm install && npm run build
```

Then point any client at the built CLI directly, in place of the `npx`
command above — same tools, same behavior, just a local path instead of
a package name:

```sh
# Claude Code
claude mcp add token-budget -- node "$(pwd)/packages/token-budget-mcp/dist/cli.js"
```

```json
// Claude Desktop's claude_desktop_config.json — use an absolute path
{
  "mcpServers": {
    "token-budget": {
      "command": "node",
      "args": ["/absolute/path/to/token-budget/packages/token-budget-mcp/dist/cli.js"]
    }
  }
}
```

## Use it with any other MCP client

The server speaks standard MCP over stdio — point any client's stdio
transport at `npx @shivam.dixit/token-budget-mcp` (or a global install's
`token-budget-mcp` binary directly).

## Hosting it remotely (Streamable HTTP)

Everything above runs the server as a local stdio process — the normal
MCP shape, and the right default (no auth needed; the client that
spawned it is implicitly the only caller). `dist/http-cli.js` is a
second entry point for the less common case where you want one shared
server multiple people connect to over a URL instead — e.g. deployed on
[Render](https://render.com) as a persistent web service. (Not Vercel:
sessions live in memory for the process's lifetime, which needs a
long-running process, not serverless functions that may not reuse the
same instance between requests.)

```sh
MCP_API_KEY=<a long random secret> npm start   # from packages/token-budget-mcp, after npm run build
```

Required: `MCP_API_KEY` — the server refuses to start without it rather
than silently serving the internet with no auth. Every `/mcp` request
needs `Authorization: Bearer <MCP_API_KEY>`; `GET /healthz` doesn't (for
platform health checks).

Optional env vars, all with sensible defaults, bounding one client's
worst-case memory footprint on a shared server: `PORT` (3000),
`MAX_CONNECTIONS` (20 concurrent MCP clients), `MAX_SESSIONS_PER_CONNECTION`
(20 budget sessions each), `MAX_MESSAGES_PER_SESSION` (100),
`MAX_CONTENT_LENGTH` (20,000 characters per message). The stdio path
above never sets any of these — a single local user needs none of them.

**Connecting a client to a hosted instance:**

```sh
# Claude Code — native remote-MCP support
claude mcp add --transport http token-budget https://your-host/mcp \
  --header "Authorization: Bearer <MCP_API_KEY>"

# A stdio-only client (e.g. Claude Desktop, which doesn't speak
# Streamable HTTP directly) — bridge with mcp-remote:
npx mcp-remote https://your-host/mcp --header "Authorization: Bearer <MCP_API_KEY>"
```

## Tools

| Tool | Does |
| --- | --- |
| `create_budget` | Creates a session. `maxTokens` (or a recognized `model` name — see `MODEL_CONTEXT_WINDOWS` in the core package), `reserve`, `strategy` (`dropOldest` default, `slidingWindow`, `priority`, or `smartPriority`), `warningThreshold`. Returns `sessionId`. |
| `add_message` | Appends a message to a session: `sessionId`, `role`, `content`, optional `pinned`/`priority`/`toolCallId`. |
| `get_context` | Applies the session's strategy, returns the surviving messages, tokens used/remaining, and what was evicted. |
| `explain` | The structured trace of the most recent `get_context` call — what was evicted/synthesized and why. |
| `stats` | Current token usage and message counts, without applying the strategy. |
| `truncate_tool_output` | Stateless — shrinks a piece of text to a token budget via `truncateToolOutput()`, no session needed. |
| `list_sessions` | Every session id created so far in this process, with a stats summary. |
| `remove_session` | Discards a session and its buffer. |

Every session lives only for the running server process — nothing is
persisted between restarts (`token-budget`'s own
`serialize()`/`deserialize()` cover persistence; out of scope here).

## What isn't exposed

The `summarizeOldest` strategy takes an async summarizer callback you
supply in your own code — there's no way for a single MCP tool call
(plain JSON arguments in, plain JSON out) to *be* that callback. Use
`dropOldest`, `slidingWindow`, `priority`, or `smartPriority` here; reach
for `summarizeOldest` directly in TypeScript when you need it.
`smartPriority` itself is exposed without its own optional `condense`
setting for the same reason — its auto-pin-system, auto-pin-current-
query, and tool-call-drops-first behavior all work over MCP with no
callback needed; condensation into a synthetic summary doesn't.

## A worked example

```
You: create a budget with maxTokens 500 using the priority strategy

Claude: [calls create_budget] → sessionId: "a1b2..."

You: add a system message "You are a helpful assistant" and pin it

Claude: [calls add_message with pinned: true]

You: now add 10 user messages about different topics, then get the context

Claude: [calls add_message ×10, then get_context]
        → shows you which messages survived and which were evicted

You: why did it evict those specific ones?

Claude: [calls explain] → the structured reason for each eviction
```

## Verifying it works

```sh
npm install && npm run build   # from the repo root
npx @modelcontextprotocol/inspector node packages/token-budget-mcp/dist/cli.js
```

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
opens a browser UI to call every tool by hand — the fastest way to
confirm the server actually works before wiring it into a client.

## License

MIT
