# token-budget-openai

OpenAI Chat Completions API adapter for
[`token-budget`](https://www.npmjs.com/package/token-budget).

No dependency on the `openai` SDK — the types here are structurally
compatible with it (and with plain `fetch`/JSON usage), so either works
without pulling the SDK in as a dependency.

## Install

```sh
npm install @shivam.dixit/token-budget @shivam.dixit/token-budget-openai
```

`token-budget` is a peer dependency (semver range, not pinned).

## Usage

```ts
import { TokenBudget } from '@shivam.dixit/token-budget';
import { toOpenAIMessages, fromOpenAIResponse, createOpenAIMessageOverhead } from '@shivam.dixit/token-budget-openai';

const budget = new TokenBudget({
  maxTokens: 128000,
  reserve: 4096,
  messageOverhead: createOpenAIMessageOverhead('gpt-4o'), // FR2-1.2.3
});
budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
budget.addMessage({ role: 'user', content: 'What is the weather in Paris?' });

// OpenAI keeps the system message inline (unlike Anthropic's separate field).
const ctx = await budget.getContext();
const messages = toOpenAIMessages(ctx);

const response = await openaiClient.chat.completions.create({ model: 'gpt-4o', messages });
fromOpenAIResponse(response, budget); // handles both tool_calls and legacy function_call

// If the reply asked for a tool call, run it and append the result:
budget.addMessage({
  role: 'tool',
  content: [{ type: 'tool_result', toolUseId: 'call_...', result: 'Sunny, 22°C' }],
  toolCallId: 'call_...', // the same id as the tool_calls[].id
});
```

## API

| Export | Description |
| --- | --- |
| `toOpenAIMessages(context)` | Converts a raw `BudgetMessage[]` or a `getContext()` result into `OpenAIMessage[]`. |
| `fromOpenAIMessages(messages)` | Inverse: converts `OpenAIMessage[]` back into `addMessage`-ready input. |
| `fromOpenAIResponse(response, budget)` | Appends a Chat Completions response's first choice directly into a `TokenBudget`. |
| `createOpenAIMessageOverhead(model?)` | Returns a `messageOverhead` function using OpenAI's documented `tokens_per_message`/`tokens_per_name` constants, looked up by model family. |

## Content & tool-call mapping

| token-budget `ContentBlock.type` | OpenAI representation |
| --- | --- |
| `text` | `{ type: 'text', text }` content part |
| `image` (`{ url, detail? }`) | `{ type: 'image_url', image_url: { url, detail } }` content part |
| `tool_call` | An entry in the assistant message's top-level `tool_calls[]` (new-style) |
| `tool_result` | A `role: 'tool'` message with `tool_call_id` |

OpenAI has no dedicated internal "pinned" concept, but its system message is
always inline — `toOpenAIMessages` keeps it as `{ role: 'system', ... }`,
and `fromOpenAIMessages` marks any `role: 'system'` message `pinned: true`
on the way back in.

### New-style vs. legacy function calling

`fromOpenAIMessages`/`fromOpenAIResponse` handle both:

- **New-style** `tool_calls[]` on an assistant message, each followed by a
  `role: 'tool'` message carrying `tool_call_id`. Multiple tool calls in one
  turn are all preserved (OpenAI issues one `tool` message per call, so
  there's no atomicity limitation here, unlike some other providers).
- **Legacy** single `function_call` on an assistant message, followed by a
  `role: 'function'` message. The legacy format carries no id, so one is
  synthesized and matched to its result by function name.

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
