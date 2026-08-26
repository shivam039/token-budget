# token-budget

Model-agnostic token accounting and eviction strategies for multi-turn LLM
conversations. `token-budget` tracks how many tokens a growing message
buffer consumes and applies a configurable eviction/compression strategy
as it approaches a token budget, so your application never silently
overflows a model's context window.

- **Zero required runtime dependencies.**
- Works in Node.js ≥ 18, browsers, and edge runtimes (no Node built-ins).
- Fully typed, TypeScript-first.
- Pluggable tokenizers and eviction strategies — bring your own, or compose
  the built-ins.
- Not an LLM client: it never calls a model API itself, except optionally
  through a summarizer callback you supply.

## Install

```sh
npm install token-budget
```

## Quickstart

```ts
import { TokenBudget, strategies } from 'token-budget';

const budget = new TokenBudget({
  maxTokens: 8000,
  reserve: 1000,
  strategy: strategies.dropOldest(),
});

budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
budget.addMessage({ role: 'user', content: 'Hello!' });

const { messages, tokensUsed, tokensRemaining } = await budget.getContext();
```

`messages` is ready to send to your model's chat-completion API as-is.

## Core concepts

- **Effective budget** = `maxTokens - reserve`. Every strategy trims the
  buffer to fit inside this number, not `maxTokens` itself.
- **Pinned messages** (`pinned: true`) — typically your system prompt —
  are never evicted or summarized by any built-in strategy.
- **Priority** (`priority: number`, higher = more important) is used by
  the `priority` strategy to decide eviction order among non-pinned
  messages. Defaults to `0`.
- **Tool-call/tool-result atomicity** — set `toolCallId` on a tool-result
  message to the `id` of the message that produced the call it answers.
  Every built-in strategy treats the pair as one atomic unit: both survive
  or both are evicted/summarized together, so you never end up with a
  dangling tool result (which breaks most provider APIs).
- **Raw vs. strategized** — `getMessages()` returns the full, unfiltered
  buffer in insertion order; `getContext()`/`getContextSync()` return what
  a strategy decided to actually send.

## `TokenBudget`

```ts
new TokenBudget({
  maxTokens: 8000,        // required: total context window size
  reserve: 1000,          // optional, default 0: tokens reserved for output
  tokenizer: 'estimate',  // optional: 'estimate' (default) or a Tokenizer instance
  charsPerToken: 4,       // optional: tunes the 'estimate' tokenizer
  warningThreshold: 0.8,  // optional, default 0.8: fraction of budget that fires 'warning'
  strategy: strategies.dropOldest(), // optional, default dropOldest()
  messageOverhead: (m) => 4,         // optional: per-message fixed overhead
  contentCounters: { image: () => 85 }, // optional: per content-block-type token counters
});
```

Construction throws a descriptive error if `reserve >= maxTokens`, or if
`warningThreshold` is outside `[0, 1]`.

### Methods

| Method | Description |
| --- | --- |
| `addMessage(input)` | Appends a message, incrementally updates totals, returns the stored `BudgetMessage` (with generated `id`/`timestamp`/`tokens`). |
| `removeMessage(id)` | Removes a message by id, returns `false` if not found. |
| `editMessage(id, patch)` | Edits a message by id and recomputes totals; throws if not found. |
| `clear()` | Empties the buffer. |
| `getMessages()` | Raw, unfiltered buffer, in insertion order. |
| `getContext()` | `Promise<ContextResult>` — applies the configured strategy (works for async strategies like `summarizeOldest`). |
| `getContextSync()` | Sync `ContextResult`; throws if the configured strategy isn't guaranteed synchronous. |
| `estimateBeforeAdd(input)` | Token cost of a would-be message, without mutating state — handy for a "disable send" UI check. |
| `stats()` | `{ tokensUsed, tokensRemaining, maxTokens, reserve, messageCount, pinnedCount }`, synchronously, at any time. |
| `setMaxTokens(n)` / `setReserve(n)` | Reconfigure the budget at runtime without losing buffer state (e.g. the model/context size changed mid-session). |
| `on(event, handler)` / `off(event, handler)` | Subscribe/unsubscribe to events. `on` returns an unsubscribe function. |

```ts
const budget = new TokenBudget({ maxTokens: 4000 });

budget.addMessage({ role: 'user', content: 'Hi there' });
budget.editMessage(budget.getMessages()[0]!.id, { content: 'Hi there!' });
budget.removeMessage('some-id');

const cost = budget.estimateBeforeAdd({ role: 'user', content: 'a long draft…' });
if (cost > budget.stats().tokensRemaining) disableSendButton();

const ctx = await budget.getContext();     // async, strategy-agnostic
const sync = budget.getContextSync();      // sync, throws for async strategies

budget.setMaxTokens(8000); // e.g. the user switched to a bigger-context model
```

### `getContext()` / `getContextSync()` result

```ts
interface ContextResult {
  messages: BudgetMessage[]; // strategy-applied, ready to send
  tokensUsed: number;
  tokensRemaining: number;
  evicted: BudgetMessage[];  // original messages dropped/summarized away
  strategyApplied: string;
}
```

### Events

`TokenBudget` implements a minimal built-in emitter (no Node `events`
dependency, so it works identically in the browser):

| Event | Fires when | Payload |
| --- | --- | --- |
| `warning` | Usage crosses `warningThreshold` of the effective budget. | `Stats & { threshold }` |
| `overflow` | A single message exceeds the whole effective budget by itself, or the buffer is still over budget after the strategy ran (e.g. pinned content alone doesn't fit). | `{ reason, message?, tokensUsed, effectiveBudget }` |
| `evicted` | A strategy dropped and/or summarized messages. | `{ strategyApplied, messages, replacedBy }` |
| `strategy-error` | The configured strategy throws (e.g. a `summarize` callback that exhausts its retries with `onError: 'throw'`). | `{ strategyName, error, recovered }` |

```ts
budget.on('warning', (stats) => console.warn('Approaching budget', stats));
budget.on('evicted', (info) => console.log('Evicted', info.messages.length, 'messages via', info.strategyApplied));
budget.on('overflow', (info) => console.error('Cannot fit context:', info.reason));
budget.on('strategy-error', (info) => console.error(`Strategy "${info.strategyName}" failed`, info.error));
```

## Strategies

All strategies implement:

```ts
interface Strategy {
  name: string;
  sync: boolean; // true only if apply() is guaranteed to never return a Promise
  apply(messages: BudgetMessage[], ctx: StrategyContext): Promise<BudgetMessage[]> | BudgetMessage[];
}
```

### `strategies.dropOldest()`

Removes the oldest non-pinned messages (tool-call/result pairs kept
together) until the buffer is back under budget.

```ts
new TokenBudget({ maxTokens: 4000, strategy: strategies.dropOldest() });
```

### `strategies.slidingWindow({ turns, enforceBudget? })`

Keeps only the last `turns` non-pinned atomic units, plus all pinned
messages, regardless of token count. A "turn" is one atomic unit — a
single message, or a tool-call kept together with its tool-result. Pass
`enforceBudget: true` to additionally trim that window down to the token
budget, oldest-first, if it's still too large.

```ts
strategies.slidingWindow({ turns: 20 });
strategies.slidingWindow({ turns: 20, enforceBudget: true });
```

### `strategies.priority()`

Evicts the lowest-`priority` non-pinned messages first; ties are broken by
age (oldest first).

```ts
new TokenBudget({ maxTokens: 4000, strategy: strategies.priority() });
budget.addMessage({ role: 'user', content: 'small talk', priority: 1 });
budget.addMessage({ role: 'user', content: "the user's actual question", priority: 10 });
```

### `strategies.summarizeOldest({ summarize, preThreshold?, blockSize?, onError?, retries? })`

When over budget (or over `preThreshold` × effective budget), takes the
oldest contiguous block of non-pinned atomic units, passes them to your
`summarize` callback, and replaces them with a single synthetic
`{ role: 'system', content: summary, metadata: { synthetic: true, sourceIds } }`
message.

```ts
strategies.summarizeOldest({
  summarize: async (messages) => callMyLLM(messages),
  onError: 'fallback-drop-oldest', // or 'throw' (default), with `retries` attempts first
  retries: 2,
});
```

`summarize-oldest` is hook-based only — bring your own summarization call.
Because it's heuristic (it doesn't know the summary's token cost until
`summarize` returns), it does **not** give the same hard "never exceeds
budget" guarantee as the other three built-ins. Chain it after
`slidingWindow`/`dropOldest` (see below) if you need a hard backstop.

### `strategies.chain([...strategies])`

Composes strategies into a pipeline — e.g. "sliding window, then summarize
on overflow, with drop-oldest as a hard backstop":

```ts
strategies.chain([
  strategies.slidingWindow({ turns: 20 }),
  strategies.summarizeOldest({ summarize: callMyLLM, onError: 'fallback-drop-oldest' }),
]);
```

A chain is `sync: true` only if every member strategy is; `getContextSync`
throws otherwise.

## Tokenizers

By default, `TokenBudget` uses a zero-dependency heuristic estimator
(`chars / charsPerToken`, default `charsPerToken: 4`). Tune it for
token-dense text:

```ts
new TokenBudget({ maxTokens: 4000, charsPerToken: 2.5 }); // e.g. CJK-heavy content
```

Or supply an exact tokenizer (e.g. from `tiktoken` or Anthropic's token
counting API) via the `Tokenizer` interface:

```ts
interface Tokenizer {
  count(text: string): number;
  encode?(text: string): number[];
}

new TokenBudget({ maxTokens: 4000, tokenizer: myTiktokenTokenizer });
```

`messageOverhead` and `contentCounters` let you account for provider-
specific framing tokens and non-text content blocks (tool calls, tool
results, images):

```ts
new TokenBudget({
  maxTokens: 4000,
  messageOverhead: (m) => (m.role === 'system' ? 3 : 4),
  contentCounters: {
    image: (block) => estimateImageTokens(block),
  },
});
```

> First-party tokenizer adapter packages (`token-budget-tiktoken`,
> `token-budget-claude`) and further framework adapters
> (`token-budget-langchain`, `token-budget-vercel-ai`) are still on the
> roadmap as separate, thin peer packages. `token-budget-anthropic` and
> `token-budget-openai` are available now — see [Framework
> adapters](#framework-adapters) below.

## Framework adapters

Thin, independently-versioned packages that convert `token-budget`'s
message model to/from a specific provider's wire format, in both
directions:

- [`token-budget-anthropic`](../token-budget-anthropic) — Anthropic
  Messages API (`toAnthropicMessages`, `fromAnthropicResponse`).
- [`token-budget-openai`](../token-budget-openai) — OpenAI Chat
  Completions API (`toOpenAIMessages`, `fromOpenAIResponse`).

Both treat `token-budget` as a peer dependency and are each under 150 lines
of actual conversion logic. If you're writing your own adapter (for
another provider, or a community package), reuse the shared conformance
suite this package exports:

```ts
import { runAdapterConformanceSuite } from 'token-budget/test-utils';

runAdapterConformanceSuite({
  name: 'my-adapter',
  toExternal: (messages) => /* ... */,
  fromExternal: (external) => /* ... */,
  buildFixtureMessages: () => /* a pinned system message, a tool-call/tool-result pair, etc. */,
});
```

It verifies round-trip fidelity, tool-call/tool-result atomicity,
pinned-message handling, and post-conversion token accounting — call it
inside your own `*.test.ts` file (requires `vitest`, an optional peer
dependency of this export).

## Write your own strategy

A strategy is just an object matching the `Strategy` interface. `apply`
receives the current message array and a `StrategyContext`:

```ts
interface StrategyContext {
  effectiveBudget: number;
  tokensUsed: number;
  countTokens: (messages: BudgetMessage[]) => number;
  countMessage: (message: BudgetMessage) => number;
  makeSynthetic: (content: string, sourceIds: string[]) => BudgetMessage;
}
```

If your strategy evicts anything, use the exported `groupIntoUnits` /
`filterByUnits` helpers so tool-call/tool-result pairs stay atomic and
insertion order is preserved exactly — the same helpers the built-ins use:

```ts
import type { Strategy } from 'token-budget';
import { groupIntoUnits, filterByUnits } from 'token-budget';

// Keeps only the single most recent non-pinned turn once over budget.
export function keepLatestOnly(): Strategy {
  return {
    name: 'keep-latest-only',
    sync: true,
    apply(messages, ctx) {
      if (ctx.countTokens(messages) <= ctx.effectiveBudget) return messages;

      const units = groupIntoUnits(messages);
      const pinned = units.filter((u) => u.pinned);
      const nonPinned = units.filter((u) => !u.pinned);
      const latest = nonPinned.at(-1);

      const survivors = latest ? [...pinned, latest] : pinned;
      return filterByUnits(messages, survivors);
    },
  };
}
```

See [`examples/customStrategy.ts`](./examples/customStrategy.ts) for the
full, tested version (exercised in
[`test/custom-strategy.test.ts`](./test/custom-strategy.test.ts)).

## Roadmap (not in this release)

- **Streaming**: `beginStream`/`appendStreamChunk`/`endStream` for
  incremental token accounting on a message being streamed in.
- **`explain()`**: a structured trace of the most recent strategy run, for debugging.
- **More framework adapters**: `token-budget-langchain`, `token-budget-vercel-ai`.
- **Tokenizer adapters**: `token-budget-tiktoken`, `token-budget-claude`.
- **Persistence hooks**: `serialize()`/`deserialize()`.

## Non-goals

`token-budget` is not a memory/RAG system (no vector search, no long-term
storage) and not an LLM client — it never sends requests to a model API
itself, except optionally through the `summarize` callback you supply to
`summarizeOldest`.

## Versioning

Semantic versioning is strictly enforced. Changes to the `Strategy`
interface, or to any built-in strategy's eviction semantics, are breaking
changes requiring a major version bump.

## License

MIT
