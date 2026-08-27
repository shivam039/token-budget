# token-budget-vercel-ai

Vercel AI SDK adapter for [`token-budget`](https://www.npmjs.com/package/token-budget):
`CoreMessage[]` conversion, `streamText()` streaming integration, and an
optional React hook.

No dependency on the `ai` package — the types here are structurally
compatible with its `CoreMessage` shapes, so either works without pulling
the SDK in as a dependency.

## Install

```sh
npm install @shivam.dixit/token-budget @shivam.dixit/token-budget-vercel-ai
```

`token-budget` is a peer dependency. `react` is an optional peer
dependency, needed only for the `token-budget-vercel-ai/react` subpath.

## Usage

```ts
import { TokenBudget } from '@shivam.dixit/token-budget';
import { toVercelMessages, fromVercelMessages, streamTextIntoBudget, reconcileUsage } from '@shivam.dixit/token-budget-vercel-ai';
import { streamText } from 'ai';

const budget = new TokenBudget({ maxTokens: 128000, reserve: 4096 });
budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
budget.addMessage({ role: 'user', content: 'What is the weather in Paris?' });

const ctx = await budget.getContext();
const result = streamText({ model, messages: toVercelMessages(ctx) });

// Pipes the stream's textStream into TokenBudget's streaming API
// (beginStream/appendStreamChunk/endStream) chunk by chunk, so
// stats().tokensUsed reflects partial output in real time.
const finalMessage = await streamTextIntoBudget(result.textStream, budget);

// Optional: compare against the SDK's own billed usage once available.
const usage = await result.usage;
console.log(reconcileUsage(finalMessage, usage));
```

### React

```tsx
import { useChat } from 'ai/react';
import { useTokenBudget } from '@shivam.dixit/token-budget-vercel-ai/react';

function Chat() {
  const { messages } = useChat();
  const { tokensUsed, tokensRemaining, isNearLimit } = useTokenBudget(messages, { maxTokens: 128000, reserve: 4096 });

  return (
    <div>
      {isNearLimit && <Banner>Approaching the context limit ({tokensUsed} used, {tokensRemaining} left)</Banner>}
      {/* ... */}
    </div>
  );
}
```

## API

| Export | Description |
| --- | --- |
| `toVercelMessages(context)` | Converts a raw `BudgetMessage[]` or a `getContext()` result into `CoreMessage[]`. |
| `fromVercelMessages(messages)` | Inverse: converts `CoreMessage[]` back into `addMessage`-ready input. |
| `streamTextIntoBudget(textStream, budget, options?)` | Pipes a `streamText()` result's `textStream` into `beginStream`/`appendStreamChunk`/`endStream`, chunk by chunk. On an upstream error, finalizes the partial content (`abortStream(id, 'keep-partial')`) before rethrowing. |
| `reconcileUsage(message, usage)` | Compares a finalized streamed message's token estimate against the SDK's `onFinish` usage, for logging — doesn't mutate the budget. |
| `useTokenBudget(messages, config)` (from `/react`) | Reactive `{ tokensUsed, tokensRemaining, isNearLimit }` derived from `useChat()`'s message list. |

Role mapping is direct: `CoreMessage`'s roles (`system`/`user`/`assistant`/`tool`)
match `token-budget`'s exactly, unlike the Anthropic/OpenAI adapters. The
system message stays inline (as with OpenAI), and `tool` stays `tool`
(unlike Anthropic, which has no `tool` role on the wire).

## Content & tool-call mapping

| token-budget `ContentBlock.type` | Vercel AI SDK part |
| --- | --- |
| `text` | `{ type: 'text', text }` |
| `image` (`{ image, mimeType? }`) | `{ type: 'image', image, mimeType }` |
| `tool_call` | `{ type: 'tool-call', toolCallId, toolName, args }` |
| `tool_result` | `{ type: 'tool-result', toolCallId, toolName, result, isError? }` |

## License

MIT
