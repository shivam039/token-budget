# Strategy guide: which one should I use?

Seven built-in strategies, one question each is best at. All are set via
`TokenBudgetConfig.strategy`; every one respects pinned messages and
tool-call/tool-result atomicity regardless of which you pick — see the
[root README](../README.md#what-this-actually-does). Exact signatures:
[`docs/API.md#strategies`](./API.md#strategies).

## Decision table

| Situation | Recommended strategy | Why |
| --- | --- | --- |
| Simple chatbot / support conversation | `slidingWindow` | Only the last few turns matter for the current exchange — cheaper and more predictable than scoring or summarizing. |
| Long-running agent with mixed-importance context | `priority` | Age alone isn't the right signal — a still-relevant old message shouldn't go before a stale recent one. |
| Tool-heavy agent (file reads, terminal output, grep results) | `priority`, with tool output tagged by relevance | Stale tool output should go before still-relevant context, not just old context — see the [coding-agent cookbook recipe](../packages/token-budget/COOKBOOK.md#coding-agent). |
| Long conversation that needs to stay coherent, not just short | `summarizeOldest` | Dropping early turns loses the throughline; folding them into a running summary keeps continuity a pure eviction strategy can't. |
| Simple, predictable trimming, no summarizer available | `dropOldest` | The default and the floor — no configuration, no external summarizer call, easy to reason about. |
| Retrieval-augmented (RAG) chat | `summarizeOldest` for conversation + re-inject fresh retrieved docs each turn | Retrieved chunks are cheap to regenerate and go stale immediately; conversational history is the part worth preserving via summary. See the [RAG chat recipe](../packages/token-budget/COOKBOOK.md#rag-chat). |
| You have embeddings and want relevance-ranked retention | `semanticRelevance` | Ranks by actual similarity to the current query, not just age or a manually-set priority number. |
| Want the "never drop system/current-query, drop tool calls first, condense the rest" defaults without hand-tagging every message | `smartPriority` | Auto-pins system + current query and deprioritizes untagged tool-call/tool-result units — a zero-config starting point; still respects any `pinned`/`priority` you set yourself. |
| Need a hard budget guarantee even if summarization doesn't get there | `chain([summarizeOldest(...), dropOldest()])` | `dropOldest` as a backstop guarantees the result fits, even if one round of summarizing isn't enough. |
| None of the above fit your importance model | A custom strategy | See [Writing a custom strategy](#writing-a-custom-strategy) below. |

## Each strategy, briefly

### `dropOldest`

```ts
strategy: strategies.dropOldest()
```

Evicts the oldest non-pinned atomic units first, until the buffer fits.
No options — the simplest possible strategy, and the library's default if
you don't configure one.

**Use when:** you want predictable, easy-to-explain behavior and don't
need summarization or importance scoring.

**Don't use when:** old context is sometimes still relevant (a pinned
system prompt or an important early decision) and you can't mark
everything important as `pinned` — reach for `priority` instead.

### `slidingWindow`

```ts
strategy: strategies.slidingWindow({ turns: 4, enforceBudget: true })
```

Keeps only the last `turns` non-pinned atomic units, plus everything
pinned — by turn count, not strictly by token budget, unless
`enforceBudget: true` also trims the kept window down to size.

**Use when:** the conversation shape is "only recent turns matter" —
customer support, a short-lived task, a chatbot with no long-term memory
requirement.

**Don't use when:** important context can appear outside the last N
turns (a fact established early, a file read from three tool calls ago
that's still relevant) — a fixed window has no way to keep it without
pinning it explicitly.

### `priority`

```ts
budget.addMessage({ role: 'tool', content: fileContents, priority: 5 });
strategy: strategies.priority()
```

Evicts the lowest-`priority` non-pinned units first (ties broken by age).
You set `priority` per message at `addMessage()` time — the strategy
itself has no options.

**Use when:** importance isn't purely a function of age — a coding agent
where the file currently being edited matters more than a file read five
turns ago, regardless of which is older.

**Don't use when:** you have no natural way to assign a priority number
per message — `dropOldest` or `slidingWindow` are simpler defaults until
you do.

### `summarizeOldest`

```ts
strategy: strategies.summarizeOldest({
  summarize: async (messages) => callYourOwnSummarizerHere(messages),
  maxSummaryDepth: 5,
})
```

Folds the oldest eligible block into a synthetic summary message via a
`summarize` callback you supply, instead of dropping it outright.
**Not sync** — always paired with `getContext()`, never `getContextSync()`.

**Use when:** losing early context entirely would break continuity a user
would notice — long-form writing, a multi-hour support case, RAG chat's
conversational thread.

**Don't use when:** the cost/latency of an extra model call per eviction
isn't worth it for content nobody will ask about again (most stale tool
output), or the summarizer itself might be unreliable/expensive — see
["Why not summarize everything?"](./why-token-budget.md#why-not-summarize-everything) in the why-not doc.

### `chain`

```ts
strategy: strategies.chain([
  strategies.summarizeOldest({ summarize: mySummarizer }),
  strategies.dropOldest(),
])
```

Runs multiple strategies in sequence, each on the previous one's output.

**Use when:** you want summarization's continuity benefit but need a
hard guarantee the result always fits budget — `dropOldest` as the last
link in the chain is the backstop.

**Don't use when:** a single strategy already gets you there — chaining
adds a step to reason about for no benefit if the first strategy alone
never leaves you over budget.

### `semanticRelevance`

```ts
strategy: strategies.semanticRelevance({
  scorer: myEmbeddingScorer, // see token-budget-embeddings for a reference implementation
  weights: { semantic: 0.7, recency: 0.3 },
})
```

Scores every non-pinned message against the current query and retains the
highest scorers until the budget is full.

**Use when:** you already have embeddings/retrieval infrastructure and
want relevance-ranked retention instead of age- or manually-tagged
priority.

**Don't use when:** you don't already have a scorer — building one just
for this is a bigger investment than `priority`, which gets most of the
same benefit from a number you set yourself. Also skip it if your
messages are small/cheap to score in bulk but a scoring call per message
would add real latency — check `scoringTimeoutMs` and set a `fallback`.

### `smartPriority`

```ts
strategy: strategies.smartPriority()
// or, with condensation instead of dropping older turns:
strategy: strategies.smartPriority({
  condense: { summarize: mySummarizer, blockSize: 4 },
})
```

A zero-config default composing `pinned`, `priority`, and (optionally)
`summarizeOldest`: auto-pins every `system` message and the current
(most recent) `user` message, defaults untagged tool-call/tool-result
units to a low priority so they're evicted before ordinary conversation
turns, and — if you pass `condense` — folds older non-pinned turns into
a synthetic summary (a real one via your `summarize` callback, or a
fixed placeholder string) instead of dropping them outright. Never
overrides a `pinned`/`priority` you set explicitly — it only fills in
defaults for messages that didn't specify one.

**Use when:** you want the three-tier "never drop the essentials, drop
tool noise first, condense rather than discard" policy most agents
actually want, without writing `pinned: true`/`priority: N` on every
message yourself.

**Don't use when:** you need precise, fully manual control over exactly
what's pinned/prioritized — compose `priority()` (and
`summarizeOldest()`/`chain()`) directly instead, tagging messages
yourself rather than relying on this strategy's defaults.

## Writing a custom strategy

A `Strategy` is `{ name: string, sync: boolean, apply(messages, ctx) }`.
Use the same building blocks the built-ins use, exported from the package:

```ts
import { groupIntoUnits, filterByUnits, unitTokens, evictOldestUnitsToBudget } from '@shivam.dixit/token-budget';
import type { Strategy, BudgetMessage, StrategyContext } from '@shivam.dixit/token-budget';

function myStrategy(): Strategy {
  return {
    name: 'my-strategy',
    sync: true,
    apply(messages: BudgetMessage[], ctx: StrategyContext): BudgetMessage[] {
      const units = groupIntoUnits(messages); // respects pinning + tool-call pairing automatically
      // ... pick which units survive, using unitTokens(unit, ctx) to check cost ...
      const survivors = evictOldestUnitsToBudget(units, ctx); // or your own logic
      return filterByUnits(messages, survivors);
    },
  };
}
```

`groupIntoUnits`/`filterByUnits` are what guarantee a custom strategy
can't accidentally split a tool-call from its result or evict a pinned
message — build on top of units, not raw messages, and those guarantees
come for free. Full signatures: [`docs/API.md#custom-strategy-building-blocks`](./API.md#custom-strategy-building-blocks).

If your strategy needs to appear in `explain()`, call `ctx.trace(step)`
with a `StrategyStepTrace` for each decision — see the built-in
strategies' source for the exact shape, or skip it if debuggability isn't
a requirement for this strategy.

## Related documentation

- [`docs/API.md`](./API.md) — exact signatures and options for every strategy
- [`docs/explainability.md`](./explainability.md) — how to see what any strategy actually did
- [`packages/token-budget/COOKBOOK.md`](../packages/token-budget/COOKBOOK.md) — full runnable, tested recipes
- [`docs/architecture-patterns.md`](./architecture-patterns.md) — priority-tier blueprints for common agent shapes
