# Examples

Standalone, runnable mini-projects — each has its own `package.json` and
can be copied out of this repo and run on its own once `token-budget` is
published (they resolve to the local workspace build for now).

| Example | Demonstrates |
| --- | --- |
| [`openai-long-conversation`](./openai-long-conversation) | A 300-turn conversation kept under a 16,000-token budget with summarize-oldest + drop-oldest, converted to OpenAI's wire format via `token-budget-openai`. |
| [`coding-agent`](./coding-agent) | Tool-call/tool-result atomicity — a stale tool-call pair gets evicted together, never orphaned, while the agent's current-file context survives. |

For smaller, single-file recipes (customer support, RAG chat, long-form
writing), see
[`packages/token-budget/COOKBOOK.md`](../packages/token-budget/COOKBOOK.md)
instead — those are tested inline as part of the core package's own test
suite.
