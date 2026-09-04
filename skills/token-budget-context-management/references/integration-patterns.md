# Integration patterns

## The context-boundary architecture

Prefer one clear seam where the application's own conversation state
becomes model input:

```
Application conversation state (DB / Redis / React state / agent loop)
        ↓
Context manager  ← token-budget lives here, in exactly one place
        ↓
addMessage(...) as state changes; getContext()/getContextSync() at the
model-call boundary
        ↓
Protected/selected messages
        ↓
LLM provider request (via a framework adapter if one applies — see examples/)
```

Avoid the alternative that fragile DIY implementations converge on:

```
React component → manual slice → API route → another manual slice →
agent loop → another manual slice → provider call
```

Duplicated context-management logic at multiple layers is the single
biggest source of the bugs this Skill exists to prevent — each copy
drifts from the others, and a fix applied in one place silently doesn't
apply in the others. If the existing application already has slicing
logic at more than one layer, the integration should collapse it to one
`TokenBudget` instance at the real boundary, not add a second policy
alongside the old ones.

## Where `TokenBudget` state should live

One `TokenBudget` instance per logical conversation (a chat session, an
agent run). Don't share one instance across unrelated conversations —
`stats()`, `explain()`, and `semanticRelevance`'s per-instance cache all
assume single-conversation scope.

## Adding messages vs. computing context

`addMessage()` mutates the buffer as the conversation grows (call it
once per new user/assistant/tool message, as it's produced — not in a
batch at request time). `getContext()`/`getContextSync()` is called at
the actual model-request boundary and returns the currently-selected
`ContextResult` (`messages`, `tokensUsed`, `tokensRemaining`, `evicted`,
`strategyApplied`) without mutating the buffer's insertion history — so
you can call it as many times as you send requests without losing
earlier messages that the current call's strategy happens to trim.
`getContextSync()` throws if the configured strategy isn't synchronous
(anything using `summarizeOldest` or `semanticRelevance` needs
`getContext()`).

## Persistence

Don't hand-roll a snapshot format. `serialize()`/`static deserialize()`
round-trip the full message buffer and config (excluding
non-serializable pieces like the tokenizer instance or strategy
function, which you re-supply via `deserialize()`'s `overrides`
argument). For write-as-you-go persistence, use the constructor's
`onPersist?: (state) => void | Promise<void>` hook (fired after every
buffer mutation) with `persistDebounceMs` if writes are too frequent —
don't build a separate change-detection layer to decide when to persist.
See [`docs/cookbook/serialization.md`](../../../docs/cookbook/serialization.md).

## Streaming

If the app streams assistant responses, use the dedicated streaming
methods rather than repeatedly calling `addMessage()` with a growing
partial string:

```ts
budget.beginStream(streamId, 'assistant');
// on each chunk:
budget.appendStreamChunk(streamId, chunk);
// on completion:
const message = budget.endStream(streamId);
// on client disconnect / abort:
budget.abortStream(streamId, 'discard'); // or 'keep-partial'
```

`stats().streaming` exposes running token estimates for open streams
(already folded into `tokensUsed`). `TokenBudgetConfig.onStrategyDuringStream`
controls whether `getContext()`/`getContextSync()` proceed or throw
while a stream is open — decide this deliberately rather than leaving
the default and being surprised by it. If the host app uses the Vercel
AI SDK, `token-budget-vercel-ai`'s `streamTextIntoBudget(textStream,
budget, options?)` wires this up automatically — use it instead of
hand-writing the chunk loop.

## Framework adapters — use them instead of hand-writing conversion

If the host app already uses one of these, its adapter package converts
between the framework's native message type and `token-budget`'s
`BudgetMessage`/`AddMessageInput` — use it rather than writing your own
mapping function, so tool-call linkage (`toolCallId`) and role mapping
stay correct automatically. Per-framework detail (where context enters
the provider, what to preserve, common mistakes): `examples/openai.md`,
`examples/anthropic.md`, `examples/vercel-ai.md`, `examples/langchain.md`
in this Skill directory.

If the host framework isn't one of these, there's no adapter — write
the conversion once, at the single context boundary from the
architecture diagram above, not per call site.

## `explain()` in an integration

Wire `budget.on('decision', report => ...)` or read `budget.explain()`
after each `getContext()` call if the app wants live visibility (e.g. a
debug panel, a log line) rather than only-on-demand. Don't parse or
pattern-match the `evicted[].reason` strings as an enum — they're
stable, human-readable strings per strategy, not a formal contract; if
the app needs to branch on *why* something was evicted programmatically,
branch on the strategy/config decision that produced it instead, not on
parsing the explanation text.
