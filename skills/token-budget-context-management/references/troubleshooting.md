# Troubleshooting

## "Context still exceeds the model's limit after integrating token-budget"

Check, in this order:

1. **Is `reserve` actually subtracting everything it needs to?** Output
   tokens, the system/developer prompt (if it's sent separately from
   the buffer and not itself counted), and tool-definition schemas sent
   with every request are all real overhead against the same window —
   if none of that is reflected in `reserve`, `effectiveBudget` is
   larger than the true available space. See `SKILL.md`'s budget
   formula.
2. **Is everything actually going through `addMessage()`?** Content
   added to the outgoing request outside the `TokenBudget` instance
   (e.g. a system prompt concatenated separately at send time) isn't
   counted or eligible for eviction.
3. **Are tool definitions counted?** They're not messages, so
   `TokenBudget` doesn't know about them automatically — they belong in
   `reserve` (a fixed estimate) or a `messageOverhead`/`contentCounters`
   override if they vary per request.
4. **Is the tokenizer accurate enough for this case?** The default
   `'estimate'` tokenizer (~4 chars/token for Latin text) can undercount
   dense or non-Latin content — see "Token count differs from the
   provider" below. For a hard limit, prefer an exact tokenizer
   (`token-budget-tiktoken` for OpenAI-family models) or a larger
   `reserve` as safety margin.
5. **Is everything pinned?** See `references/anti-patterns.md`'s
   "Protecting everything" — pinned content isn't eligible for eviction
   at all, so over-pinning reproduces exactly this symptom.

## "Important information disappeared that should have survived"

Check:

1. **Strategy choice** — `dropOldest`/`slidingWindow` have no concept
   of importance beyond recency; if the missing content was old but
   important, that's `priority` or pinning, not a bug in the strategy
   that's running.
2. **Priority configuration** — with `priority()`, confirm the important
   message actually has a higher `priority` value than what displaced
   it; the default (unset) is `0`.
3. **Pinning** — should this have been `pinned: true`? Pinning is the
   only guarantee independent of any strategy's policy.
4. **Summarization depth** — with `summarizeOldest`, a message folded
   into a synthetic summary isn't "gone," it's compressed; call
   `budget.explain()` and look at `steps[].synthesized[].sourceIds` to
   confirm which original messages fed which summary, and check whether
   `maxSummaryDepth`/`onMaxDepthReached` caused a summary itself to be
   hard-evicted.
5. **Tool-call groups** — confirm the missing message wasn't part of a
   unit that got evicted as a whole because its *paired* message (the
   call or the result) looked low-value to the strategy even though this
   one didn't.

`budget.explain()` (see `docs/explainability.md`) is the authoritative
source here — read `steps[].evicted[].reason` for the actual decision
rather than guessing from the strategy's general behavior.

## "Tool calls are broken after integrating token-budget"

Check:

1. **Is `toolCallId` actually set** on the tool-result message, pointing
   at the `id` of the message that produced the call? Without it,
   nothing links them and they're eligible to be evicted independently
   — see `SKILL.md`'s "Tool-call atomicity."
2. **Message format from the framework adapter** — if using
   `token-budget-openai`/`-anthropic`/`-langchain`/`-vercel-ai`, confirm
   the adapter's conversion function is actually being used for both
   directions (into `token-budget` and back out to the provider) rather
   than a hand-written partial conversion; see the relevant file under
   `examples/`.
3. **Provider-specific tool representation** — some providers embed tool
   calls inside the assistant message's content blocks rather than as a
   separate message; confirm the mapping used actually produces
   `token-budget`-visible `BudgetMessage`s with a real `toolCallId` link,
   not just visually adjacent messages.
4. **Custom grouping code left over from before the integration** — if
   the app previously had its own tool-pairing logic, make sure it was
   removed rather than left running alongside `token-budget`'s built-in
   grouping (two systems disagreeing about pairing is worse than either
   alone).

## "Token count differs from what the provider reports"

This is expected, not necessarily a bug — different tokenizers count
differently, and the built-in `'estimate'` tokenizer is a heuristic
(~4 chars/token for Latin script, ~1 for CJK, ~2 for Cyrillic — see
`createEstimateTokenizer`'s `EstimatorProfile`), not an exact count for
any specific model. Options, in order of effort:

1. Accept the estimate and size `reserve` with extra margin for the
   expected error — appropriate when the exact count doesn't matter,
   only staying safely under the limit does.
2. Use `token-budget-tiktoken` for exact OpenAI-family counts
   (`createTiktokenTokenizer()`).
3. Use `token-budget-claude`'s `createClaudeTokenizer()` for a
   best-effort Claude approximation, and its `calibrate(samples)`
   utility to fit the ratio against real observed usage from your own
   traffic if precision matters — Anthropic has never published Claude's
   real tokenizer, so this is explicitly an approximation, not an exact
   match.

Never claim exact equality between `token-budget`'s count and a
provider's reported usage unless it's been verified for that specific
tokenizer/model pairing — say "estimated" or "approximate" rather than
asserting precision that hasn't been confirmed.
