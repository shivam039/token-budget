# FAQ

Direct answer first, detail after — every question here is one this
project can actually back up with real code, real tests, or a real
published benchmark. Nothing below is aspirational.

## What is an LLM context window?

The maximum number of tokens (roughly, word-pieces) a model can process
in a single request — your conversation history, tool calls, tool
results, and system prompt all count against it. Exceed it and the
provider either rejects the request outright or silently truncates
something you didn't choose to lose.

## What happens when an AI agent exceeds its context window?

Without something managing it: a hard error from the provider, or
silent truncation that can drop the system prompt, split a tool-call
from its result (which most provider APIs then reject as malformed), or
lose whatever context happened to be oldest — regardless of whether it
was actually the least important thing in the buffer. See
[`docs/guides/ai-agent-context-management.md`](./guides/ai-agent-context-management.md)
for the full shape of the problem.

## How do you trim LLM conversation history?

Not with a plain `messages.shift()`/`.slice()` — that's the obvious
first thing to write, and it's a reasonable start, but it breaks down
at exactly the moments that matter: it can delete the system prompt
once it's the oldest message, split a tool-call from its result, and
gives no answer to "why did it drop *that* message." token-budget
replaces that hand-rolled logic with pluggable strategies (drop-oldest,
sliding-window, priority, summarize, or a chain of them), atomic
tool-call pairing, pinned-message guarantees, and an `explain()` trace.
Full comparison: [`docs/comparisons.md`](./comparisons.md#token-budget-vs-diy-messagesslice--shift).

## How do you implement a token budget for an AI agent?

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 128000,
  reserve: 4096, // tokens reserved for the model's output
  strategy: strategies.priority(),
});

budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
// ... add turns as the conversation grows ...
const { messages } = await budget.getContext(); // always fits maxTokens - reserve
```

`maxTokens` is the model's real context window (or a smaller number you
choose to leave headroom); `reserve` is tokens set aside for the
model's own reply. See the [root README](../README.md#the-smallest-useful-example)
for the full walkthrough, including the `getContext()`/`commit()`
lifecycle.

## How do you preserve tool calls when trimming context?

Give a tool-result message's `toolCallId` the `id` of the assistant
message that produced the call it answers. Every built-in strategy
groups that pair into one atomic eviction unit — both survive an
eviction, or both go, so a provider never sees an orphaned tool result
(a `tool_call_id` with no matching call, which most provider APIs
reject outright). This is checked, not just claimed:
[`examples/coding-agent`](../examples/coding-agent) asserts it directly
against a real strategy run.

## How do you truncate large tool results?

`truncateToolOutput(text, maxTokens, tokenizer)` shrinks a single
oversized tool result (a file dump, a verbose CI log) to fit a token
budget *before* it becomes a message — the case eviction strategies
alone can't fix, since they operate on whole messages, not the content
inside one. Full guide:
[`docs/guides/tool-output-context-management.md`](./guides/tool-output-context-management.md).

## Is token-budget a tokenizer?

No. A tokenizer answers "how many tokens is this text?" — a
`count(text): number` function. token-budget answers "given a growing
buffer and a hard limit, what should stay, in what order, and why?"
Full comparison, including the honest performance numbers:
[`docs/comparisons/token-budget-vs-gpt-tokenizer.md`](./comparisons/token-budget-vs-gpt-tokenizer.md).

## When should I use a tokenizer instead of token-budget?

When counting is the *only* requirement — you just need to know how
many tokens a string is, with no eviction, prioritization, or
tool-call-safety concern. A specialized tokenizer like `gpt-tokenizer`
is faster at raw counting than this project's own
[`token-budget-tiktoken`](../packages/token-budget-tiktoken), and that's
fine — you can use it **as** token-budget's `tokenizer` option (anything
with a `count(text): number` method works) if you want both: fast
counting and the eviction/prioritization/explainability layer on top.

## Is token-budget an alternative to LangChain?

No — it's a narrower, composable piece, not a framework replacement. If
you're already using LangChain.js, `trim_messages` and
`SummarizationMiddleware` cover basic trimming and summarization.
token-budget is worth adding when you need the same eviction logic to
work identically outside LangChain too, a strategy *chain* with a hard
budget guarantee, or an explainable decision trail. Full comparison:
[`docs/comparisons/token-budget-vs-langchain.md`](./comparisons/token-budget-vs-langchain.md).

## Does token-budget work with OpenAI?

Yes — [`token-budget-openai`](../packages/token-budget-openai) converts
to/from the Chat Completions wire format, including both new-style
`tool_calls[]` and legacy `function_call`.

## Does token-budget work with Anthropic?

Yes — [`token-budget-anthropic`](../packages/token-budget-anthropic)
converts to/from the Messages API wire format, including the separate
`system` field Anthropic uses instead of a `system` role in `messages[]`.

## Does token-budget work with Vercel AI SDK?

Yes — [`token-budget-vercel-ai`](../packages/token-budget-vercel-ai)
converts `CoreMessage[]`, integrates with `streamText()`, and ships an
optional `/react` `useTokenBudget()` hook.

## Does token-budget work with LangChain?

Yes — [`token-budget-langchain`](../packages/token-budget-langchain)
converts `BaseMessage[]` and provides a `TokenBudgetMemory` class
implementing LangChain's `BaseMemory` contract.

## Where do I start?

- New to the problem: [`docs/guides/ai-agent-context-management.md`](./guides/ai-agent-context-management.md)
- Want to see it work, no setup: [`examples/coding-agent-context`](../examples/coding-agent-context)
- Ready to integrate: the [root README](../README.md)'s smallest example, then your framework's adapter README above
