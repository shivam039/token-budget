# Why token-budget?

Six honest "why not just X" answers in one place. Each is a summary with a
link to the fuller treatment elsewhere — this page exists so a skeptical
developer can find every "why not just..." answer without hunting across
the README, FAQ, and comparisons docs separately.

## Why not just use a tokenizer?

A tokenizer answers "how many tokens is this text?" — a `count(text): number`
function, nothing more. token-budget answers a different question: "given
a growing buffer and a hard limit, what should stay, in what order, and
why?" You need a tokenizer either way — token-budget ships a
zero-dependency estimator, or plug in a real one — but counting tokens
doesn't decide what to evict once you're over budget, how to keep a
tool-call and its result together, or how to explain the decision
afterward. Full comparison, including the honest performance numbers
(token-budget's own tokenizer is *slower* than `gpt-tokenizer` at raw
counting, and says so):
[`docs/comparisons/token-budget-vs-gpt-tokenizer.md`](./comparisons/token-budget-vs-gpt-tokenizer.md).

## Why not `messages.slice(-N)`?

The obvious first thing to write, and a reasonable start. It breaks down
because messages vary wildly in size — a fixed message count doesn't
translate to a fixed token count, so `slice(-10)` might be well under
budget one turn and over it the next, depending on what's in those 10
messages (a one-line reply vs. a 4,000-token file dump). It's also
oblivious to what's actually important: the 11th-from-last message might
be a pinned system prompt or a fact the conversation still depends on,
and `slice` has no concept of "important" beyond position. Full detail:
[migration-from-simple-sliding-window.md](./migration/migration-from-simple-sliding-window.md).

## Why not `.shift()`?

The next thing most teams write once they notice `slice(-N)` isn't
token-aware: `while (tokens > max) messages.shift()`. This is real
working code, and it's where things get subtle wrong instead of obviously
wrong: it deletes the system prompt the moment it's the oldest message
(unless someone remembers to special-case it every time), it splits a
tool-call from its result once the loop happens to shift one half away
(which most provider APIs then reject outright as a malformed request),
and there's no way to answer "why did it drop *that* message" after the
fact — not because the answer doesn't exist, but because nothing recorded
it. token-budget is this exact logic, written once, with pinned-message
guarantees, atomic tool-call pairing, and an `explain()` trace built in.
Full before/after: [migration-from-manual-trimming.md](./migration/migration-from-manual-trimming.md).

## Why not summarize everything?

Summarizing every eviction (instead of dropping) sounds strictly better —
nothing is ever truly lost. In practice it has real costs `summarizeOldest`
is deliberately not the default for: an extra model call per eviction adds
latency and cost to what should be a cheap buffer operation, a
summarization pass can itself fail or hallucinate detail that wasn't
there, and most stale context (an old file read, a tool result from three
turns ago) genuinely doesn't need to survive in any form — dropping it is
correct, not a compromise. token-budget's default strategy is
`dropOldest`; `summarizeOldest` is opt-in for the specific cases where
continuity actually matters (see the [strategy guide](./strategy-guide.md)'s
decision table), and `chain([summarizeOldest(...), dropOldest()])` lets
you summarize what's worth it while keeping a hard drop-based guarantee
as backstop.

## Why not LangChain's `trim_messages` / `SummarizationMiddleware`?

If you're already all-in on LangChain.js, those cover the basics — for
many apps, that's genuinely enough, and adding a second dependency for
the same job isn't worth it. Reach for token-budget instead when you need
the same eviction/summarization logic to work identically across
LangChain, the Vercel AI SDK, or a raw provider client (no framework
lock-in); a strategy *chain* with a hard token-budget guarantee; or an
explainable decision trail. Full technically-fair comparison with the
tested workload spelled out:
[`docs/comparisons/token-budget-vs-langchain.md`](./comparisons/token-budget-vs-langchain.md).

## Why not `gpt-tokenizer`?

Not a competitor — a different job, and worth saying plainly:
`gpt-tokenizer` can be genuinely excellent for raw tokenization
throughput, and if that's your actual bottleneck, use it. token-budget is
solving a different problem (what stays in context, not how fast can you
count tokens), and it doesn't compete on tokenizer speed — its own
`token-budget-tiktoken` package is honestly *slower* than `gpt-tokenizer`
at the one thing `gpt-tokenizer` does, published without spin in
[`docs/benchmarks.md`](./benchmarks.md#raw-tokenizer-benchmark). The two
compose rather than compete: `gpt-tokenizer` (or any tokenizer with a
`count(text): number` method) can be used directly as token-budget's
`tokenizer` option, giving you fast counting *and* the eviction/
prioritization/explainability layer on top. Full deep dive:
[`docs/comparisons/token-budget-vs-gpt-tokenizer.md`](./comparisons/token-budget-vs-gpt-tokenizer.md).

## Related documentation

- [`docs/comparisons.md`](./comparisons.md) — the full comparison taxonomy (tokenizers, memory systems, agent frameworks, compression systems)
- [`docs/migration/`](./migration/) — concrete before/after code for moving off a DIY approach
- [`docs/strategy-guide.md`](./strategy-guide.md) — which built-in strategy fits your situation
