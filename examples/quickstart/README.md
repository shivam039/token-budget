# Example: quickstart

The smallest possible `token-budget` setup — a pinned system prompt, five
turns, and `dropOldest` eviction once a deliberately small 60-token budget
overflows. Meant to be read top-to-bottom and understood in under 2
minutes; for a realistic session, see
[`../coding-agent-context`](../coding-agent-context) instead.

## Run it

Requires the one-time repo-root setup in [`../README.md`](../README.md)
first (`npm install && npm run build`). Then:

```sh
cd examples/quickstart
npm start
```

## What to look at

- The system message has `pinned: true` — it survives eviction even
  though it's the oldest message in the buffer.
- `getContextSync()` never mutates the buffer itself (see the root
  README's ["lifecycle" section](../../README.md#the-lifecycle-addmessage--getcontext--send--commit))
  — this script calls it once and reads the result, same as you would
  every turn in a real loop.
- `budget.explain()` at the end prints the exact reason each evicted
  message was dropped — see [`docs/explainability.md`](../../docs/explainability.md).
