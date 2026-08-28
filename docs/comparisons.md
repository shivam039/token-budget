# Comparisons

`token-budget` answers **"what should remain in context?"** Most of what
it's compared to here answers a different, narrower question — that's
not a knock on them, it's the point: pick the right tool for the
question you actually have.

## Categories, briefly

Five different jobs get grouped under "context/memory tooling" for LLM
apps. `token-budget` is one of them, not a replacement for the other
four:

| Category | Answers | Examples |
| --- | --- | --- |
| **Tokenizers** | "How many tokens is this text?" | `gpt-tokenizer`, `tiktoken`, `token-budget-tiktoken` |
| **Memory systems** | "What should I remember/retrieve about this user or task, across sessions?" | Vector-store-backed memory, mem0-style long-term recall |
| **Agent frameworks** | "How do I orchestrate tool calls, planning, and multi-step agent loops?" | LangGraph, custom agent loops |
| **Compression systems** | "How do I make this text shorter?" | Prompt-compression tools, generic summarizers |
| **`token-budget`** | "Given a growing buffer and a hard token limit, what stays, in what order, and why?" | — |

A real agent typically needs several of these at once: a tokenizer to
count, an agent framework to orchestrate, maybe a memory system for
cross-session recall — and `token-budget` to keep the *current* buffer
inside budget without breaking a tool-call pair or losing the system
prompt. They compose; none of them substitute for what the others do.

## token-budget vs. DIY (`messages.slice()` / `.shift()`)

The real default alternative — most teams write this before reaching for
a library, and it's a reasonable thing to try first.

**What it gets right:** zero dependencies, full control, obvious to read.

**Where it breaks down:**
- Splits a tool-call from its result (most provider APIs reject the
  request outright once that happens).
- Drops the system prompt the moment it's the oldest thing in the
  buffer, unless someone remembers to special-case it.
- No way to answer "why did it drop *that* message" after the fact.
- Recomputing the running token total from scratch on every add is
  quadratic at scale — see
  [`benchmarks.md`](./benchmarks.md#incremental-accounting-benchmark):
  ~100× slower than incremental accounting at 100,000 messages, not a
  rounding error.

`token-budget` is this logic, written once: atomic tool-call pairing,
pinned-message guarantees, `explain()`, and incremental accounting,
benchmarked at scale instead of assumed to hold up.

## token-budget vs. `gpt-tokenizer`

**Not really a competitor — a different job.** `gpt-tokenizer` answers
"how many tokens is this text," fast. `token-budget` answers "given a
growing buffer and a budget, what should stay." `token-budget-tiktoken`
(this project's own OpenAI-family tokenizer) is honestly slower than
`gpt-tokenizer` at the one thing `gpt-tokenizer` does — see
[`benchmarks.md`](./benchmarks.md#raw-tokenizer-benchmark) for the actual
numbers, published without spin.

You can use `gpt-tokenizer` **as** `token-budget`'s tokenizer if raw
counting speed matters more to you than `js-tiktoken` compatibility —
anything with a `count(text): number` method works as the `tokenizer`
option. They're complementary, not competing.

Dedicated deep dive, with the full benchmark tables and an FAQ:
[`comparisons/token-budget-vs-gpt-tokenizer.md`](./comparisons/token-budget-vs-gpt-tokenizer.md).

## token-budget vs. LangChain's `trim_messages` / `SummarizationMiddleware`

If you're already all-in on LangChain.js, `trim_messages` covers basic
trimming and `SummarizationMiddleware` covers basic summarization — for
many apps, that's enough, and adding a second dependency for the same job
isn't worth it.

Reach for `token-budget` instead when you need:

- **Framework portability** — the same eviction/summarization logic
  working identically across LangChain, the Vercel AI SDK, or a raw
  OpenAI/Anthropic client, without re-implementing it per framework.
- **A strategy chain with a hard token-budget guarantee** — e.g.
  summarize-oldest with drop-oldest as a backstop, so a summary that
  doesn't leave enough room still can't push you over budget.
- **An explainable decision trail** (`explain()`) for debugging or an
  audit log, not just a trimmed array.
- **Performance at scale in the shape most apps actually run** — see
  [`benchmarks.md`](./benchmarks.md#context-management-benchmark)'s
  realistic bounded-window benchmark: `trimMessages`' cost there is
  driven by total history size, not the (often much smaller) window
  actually retained.

In our benchmarks — methodology and every number in
[`benchmarks.md`](./benchmarks.md), not repeated here — `token-budget`
was consistently faster than `trimMessages` at scale, including in a
bounded-window scenario built specifically to give `trimMessages` a
realistic, favorable shape rather than a worst case. We don't think
that's "LangChain is bad at this" so much as `trim_messages` not being
built for repeated, large-scale eviction against a big history — which is
exactly the scenario `token-budget` is for.

Dedicated deep dive, with the exact tested workload spelled out and an
FAQ: [`comparisons/token-budget-vs-langchain.md`](./comparisons/token-budget-vs-langchain.md).

## token-budget vs. provider-native truncation (e.g. OpenAI's `truncation_strategy`)

Provider-native truncation is zero client code, and for a simple app,
that's a real advantage. It's opaque about what it drops, locks you to
that one provider's mechanism, and gives you nothing to pin or explain.
`token-budget` runs client-side, works the same way against every
provider, and never evicts anything you've marked `pinned` — the
trade-off is you own the client-side logic instead of trusting the
provider's black box.
