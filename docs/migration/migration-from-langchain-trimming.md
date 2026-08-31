# Migrating from LangChain's `trim_messages` / `SummarizationMiddleware`

If you're already using LangChain.js's own trimming, it's worth being
direct about when moving to token-budget is actually worth it versus
when it isn't — see
[`docs/comparisons/token-budget-vs-langchain.md`](../comparisons/token-budget-vs-langchain.md)
for the full tested-workload comparison this page summarizes into a
migration path.

## The starting point

```ts
import { trimMessages } from '@langchain/core/messages';

const trimmed = await trimMessages(messages, {
  maxTokens: 8000,
  tokenCounter: myTokenCounter,
  strategy: 'last',
});
```

## When to keep `trim_messages` as-is

If your app is LangChain-only, trimming needs are basic, and you don't
need an explainable decision trail — `trim_messages` covers that well.
Migrating for its own sake adds a dependency for no functional gain.
Reach for token-budget specifically when you hit one of:

- You need the **same** eviction/summarization logic to also work outside
  LangChain (a raw provider client, the Vercel AI SDK) without
  re-implementing it per framework.
- You need a **strategy chain** with a hard token-budget guarantee (e.g.
  summarize-oldest with drop-oldest as a backstop).
- You need to **explain** a decision after the fact, not just get a
  trimmed array back.
- Your history is **large** and queried repeatedly — `trim_messages`'
  cost is driven by total history size, not the (often smaller) window
  actually retained; see the realistic bounded-window benchmark in
  [`docs/benchmarks.md`](../benchmarks.md#context-management-benchmark).

## The token-budget equivalent

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { toLangChainMessages, fromLangChainMessages } from '@shivam.dixit/token-budget-langchain';

const budget = new TokenBudget({ maxTokens: 8000, strategy: strategies.dropOldest() });
budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
for (const input of fromLangChainMessages(existingMessages)) budget.addMessage(input);

const ctx = await budget.getContext();
const trimmed = toLangChainMessages(ctx); // pass straight to your LangChain model/chain
```

`token-budget-langchain` round-trips real `SystemMessage`/`HumanMessage`/
`AIMessage`/`ToolMessage`/`FunctionMessage` instances (structural typing —
no hard dependency on `@langchain/core`), including tool-call mapping
(`AIMessage.tool_calls[]` ↔ `toolCallId`-linked messages) — see the
[`token-budget-langchain` README](../../packages/token-budget-langchain/README.md#content-tool-call-and-metadata-mapping)
for the full content-type mapping table.

## Drop-in memory replacement

If you're using LangChain's `BufferMemory`/`ConversationChain` pattern,
`TokenBudgetMemory` implements the same `BaseMemory` contract
(`loadMemoryVariables`/`saveContext`/`clear`) as a drop-in swap:

```ts
import { TokenBudgetMemory } from '@shivam.dixit/token-budget-langchain';

const memory = new TokenBudgetMemory({
  budget: new TokenBudget({ maxTokens: 8000, strategy: strategies.slidingWindow({ turns: 20 }) }),
});

const chain = new ConversationChain({ llm, memory }); // same shape as BufferMemory
```

## `SummarizationMiddleware` equivalent

```ts
strategy: strategies.summarizeOldest({
  summarize: async (messages) => yourExistingSummarizerCall(messages),
})
```

Bring the same summarization call you already have — `summarizeOldest`
just changes when/how it's invoked (triggered by budget pressure, folded
into a synthetic message the strategy machinery understands), not what it
summarizes with.

## Related documentation

- [`docs/comparisons/token-budget-vs-langchain.md`](../comparisons/token-budget-vs-langchain.md) — full comparison and benchmark methodology
- [`packages/token-budget-langchain/README.md`](../../packages/token-budget-langchain/README.md) — full adapter API
