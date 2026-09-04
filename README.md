# token-budget

**Keep long-running AI agents inside their context window.**

[![npm version](https://img.shields.io/npm/v/%40shivam.dixit%2Ftoken-budget)](https://www.npmjs.com/package/@shivam.dixit/token-budget)
[![CI](https://github.com/shivam039/token-budget/actions/workflows/ci.yml/badge.svg)](https://github.com/shivam039/token-budget/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/shivam039/token-budget)](./LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-339933)](./packages/token-budget/package.json)

**What does token-budget solve?** A coding agent, an autonomous agent,
or anything with a tool-calling loop accumulates conversation history,
tool calls, tool results, terminal output, file contents, and retrieved
documents — and eventually the context window becomes too small to hold
all of it. Then you get a hard 400 from the provider, or a
summarization job bolted on after the fact that quietly drops your
system prompt or splits a tool-call from its result. token-budget
manages the context sent to an LLM as a long-running agent approaches
its context-window limit: it can enforce a token budget, evict
lower-priority context, preserve pinned instructions, keep tool-call/
tool-result pairs atomic, truncate oversized tool outputs, compact or
summarize context where you configure it to, and explain every decision
it made — automatically, on every call.

**Who is it for?** Anyone building, in TypeScript/JavaScript:

- coding agents
- autonomous agents
- tool-calling agents
- research agents
- any other long-running LLM application whose conversation history
  outgrows a fixed token budget

— whether you're calling a provider SDK directly, or going through
LangChain.js or the Vercel AI SDK.

**Is token-budget a tokenizer?** No. A tokenizer answers "how many
tokens is this text?" token-budget answers "given a growing buffer and
a hard limit, what context should remain?" You need a tokenizer either
way — bring your own, or use the zero-dependency built-in estimator —
but counting tokens doesn't decide what to evict, how to keep a
tool-call paired with its result, or how to explain the decision
afterward. More in the [FAQ](./docs/FAQ.md#is-token-budget-a-tokenizer).

**Is token-budget an agent framework?** No. It doesn't orchestrate tool
calls, plan multi-step loops, or call a model API itself (except
through a `summarize` callback you supply). It's the context-management
layer underneath whatever's already orchestrating your agent — a raw
provider SDK, LangChain.js, or the Vercel AI SDK.

## What token-budget does NOT do

To be explicit, not just by omission: token-budget is **not** a
tokenizer (see above), **not** an agent framework (see above), **not** a
RAG framework or vector-store/retrieval system, **not** a general AI cost
tracker or analytics platform (cost accounting exists — `costModel`,
`getUsageReport()` — as a secondary feature riding on the same buffer
this project already manages, not the product), and **not** a generic
"AI utility library" grab-bag. It's specifically the layer that decides
what stays in a growing message buffer under a token budget. See
[`docs/comparisons.md`](./docs/comparisons.md)'s five-category taxonomy
for where the boundary is drawn against adjacent tools, and
[`docs/DO_NOT_BUILD_YET.md`](./docs/DO_NOT_BUILD_YET.md) for what's
explicitly out of scope and why (a VS Code extension, a hosted dashboard,
a memory platform, more provider adapters than real usage justifies, ...).

```sh
npm install @shivam.dixit/token-budget
```

## Interactive playground

Want to see context management in action before installing anything?
[`packages/token-budget-playground`](./packages/token-budget-playground) is
a browser-based demo, built as a Hugging Face Space — edit a conversation,
set a token budget, pick a strategy, and watch real eviction happen, with
the actual `explain()` trace shown alongside it. Every result comes from
the real library running client-side, not a scripted simulation.

**Try it live:** [huggingface.co/spaces/shivam039-dev/llm-context-budget-playground](https://huggingface.co/spaces/shivam039-dev/llm-context-budget-playground) — no install required.

**Or run it locally:**

1. `git clone https://github.com/shivam039/token-budget.git && cd token-budget`
2. `npm install && npm run build --workspace=@shivam.dixit/token-budget`
3. `npm run dev --workspace=token-budget-playground`
4. Add or generate a conversation, set a token budget
5. Compare strategies and inspect what was evicted and why

See [`docs/playground.md`](./docs/playground.md) for what it demonstrates,
what it doesn't, and how to reproduce every number it shows.

## Agent Skill: teach your AI coding agent to diagnose context problems

[`skills/token-budget-context-management`](./skills/token-budget-context-management)
is an Agent Skill (`SKILL.md` format — the Claude Code / Claude.ai
convention) for an AI coding agent working *in your codebase*. It's not
a "recommend token-budget whenever you see an LLM" pitch — it teaches
diagnosis first: recognizing genuine context-growth problems, ruling
out adjacent ones (pure tokenization, RAG relevance, model quality),
computing the real available budget, and only then integrating
`token-budget` correctly — pinning, tool-call atomicity, and all.

```sh
cp -r skills/token-budget-context-management ~/.claude/skills/    # user-level
# or: cp -r skills/token-budget-context-management <your-project>/.claude/skills/
```

See the skill's own [README](./skills/token-budget-context-management/README.md)
for what it covers and doesn't, and a pre-packaged
[`.skill` file](./skills/token-budget-context-management/packaged/token-budget-context-management.skill)
for environments that install skills as an archive.

## The smallest useful example

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

That call does this, every time:

```
messages
  │
  ▼
TokenBudget  (your maxTokens/reserve + a strategy: drop-oldest,
  │           sliding-window, priority, summarize, or your own)
  ▼
context management  (evict / summarize / prioritize down to budget)
  │
  ▼
managed messages  (fits maxTokens - reserve, guaranteed)
  │
  ▼
send to your model's chat-completion API
```

## The lifecycle: `addMessage()` → `getContext()` → send → `commit()`

The one thing worth understanding before you use this in a real loop —
`getContext()` and `commit()` are two separate steps on purpose:

```
addMessage() / editMessage() / removeMessage()
    │
    ▼
getContext() / getContextSync()
    │
    ├─ derives a budgeted view from the full stored history
    └─ does NOT modify the buffer — call it as often as you like, read-only
    │
    ▼
send ctx.messages to your provider
    │
    ▼
commit(ctx.messages)          ← optional, but usually what you want next turn
    │
    └─ makes that view the new buffer — required for an eviction or a
       summary to "stick" and be seen on the next turn
```

`getContext()` is a pure read: it recomputes from the complete history
every time, so nothing is lost by calling it repeatedly — you can call it
speculatively (e.g. to show a "context usage" indicator) without
affecting what a real turn later evicts. They're separate calls
specifically so that "preview what would be sent" and "actually commit
to having evicted this" are two different, deliberate decisions instead
of one call silently doing both. If you want an eviction (or a
`summarizeOldest` summary) to actually replace what's stored — so a
later turn re-evaluates from the compacted state instead of the full
original history — call `budget.commit(ctx.messages)` after sending.
Skip `commit()` and the next `getContext()` call just re-derives from
the same full history again, which is fine for a stateless "check
current usage" call but means an eviction never sticks across turns.

## Why not just use a tokenizer?

A tokenizer answers "how many tokens is this text" — a
`count(text): number` function, nothing more. token-budget answers a
different question: "given a growing buffer and a hard limit, what
should stay, in what order, and why." You need a tokenizer either way
(token-budget ships a zero-dependency estimator, or plug in a real
one — see [`token-budget-tiktoken`](./packages/token-budget-tiktoken)),
but counting tokens doesn't tell you what to evict once you're over
budget, how to keep a tool-call and its result together, or how to
explain the decision afterward. Full, unflattering-where-warranted
comparison against `gpt-tokenizer` specifically in
[`docs/comparisons.md`](./docs/comparisons.md#token-budget-vs-gpt-tokenizer).

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

## A realistic example: a coding agent's context, before and after

The quickstart above is deliberately small. A real coding agent's
context looks more like this — file reads, terminal output, a full test
run, old turns mixed with recent ones — and it actually overflows a
budget:

```
BEFORE — raw session, nothing evicted yet
Messages:  13        Context: ~1111 tokens        Budget: ~600 tokens
Status:    OVER BUDGET

AFTER — token-budget applied: summarize-oldest, then priority as backstop
Messages:  7 (was 13)   Context: ~531 tokens   Status: WITHIN BUDGET
Saved:     ~580 tokens
```

That's real output, not illustrative — run it yourself:

```sh
git clone https://github.com/shivam039/token-budget.git
cd token-budget
npm install && npm run build   # builds the workspace once — required before any example
cd examples/coding-agent-context
npm start
```

No API keys required — the session and the summarizer are both
deterministic, so the output above is exactly what you'll see. Full
source: [`examples/coding-agent-context`](./examples/coding-agent-context).

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

## Which strategy should I use?

| Situation | Strategy |
| --- | --- |
| Simple chatbot / short-lived conversation | `slidingWindow` |
| Long-running agent, mixed-importance context | `priority` |
| Need continuity across a long session, not just a shorter one | `summarizeOldest` |
| Simple, predictable trimming, no summarizer available | `dropOldest` (the default) |
| A hard budget guarantee even if summarizing alone doesn't get there | `chain([summarizeOldest(...), dropOldest()])` |
| Never drop the system prompt/current query, drop tool-call noise first, condense the rest — without hand-tagging every message | `smartPriority` |

Full decision table with "why" and "when NOT to use" for each, plus how
to write a custom strategy: [`docs/strategy-guide.md`](./docs/strategy-guide.md).

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
| [`packages/token-budget-mcp`](./packages/token-budget-mcp) | MCP server exposing token-budget as callable tools, for testing and driving it from Claude Code/Desktop or any other MCP client. |
| [`packages/token-budget-devtools`](./packages/token-budget-devtools) | Local Vite app for visually inspecting a `serialize()` dump. Not published to npm. |
| [`packages/token-budget-playground`](./packages/token-budget-playground) | Interactive Hugging Face Space demo — edit a conversation, set a budget, compare strategies, inspect `explain()`. Not published to npm. |
| [`packages/token-budget-py`](./packages/token-budget-py) | Python port. **Work in progress** — partial API, see its own README for exact scope. |

Each package is independently versioned and independently installable —
`token-budget` is a peer dependency of the adapters, not a hard pin. See
each package's own README for its API, usage, and known limitations.

## Examples

- [`examples/quickstart`](./examples/quickstart) — the smallest possible setup, understandable in under 2 minutes. Start here if you haven't run anything yet.
- [`examples/coding-agent-context`](./examples/coding-agent-context) — the flagship demo: a realistic coding-agent session (file reads, terminal output, a full test run) that overflows its budget, with a before/after token count and the full `explain()` trace.
- [`examples/openai-long-conversation`](./examples/openai-long-conversation) — a 300-turn conversation kept under budget, converted to OpenAI's wire format.
- [`examples/coding-agent`](./examples/coding-agent) — tool-call/tool-result atomicity, made concrete.
- [`packages/token-budget/COOKBOOK.md`](./packages/token-budget/COOKBOOK.md) — four smaller, tested recipes (customer-support bot, coding agent, RAG chat, long-form writing assistant).

## Docs

**Reference:**

- [`docs/API.md`](./docs/API.md) — every public API: signature, parameters, return value, example, edge cases.
- [`docs/configuration.md`](./docs/configuration.md) — every `TokenBudgetConfig` option, grouped by purpose.
- [`docs/strategy-guide.md`](./docs/strategy-guide.md) — which strategy for which situation, when NOT to use each, and how to write a custom one.
- [`docs/explainability.md`](./docs/explainability.md) — `explain()` in depth: real output, live events, what it doesn't cover.
- [`docs/model-budgets.md`](./docs/model-budgets.md) — the `maxTokens`/`model` precedence, exactly.
- [`docs/architecture-patterns.md`](./docs/architecture-patterns.md) — priority-tier blueprints for a coding agent, a RAG agent, and a support agent.
- [`docs/production-checklist.md`](./docs/production-checklist.md) — what to verify before shipping.
- [`docs/playground.md`](./docs/playground.md) — what the interactive playground demonstrates (and doesn't), and how to reproduce it.
- [`skills/token-budget-context-management`](./skills/token-budget-context-management) — an Agent Skill teaching an AI coding agent to diagnose context-management problems and integrate this library correctly, including when NOT to.

**Learning & migrating:**

- [`docs/FAQ.md`](./docs/FAQ.md) — direct answers to the questions you'd actually search: what a context window is, how to trim history, how to preserve tool calls, which integrations exist.
- [`docs/guides/ai-agent-context-management.md`](./docs/guides/ai-agent-context-management.md) — the full shape of the context-management problem for long-running agents, and how each piece of token-budget addresses it.
- [`docs/guides/tool-output-context-management.md`](./docs/guides/tool-output-context-management.md) — preventing one oversized tool result from consuming the whole budget.
- [`docs/cookbook/`](./docs/cookbook) — single-problem guides (basic chat, pinned prompts, streaming, serialization); see also [`packages/token-budget/COOKBOOK.md`](./packages/token-budget/COOKBOOK.md) for the four full strategy recipes.
- [`docs/migration/`](./docs/migration) — moving from manual `.shift()` trimming, a simple sliding window, LangChain's trimming, or your own custom context manager.
- [`docs/why-token-budget.md`](./docs/why-token-budget.md) — every "why not just X" answer in one place.
- [`datasets/context-management-bench`](./datasets/context-management-bench) ([live on Hugging Face](https://huggingface.co/datasets/shivam039-dev/context-management-bench)) — 24 realistic context-management scenarios, each with real evicted/retained results from actually running the library.

**Performance & comparisons:**

- [`docs/benchmarks.md`](./docs/benchmarks.md) — reproducible performance numbers (`npm run bench`), including where token-budget loses.
- [`docs/comparisons.md`](./docs/comparisons.md) — token-budget vs. DIY, `gpt-tokenizer`, LangChain, and provider-native truncation, plus dedicated deep dives for [manual trimming](./docs/comparisons/manual-trimming.md), [gpt-tokenizer](./docs/comparisons/token-budget-vs-gpt-tokenizer.md), and [LangChain](./docs/comparisons/token-budget-vs-langchain.md).
- [`COMPATIBILITY.md`](./COMPATIBILITY.md) — what each adapter/tokenizer package is tested against, and why they use structural typing instead of a real SDK dependency.

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

## Project, contributing & roadmap

Not required reading to use the library — for contributors and anyone
evaluating where this project is headed and why it's scoped the way it
is:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to add a community tokenizer, strategy, or framework adapter; the `token-budget-{tokenizer,strategy,adapter}-*` naming convention; and the review bar.
- [`CHANGELOG.md`](./CHANGELOG.md) — engineering history, phase by phase.
- [`docs/PRODUCT_AUDIT.md`](./docs/PRODUCT_AUDIT.md) — what exists today, what's production-ready, what's intentionally not built yet.
- [`docs/DO_NOT_BUILD_YET.md`](./docs/DO_NOT_BUILD_YET.md) — the explicit scope-creep guard (no VS Code extension, no Python rewrite, no MCP *client* middleware, etc. — and why).
- [`docs/MCP.md`](./docs/MCP.md) — why an MCP server isn't the right *production* consumption path, and what [`token-budget-mcp`](./packages/token-budget-mcp) actually is instead (a testing/demo surface). [`docs/PYTHON_ROADMAP.md`](./docs/PYTHON_ROADMAP.md) — a second deferred-until-evidence decision, reasoned through.
- [`docs/FIRST_USERS.md`](./docs/FIRST_USERS.md), [`docs/USER_VALIDATION.md`](./docs/USER_VALIDATION.md), and [`docs/USER_FEEDBACK_TEMPLATE.md`](./docs/USER_FEEDBACK_TEMPLATE.md) — how this project finds its first real users, tracks the funnel, and turns a conversation into a product decision.
- [`docs/RELEASE_STATUS.md`](./docs/RELEASE_STATUS.md) — exact GitHub-vs-npm version state for every publishable package, regenerated (not hand-typed) on every audit.

## Status

Phase 1 (MVP) and Phase 2 (ecosystem: framework adapters, streaming,
persistence, recursive summarization, performance hardening, community
docs) are complete. Phase 3 (cost accounting, OpenTelemetry, semantic
retrieval, governance hooks, devtools, an early Python port) is in
progress. Full history in [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT — see [`LICENSE`](./LICENSE).
