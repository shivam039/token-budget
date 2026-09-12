# Integrating token-budget-mcp with AI clients and agents

`token-budget-mcp` speaks standard Model Context Protocol (MCP). The key question is not which underlying model you use; it is whether the **AI host or agent runtime** can act as an MCP client.

A GPT, Claude, Gemini, or other model can use the same token-budget MCP tools when the application around that model supports MCP.

## Choose a transport

| Situation | Transport | Server address |
| --- | --- | --- |
| Desktop/coding client launches the server locally | stdio | `npx -y @shivam.dixit/token-budget-mcp` |
| AI client connects to a hosted/shared server | Streamable HTTP | `https://your-host/mcp` |
| Custom Node/Python agent | stdio or Streamable HTTP | whichever fits deployment |

Prefer **stdio** for one local user. Prefer **Streamable HTTP** when the MCP server is hosted separately or shared.

The hosted server supports private bearer-token mode and an explicitly enabled public-demo mode. See the package [README](../packages/token-budget-mcp/README.md#hosting-it-remotely-streamable-http) for deployment, limits, readiness, and security.

## Claude Code

### Local stdio

```sh
claude mcp add token-budget -- npx -y @shivam.dixit/token-budget-mcp
```

### Remote Streamable HTTP

```sh
claude mcp add --transport http token-budget https://your-host/mcp \
  --header "Authorization: Bearer <MCP_API_KEY>"
```

For an intentionally anonymous `PUBLIC_DEMO_MODE=true` deployment, omit the authorization header.

## Claude Desktop

For local stdio, add this to `claude_desktop_config.json`:

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

If a client version does not accept Streamable HTTP directly, use a compatible HTTP-to-stdio MCP bridge rather than changing this server's protocol.

## Cursor

Cursor supports local stdio and remote Streamable HTTP MCP servers. Put project configuration in `.cursor/mcp.json`, or use Cursor's global MCP configuration.

### Local

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

### Remote

```json
{
  "mcpServers": {
    "token-budget": {
      "url": "https://your-host/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_API_KEY>"
      }
    }
  }
}
```

Do not commit a real API key. Use the client's supported environment-variable/secret mechanism.

## Other MCP-native clients

For Windsurf, VS Code agent extensions, IDE agents, desktop assistants, and other MCP clients, the same two primitives apply:

### stdio

```text
command: npx
args: -y @shivam.dixit/token-budget-mcp
```

### Streamable HTTP

```text
URL: https://your-host/mcp
Authorization: Bearer <MCP_API_KEY>   # private mode only
```

Configuration filenames and UI differ between clients. The protocol does not: a compatible client initializes the server, discovers tools, and calls them using their published schemas.

Do not assume a product supports MCP merely because its underlying model can call tools. MCP support belongs to the **host application/runtime**, not the model itself.

## OpenAI Agents SDK — JavaScript/TypeScript

The OpenAI Agents SDK supports Streamable HTTP and stdio MCP servers.

```ts
import {
  Agent,
  MCPServerStreamableHttp,
  run,
} from '@openai/agents';

const tokenBudget = new MCPServerStreamableHttp({
  name: 'token-budget',
  url: 'https://your-host/mcp',
  requestInit: {
    headers: {
      Authorization: 'Bearer ' + process.env.TOKEN_BUDGET_MCP_API_KEY,
    },
  },
  cacheToolsList: true,
});

await tokenBudget.connect();

try {
  const agent = new Agent({
    name: 'Context diagnostics assistant',
    instructions:
      'Use token-budget tools when you need to analyze context pressure or compare context-management strategies.',
    mcpServers: [tokenBudget],
  });

  const result = await run(
    agent,
    'Compare strategies for this conversation under an 8,000-token budget.',
  );

  console.log(result.finalOutput);
} finally {
  await tokenBudget.close();
}
```

The SDK discovers the MCP tool schemas for the agent. You do not need to recreate every token-budget MCP tool manually.

## OpenAI Agents SDK — Python

```py
import asyncio
import os

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp


async def main():
    async with MCPServerStreamableHttp(
        name="token-budget",
        params={
            "url": "https://your-host/mcp",
            "headers": {
                "Authorization": "Bearer " + os.environ["TOKEN_BUDGET_MCP_API_KEY"]
            },
        },
        cache_tools_list=True,
    ) as server:
        agent = Agent(
            name="Context diagnostics assistant",
            instructions=(
                "Use token-budget tools to analyze context pressure "
                "and compare context-management strategies."
            ),
            mcp_servers=[server],
        )
        result = await Runner.run(
            agent,
            "Diagnose this conversation's token-budget pressure.",
        )
        print(result.final_output)


asyncio.run(main())
```

For an anonymous public-demo deployment, omit the authorization header.

## Custom agents and frameworks

If an AI framework does not provide native MCP integration, your application can act as the MCP client:

```text
user
  ↓
your agent runtime / model API
  ↓
MCP client
  ↓
token-budget-mcp
  ↓
token-budget
```

The application:

1. connects to `https://your-host/mcp` or launches the stdio process;
2. initializes MCP;
3. lists the server's tools;
4. makes those tool definitions available to its model/agent runtime;
5. when the model requests a tool, calls it through MCP;
6. feeds the result back to the model;
7. closes the MCP connection when finished.

Use the official MCP client SDK for your language instead of implementing MCP framing manually.

The repository's `scripts/smoke-token-budget-mcp.mjs` is a small real-client example: it initializes the Streamable HTTP server, lists tools, invokes a deterministic tool, validates the result, and closes cleanly.

### Vercel AI SDK, LangChain, and similar frameworks

If the framework/runtime version has native MCP client support, connect this server through that integration. Otherwise use an MCP client SDK and adapt the discovered tools to the framework's tool interface.

Do not copy the business logic from `token-budget-mcp` into framework-specific tools.

Also distinguish MCP from this repository's production adapters such as `token-budget-vercel-ai` and `token-budget-langchain`. Those integrate the **core library directly into the application's message loop**, which remains the recommended production architecture for automatic context management.

## ChatGPT and other hosted AI products

Do not assume an arbitrary hosted chat product can accept a raw stdio command or arbitrary MCP URL.

If the product exposes an MCP/app/connector mechanism, configure the hosted Streamable HTTP endpoint through that product's supported flow. If it does not expose MCP connectivity, use a custom agent/application that acts as the MCP client.

```text
model tool-calling capability != MCP client capability
```

The host must implement MCP.

## Authentication

### Local stdio

No server API key is required. The client launches the process and communicates through stdin/stdout.

### Private hosted server

Run the HTTP server with `MCP_API_KEY` and send:

```http
Authorization: Bearer <MCP_API_KEY>
```

Do not put API keys in query strings or commit them to source control.

### Public demo

A server deliberately started with:

```sh
PUBLIC_DEMO_MODE=true
```

accepts anonymous MCP requests subject to connection, body-size, session, and rate limits. Do not send private or sensitive conversation content to a shared public demo.

## Which tools should an AI use?

### Stateless Strategy Lab

Use these when the AI already has a conversation and wants to inspect it directly:

- `analyze_conversation` — token usage and conversation composition
- `compare_strategies` — compare eviction strategies on the same input
- `simulate_pressure` — inspect additional context pressure
- `find_breakpoint` — estimate warning/budget boundaries
- `diagnose_budget` — structured context-budget findings
- `recommend_strategy` — deterministic strategy guidance

These do not require a server-side session.

### Stateful budget session

Use these when you want to interact with one `TokenBudget` instance over multiple calls:

- `create_budget`
- `add_message`
- `get_context`
- `explain`
- `stats`
- `list_sessions`
- `remove_session`

`truncate_tool_output` is stateless and useful when an oversized tool result needs to be reduced to a token target.

## Example prompts after connecting

```text
Use token-budget to analyze this conversation and tell me what is consuming
the context window.
```

```text
Compare dropOldest, slidingWindow, priority, and smartPriority for this
conversation with an 8,000-token budget. Explain the important differences.
```

```text
Create a 4,000-token budget using priority strategy. Add the following
messages, get the resulting context, and explain every eviction.
```

The host discovers schemas through MCP; users normally do not need to write raw protocol requests.

## Verify the connection

Local server:

```sh
npx @modelcontextprotocol/inspector \
  npx -y @shivam.dixit/token-budget-mcp
```

Hosted server:

```sh
MCP_BASE_URL=https://your-host npm run smoke:mcp
```

Private hosted server:

```sh
MCP_BASE_URL=https://your-host \
MCP_API_KEY=<secret> \
npm run smoke:mcp
```

The smoke test performs a real MCP initialization, lists tools, invokes a deterministic tool, validates its response, and closes the connection.

## Troubleshooting

### The client says the server is disconnected

For stdio, run the `npx` command manually and confirm Node/npm can resolve the package. If the package is not published yet, build the repository and point the client at `packages/token-budget-mcp/dist/cli.js`.

For HTTP, check:

```text
GET https://your-host/healthz
GET https://your-host/readyz
```

Then confirm the MCP endpoint itself is exactly:

```text
https://your-host/mcp
```

Do not pass the base URL where a client expects the MCP endpoint.

### HTTP 401

The hosted server is in private mode and the bearer token is missing or incorrect.

### HTTP 429

The hosted server's rate limit was reached.

### HTTP 503

The service may be at its connection limit, shutting down, or temporarily unavailable during deployment/restart.

### Tools connect but the AI does not use them

Confirm the host lists token-budget tools as available. Then ask explicitly for one tool by name, such as `analyze_conversation`, to distinguish discovery problems from model tool-selection behavior.

### The model supports tool calling but there is no MCP setting

Tool calling alone is not MCP support. Use an MCP-capable host/runtime or write a small application using an MCP client SDK.

## Production architecture: MCP vs direct library integration

Use **token-budget-mcp** for:

- interactive experimentation;
- diagnostics;
- strategy comparison;
- demos;
- letting an AI assistant inspect token-budget behavior;
- one protocol surface reusable across different AI hosts.

Use the **token-budget library/adapters directly** when an application needs automatic context management on every model turn.

For production agent loops, the preferred architecture remains:

```text
agent message loop
      ↓
token-budget / provider adapter
      ↓
managed context
      ↓
model API
```

rather than adding a network MCP round trip to every turn.

See [MCP.md](./MCP.md) for the architectural reasoning.
