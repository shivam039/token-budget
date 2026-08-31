# Persisting and restoring a session

**Problem:** your process restarts (deploy, crash, serverless cold start)
mid-session, and the conversation should resume from where it left off,
not from scratch.

**Why a naive implementation fails:** persisting just the raw message
array loses everything token-budget tracks alongside it — `pinned`/
`priority` flags, per-message token counts, the schema needed to detect
an incompatible future format — and reconstructing a `TokenBudget` from
scratch means re-deriving all of that by hand, or silently dropping it.

## Solution

```ts
// Auto-persist on every mutation (simplest — write wherever you like):
const budget = new TokenBudget({
  maxTokens: 128000,
  strategy: strategies.priority(),
  onPersist: (state) => saveToRedis(sessionId, state),
  persistDebounceMs: 500, // coalesce rapid mutations into one write
});

// Or persist explicitly, on your own schedule:
const state = budget.serialize();
await saveToRedis(sessionId, state);
```

```ts
// Restore in a new process:
const state = await loadFromRedis(sessionId);
const budget = TokenBudget.deserialize(state, {
  strategy: strategies.priority(), // re-supply what serialize() couldn't capture
});
```

## Explanation

`serialize()` produces a plain, JSON-serializable snapshot: every message
(including synthetic summaries, with full metadata) plus the JSON-safe
half of the config (`maxTokens`, `reserve`, `warningThreshold`,
`charsPerToken`, `devMode`, `onStrategyDuringStream`). It deliberately
excludes anything that can't be serialized generically — the `strategy`
object itself, a custom `tokenizer` instance, `messageOverhead`/
`contentCounters` functions. `TokenBudget.deserialize(state, overrides)`
re-supplies those via `overrides`, and can also override any JSON-safe
field (e.g. restoring a session but pointing it at a bigger `maxTokens`
for a model change).

`onPersist` (with `persistDebounceMs`) is sugar for calling `serialize()`
yourself after every mutation — use it when you want auto-persistence
without threading a `serialize()` call through every call site that
mutates the buffer. No storage backend is bundled; write `state` to
Redis, a database row, IndexedDB, wherever fits your deployment.

## Production considerations

- `schemaVersion` is included in every snapshot — `deserialize()` throws
  if it's newer than your installed `token-budget` version supports
  (upgrade the package), and warns (doesn't throw) if it's older. Check
  your version pin if you see that warning unexpectedly.
- Open streams are excluded by default — pass
  `serialize({ includeOpenStreams: true })` if you need a mid-flight
  stream's partial content to survive a restart; see
  [`docs/cookbook/streaming.md`](./streaming.md) for what "resuming" it
  actually means (you decide whether to finalize or discard on restore).
- Test the actual round trip, not just that `serialize()` doesn't throw —
  `deserialize()` a snapshot and confirm `stats()`/`getContext()` behave
  identically to the pre-restart budget, including with whatever
  `overrides` your production restore path actually passes.

## Related documentation

- [`docs/API.md#serialization`](../API.md#serialization) — full signatures and important behavior
- [`docs/production-checklist.md`](../production-checklist.md) — "test serialization/recovery"
