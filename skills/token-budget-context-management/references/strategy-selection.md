# Strategy selection

All six strategies live in `strategies` (imported as
`import { strategies } from '@shivam.dixit/token-budget'`). Every one
groups messages into atomic units first via the library's internal
`toolCallId` grouping (see `SKILL.md`'s "Tool-call atomicity" section) —
a call/result pair is never split by any strategy below — and every one
excludes `pinned: true` units from eviction entirely.

## `dropOldest()`

```ts
strategies.dropOldest()
```

No config. Evicts non-pinned units oldest-first until the buffer fits
`effectiveBudget`. `name: 'drop-oldest'`, synchronous.

**Use when** chronological history is the whole policy — older context
is generically less valuable, and the app has no per-message importance
signal worth encoding. This is the right default when you're not sure
yet and just need correct, predictable behavior.

**Don't use when** some old messages matter more than some recent ones
(a pinned system prompt aside) — reach for `priority` instead.

## `slidingWindow(options)`

```ts
interface SlidingWindowOptions {
  turns: number;
  enforceBudget?: boolean;   // default false
}
strategies.slidingWindow({ turns: 4, enforceBudget: true })
```

Keeps only the last `turns` non-pinned atomic units plus all pinned
messages, **regardless of token count**, unless `enforceBudget: true`
also runs token-based eviction on the windowed result. `name:
'sliding-window'`, synchronous.

**Use when** the app only ever needs recent conversational context and
older turns are genuinely irrelevant once superseded — a ticket-scoped
support bot, a single-topic Q&A session. Cheaper and more predictable
than summarization because there's no model call and no per-message
importance to maintain.

**Don't use when** turn count doesn't correlate with token count (a few
huge messages can still blow the budget without `enforceBudget: true`),
or when some content from outside the window still matters (use
`priority` or pin it explicitly instead).

## `priority()`

```ts
strategies.priority()
```

No config; no-op if already under budget. Otherwise sorts non-pinned
units by `(priority ascending, then age ascending)` and evicts the
lowest-priority-oldest units first. `name: 'priority'`, synchronous.

**Use when** the application already has, or can derive, a meaningful
per-message importance signal — the current task, the file just edited,
a customer's active complaint vs. small talk from ten turns ago. See
[`docs/architecture-patterns.md`](../../../docs/architecture-patterns.md)'s
coding-agent blueprint for a worked example (`priority: 5` for the
current file, `priority: 1` for a stale file read from earlier).

**Don't use when** there's no real importance signal to assign — an
arbitrary priority number is worse than no policy at all, because it
looks intentional but isn't.

## `summarizeOldest(options)`

```ts
interface SummarizeOldestOptions {
  summarize: (messages: BudgetMessage[]) => Promise<string>;
  preThreshold?: number;                        // default 1
  blockSize?: number;                           // default: grows until under preThreshold
  onError?: 'throw' | 'fallback-drop-oldest';    // default 'throw'
  retries?: number;                              // default 0
  maxSummaryDepth?: number;                      // default 3
  onMaxDepthReached?: 'evict' | 'keep-forever' | ((message: BudgetMessage) => 'evict' | 'keep-forever'); // default 'keep-forever'
}
strategies.summarizeOldest({ summarize: mySummarizer, blockSize: 4 })
```

When usage exceeds `preThreshold * effectiveBudget`, takes the oldest
eligible non-pinned units, calls `summarize()` on them, and replaces the
block with one synthetic message. Re-summarizes prior summaries up to
`maxSummaryDepth`. `name: 'summarize-oldest'`, **asynchronous** — requires
`getContext()`, not `getContextSync()`.

**Use only when both are true**: (1) the semantic content of old context
is genuinely worth preserving in compressed form rather than dropping,
and (2) the host application already has, or is willing to add, a real
`summarize()` implementation (an LLM call, typically). Do not add this
strategy speculatively "because it sounds more sophisticated" — it costs
an extra model call per fold, adds latency, and a summarizer that
doesn't exist yet is not a reason to add the config for one. If the app
has no summarization mechanism, `dropOldest`/`priority`/`slidingWindow`
are strictly simpler and equally correct for pure eviction.

**Don't use when** old context truly has no ongoing value (support
tickets that are ticket-scoped — `slidingWindow` is cheaper and just as
correct), or when the app cannot tolerate the extra latency/cost of a
summarization call on the hot path.

## `semanticRelevance(options)`

```ts
interface SemanticRelevanceOptions {
  scorer: Scorer;
  auxiliaryContext?: unknown;
  mustRetain?: (msg: BudgetMessage) => boolean;
  weights?: { semantic?: number; recency?: number; priority?: number }; // default { semantic: 1 }
  scoringTimeoutMs?: number;   // default 2000
  fallback?: Strategy;
}
strategies.semanticRelevance({ scorer: myScorer, fallback: strategies.dropOldest() })
```

Scores every eligible message against the current query (the latest
`user` message) via `scorer.score()`, blends semantic/recency/priority
per `weights`, and keeps the highest-scoring units. `name:
'semantic-relevance'`, asynchronous. **Construct one instance per
`TokenBudget`** — the doc comment on this strategy explicitly warns that
its per-instance score cache is invalidated by query changes and is not
safe to share across independent budgets.

**Use when** relevance to the current question — not recency, not a
static priority — should decide what survives, and an embedding/scoring
function is available (`token-budget-embeddings`'s
`createEmbeddingsScorer({ embed })` is a ready-made cosine-similarity
`Scorer`; bring your own `embed` function).

**Don't use when** there's no scoring function available and adding one
is out of scope — always pass `fallback` (e.g. `dropOldest()`) so a
scoring timeout or error degrades gracefully instead of throwing.

## `chain(strategies)`

```ts
strategies.chain([
  strategies.summarizeOldest({ summarize: mySummarizer, blockSize: 4 }),
  strategies.priority(),
])
```

Runs strategies in sequence, each seeing the prior's output. `name` is
`` `chain(${names.join(' -> ')})` ``; `sync` is true only if every member
is synchronous.

**Use when** one strategy alone doesn't fully express the policy — most
commonly a summarization pass that folds old context, followed by a
`priority()` backstop for anything summarization left over budget. The
repository's own [`examples/coding-agent-context`](../../../examples/coding-agent-context)
(at the repo root — not this Skill's own `examples/` directory, which
holds framework-integration guides instead) does exactly this. Don't
chain strategies that don't compose meaningfully just to seem thorough
— each added strategy is another thing to test and explain.
