# How do you manage context in a long-running AI agent?

**Direct answer:** by enforcing a token budget on every turn — evicting
or summarizing lower-priority content, preserving pinned instructions
and atomic tool-call/tool-result pairs, and recording *why* each
decision was made — instead of letting the buffer grow unbounded or
hand-rolling a trimming function that breaks under real agent traffic.

This guide covers the actual shape of the problem, then how
[`token-budget`](https://github.com/shivam039/token-budget) addresses
each part of it. It links out to the deeper docs for specifics rather
than repeating them — treat this as the map, not the whole territory.

## What actually grows in a long-running agent's context

A coding agent, an autonomous agent, or any tool-calling loop
accumulates, turn after turn:

- **Conversation history** — every user message and assistant reply,
  including ones from many turns ago that may no longer be relevant.
- **Tool calls** — the assistant's requests to run a tool (read a file,
  run a command, query an API).
- **Tool results** — the tool's output, which can be arbitrarily large
  (a full file, a verbose test run, a CI log) and is tightly coupled to
  the call that produced it.
- **Retrieved documents** — chunks pulled in for RAG-style grounding,
  re-injected some or every turn.
- **System instructions** — the one thing that must never silently
  disappear, no matter how old it gets.

None of this shrinks on its own. Eventually the total exceeds the
model's context window, and something has to give — the only question
is whether *you* decide what, or the provider (or a crash) decides for
you.

## The naive approach, and why it breaks

The obvious first fix is `messages.shift()` or `.slice(-N)` behind an
`if`. It's genuinely fine for a while, and breaks in three specific,
predictable ways once an agent runs long enough:

1. It eventually shifts out the system prompt, because age-based
   trimming has no concept of "this one is pinned."
2. It can split a tool-call from the result it's paired with — most
   provider APIs reject the resulting request outright (an orphaned
   `tool_call_id`).
3. It gives no answer to "why did it drop *that* message," which
   matters the moment a user (or an incident review) asks.

Full treatment, including the incremental-accounting performance angle:
[`docs/comparisons.md#token-budget-vs-diy-messagesslice--shift`](../comparisons.md#token-budget-vs-diy-messagesslice--shift).

## The pieces of a real solution

**Token budget enforcement.** A hard ceiling (`maxTokens`, minus
`reserve` for the model's own reply) that every strategy respects —
`getContext()` never returns more than that, guaranteed. See the [root
README's smallest example](../../README.md#the-smallest-useful-example).

**Eviction and prioritization.** Not just "drop the oldest" — a
`priority` strategy can keep a low-value-but-recent tool result out and
a high-value-but-older instruction in, based on a `priority` you set
per message. Multiple strategies (`dropOldest`, `slidingWindow`,
`priority`, `summarizeOldest`) compose into a `chain()` — e.g. summarize
first, drop-oldest as a hard backstop if the summary still doesn't fit.

**Pinned instructions.** `pinned: true` on a message (typically the
system prompt) means no built-in strategy ever evicts or summarizes it,
regardless of age.

**Atomic tool-call/tool-result pairing.** Set a tool-result message's
`toolCallId` to the id of the assistant message that produced the call
— every built-in strategy treats the pair as one unit, so it's kept or
evicted together, never split. See the FAQ:
["How do you preserve tool calls when trimming context?"](../FAQ.md#how-do-you-preserve-tool-calls-when-trimming-context).

**Compaction and summarization.** `summarizeOldest` folds the oldest
eligible block into a single synthetic message via a summarizer
callback you supply (your own LLM call, or a cheaper model) —
recursively, with a configurable max depth, so a long-running session
doesn't just keep re-summarizing an ever-growing single blob forever.

**Oversized tool output.** A single tool result (a huge file, a verbose
log) can be larger than the whole budget by itself — eviction
strategies operate on whole messages and can't help there.
`truncateToolOutput()` handles this specific case; see
[`docs/guides/tool-output-context-management.md`](./tool-output-context-management.md).

**Explainability.** `budget.explain()` returns a structured trace: which
strategy ran, what it evicted and why, what it synthesized, and how
many tokens the decision saved — so "why did that leave the context"
has a real, programmatic answer instead of a shrug. See the [root
README's `explain()` section](../../README.md#explain--see-exactly-what-happened-and-why).

## See it work

[`examples/coding-agent-context`](../../examples/coding-agent-context)
is a realistic, deterministic, ~20-message coding-agent session (file
reads, terminal output, a full test run, old and recent turns mixed)
that genuinely exceeds a 700-token budget and shows exactly what gets
evicted, summarized, and preserved — runnable in under a minute, no API
key required.

## Integrating with what you're already using

token-budget is context-management infrastructure, not an agent
framework — it's the layer underneath whatever's orchestrating your
agent already:

- [`token-budget-openai`](../../packages/token-budget-openai) — OpenAI Chat Completions
- [`token-budget-anthropic`](../../packages/token-budget-anthropic) — Anthropic Messages API
- [`token-budget-vercel-ai`](../../packages/token-budget-vercel-ai) — Vercel AI SDK
- [`token-budget-langchain`](../../packages/token-budget-langchain) — LangChain.js

More questions answered directly in [`docs/FAQ.md`](../FAQ.md).
