# Configuration reference

Every option accepted by `new TokenBudget(config)`. This is the config
half of [`docs/API.md`](./API.md#tokenbudget-constructor--config) pulled
out into its own page — same source of truth
([`packages/token-budget/src/types.ts`](../packages/token-budget/src/types.ts)'s
`TokenBudgetConfig`), grouped by what each option is for rather than
alphabetically.

## Budget sizing

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxTokens` | `number` | — | Total context window size, in tokens. Required unless `model` names a recognized entry in `MODEL_CONTEXT_WINDOWS` — see [`docs/model-budgets.md`](./model-budgets.md). |
| `model` | `string` | — | Model name — auto-derives `maxTokens` when omitted, and used for cost accounting if `costModel` is also set. |
| `reserve` | `number` | `0` | Tokens set aside for the model's own reply. Must be `< maxTokens`. The strategy actually targets `maxTokens - reserve` (the `effectiveBudget` getter). |
| `warningThreshold` | `number` (0–1) | `0.8` | Fraction of `effectiveBudget` at which the `warning` event fires. |

## Token counting

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `tokenizer` | `Tokenizer \| 'estimate'` | `'estimate'` | A real tokenizer instance (e.g. from `token-budget-tiktoken`), or the built-in heuristic. |
| `charsPerToken` | `number` | `4` | Heuristic-estimator tuning. Takes precedence over `estimatorProfile`. Ignored if a real `tokenizer` is set. |
| `estimatorProfile` | `'latin' \| 'cjk' \| 'cyrillic' \| 'auto-detect'` | `'latin'` | Heuristic-estimator script profile. Ignored if `charsPerToken` is set, or a real `tokenizer` is set. |
| `messageOverhead` | `(message: BudgetMessage) => number` | built-in | Per-message fixed overhead (role/formatting tokens) added on top of content tokens — override to match a provider's exact accounting. |
| `contentCounters` | `Record<string, ContentCounter>` | built-in | Per-content-block-type token counters, keyed by `ContentBlock.type` — override or extend for custom content block shapes. |

## Strategy

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `strategy` | `Strategy` | `strategies.dropOldest()` | Eviction/compression strategy. See [`docs/strategy-guide.md`](./strategy-guide.md). |

## Streaming

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `onStrategyDuringStream` | `'skip' \| 'error'` | `'skip'` | What `getContext()`/`getContextSync()` do while a stream is open. `'error'` refuses to build a context that doesn't reflect in-flight content. |

## Persistence

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `onPersist` | `(state: SerializedState) => void \| Promise<void>` | — | Called (debounced by `persistDebounceMs`) with the current `serialize()`-shaped state after every buffer mutation. No storage backend is bundled — write `state` wherever you like. |
| `persistDebounceMs` | `number` | `0` | Debounce window (ms), trailing-edge. `0` calls `onPersist` synchronously after every mutation; rapid mutations otherwise coalesce into one call carrying the latest state once the window elapses (never dropped, just delayed). |

## Cost accounting

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `costModel` | `CostModel` | — | Pluggable per-token pricing. See [`token-budget-pricing`](../packages/token-budget-pricing) for a static lookup table. Ignored unless `model` is also set. |
| `costWarningThreshold` | `number` | — | Cumulative cost that fires the `costWarning` event once. |
| `maxCost` | `number` | — | Cumulative cost ceiling. |
| `maxCostPolicy` | `'block-new-messages' \| ((info: CostWarningInfo) => void)` | — (no-op) | What happens once `maxCost` is reached. `'block-new-messages'` throws from `addMessage()` before any state changes. A callback receives the ceiling info on every over-ceiling call without blocking it. Omitting this makes `maxCost` purely informational. |

## Observability & governance

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `devMode` | `boolean` | `false` | `console.debug`-logs every `ExplainReport` as it's produced. |
| `onUsageSnapshot` | `(report: UsageReport, timestamp: number) => void` | — | Sugar for `budget.on('usageSnapshot', fn)` at construction time. |
| `usageSnapshotIntervalMs` | `number` | `0` (every call) | Minimum interval between `usageSnapshot` emissions. |
| `tags` | `Record<string, string>` | — | Arbitrary tags carried on `UsageReport`/`AuditEvent` (e.g. `{ tenantId, userId }`). |
| `redactor` | `(message: BudgetMessage) => BudgetMessage` | — | Pre-processor applied to every message before it's counted or buffered — e.g. strip PII prior to token accounting. Runs once per `addMessage()` call, not on `editMessage()`. |
| `auditLog` | `boolean` | `false` | Calls `onAuditEvent` after every `getContext()`/`getContextSync()` call. |
| `onAuditEvent` | `(event: AuditEvent) => void \| Promise<void>` | — | One `AuditEvent` per strategy decision when `auditLog` is true — plain, unsigned data; hash or sign it yourself if compliance requires that. |

## What's validated at construction

`new TokenBudget(config)` throws immediately (not on first use) if:

- `maxTokens` can't be resolved (missing, and `model` unset or unrecognized) — see [`docs/model-budgets.md`](./model-budgets.md).
- `maxTokens` isn't a positive finite number.
- `reserve` is negative, or `>= maxTokens`.
- `warningThreshold` is outside `[0, 1]`.

Nothing silently clamps to a "safe" default — an invalid config is a
construction-time error, not a runtime surprise later.

## Related documentation

- [`docs/API.md`](./API.md) — the full API reference, including methods (not just config)
- [`docs/model-budgets.md`](./model-budgets.md) — the `maxTokens`/`model` precedence in detail
- [`docs/production-checklist.md`](./production-checklist.md) — which of these to actually set before shipping
