# Descriptions

Canonical copy for submissions, listings, and posts. Pull from here rather
than rewriting from scratch each time, so wording stays consistent and
accurate across channels. Nothing here goes beyond the package facts —
no invented numbers, users, or benchmarks.

## 1-sentence description

> token-budget keeps long-running AI agents inside their context window —
> model-agnostic token budgets and eviction strategies (drop-oldest,
> sliding-window, priority, summarize) with pinned messages, atomic
> tool-call/tool-result pairing, and explainable decisions.

## 50–80 word description

> token-budget is a TypeScript library that keeps multi-turn LLM
> conversations under a token budget as they grow. It applies eviction
> strategies — drop-oldest, sliding-window, priority, and summarization —
> that chain together, while preserving pinned system messages and atomic
> tool-call/tool-result pairs so eviction never breaks a request mid-flight.
> Every decision is inspectable via `explain()`. Adapters exist for OpenAI,
> Anthropic, the Vercel AI SDK, LangChain.js, and tiktoken. Zero required
> runtime dependencies, Node ≥18, browser/edge compatible, MIT licensed.

## 150–200 word description

> Long-running AI agents accumulate conversation history, tool calls, tool
> results, and intermediate context turn after turn. Eventually that
> history approaches the model's context limit, and something has to give.
> The naive fix — `messages.shift()` or `.slice(-N)` — works for a while,
> then breaks in predictable ways: it can shift out the system prompt
> because age-based trimming has no concept of "pinned," it can split a
> tool call from the result it's paired with (most provider APIs reject
> the resulting request outright), and it gives no answer to "why did it
> drop *that* message" when something goes wrong.
>
> token-budget is a model-agnostic TypeScript library that replaces that
> guesswork with an explicit token budget, prioritized eviction strategies
> (drop-oldest, sliding-window, priority, summarize — chainable), pinned
> messages that are never evicted regardless of age, atomic tool-call/
> tool-result pairing so a pair is always kept or dropped together, and
> `explain()` for a structured trace of what was evicted and why. It works
> standalone or through adapters for OpenAI, Anthropic, the Vercel AI SDK,
> LangChain.js, and tiktoken. Zero required runtime dependencies, Node
> ≥18, browser/edge compatible, MIT licensed.

## "Why this exists"

Long-running AI agents accumulate conversation history, tool calls, tool
results, and intermediate context. Eventually the context approaches the
model's limit. Naive FIFO trimming can remove important instructions or
break tool interactions. token-budget provides explicit token budgets,
prioritized eviction, pinned messages, tool-pair preservation, and
explainable context decisions.

## Links (use these exactly)

- npm: https://www.npmjs.com/package/@shivam.dixit/token-budget
- GitHub: https://github.com/shivam039/token-budget
- License: MIT
- Author: shivam039
