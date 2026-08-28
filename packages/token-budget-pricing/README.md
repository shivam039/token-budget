# token-budget-pricing

Static per-model pricing lookup table and a ready-made `CostModel` for
[`token-budget`](https://www.npmjs.com/package/token-budget)'s cost
accounting (`costModel`, `maxCost`, `getUsageReport()`).

Pricing changes frequently and this table is a point-in-time snapshot —
it **will** lag reality. Use `overrides` for up-to-date or custom rates,
or supply your own `CostModel` entirely (e.g. backed by a live pricing
API) if that matters for your use case.

## Install

```sh
npm install @shivam.dixit/token-budget @shivam.dixit/token-budget-pricing
```

`token-budget` is a peer dependency (semver range, not pinned).

## Usage

```ts
import { TokenBudget } from '@shivam.dixit/token-budget';
import { createCostModel } from '@shivam.dixit/token-budget-pricing';

const budget = new TokenBudget({
  maxTokens: 128000,
  model: 'gpt-4o',
  costModel: createCostModel(),
});

budget.addMessage({ role: 'user', content: 'Hello!' });
console.log(budget.stats().cost); // { inputCost, outputCost, totalCost, currency: 'USD' }
```

### Overriding or adding models

```ts
const costModel = createCostModel({
  'my-fine-tuned-model': { input: 5e-6, output: 15e-6 }, // USD per token
  'gpt-4o': { input: 3e-6, output: 12e-6 }, // override the built-in rate
});
```

An unknown model name returns cost `0` rather than throwing — pass
`overrides` for any model not in `PRICING_TABLE`, or import
`PRICING_TABLE` directly to check what's covered.

## What's covered

A snapshot of OpenAI, Anthropic, and Google model pricing — see
[`src/index.ts`](./src/index.ts) for the current table. `role` is accepted
by `CostModel.costPerToken()` for interface compatibility but isn't used
here — this model is priced per-model/per-direction, not per-role.

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
