# The interactive playground

[`packages/token-budget-playground`](../packages/token-budget-playground) is a
browser-based, interactive demo of `@shivam.dixit/token-budget` — built as a
Hugging Face Space, but runnable and buildable entirely from this repo. This
page explains what it demonstrates, what it deliberately doesn't, and how to
reproduce everything it shows.

## What it demonstrates

Every result the playground shows comes from actually calling the real
library client-side — `new TokenBudget(...)`, `addMessage()`,
`getContext()`/`getContextSync()`, `explain()` — the same functions
documented in [`docs/API.md`](./API.md). Nothing is simulated:

- Editing a conversation and applying a token budget, with real eviction.
- Pinned messages surviving eviction regardless of budget pressure.
- Tool-call/tool-result pairs kept or evicted together, never split.
- The real `explain()` decision trace, rendered as-is (adapted to
  `ExplainReport`'s actual shape — see [`docs/explainability.md`](./explainability.md)).
- Strategy comparison (`dropOldest`/`slidingWindow`/`priority`) run
  side-by-side against the same conversation and budget.
- Model context-window presets pulled directly from the library's own
  exported `MODEL_CONTEXT_WINDOWS` table (see [`docs/model-budgets.md`](./model-budgets.md)) — never hardcoded in the playground.
- A live, in-browser context-management benchmark (token-budget vs. a naive
  DIY loop) at a size the browser can run responsively.

## What it does not demonstrate

- **No real LLM calls, anywhere.** The `summarizeOldest` strategy needs an
  async `summarize()` callback that calls a real model — the playground
  can't require an API key, so it uses a clearly-labeled **deterministic
  demo summarizer** instead (string truncation, not an actual summary). In
  your own code, pass your real summarizer to `strategies.summarizeOldest({ summarize })` — see [`docs/API.md#strategiessummarizeoldest`](./API.md#strategiessummarizeoldest).
- **Estimated token counts, not exact ones.** The playground uses the
  library's built-in zero-dependency heuristic tokenizer (~4 chars/token) —
  the same default `TokenBudget` uses with no `tokenizer` configured. It is
  not `token-budget-tiktoken` or any specific model's real tokenizer. See
  [Token counting modes](../README.md#token-counting-modes).
- **Not a full 50,000-message benchmark, live.** The in-browser benchmark
  tab runs at sizes (1,000–10,000 messages) chosen to stay responsive
  without a Web Worker; it never auto-runs a 50,000-message case, and it
  doesn't bundle LangChain's `trimMessages` into the browser build at all
  (a heavy dependency not worth adding to a demo page). The full
  comparison, including LangChain, is shown as a static reference table of
  the real numbers already published in [`docs/benchmarks.md`](./benchmarks.md), with the exact command to reproduce them.
- **Not model-quality evaluation.** This is entirely about which messages
  survive a budget, not whether a model's replies are good.

## Reproducing what you see

Run the playground itself:

```sh
git clone https://github.com/shivam039/token-budget.git
cd token-budget
npm install
npm run build --workspace=@shivam.dixit/token-budget
npm run dev --workspace=token-budget-playground
```

Regenerate the benchmark dataset (see [`docs/DATASET.md`](#the-companion-dataset) below):

```sh
npm run generate:dataset
```

Reproduce the full published benchmark numbers (including the
50,000-message case and the LangChain comparison the in-browser tab
doesn't run live):

```sh
npm run bench
```

Everything above uses commands and scripts that already exist in this
repository — the playground and dataset generator both import the same
deterministic conversation generator
([`scripts/lib/generateConversation.ts`](../scripts/lib/generateConversation.ts))
rather than each having their own, and the benchmark numbers referenced
throughout the playground are the real ones from
[`bench/context-management-bench.mjs`](../bench/context-management-bench.mjs)
and [`docs/benchmarks.md`](./benchmarks.md), not a second implementation.

## The companion dataset

[`datasets/context-management-bench`](../datasets/context-management-bench)
is a Hugging Face dataset specification: 24 realistic context-management
scenarios (8 categories × 3 conversation lengths), each with the real
evicted/retained message ids produced by actually running the library —
see its own [dataset card](../datasets/context-management-bench/README.md)
for the full schema, intended use, and limitations.

## How to contribute an additional scenario

1. Add a new category (or extend an existing one) in
   [`scripts/lib/generateConversation.ts`](../scripts/lib/generateConversation.ts) —
   a pinned instruction, a message-generation strategy, and tool names for
   the scenario.
2. If it's a new category, add it to `ALL_CATEGORIES`, and add its budget/
   strategy/expected-behavior entries in
   [`scripts/generate-context-dataset.ts`](../scripts/generate-context-dataset.ts).
3. Run `npm run generate:dataset` and check the new `data/<category>.jsonl`
   file looks right — real eviction should actually happen (an example
   where nothing gets evicted doesn't demonstrate anything).
4. The same category automatically becomes selectable in the playground's
   "Generate long conversation" panel — no separate playground change
   needed, since both consume the same generator.

## Deploying / updating the live Space

Two ways, both documented in the "Deploying this Space" section of
[`packages/token-budget-playground/README.md`](../packages/token-budget-playground/README.md):

- **Automatic, via GitHub Actions** — [`.github/workflows/deploy-playground.yml`](../.github/workflows/deploy-playground.yml)
  builds the playground and pushes it to the Space on every push to
  `main` that touches the playground, the core package, or the shared
  generator (or on demand via `workflow_dispatch`). One-time setup: add
  a repository secret named `HF_TOKEN` — a Hugging Face access token
  with write access to the target Space, generated at
  [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
  (GitHub → repo Settings → Secrets and variables → Actions → New
  repository secret). Without that secret the workflow still runs
  successfully, it just skips the deploy step with a clear notice
  instead of failing — safe to merge before the secret exists.
- **Manual**, if you'd rather not wire up CI for this: build locally and
  push the `dist/` output yourself — the exact commands are in the
  Space's own README.

Either way, this repository can build and push the *content* — the
Space itself (the `huggingface.co/spaces/...` repo) has to already exist
under a real Hugging Face account first; that one-time creation step
isn't something a repository change can do on its own.

## Related documentation

- [`docs/API.md`](./API.md) — every API the playground calls
- [`docs/strategy-guide.md`](./strategy-guide.md) — the decision table behind the strategy selector
- [`docs/explainability.md`](./explainability.md) — the `explain()` trace the playground renders
- [`docs/benchmarks.md`](./benchmarks.md) — full, real benchmark numbers and methodology
