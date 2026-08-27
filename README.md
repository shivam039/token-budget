# token-budget

**Keep long-running AI agents inside their context window.**

[![npm version](https://img.shields.io/npm/v/%40shivam.dixit%2Ftoken-budget)](https://www.npmjs.com/package/@shivam.dixit/token-budget)
[![CI](https://github.com/shivam039/token-budget/actions/workflows/ci.yml/badge.svg)](https://github.com/shivam039/token-budget/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/shivam039/token-budget)](./LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-339933)](./packages/token-budget/package.json)

A coding agent, an autonomous agent, or anything with a tool-calling loop
accumulates conversation history, tool calls, tool results, terminal
output, file contents, and retrieved documents — and eventually the
context window becomes too small to hold all of it. Then you get a hard
400 from the provider, or a summarization job bolted on after the fact
that quietly drops your system prompt or splits a tool-call from its
result. **token-budget keeps that context inside its token budget
automatically**, with a strategy you choose (drop oldest, sliding
window, priority, summarize, or your own), atomic tool-call/tool-result
pairing so a provider never rejects an orphaned result, and tells you
exactly what it did and why via `explain()`.

It's context-management infrastructure, not a tokenizer and not an
agent framework: it doesn't count tokens itself for a specific model
(bring your own tokenizer, or use the built-in estimator), it doesn't
orchestrate tool calls or agent loops, and it doesn't call a model API
(except through a `summarize` callback you supply). It's the
buffer-management layer underneath whatever you're already using — raw
provider SDKs, Vercel AI SDK, or LangChain.js.

```sh
npm install @shivam.dixit/token-budget
```

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 8000,
  reserve: 1000, // tokens reserved for the model's output
  strategy: strategies.dropOldest(),
});

budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
budget.addMessage({ role: 'user', content: 'Hello!' });

// ... 500 turns later, still under 8,000 tokens ...
const { messages, tokensUsed, tokensRemaining, evicted } = await budget.getContext();
```

`messages` is ready to send to your model's chat-completion API as-is —
`evicted` tells you exactly what got dropped, and `budget.explain()`
gives you the full reasoning trail. `pinned: true` means the system
prompt survives every eviction strategy, and tool-call/tool-result pairs
are always kept or dropped together — no dangling tool results.

## What this actually does

```
Without context management

  conversation  ████████████████████████████████████████████████ 💥
                                                    context window exceeded —
                                                    hard error, or silent truncation

With token-budget

  conversation  ██████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░
                                      │
                                      └─ budget enforcement kicks in here

  ✓ pinned system prompt — never evicted, by any strategy
  ✓ tool-call / tool-result pairs — always kept or dropped together
  ✓ every eviction — named, with a reason, via explain()
```

## `explain()` — see exactly what happened and why

Every `getContext()`/`getContextSync()` call is fully explainable — this
is real output from `budget.explain()`, not illustrative pseudo-JSON:

```json
{
  "strategyApplied": "sliding-window",
  "tokensBefore": 48,
  "tokensAfter": 32,
  "tokensRemaining": 168,
  "steps": [
    {
      "strategyName": "sliding-window",
      "tokensBefore": 48,
      "tokensAfter": 32,
      "messagesConsidered": 6,
      "evicted": [
        { "id": "msg_1", "reason": "outside the last 3 turns (position 1 of 6)" },
        { "id": "msg_2", "reason": "outside the last 3 turns (position 2 of 6)" }
      ],
      "synthesized": []
    }
  ]
}
```

Your application can tell a user (or a compliance log) *why* something
left the context — not just that it did. This is the thing most
truncation code, hand-rolled or built into a framework, doesn't give you.

**Answering the questions you'll actually ask in a debugger:**

```ts
const report = budget.explain()!;

report.tokensBefore - report.tokensAfter;                    // tokens this call saved
report.strategyApplied;                                      // which strategy (or chain) ran
report.steps.flatMap((s) => s.evicted);                       // every eviction, with a reason
report.steps.flatMap((s) => s.synthesized);                   // every summary this call created

// "Why did *this* message disappear?"
report.steps.flatMap((s) => s.evicted).find((e) => e.id === messageId)?.reason;

// "Why was *this* message preserved?" — explain() reports what left;
// anything still in ctx.messages and not synthetic answers "it wasn't evicted":
ctx.messages.some((m) => m.id === messageId && !m.metadata?.['synthetic']);
```

See [`examples/coding-agent-context`](./examples/coding-agent-context) for
all of this against a realistic session, printed as a readable report
rather than raw JSON.

## `getContext()` vs `commit()`

```
getContext() / getContextSync()
    │
    ├─ derives a budgeted view from the full stored history
    └─ does NOT modify the buffer — call it as often as you like, read-only

commit(ctx.messages)
    │
    └─ makes that view the new buffer — required for an eviction or a
       summary to "stick" and be seen on the next turn
```

`getContext()` is a pure read: it recomputes from the complete history
every time, so nothing is lost by calling it repeatedly. If you want an
eviction (or a `summarizeOldest` summary) to actually replace what's
stored — so a later turn re-evaluates from the compacted state instead of
the full original history — call `budget.commit(ctx.messages)` after it.

## Token counting modes

| Mode | Config | Trade-off |
| --- | --- | --- |
| **Estimate** (default) | `tokenizer: 'estimate'` (or omit it) | Zero dependencies, fast, works for any model — but approximate (`chars / charsPerToken`). |
| **Real tokenizer** | `tokenizer: myTokenizer`, e.g. from `token-budget-tiktoken` | Exact for the model it's built for — see [`packages/token-budget-tiktoken`](./packages/token-budget-tiktoken) and [`packages/token-budget-claude`](./packages/token-budget-claude). |

If you're only roughly tracking usage, the default estimator is fine. If
you need to guarantee you never exceed a model's real context limit, use
a tokenizer built for that model — the estimator is a heuristic, not a
promise.

**Tokenizer performance:** `token-budget-tiktoken` uses `js-tiktoken` for
compatibility and portability, not raw speed — it is not the fastest
standalone tokenizer available. If tokenization throughput alone is your
bottleneck, a specialized tokenizer such as `gpt-tokenizer` may be
faster; you can use it as `token-budget`'s `tokenizer` option directly.
Full numbers, published without spin, in
[`docs/benchmarks.md`](./docs/benchmarks.md#raw-tokenizer-benchmark).

## Why not just write this myself?

Most teams do, and the first version is `messages.shift()` behind an
`if`. It works until: the shift deletes the system prompt, or splits a
tool-call from the result it's paired with (which most provider APIs
reject outright), or someone asks "why did it drop *that* message" and
there's no answer. token-budget is that logic, written once, with atomic
tool-call pairing, pinned-message guarantees, and a decision trace built
in — and benchmarked at 100k messages so it doesn't become the thing that
falls over under load six months later (see [Scale
guidance](./packages/token-budget/README.md#scale-guidance)). In our own
[incremental-accounting benchmark](./docs/benchmarks.md#incremental-accounting-benchmark),
recomputing the running token total from scratch on every add — the
obvious way to write this — was ~100× slower than incremental accounting
at 100,000 messages.

## Why not LangChain's `trim_messages` / `SummarizationMiddleware`?

If you're already all-in on LangChain, those cover the basics. Reach for
token-budget instead when you need: the same eviction/summarization logic
to work identically whether you're calling LangChain, the Vercel AI SDK,
or a raw OpenAI/Anthropic client (no framework lock-in); a *chain* of
strategies with a hard token-budget guarantee (sliding window, then
summarize, with drop-oldest as a backstop); or an explainable trail of
what was evicted and why, for debugging or an audit log — see
[`explain()`](./packages/token-budget/README.md#explain--debugging-strategy-decisions).
In our [context-management benchmark's realistic bounded-window
scenario](./docs/benchmarks.md#realistic-benchmark--bounded-window-on-a-large-history)
— a 50,000-message history queried at everyday window sizes, not a worst
case — `trimMessages` consistently took 20+ seconds where token-budget
took well under a second; full methodology and every number, including
where this reflects `trimMessages` not being built for repeated,
large-scale eviction, in [`docs/comparisons.md`](./docs/comparisons.md).

## Why not the provider's own truncation (e.g. OpenAI's `truncation_strategy`)?

Provider-native truncation is opaque (it decides what to drop, not you),
locks you to that one provider, and doesn't tell you which messages
survived or why. token-budget runs client-side, works the same way
against every provider, and never evicts anything you've marked `pinned`.

## Packages

| Package | Description |
| --- | --- |
| [`packages/token-budget`](./packages/token-budget) | Core: budget config, message buffer, strategies, streaming, explain(), events. Zero required runtime dependencies. |
| [`packages/token-budget-anthropic`](./packages/token-budget-anthropic) | Anthropic Messages API adapter. |
| [`packages/token-budget-openai`](./packages/token-budget-openai) | OpenAI Chat Completions API adapter. |
| [`packages/token-budget-vercel-ai`](./packages/token-budget-vercel-ai) | Vercel AI SDK adapter, streaming integration, optional React hook. |
| [`packages/token-budget-tiktoken`](./packages/token-budget-tiktoken) | Exact OpenAI-family tokenizer (pure-JS by default, opt-in native/WASM path). |
| [`packages/token-budget-langchain`](./packages/token-budget-langchain) | LangChain.js adapter: `BaseMessage[]` conversion and a `TokenBudgetMemory` class. |
| [`packages/token-budget-claude`](./packages/token-budget-claude) | Best-effort Claude tokenizer approximation, with a `calibrate()` utility. |
| [`packages/token-budget-pricing`](./packages/token-budget-pricing) | Static per-model pricing table / `CostModel` for cost accounting. |
| [`packages/token-budget-otel`](./packages/token-budget-otel) | OpenTelemetry instrumentation: spans + token/cost/eviction counters. |
| [`packages/token-budget-embeddings`](./packages/token-budget-embeddings) | Reference cosine-similarity `Scorer` for the `semanticRelevance` strategy. |
| [`packages/token-budget-devtools`](./packages/token-budget-devtools) | Local Vite app for visually inspecting a `serialize()` dump. Not published to npm. |
| [`packages/token-budget-py`](./packages/token-budget-py) | Python port. **Work in progress** — partial API, see its own README for exact scope. |

Each package is independently versioned and independently installable —
`token-budget` is a peer dependency of the adapters, not a hard pin. See
each package's own README for its API, usage, and known limitations.

## Examples

- [`examples/coding-agent-context`](./examples/coding-agent-context) — the flagship demo: a realistic coding-agent session (file reads, terminal output, a full test run) that overflows its budget, with a before/after token count and the full `explain()` trace.
- [`examples/openai-long-conversation`](./examples/openai-long-conversation) — a 300-turn conversation kept under budget, converted to OpenAI's wire format.
- [`examples/coding-agent`](./examples/coding-agent) — tool-call/tool-result atomicity, made concrete.
- [`packages/token-budget/COOKBOOK.md`](./packages/token-budget/COOKBOOK.md) — four smaller, tested recipes (customer-support bot, coding agent, RAG chat, long-form writing assistant).

## Docs

- [`docs/benchmarks.md`](./docs/benchmarks.md) — reproducible performance numbers (`npm run bench`), including where token-budget loses.
- [`docs/comparisons.md`](./docs/comparisons.md) — token-budget vs. DIY, `gpt-tokenizer`, LangChain, and provider-native truncation.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to add a community tokenizer, strategy, or framework adapter; the `token-budget-{tokenizer,strategy,adapter}-*` naming convention; and the review bar.
- [`COMPATIBILITY.md`](./COMPATIBILITY.md) — what each adapter/tokenizer package is tested against, and why they use structural typing instead of a real SDK dependency.
- [`CHANGELOG.md`](./CHANGELOG.md) — engineering history, phase by phase.

**Project direction** (audience: contributors and anyone evaluating
where this project is headed, not required reading to use the library):
[`docs/PRODUCT_AUDIT.md`](./docs/PRODUCT_AUDIT.md) — what exists today,
what's production-ready, what's intentionally not built yet;
[`docs/DO_NOT_BUILD_YET.md`](./docs/DO_NOT_BUILD_YET.md) — the explicit
scope-creep guard; [`docs/MCP.md`](./docs/MCP.md) and
[`docs/PYTHON_ROADMAP.md`](./docs/PYTHON_ROADMAP.md) — two specific
deferred-until-evidence decisions; [`docs/FIRST_USERS.md`](./docs/FIRST_USERS.md)
and [`docs/USER_VALIDATION.md`](./docs/USER_VALIDATION.md) — how this
project finds and tracks its first real users.

## Development

This is an npm workspaces monorepo — one `npm install` at the root wires
every package together (adapters resolve `token-budget` from
`packages/token-budget` via a workspace symlink).

```sh
npm install
npm run build       # builds every package (core first, so adapters can resolve it)
npm run typecheck   # tsc --noEmit in every package
npm run test         # vitest run in every package
npm run test:coverage
npm run bench          # reproducible performance benchmarks — see docs/benchmarks.md
```

Each package also has its own scripts (`npm run test --workspace=token-budget-anthropic`).
CI runs this same build/typecheck/test:coverage pipeline on Node 18, 20,
and 22 for every push and PR — see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Status

Phase 1 (MVP) and Phase 2 (ecosystem: framework adapters, streaming,
persistence, recursive summarization, performance hardening, community
docs) are complete. Phase 3 (cost accounting, OpenTelemetry, semantic
retrieval, governance hooks, devtools, an early Python port) is in
progress. Full history in [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT — see [`LICENSE`](./LICENSE).
