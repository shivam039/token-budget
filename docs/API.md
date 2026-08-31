# API reference

Every entry below is documented from the actual TypeScript source in
[`packages/token-budget/src`](../packages/token-budget/src) — nothing here
is aspirational or unimplemented. For narrative/how-to documentation, see
the [root README](../README.md), [`docs/FAQ.md`](./FAQ.md), and
[`docs/strategy-guide.md`](./strategy-guide.md); this page is the
consistent, per-symbol reference for when you already know what you're
looking for.

```ts
import { TokenBudget, strategies, /* ... */ } from '@shivam.dixit/token-budget';
```

## Contents

- [`TokenBudget` (constructor & config)](#tokenbudget-constructor--config)
- [Buffer management](#buffer-management) — `addMessage`, `editMessage`, `removeMessage`, `clear`, `getMessages`, `estimateBeforeAdd`
- [Context retrieval](#context-retrieval) — `getContext`, `getContextSync`, `commit`, `explain`
- [Statistics & usage](#statistics--usage) — `stats`, `getUsageReport`, `exportUsageJSON`, `exportUsageCSV`
- [Serialization](#serialization) — `serialize`, `TokenBudget.deserialize`
- [Streaming](#streaming) — `beginStream`, `appendStreamChunk`, `endStream`, `abortStream`
- [Events](#events) — `on`, `off`, `listenerCount`
- [Reconfiguration](#reconfiguration) — `setMaxTokens`, `setReserve`
- [Strategies](#strategies) — `dropOldest`, `slidingWindow`, `priority`, `summarizeOldest`, `chain`, `semanticRelevance`
- [Custom-strategy building blocks](#custom-strategy-building-blocks) — `groupIntoUnits`, `filterByUnits`, `unitTokens`, `evictOldestUnitsToBudget`
- [Tool output](#tool-output) — `truncateToolOutput`
- [Model-derived budgets](#model-derived-budgets) — `MODEL_CONTEXT_WINDOWS`, `getModelContextWindow`
- [Tokenizer](#tokenizer) — `createEstimateTokenizer`

---

## `TokenBudget` (constructor & config)

### Purpose

The central class. Holds a message buffer, computes running token totals
incrementally as messages are added/edited/removed, and applies a
configured `Strategy` on demand via `getContext()`/`getContextSync()`.

### Signature

```ts
new TokenBudget(config: TokenBudgetConfig)
```

### Parameters

`TokenBudgetConfig`:

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `maxTokens` | `number` | Conditionally* | — | Total context window size, in tokens. |
| `model` | `string` | No | — | Model name. Used to auto-derive `maxTokens` from `MODEL_CONTEXT_WINDOWS` when `maxTokens` is omitted, and passed to `costModel.costPerToken()` for cost accounting. |
| `reserve` | `number` | No | `0` | Tokens set aside for the model's own reply. Must be less than `maxTokens`. |
| `tokenizer` | `Tokenizer \| 'estimate'` | No | `'estimate'` | A tokenizer instance, or the string `'estimate'` for the built-in zero-dependency heuristic. |
| `charsPerToken` | `number` | No | `4` | Heuristic-estimator tuning. Takes precedence over `estimatorProfile` when set. |
| `estimatorProfile` | `'latin' \| 'cjk' \| 'cyrillic' \| 'auto-detect'` | No | `'latin'` | Heuristic-estimator script profile. Ignored if `charsPerToken` is also set. |
| `warningThreshold` | `number` (0–1) | No | `0.8` | Fraction of the effective budget at which the `warning` event fires. |
| `strategy` | `Strategy` | No | `strategies.dropOldest()` | Eviction/compression strategy applied by `getContext`/`getContextSync`. |
| `messageOverhead` | `(message: BudgetMessage) => number` | No | built-in | Per-message fixed overhead (role/formatting tokens), added on top of content tokens. |
| `contentCounters` | `Record<string, ContentCounter>` | No | built-in | Per-content-block-type token counters, keyed by `ContentBlock.type`. |
| `devMode` | `boolean` | No | `false` | When true, `console.debug`-logs every `ExplainReport` as it's produced. |
| `onStrategyDuringStream` | `'skip' \| 'error'` | No | `'skip'` | What `getContext()`/`getContextSync()` do while a stream is open. `'error'` refuses to build a context that doesn't reflect in-flight content. |
| `onPersist` | `(state: SerializedState) => void \| Promise<void>` | No | — | Called (debounced by `persistDebounceMs`) with the current `serialize()`-shaped state after every buffer mutation. No storage backend is bundled. |
| `persistDebounceMs` | `number` | No | `0` | Debounce window (ms) for `onPersist`, trailing-edge. `0` calls it synchronously after every mutation. |
| `costModel` | `CostModel` | No | — | Pluggable cost model for cost accounting. Ignored unless `model` is also set. |
| `costWarningThreshold` | `number` | No | — | Cumulative cost threshold that fires the `costWarning` event once. |
| `maxCost` | `number` | No | — | Cumulative cost ceiling. |
| `maxCostPolicy` | `'block-new-messages' \| ((info: CostWarningInfo) => void)` | No | — (no-op) | Policy applied once `maxCost` is reached. Omitting this makes `maxCost` a no-op. |
| `onUsageSnapshot` | `(report: UsageReport, timestamp: number) => void` | No | — | Sugar for `budget.on('usageSnapshot', fn)` at construction time. |
| `usageSnapshotIntervalMs` | `number` | No | `0` (every call) | Minimum interval between `usageSnapshot` emissions. |
| `tags` | `Record<string, string>` | No | — | Arbitrary tags carried on `UsageReport`/`AuditEvent` (e.g. `{ tenantId, userId }`). |
| `redactor` | `(message: BudgetMessage) => BudgetMessage` | No | — | Pre-processor applied to every message before it's counted/buffered. Runs once per `addMessage()` call only. |
| `auditLog` | `boolean` | No | `false` | When true, calls `onAuditEvent` after every `getContext()`/`getContextSync()` call. |
| `onAuditEvent` | `(event: AuditEvent) => void \| Promise<void>` | No | — | Receives one `AuditEvent` per strategy decision when `auditLog` is true. |

\* `maxTokens` is required unless `model` names a recognized entry in
`MODEL_CONTEXT_WINDOWS`. An explicit `maxTokens` always wins if both are
set. Omitting both, or naming an unrecognized model, throws — see
[`docs/model-budgets.md`](./model-budgets.md).

Also throws if: `maxTokens` isn't a positive finite number, `reserve` is
negative or `>= maxTokens`, or `warningThreshold` is outside `[0, 1]`.

### Returns

A `TokenBudget` instance. Also exposes read-only getters:
`maxTokens`, `reserve`, `effectiveBudget` (`maxTokens - reserve`).

### Example

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 8000,
  reserve: 1000,
  strategy: strategies.dropOldest(),
});
```

### Important behavior

- Construction is pure/synchronous and throws on invalid config — nothing
  silently clamps to a "safe" value.
- `effectiveBudget` (`maxTokens - reserve`) is the number every strategy
  actually targets, not `maxTokens` itself.

### Related APIs

[Reconfiguration](#reconfiguration), [Model-derived budgets](#model-derived-budgets), [`docs/configuration.md`](./configuration.md)

---

## Buffer management

### `addMessage`

**Purpose:** Appends a message to the buffer and incrementally updates
running token/cost totals — the normal way content enters a `TokenBudget`.

**Signature:**

```ts
addMessage(input: AddMessageInput): BudgetMessage
```

**Parameters:**

`AddMessageInput` is `BudgetMessage` minus its derived fields (`tokens` is
never accepted; `id`/`timestamp` are optional and auto-generated if
omitted):

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `role` | `'system' \| 'user' \| 'assistant' \| 'tool'` | Yes | — | Message role. |
| `content` | `string \| ContentBlock[]` | Yes | — | Message content. |
| `id` | `string` | No | auto-generated | Stable identifier. Throws if it collides with an existing message. |
| `name` | `string` | No | — | Display/participant name; some providers count it as overhead. |
| `pinned` | `boolean` | No | `false` | Never evicted or summarized by any built-in strategy. |
| `priority` | `number` | No | `0` | Higher = more important. Used by the `priority` strategy. |
| `toolCallId` | `string` | No | — | Links a tool-result message to the `id` of the assistant message whose call it answers — see [tool-call/tool-result pairing](#custom-strategy-building-blocks). |
| `metadata` | `Record<string, unknown>` | No | — | Arbitrary caller metadata. |
| `timestamp` | `number` | No | `Date.now()` | Unix ms timestamp. |

**Returns:** The stored `BudgetMessage`, including its computed `tokens`
count and resolved `id`/`timestamp`.

**Example:**

```ts
budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
const msg = budget.addMessage({ role: 'user', content: 'Hello!' });
msg.tokens; // computed token count, including overhead
```

**Important behavior:**

- Throws if `input.id` is set and already exists — use `editMessage()` to
  update, or `removeMessage()` first.
- If `maxCostPolicy: 'block-new-messages'` and this message would push
  cumulative cost to `maxCost`, throws *before* any state changes — a
  rejected message leaves the buffer and usage/cost accounting untouched.
- Emits `overflow` (reason `'single-message-exceeds-budget'`) if this one
  message's token count alone exceeds `effectiveBudget` — that's a signal
  to reach for [`truncateToolOutput`](#tool-output), since no eviction
  strategy can fix a single oversized message.
- If `redactor` is configured, it runs on the message before token
  counting — redacted content is what gets counted and stored.

**Related APIs:** [`editMessage`](#editmessage), [`estimateBeforeAdd`](#estimatebeforeadd), [`truncateToolOutput`](#tool-output)

### `editMessage`

**Purpose:** Updates an existing message in place and recomputes totals.

**Signature:**

```ts
editMessage(id: string, patch: Partial<Omit<BudgetMessage, 'id'>>): BudgetMessage
```

**Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | The message to update. |
| `patch` | `Partial<Omit<BudgetMessage, 'id'>>` | Yes | Fields to merge onto the existing message. |

**Returns:** The updated `BudgetMessage` (token count recomputed).

**Important behavior:** Throws if no message with `id` exists. Preserves
the message's original position in buffer iteration order (it doesn't
move to the end).

**Related APIs:** [`addMessage`](#addmessage), [`removeMessage`](#removemessage)

### `removeMessage`

**Purpose:** Removes a message by id and recomputes totals.

**Signature:**

```ts
removeMessage(id: string): boolean
```

**Returns:** `true` if a message was removed, `false` if `id` wasn't found.

**Related APIs:** [`clear`](#clear)

### `clear`

**Purpose:** Empties the buffer entirely (all messages, running totals reset to 0).

**Signature:**

```ts
clear(): void
```

**Important behavior:** Does not reset lifetime `getUsageReport()` totals — those are cumulative by design. See [Statistics & usage](#statistics--usage).

### `getMessages`

**Purpose:** Reads the raw, unfiltered buffer — every stored message, in insertion order — without applying the configured strategy.

**Signature:**

```ts
getMessages(): BudgetMessage[]
```

**Related APIs:** [`getContext`/`getContextSync`](#context-retrieval) (strategy-applied view, vs. this raw view)

### `estimateBeforeAdd`

**Purpose:** Previews what a message *would* cost in tokens, without mutating the buffer — useful for a "this won't fit" check before committing to `addMessage()`.

**Signature:**

```ts
estimateBeforeAdd(input: AddMessageInput): number
```

**Returns:** Token count the message would have if added right now.

**Example:**

```ts
const cost = budget.estimateBeforeAdd({ role: 'tool', content: hugeFileContents });
if (cost > budget.effectiveBudget) {
  // shrink it first — see truncateToolOutput
}
```

**Related APIs:** [`truncateToolOutput`](#tool-output)

---

## Context retrieval

### `getContext`

**Purpose:** The strategy-applied, ready-to-send view of the buffer — the normal way to get "what should I actually send the model right now." Async because strategies (e.g. `summarizeOldest`) may call an async summarizer.

**Signature:**

```ts
async getContext(): Promise<ContextResult>
```

**Returns:**

`ContextResult`:

| Field | Type | Description |
| --- | --- | --- |
| `messages` | `BudgetMessage[]` | The surviving, strategy-applied messages — ready to send as-is. |
| `tokensUsed` | `number` | Token count of `messages`. |
| `tokensRemaining` | `number` | `effectiveBudget - tokensUsed`, floored at 0. |
| `evicted` | `BudgetMessage[]` | Messages present in the buffer but absent from `messages`. |
| `strategyApplied` | `string` | Name of the strategy (or chain) that ran. |

**Important behavior:**

- **Pure/read-only**: recomputes from the complete stored history every
  call. Calling it repeatedly (e.g. for a live "context usage" indicator)
  never itself evicts anything from the buffer — only [`commit()`](#commit)
  does that. See the root README's ["The lifecycle" section](../README.md#the-lifecycle-addmessage--getcontext--send--commit) for the full reasoning.
- Throws if a stream is open and `onStrategyDuringStream: 'error'` is configured.
- Emits `evicted` (if anything was evicted/replaced), `overflow` (reason
  `'unresolvable-after-strategy'`, if the strategized result still exceeds
  budget), and `decision` (mirroring `explain()`'s output) — see [Events](#events).

**Related APIs:** [`getContextSync`](#getcontextsync), [`commit`](#commit), [`explain`](#explain)

### `getContextSync`

**Purpose:** Synchronous variant of `getContext`, for strategies guaranteed never to return a `Promise` (`dropOldest`, `slidingWindow`, `priority`, and chains composed only of those).

**Signature:**

```ts
getContextSync(): ContextResult
```

**Important behavior:** Throws a descriptive error if the configured
strategy isn't declared `sync: true` (e.g. `summarizeOldest`,
`semanticRelevance`) — use `getContext()` for those instead.

**Related APIs:** [`getContext`](#getcontext)

### `commit`

**Purpose:** Makes a strategized result "stick" — replaces the raw buffer with the given messages, so the *next* `getContext()` call re-derives from this compacted state instead of the full original history.

**Signature:**

```ts
commit(messages: BudgetMessage[]): void
```

**Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `messages` | `BudgetMessage[]` | Typically a `getContext()`/`getContextSync()` result's `.messages`. |

**Important behavior:** `getContext()` never calls this itself — an
eviction or a `summarizeOldest` summary only "sticks" across turns if you
call `commit()` after sending. This is what lets `summarizeOldest`
re-summarize a previous summary on a later call, instead of re-deriving
from the same full history every time. Skipping `commit()` is fine for a
stateless "check current usage" call, but means an eviction never
persists.

**Related APIs:** [`getContext`](#getcontext)

### `explain`

**Purpose:** The structured decision trace from the most recent `getContext()`/`getContextSync()` call — what was evicted or synthesized, and why. See [`docs/explainability.md`](./explainability.md) for a full walkthrough.

**Signature:**

```ts
explain(): ExplainReport | undefined
```

**Returns:**

`ExplainReport` (JSON-serializable — no circular refs, no functions):

| Field | Type | Description |
| --- | --- | --- |
| `steps` | `StrategyStepTrace[]` | One entry per strategy that ran — a plain strategy produces one, a `chain([...])` produces one per member, in order. |
| `tokensBefore` | `number` | Token count before this call's strategy ran. |
| `tokensAfter` | `number` | Token count after. |
| `tokensRemaining` | `number` | `effectiveBudget - tokensAfter`, floored at 0. |
| `strategyApplied` | `string` | Name of the (possibly chained) strategy. |
| `timestamp` | `number` | Unix ms when this call ran. |

Each `StrategyStepTrace`: `strategyName`, `tokensBefore`, `tokensAfter`,
`messagesConsidered`, `evicted: { id, reason }[]`, `synthesized: { id, sourceIds, reason }[]`.

Returns `undefined` if neither `getContext()` nor `getContextSync()` has
been called yet.

**Related APIs:** [`docs/explainability.md`](./explainability.md), the `decision` event under [Events](#events)

---

## Statistics & usage

### `stats`

**Purpose:** Current buffer usage, without applying the configured strategy — cheap and safe to call on every render of a "context usage" indicator.

**Signature:**

```ts
stats(): Stats
```

**Returns:**

| Field | Type | Description |
| --- | --- | --- |
| `tokensUsed` | `number` | Includes open streams' running estimates. |
| `tokensRemaining` | `number` | `effectiveBudget - tokensUsed`, floored at 0. |
| `maxTokens` | `number` | | 
| `reserve` | `number` | |
| `messageCount` | `number` | |
| `pinnedCount` | `number` | |
| `streaming` | `StreamingEstimate[]` | Open streams' `{ id, estimatedTokens }`. |
| `cost` | `CostBreakdown \| undefined` | Only present when `costModel` is configured. |

**Related APIs:** [`getUsageReport`](#getusagereport) (lifetime totals, vs. this current-buffer snapshot)

### `getUsageReport`

**Purpose:** The cumulative, lifetime usage/cost ledger — unlike `stats()`, every field here only ever grows. `removeMessage`/`editMessage`/eviction don't retroactively adjust it.

**Signature:**

```ts
getUsageReport(): UsageReport
```

**Returns:** `{ totalMessagesProcessed, totalTokensConsumed: Record<Role, number>, totalEvictions: Record<string, number>, totalCost?, tags? }`. Returns a deep copy — mutating the result has no effect on the budget.

**Related APIs:** [`exportUsageJSON`](#exportusagejson), [`exportUsageCSV`](#exportusagecsv)

### `exportUsageJSON`

**Purpose:** `getUsageReport()`, JSON-stringified and indented for readability.

**Signature:**

```ts
exportUsageJSON(): string
```

### `exportUsageCSV`

**Purpose:** Flat `Metric,Value` CSV of `getUsageReport()`'s scalar fields — `totalMessagesProcessed`, per-role token totals, and cost fields if `costModel` is configured.

**Signature:**

```ts
exportUsageCSV(): string
```

---

## Serialization

### `serialize`

**Purpose:** A plain, JSON-serializable snapshot of this budget's state — for persisting a session across restarts.

**Signature:**

```ts
serialize(options?: { includeOpenStreams?: boolean }): SerializedState
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `options.includeOpenStreams` | `boolean` | No | `false` | Include open streams' accumulated partial content, each marked `wasInterrupted: true`. Resuming/finalizing them on restore is left to the caller. |

**Returns:** `SerializedState`: `schemaVersion`, `maxTokens`, `reserve`, `warningThreshold`, `charsPerToken`, `devMode`, `onStrategyDuringStream`, `messages`, and optionally `streaming`.

**Important behavior:** Excludes anything that can't be serialized
generically — the tokenizer instance, `strategy`, `messageOverhead`,
`contentCounters`. Re-supply those via `deserialize()`'s `overrides` if
you didn't use the defaults.

**Related APIs:** [`TokenBudget.deserialize`](#tokenbudgetdeserialize)

### `TokenBudget.deserialize`

**Purpose:** Reconstructs a fully-functional `TokenBudget` from a `serialize()` snapshot. Static method.

**Signature:**

```ts
static deserialize(state: SerializedState, overrides?: Partial<TokenBudgetConfig>): TokenBudget
```

**Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `state` | `SerializedState` | Yes | A previous `serialize()` result. |
| `overrides` | `Partial<TokenBudgetConfig>` | No | Fills in what couldn't be serialized (`tokenizer`, `strategy`, `messageOverhead`, `contentCounters`, `onPersist`, ...) and can override any JSON-safe config field too. |

**Returns:** A new `TokenBudget`, with the buffer already `commit()`-ed and any serialized open streams re-opened and replayed.

**Important behavior:** Throws if `state.schemaVersion` is newer than the
installed package supports (upgrade `token-budget`). Warns via
`console.warn` if older — today a no-op beyond the warning, since schema
v1 is the only version that has existed.

**Example:**

```ts
const state = budget.serialize();
await saveToRedis(sessionId, state);

// later, a new process:
const state = await loadFromRedis(sessionId);
const budget = TokenBudget.deserialize(state, { strategy: strategies.priority() });
```

**Related APIs:** [`serialize`](#serialize)

---

## Streaming

For a streamed model response, where content arrives incrementally before
it's a finished message.

### `beginStream`

**Signature:** `beginStream(id: string, role: Role, metadata?: Record<string, unknown>): void`

**Purpose:** Registers a new in-progress streamed message. Throws if `id` is already open.

### `appendStreamChunk`

**Signature:** `appendStreamChunk(id: string, chunk: string | ContentBlock): void`

**Purpose:** Appends a chunk and updates the stream's running, approximate token estimate — O(chunk length) per call, not O(total accumulated length). Throws if `id` isn't an open stream.

### `endStream`

**Signature:** `endStream(id: string): BudgetMessage`

**Purpose:** Finalizes a stream: exact recount over the full accumulated content (reconciling any drift from the running estimate), and folds it into the buffer as a normal message via `addMessage()`.

### `abortStream`

**Signature:** `abortStream(id: string, policy?: 'discard' | 'keep-partial'): void`

**Purpose:** Handles a client/network abort mid-stream. `'discard'` (default) drops the partial message entirely. `'keep-partial'` finalizes whatever content arrived so far (same as `endStream`).

**Important behavior (all streaming methods):** Open-stream content is
never visible to strategies — it isn't part of the buffer until
`endStream`/`abortStream` runs. `getContext()`/`getContextSync()` with a
stream still open either proceed normally (`onStrategyDuringStream: 'skip'`, default) or throw (`'error'`).

**Related APIs:** [`docs/cookbook/streaming.md`](./cookbook/streaming.md)

---

## Events

`TokenBudget` extends a minimal typed event emitter (no Node.js dependency).

### `on` / `off` / `listenerCount`

**Signature:**

```ts
on<K extends TokenBudgetEventName>(event: K, handler: TokenBudgetEvents[K]): () => void  // returns an unsubscribe function
off<K extends TokenBudgetEventName>(event: K, handler: TokenBudgetEvents[K]): void
listenerCount<K extends TokenBudgetEventName>(event: K): number
```

**Events:**

| Event | Payload | Fires when |
| --- | --- | --- |
| `warning` | `Stats & { threshold: number }` | Usage crosses `warningThreshold`, once per crossing (resets when usage drops back below). |
| `overflow` | `OverflowInfo` | A single message exceeds `effectiveBudget` on `addMessage()`, or a strategized result still exceeds budget after `getContext()`. |
| `evicted` | `EvictedInfo` | A `getContext()`/`getContextSync()` call evicted or replaced anything. |
| `strategy-error` | `StrategyErrorInfo` | The configured strategy throws during `apply()`. |
| `decision` | `ExplainReport` | Every `getContext()`/`getContextSync()` call — mirrors `explain()`'s output. |
| `costWarning` | `CostWarningInfo` | Cumulative cost first crosses `costWarningThreshold`. |
| `usageSnapshot` | `(report: UsageReport, timestamp: number)` | After every `getContext()`/`getContextSync()` call, throttled by `usageSnapshotIntervalMs`. |

**Example:**

```ts
const unsubscribe = budget.on('evicted', (info) => {
  console.log(`${info.strategyApplied} evicted ${info.messages.length} message(s)`);
});
// later:
unsubscribe();
```

**Related APIs:** [`explain`](#explain)

---

## Reconfiguration

### `setMaxTokens` / `setReserve`

**Signature:**

```ts
setMaxTokens(n: number): void
setReserve(n: number): void
```

**Purpose:** Reconfigure the context window or output reserve without losing buffer state — e.g. switching models mid-session. Both validate against each other (`reserve` must stay `< maxTokens`) and re-run the warning check immediately.

**Related APIs:** [`TokenBudget` config](#tokenbudget-constructor--config)

---

## Strategies

Every strategy is a factory function returning a `Strategy` object
(`{ name, sync, apply }`) — pass its result as `TokenBudgetConfig.strategy`.
See [`docs/strategy-guide.md`](./strategy-guide.md) for *which* one to
pick; this section is each one's exact signature.

### `strategies.dropOldest`

**Signature:** `dropOldest(): Strategy` — no options.

**Purpose:** Evicts the oldest non-pinned atomic units first, until the buffer fits budget. The simplest, most predictable strategy — see [strategy-guide.md](./strategy-guide.md#dropoldest).

### `strategies.slidingWindow`

**Signature:** `slidingWindow(options: SlidingWindowOptions): Strategy`

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `turns` | `number` | Yes | — | Number of most recent non-pinned atomic units to keep. |
| `enforceBudget` | `boolean` | No | `false` | Also trim the kept window down to the token budget, oldest-first. |

**Purpose:** Keeps only the last `turns` non-pinned units, plus all pinned messages, regardless of token count (unless `enforceBudget` is set). A "turn" is one atomic unit: a single message, or a tool-call/tool-result pair kept together.

### `strategies.priority`

**Signature:** `priority(): Strategy` — no options.

**Purpose:** Evicts the lowest-`priority` non-pinned units first (ties broken by age), instead of purely by age. Set `priority` per message via `addMessage()`.

### `strategies.summarizeOldest`

**Signature:** `summarizeOldest(options: SummarizeOldestOptions): Strategy`

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `summarize` | `(messages: BudgetMessage[]) => Promise<string>` | Yes | — | Summarizes a contiguous block of the oldest non-pinned messages into replacement text. Bring your own model call. |
| `preThreshold` | `number` | No | `1` | Fraction of effective budget at which to trigger summarization, before a hard overflow. |
| `blockSize` | `number` | No | grows until under threshold | Fixed number of oldest eligible atomic units to summarize per call. |
| `onError` | `'throw' \| 'fallback-drop-oldest'` | No | `'throw'` | Behavior once `summarize` has failed `1 + retries` times. |
| `retries` | `number` | No | `0` | Retries after the first failed `summarize()` call. |
| `maxSummaryDepth` | `number` | No | `3` | Once a synthetic summary's depth reaches this, it's never folded into another summary again. |
| `onMaxDepthReached` | `'evict' \| 'keep-forever' \| ((message: BudgetMessage) => 'evict' \| 'keep-forever')` | No | `'keep-forever'` | What to do with a depth-maxed summary that's the oldest thing in an over-budget buffer. |

**Purpose:** Folds the oldest eligible non-pinned block into one synthetic summary message via your `summarize` callback, instead of dropping it outright. Tool-call/tool-result pairs are summarized as a unit, never split. `not sync` — always use with `getContext()`, not `getContextSync()`.

**Important behavior:** Supports re-summarizing a previous summary when it's the oldest eligible content and the buffer overflows again — call `budget.commit()` after each round for this to work (see [`commit`](#commit)).

### `strategies.chain`

**Signature:** `chain(strategies: Strategy[]): Strategy`

**Purpose:** Runs multiple strategies in sequence, each operating on the previous one's output — e.g. `summarizeOldest` first, with `dropOldest` as a hard backstop guaranteeing the result fits budget even if summarization alone doesn't get there. `explain()`'s `steps` has one entry per member, in order. `sync` only if every member is sync.

**Example:**

```ts
strategy: strategies.chain([
  strategies.summarizeOldest({ summarize: mySummarizer }),
  strategies.dropOldest(),
])
```

### `strategies.semanticRelevance`

**Signature:** `semanticRelevance(options: SemanticRelevanceOptions): Strategy`

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `scorer` | `Scorer` | Yes | — | Pluggable relevance scorer — see [`token-budget-embeddings`](../packages/token-budget-embeddings) for a reference cosine-similarity implementation. |
| `auxiliaryContext` | `unknown` | No | — | Passed through to the scorer (e.g. an active goal or system prompt). |
| `mustRetain` | `(msg: BudgetMessage) => boolean` | No | — | Predicate for messages retained even if not pinned. |
| `weights.semantic` / `.recency` / `.priority` | `number` | No | `1` / `0` / `0` | Hybrid scoring weights: `finalScore = semantic*semanticWeight + recency*recencyWeight + priority*priorityWeight`. |
| `scoringTimeoutMs` | `number` | No | `2000` | Timeout for a single `scorer.score()` call. |
| `fallback` | `Strategy` | No | — | Used if scoring throws or times out. |

**Purpose:** Scores every non-pinned/non-`mustRetain` message and retains the highest-scoring units until the budget is full — a relevance-ranked alternative to age- or priority-based eviction.

**Important behavior:** Caches scores in a per-instance closure. **Construct one instance per `TokenBudget`** — sharing one instance across multiple budgets can cross-contaminate cached scores if their message ids collide (e.g. two tenants both starting ids from `"1"`). `scorer` itself is fine to reuse.

---

## Custom-strategy building blocks

For writing your own `Strategy` — see [`docs/strategy-guide.md#writing-a-custom-strategy`](./strategy-guide.md#writing-a-custom-strategy).

### `groupIntoUnits`

**Signature:** `groupIntoUnits(messages: BudgetMessage[]): Unit[]`

**Purpose:** Groups a flat message list into atomic eviction units — a
tool-result message (`toolCallId` set) is merged into the unit of the
message that produced the call it answers, so a custom strategy can't
accidentally split a pair. `Unit`: `{ messages, pinned, order, priority }`.

### `filterByUnits`

**Signature:** `filterByUnits(original: BudgetMessage[], keptUnits: Unit[]): BudgetMessage[]`

**Purpose:** Projects a chosen surviving subset of units back onto the original flat message order — the inverse of `groupIntoUnits`.

### `unitTokens`

**Signature:** `unitTokens(unit: Unit, ctx: StrategyContext): number`

**Purpose:** Token count of one unit (sum of its messages), using the `StrategyContext.countMessage` passed into your strategy's `apply()`.

### `evictOldestUnitsToBudget`

**Signature:** `evictOldestUnitsToBudget(units: Unit[], ctx: StrategyContext, budget?: number): Unit[]`

**Purpose:** Evicts the oldest non-pinned units (by `order`) until the remaining units' total fits `budget` (default `ctx.effectiveBudget`) — the same backstop `dropOldest`/`slidingWindow` use internally, reusable in your own strategy.

---

## Tool output

### `truncateToolOutput`

**Purpose:** Shrinks a single oversized tool result (a file dump, a verbose CI log) to fit a token budget — *before* it becomes a message. Eviction strategies operate on whole messages; this is the tool for the case where *one* message alone is bigger than the whole budget.

**Signature:**

```ts
truncateToolOutput(
  text: string,
  maxTokens: number,
  tokenizer: Tokenizer,
  options?: TruncateToolOutputOptions,
): string
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `text` | `string` | Yes | — | Raw text to shrink. |
| `maxTokens` | `number` | Yes | — | Target token ceiling. |
| `tokenizer` | `Tokenizer` | Yes | — | The same tokenizer you pass `TokenBudget` (or `createEstimateTokenizer()`). |
| `options.keep` | `'start' \| 'end' \| 'both'` | No | `'end'` | Which part to keep. `'end'` suits terminal output/test runners/stack traces (the actionable line is usually last). `'both'` keeps head + tail, e.g. a file read where imports and the tail both matter. |
| `options.marker` | `(omittedChars: number) => string` | No | `…[N chars cut]…` | Builds the text inserted where content was cut. |

**Returns:** The shrunk text — unchanged if it already fits `maxTokens`.

**Important behavior:** Never splits a UTF-16 surrogate pair (an emoji or
other astral-plane character) at the cut boundary — output is always
well-formed. Has nothing to do with eviction or `toolCallId` pairing; it's
a content-prep step that composes with whatever strategy you're already
using.

**Related APIs:** [`estimateBeforeAdd`](#estimatebeforeadd), [`docs/guides/tool-output-context-management.md`](./guides/tool-output-context-management.md)

---

## Model-derived budgets

See [`docs/model-budgets.md`](./model-budgets.md) for the full precedence explanation.

### `MODEL_CONTEXT_WINDOWS`

**Signature:** `const MODEL_CONTEXT_WINDOWS: Record<string, number>`

**Purpose:** Known context-window sizes, keyed by model name — a static,
point-in-time snapshot. Set `TokenBudgetConfig.model` to a listed name and
omit `maxTokens` to derive it automatically.

### `getModelContextWindow`

**Signature:** `getModelContextWindow(model: string): number | undefined`

**Purpose:** Looks up `model`'s known context-window size, or `undefined` if not listed.

---

## Tokenizer

### `createEstimateTokenizer`

**Signature:** `createEstimateTokenizer(charsPerToken?: number, estimatorProfile?: EstimatorProfile): Tokenizer`

**Purpose:** Builds the same zero-dependency heuristic tokenizer
`TokenBudget` uses by default (`tokenizer: 'estimate'`) — useful when you
need the same estimate outside a `TokenBudget` instance, e.g. as the
`tokenizer` argument to [`truncateToolOutput`](#tool-output).

**Related APIs:** For an exact (not estimated) tokenizer, see
[`token-budget-tiktoken`](../packages/token-budget-tiktoken) (OpenAI
family) or [`token-budget-claude`](../packages/token-budget-claude)
(Claude approximation).
