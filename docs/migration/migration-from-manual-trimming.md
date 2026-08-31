# Migrating from manual `.shift()` trimming

The most common first implementation of context management — and a
reasonable place to start. This page shows exactly where it breaks down
and the token-budget equivalent.

## The starting point

```ts
function trimHistory(messages: Message[], maxTokens: number): Message[] {
  while (estimateTokens(messages) > maxTokens) {
    messages.shift();
  }
  return messages;
}
```

## Where it breaks down

- **Recomputing `estimateTokens(messages)` from scratch every loop
  iteration is quadratic.** Fine at 20 messages, measurably slow at
  10,000+ — see [`docs/benchmarks.md#incremental-accounting-benchmark`](../benchmarks.md#incremental-accounting-benchmark):
  ~100× slower than incremental accounting at 100,000 messages in this
  project's own benchmark, not a rounding error.
- **It deletes the system prompt** the instant it becomes the oldest
  message, unless every call site remembers to special-case index 0.
  One missed call site and the agent silently loses its instructions.
- **It splits a tool-call from its result** whenever the loop happens to
  shift one half of a pair away before the other. Most provider APIs
  reject the resulting request outright — a `tool_call_id` with no
  matching call (or vice versa) is a malformed request, not a silent
  degradation.
- **No way to answer "why did it drop *that* message"** after the fact —
  not because the information doesn't exist, but because nothing recorded
  it. Debugging "the agent forgot X" means re-reading the loop and
  guessing.

## The token-budget equivalent

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens,
  strategy: strategies.dropOldest(), // same age-based eviction as .shift()
});

budget.addMessage({ role: 'system', content: systemPrompt, pinned: true }); // never evicted
for (const m of history) {
  budget.addMessage({ role: m.role, content: m.content, toolCallId: m.toolCallId }); // pairs never split
}

const { messages } = budget.getContextSync(); // O(1)-ish incremental accounting, not a full rescan
```

Same eviction *policy* as the original loop (oldest-first) — the
difference is everything the manual version didn't handle: `pinned: true`
guarantees the system prompt survives regardless of position;
`toolCallId` guarantees a tool-call/tool-result pair is evicted together
or not at all; and `budget.explain()` after `getContextSync()` gives you
the eviction reasons the original loop never recorded. See
[`docs/explainability.md`](../explainability.md).

If age-based eviction (`dropOldest`) isn't actually the right policy for
your agent — most coding/long-running agents aren't purely age-ordered in
importance — see [`docs/strategy-guide.md`](../strategy-guide.md) for
what to use instead; migrating the *mechanism* (this page) and choosing
the right *policy* (the strategy guide) are separate decisions.

## What doesn't change

Your message shapes, your provider call, your loop structure — this
replaces the trimming function only. Converting to/from your provider's
wire format is a separate, optional step handled by the adapter packages
(`token-budget-openai`, `token-budget-anthropic`, ...) if you want it;
`TokenBudget`'s own `BudgetMessage` shape works standalone too.

## Related documentation

- [`docs/why-token-budget.md#why-not-shift`](../why-token-budget.md#why-not-shift)
- [`docs/API.md`](../API.md) — full API reference
- [`docs/production-checklist.md`](../production-checklist.md)
