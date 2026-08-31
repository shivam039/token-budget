# Migrating from a custom in-house context manager

For teams that already built something more sophisticated than
`.shift()` — a bespoke class with its own eviction rules, maybe even
priority tagging or summarization. This page is about what to check
before treating token-budget as a replacement, not a generic "just
switch" pitch.

## Before migrating, be honest about what your current system actually does

Most in-house context managers, even sophisticated ones, tend to have
gaps in the same few places — worth explicitly checking your own system
against:

- **Does it guarantee tool-call/tool-result atomicity?** Specifically:
  can it ever evict one half of a `tool_call`/`tool_result` pair without
  the other? If you've never hit this in testing, it may be because your
  test conversations are short, not because the logic prevents it.
- **Does it explain its decisions**, or only produce a result? "Why did
  message X get dropped" is either answerable from stored state, or it
  isn't — check whether that answer exists today, or would require
  re-running your eviction logic with logging added after the fact.
- **Is your token accounting incremental**, or does it recompute the
  whole buffer's token count on every mutation? The latter is fine at
  small scale and becomes a real bottleneck at scale — see
  [`docs/benchmarks.md#incremental-accounting-benchmark`](../benchmarks.md#incremental-accounting-benchmark).
- **Does pinning/priority exist as a first-class concept**, or is
  "important" content protected by ad-hoc special-casing scattered
  through the eviction logic?

If your system already does all of this well, migrating is mostly about
whether you want to stop maintaining it, not whether it's broken. If it
has gaps in one or two of these, that's usually the actual reason to
migrate — not "use a library instead of custom code" in the abstract.

## Migrating incrementally

You don't have to switch everything at once. Two safe incremental paths:

**1. Keep your existing message model, adopt token-budget only for
eviction decisions:**

```ts
import { groupIntoUnits, filterByUnits, evictOldestUnitsToBudget } from '@shivam.dixit/token-budget';

// Map your existing messages into BudgetMessage-shaped objects just for
// this call, run token-budget's eviction, then map the survivors back:
const units = groupIntoUnits(yourMessages.map(toBudgetMessage));
const survivors = evictOldestUnitsToBudget(units, ctx);
const kept = filterByUnits(yourMessages.map(toBudgetMessage), survivors).map(fromBudgetMessage);
```

This is the same building-block approach a [custom strategy](../strategy-guide.md#writing-a-custom-strategy)
uses — useful if you want token-budget's atomic-pairing/budget-fitting
logic without adopting `TokenBudget` as your message store.

**2. Adopt `TokenBudget` as the message store, keep your own strategy
logic as a [custom `Strategy`](../strategy-guide.md#writing-a-custom-strategy):**

```ts
const myExistingImportanceLogic: Strategy = {
  name: 'my-existing-importance-model',
  sync: true,
  apply(messages, ctx) {
    // port your existing "what's important" logic here, operating on
    // groupIntoUnits(messages) so pinning/pairing guarantees still hold
  },
};

const budget = new TokenBudget({ maxTokens, strategy: myExistingImportanceLogic });
```

This gets you `explain()`, events, serialization, and streaming for free,
while keeping the specific importance model you've already tuned.

## What you gain either way

- `explain()` / the `decision` event — a decision trail your custom
  system may not have (see [`docs/explainability.md`](../explainability.md)).
- `serialize()`/`deserialize()` for session persistence, if you don't
  already have it.
- Incremental token accounting, benchmarked at scale (see
  [`docs/benchmarks.md`](../benchmarks.md)).
- Framework adapters (`token-budget-openai`, `-anthropic`, `-vercel-ai`,
  `-langchain`) if your custom system is currently hand-rolling wire-format
  conversion too.

## Related documentation

- [`docs/strategy-guide.md#writing-a-custom-strategy`](../strategy-guide.md#writing-a-custom-strategy)
- [`docs/API.md#custom-strategy-building-blocks`](../API.md#custom-strategy-building-blocks)
