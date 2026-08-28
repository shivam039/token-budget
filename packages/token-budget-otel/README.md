# token-budget-otel

OpenTelemetry instrumentation for
[`token-budget`](https://www.npmjs.com/package/token-budget): one span per
strategy decision, cost warning, and overflow, plus counters for tokens
consumed, cost accrued, and messages evicted.

## Install

```sh
npm install @shivam.dixit/token-budget @shivam.dixit/token-budget-otel @opentelemetry/api
```

`token-budget` and `@opentelemetry/api` are both peer dependencies
(semver ranges, not pinned) — bring your own OTel SDK setup
(`@opentelemetry/sdk-node`, exporters, etc.); this package only calls the
`@opentelemetry/api` surface.

## Usage

```ts
import { TokenBudget } from '@shivam.dixit/token-budget';
import { instrumentBudget } from '@shivam.dixit/token-budget-otel';
import { createCostModel } from '@shivam.dixit/token-budget-pricing'; // optional, for cost metrics

const budget = new TokenBudget({
  maxTokens: 128000,
  model: 'gpt-4o',
  costModel: createCostModel(),
});

instrumentBudget(budget);

// From here on, every getContext()/getContextSync() call emits a
// token_budget.decision span and updates the tokens/cost counters; every
// overflow/costWarning emits its own span.
budget.addMessage({ role: 'user', content: 'Hello!' });
await budget.getContext();
```

`instrumentBudget()` takes an already-constructed `TokenBudget` and
subscribes directly to its events (`decision`, `overflow`, `costWarning`,
`usageSnapshot`) via `budget.on(...)` — there's nothing else to wire up,
and no periodic polling involved. Pass a custom `meter`/`tracer` (or
provider names) if you don't want the default global providers:

```ts
instrumentBudget(budget, { meter: myMeter, tracer: myTracer });
```

## Metrics emitted

| Instrument | Kind | Description |
| --- | --- | --- |
| `token_budget.tokens_consumed` | Counter | Tokens consumed, labeled by `role` (and any `tags` set on the budget) |
| `token_budget.cost_accrued` | Counter | Cost accrued in USD, labeled by `tags` |
| `token_budget.evictions` | Counter | Messages evicted/summarized, labeled by `strategy` |

Counters record *deltas* between successive `usageSnapshot` events, not
the running cumulative total — matching how OTel counters are meant to be
used (`add()`, never `set()`).

## Spans emitted

| Span | Fires on | Attributes |
| --- | --- | --- |
| `token_budget.decision` | `decision` event (every `getContext()`/`getContextSync()` call) | `strategy`, `tokens.before`, `tokens.after`, `evictions.total` |
| `token_budget.overflow` | `overflow` event | `overflow.reason`, `tokens.used` |
| `token_budget.costWarning` | `costWarning` event | `cost.cumulative`, `cost.threshold` |

## The wider project

Part of the [`token-budget`](https://github.com/shivam039/token-budget)
monorepo — the core package, the other framework/tokenizer adapters,
benchmarks, and the flagship
[coding-agent example](https://github.com/shivam039/token-budget/tree/main/examples/coding-agent-context)
all live there. See the
[compatibility matrix](https://github.com/shivam039/token-budget/blob/main/COMPATIBILITY.md)
for exactly what every adapter is tested against.

## License

MIT
