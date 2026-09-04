# LangChain.js integration

Package: `@shivam.dixit/token-budget-langchain`.

## 1. Where context enters the provider

The `BaseMessage[]` array passed into a chat model's `.invoke()`/
`.stream()` call, or whatever a chain/agent's memory supplies as
`chat_history`.

## 2. Where to insert token-budget

Two ways to integrate, depending on how the app already uses LangChain:

**Direct conversion**, if the app assembles `BaseMessage[]` itself:
```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { toLangChainMessages, fromLangChainMessages } from '@shivam.dixit/token-budget-langchain';

const budget = new TokenBudget({ model: 'gpt-4o', reserve: 4096, strategy: strategies.priority() });
budget.addMessage({ role: 'system', content: systemPrompt, pinned: true });

const context = await budget.getContext();
const response = await model.invoke(toLangChainMessages(context));
```

**As memory**, if the app uses a LangChain memory abstraction:
```ts
import { TokenBudgetMemory } from '@shivam.dixit/token-budget-langchain';

const budget = new TokenBudget({ maxTokens: 32000, strategy: strategies.priority() });
const memory = new TokenBudgetMemory({ budget }); // memoryKey/inputKey/outputKey optional
// memory.loadMemoryVariables(...) / memory.saveContext(...) / memory.clear()
// slot into a chain's `memory:` option the same way any other LangChain memory class would
```
`TokenBudgetMemory` wraps an already-constructed `TokenBudget` instance
(via `options.budget`) — it doesn't take `TokenBudgetConfig` fields
directly, so build the budget first, exactly as in the direct-conversion
example above.

## 3. What must be preserved

- System messages carrying instructions the chain depends on — pin
  them.
- Tool call / tool message pairing — LangChain's `AIMessage.tool_calls`
  and corresponding `ToolMessage`s must convert with `toolCallId` intact
  so eviction can't split them.
- Any existing LangChain memory contract the app relies on (`memoryKeys`,
  the shape returned by `loadMemoryVariables`) if swapping in
  `TokenBudgetMemory` — check what the chain/agent actually expects
  before replacing an existing memory class wholesale.

## 4. Adapter to use

`toLangChainMessages(context)`, `fromLangChainMessages(messages)`, and
the `TokenBudgetMemory` class (`loadMemoryVariables`, `saveContext`,
`clear`, `memoryKeys`) for apps already structured around LangChain's
memory abstraction.

## 5. Tests to add

- A round trip through `toLangChainMessages`/`fromLangChainMessages`
  preserves message roles and tool-call ids.
- If using `TokenBudgetMemory`: `saveContext` followed by
  `loadMemoryVariables` returns what the chain expects, and `clear()`
  actually empties the underlying budget.
- A tool call/result pair from a LangChain tool-calling agent survives
  or evicts together.

## 6. Common mistakes

- Mixing `TokenBudgetMemory` with a separate, independent
  trimming/summarization step LangChain itself provides (e.g. its own
  trimming middleware) — running two eviction policies on the same
  conversation produces confusing, hard-to-explain results; pick one.
  See [docs/comparisons/token-budget-vs-langchain.md](https://github.com/shivam039/token-budget/blob/main/docs/comparisons/token-budget-vs-langchain.md)
  in the source repository for how the two relate.
- Hand-converting `BaseMessage` tool-call fields instead of using the
  adapter, losing the `toolCallId` link in the process.
