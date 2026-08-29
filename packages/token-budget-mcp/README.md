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

## Use it with any other MCP client

The server speaks standard MCP over stdio — point any client's stdio
transport at `npx @shivam.dixit/token-budget-mcp` (or a global install's
`token-budget-mcp` binary directly).

## Tools

| Tool | Does |
| --- | --- |
| `create_budget` | Creates a session. `maxTokens` (or a recognized `model` name — see `MODEL_CONTEXT_WINDOWS` in the core package), `reserve`, `strategy` (`dropOldest` default, `slidingWindow`, or `priority`), `warningThreshold`. Returns `sessionId`. |
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
`dropOldest`, `slidingWindow`, or `priority` here; reach for
`summarizeOldest` directly in TypeScript when you need it.

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
