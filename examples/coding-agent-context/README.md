# Example: a coding agent's context, at realistic scale

The other example ([`../coding-agent`](../coding-agent)) proves the
atomicity guarantee with 6 messages and a 120-token toy budget. This one
is the product demo: a ~20-message session shaped like a real coding
agent actually produces it — a pinned system prompt, a dead-end file
read, verbose terminal/test output, a stack trace, old turns and recent
ones — that grows past a realistic 700-token budget, and exactly what
`token-budget` does about it. For the broader problem this solves, see
[`docs/guides/ai-agent-context-management.md`](../../docs/guides/ai-agent-context-management.md).

## Run it

Requires the one-time repo-root setup in [`../README.md`](../README.md)
first (`npm install && npm run build`, so `token-budget`'s `dist/`
exists for this example to import). Then:

```sh
cd examples/coding-agent-context
npm start
```

## What you'll see

```
BEFORE — raw session, nothing evicted yet
Messages:  13
Context:   ~1111 tokens
Budget:    ~600 tokens (700 max, 100 reserved)
Status:    OVER BUDGET

AFTER — token-budget applied: summarize-oldest, then priority as backstop
Messages:  7 (was 13)
Context:   ~531 tokens
Status:    WITHIN BUDGET
Saved:     ~580 tokens
```

Followed by, for every strategy in the chain, exactly which messages it
touched and why (`explain()`'s output — not paraphrased, this is the
real `evicted`/`synthesized` trace), then a "preserved" list derived from
the surviving messages, then a final check that no tool result was left
pointing at an evicted tool call.

## What to look at

- **The chain**: `strategies.chain([summarizeOldest({...}), priority()])`
  — pass one folds the oldest stale block (the dead-end file read, the
  first partial test run) into a single summary message; pass two is a
  backstop that only fires if pass one didn't get all the way under
  budget (here it doesn't need to — you'll see it report a no-op).
- **`pinned: true`** on the system prompt — it's never touched by either
  strategy, regardless of age or priority.
- **`priority`** on the final full-suite test run (`priority: 5`) vs. the
  first, superseded partial run and the dead-end file read
  (`priority: 1`) — recency alone wouldn't distinguish "this tool result
  is now redundant" from "this tool result is the evidence the fix
  works"; priority does.
- **The summarizer callback** is a deterministic stand-in (extracts file
  names mentioned, no network call) so this example has no external
  dependency and reproducible output — swap it for a real LLM call in
  production. `summarizeOldest` is `async` for exactly this reason.
- **The atomicity check at the end**: every surviving tool result's
  `toolCallId` still points at a surviving tool call. That's not
  something this example's code enforces — it's guaranteed by every
  built-in strategy grouping a call/result pair into one atomic unit
  before eviction ever runs.

## Why this is the harder problem than raw token counting

Counting tokens is the easy 10%. The actual problem a long-running
coding agent has is *deciding what to keep* when the count goes over —
without dropping the system prompt, without orphaning a tool result,
and (ideally) without dropping the one piece of evidence that proves the
fix works just because it happened to be old. That decision, and being
able to explain it afterward, is what this library is for.
