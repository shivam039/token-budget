# token-budget-langchain

LangChain.js adapter for [`token-budget`](https://www.npmjs.com/package/token-budget):
`BaseMessage[]` conversion and a `TokenBudgetMemory` class.

No dependency on `@langchain/core` — the types here are structurally
compatible with it (real `SystemMessage`/`HumanMessage`/`AIMessage`/
`ToolMessage`/`FunctionMessage` instances work as input directly, since
they expose the same fields and a `_getType()` method), so either works
without pulling the package in as a dependency.

## Install

```sh
npm install @shivam.dixit/token-budget @shivam.dixit/token-budget-langchain
```

`token-budget` is a peer dependency (semver range, not pinned).

## Usage: message conversion

```ts
import { TokenBudget } from '@shivam.dixit/token-budget';
import { toLangChainMessages, fromLangChainMessages } from '@shivam.dixit/token-budget-langchain';

const budget = new TokenBudget({ maxTokens: 128000 });
budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
budget.addMessage({ role: 'user', content: 'What is the weather in Paris?' });

const ctx = await budget.getContext();
const messages = toLangChainMessages(ctx); // pass straight to a LangChain model/chain

// After the model replies (a real AIMessage works here too):
for (const input of fromLangChainMessages([aiMessage])) budget.addMessage(input);
```

## Usage: `TokenBudgetMemory`

Drop it into a `ConversationChain` (or any code expecting LangChain's
`BaseMemory` contract — `loadMemoryVariables`/`saveContext`/`clear`) in
place of `BufferMemory`:

```ts
import { TokenBudgetMemory } from '@shivam.dixit/token-budget-langchain';

const memory = new TokenBudgetMemory({
  budget: new TokenBudget({ maxTokens: 128000, strategy: strategies.slidingWindow({ turns: 20 }) }),
});

const chain = new ConversationChain({ llm, memory });
await chain.call({ input: 'Hello!' }); // saveContext runs internally, keeping the budget in sync
```

`loadMemoryVariables` returns `{ history: LangChainMessageLike[] }` (the
key is configurable via `memoryKey`, default `'history'`) built from
`budget.getContext()`. `saveContext` appends the human/AI turn — the input
key is auto-detected when there's exactly one, or set `inputKey`/
`outputKey` explicitly (LangChain's own convention) — then calls
`budget.commit()` so eviction/summarization sticks across turns. The
underlying budget is exposed as `memory.budget` for direct access to
`stats()`, events, `explain()`, etc.

## API

| Export | Description |
| --- | --- |
| `toLangChainMessages(context)` | Converts a raw `BudgetMessage[]` or a `getContext()` result into `LangChainMessageLike[]`. |
| `fromLangChainMessages(messages)` | Inverse: converts `BaseMessage`-shaped input back into `addMessage`-ready input. |
| `TokenBudgetMemory` | `BaseMemory`-shaped class (`memoryKeys`, `loadMemoryVariables`, `saveContext`, `clear`) backed by a `TokenBudget`. |

## Content, tool-call, and metadata mapping

| token-budget `ContentBlock.type` | LangChain representation |
| --- | --- |
| `text` | `{ type: 'text', text }` content part |
| `image` (`{ url }`) | `{ type: 'image_url', image_url: { url } }` |
| `tool_call` | An entry in `AIMessage.tool_calls[]` |
| `tool_result` | A `ToolMessage` (`_getType() === 'tool'`), linked via `tool_call_id` |

`additional_kwargs`/`response_metadata` round-trip through `token-budget`'s
`metadata` field without loss (`metadata.additional_kwargs`/
`metadata.response_metadata`) — nothing else needs to change on your end.

## Known limitations

- **Structural, not class instances.** `toLangChainMessages` returns plain
  objects shaped like `BaseMessage` subclasses (working `_getType()`,
  `content`, `additional_kwargs`, etc.), not real `HumanMessage`/`AIMessage`
  instances. Code that calls `_getType()` — the documented, intended way to
  branch on message role — works correctly; code doing `instanceof
  HumanMessage` will not recognize them.
- **Legacy `FunctionMessage` linkage** only resolves `toolCallId` when the
  preceding `AIMessage` carried a matching `tool_calls` entry (mirroring
  `token-budget-openai`'s handling of the same legacy pattern) — a bare
  `FunctionMessage` with no preceding tool call round-trips as a tool
  result with an unset `toolCallId`.
- **`GenericMessage`** (LangChain's rarely-used custom-role type) maps to
  `role: 'user'` rather than preserving its own arbitrary role string.

## Compatibility matrix

Tested against LangChain.js's public message/memory shapes as of
`@langchain/core@^0.3.0`. This package has no runtime dependency on
`@langchain/core`, so it doesn't pin a version — if LangChain's message
model changes in a way that breaks structural compatibility, this table
(and the adapter) will be updated; check the changelog if you hit
surprises on a very new or very old LangChain release.

| Package | Tested range |
| --- | --- |
| `@langchain/core` (messages, `BaseMemory`) | `^0.3.0` |

## The wider project

Part of the [`token-budget`](https://github.com/shivam039/token-budget)
monorepo — the core package, the other framework/tokenizer adapters,
benchmarks, and the flagship
[coding-agent example](https://github.com/shivam039/token-budget/tree/main/examples/coding-agent-context)
all live there. See the
[compatibility matrix](https://github.com/shivam039/token-budget/blob/main/COMPATIBILITY.md)
for exactly what every adapter is tested against.

## License

MIT
