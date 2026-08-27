# Examples

Standalone, runnable mini-projects — each has its own `package.json` and
can be copied out of this repo and run on its own once `token-budget` is
published (they resolve to the local workspace build for now).

**One-time setup, from the repo root, before running any example below**
(the examples resolve `token-budget` via a workspace symlink, so the
core package needs a real `dist/` to import — a plain `npm install`
inside an example directory alone is not enough on a fresh clone):

```sh
git clone https://github.com/shivam039/token-budget.git
cd token-budget
npm install
npm run build
```

Then `cd examples/<name> && npm start` for any example below.

| Example | Demonstrates |
| --- | --- |
| [`openai-long-conversation`](./openai-long-conversation) | A 300-turn conversation kept under a 16,000-token budget with summarize-oldest + drop-oldest, converted to OpenAI's wire format via `token-budget-openai`. |
| [`coding-agent`](./coding-agent) | Tool-call/tool-result atomicity — a stale tool-call pair gets evicted together, never orphaned, while the agent's current-file context survives. |
| [`coding-agent-context`](./coding-agent-context) | The product demo: a realistic ~20-message coding-agent session (file reads, terminal output, a full test run, old vs. recent turns) that overflows a real budget, with a before/after token count and `explain()`'s full reasoning trail for what was summarized, evicted, and preserved. |

For smaller, single-file recipes (customer support, RAG chat, long-form
writing), see
[`packages/token-budget/COOKBOOK.md`](../packages/token-budget/COOKBOOK.md)
instead — those are tested inline as part of the core package's own test
suite.
