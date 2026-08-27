# Example: a coding agent, with tool-call atomicity

System instructions + conversation + tool calls + tool results, kept
inside a 120-token budget via `strategies.priority()`. Demonstrates the
mechanic that makes hand-rolled `messages.slice()` truncation unsafe for
agent loops: a tool-call and its tool-result are always evicted or kept
**together** — never split into an orphaned tool result, which most
provider APIs reject outright.

## Run it

Requires the one-time repo-root setup in [`../README.md`](../README.md)
first (`npm install && npm run build`, so `token-budget`'s `dist/`
exists for this example to import). Then:

```sh
cd examples/coding-agent
npm start
```

## What to look at

- `priority: 1` on the stale `read_file('src/old-helpers.ts')` call/result
  pair vs. `priority: 5` on the current file and test run — the low-priority
  pair is evicted first when over budget.
- The `toolCallId` link between a `tool` message and the `assistant`
  message that produced it — `priority()` (like every built-in strategy)
  treats a linked pair as one atomic unit.
- The final check: every surviving tool result's `toolCallId` points to a
  surviving tool call. That's not a coincidence — it's guaranteed by the
  library, not something this example's code enforces itself.
