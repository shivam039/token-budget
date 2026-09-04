# Vercel AI SDK integration

Package: `@shivam.dixit/token-budget-vercel-ai`.

## 1. Where context enters the provider

The `messages: CoreMessage[]` array passed to `streamText({ messages,
... })` or `generateText({ messages, ... })`.

## 2. Where to insert token-budget

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { toVercelMessages, streamTextIntoBudget, reconcileUsage } from '@shivam.dixit/token-budget-vercel-ai';
import { streamText } from 'ai';

const budget = new TokenBudget({
  model: 'gpt-4o',
  reserve: 4096,
  strategy: strategies.priority(),
});

budget.addMessage({ role: 'system', content: systemPrompt, pinned: true });
budget.addMessage({ role: 'user', content: userInput, priority: 5 });

const context = await budget.getContext();
const result = streamText({ model: openaiModel, messages: toVercelMessages(context) });

const assistantMessage = await streamTextIntoBudget(result.textStream, budget);
reconcileUsage(assistantMessage, await result.usage); // compare estimate vs. the SDK's own reported usage
```

If the app is a React client, `computeBudgetSnapshot(messages, config)`
— exported from the `@shivam.dixit/token-budget-vercel-ai/react` subpath
— is the pure logic behind a `useTokenBudget`-style hook — call it from
a `useMemo`/effect rather than re-deriving budget state by hand in
component code.

## 3. What must be preserved

- The system prompt (`pinned: true`) — `toVercelMessages` maps it into
  `CoreMessage[]`'s own system-message convention.
- Streaming behavior — use `streamTextIntoBudget` rather than manually
  accumulating `result.textStream` chunks and calling `addMessage` once
  at the end; the dedicated streaming methods (`beginStream`/
  `appendStreamChunk`/`endStream`) keep `stats()` accurate mid-stream,
  which a single post-hoc `addMessage` call doesn't.
- Tool calls — `CoreMessage`'s tool-call/tool-result parts must convert
  with `toolCallId` linkage intact through `toVercelMessages`/
  `fromVercelMessages`.

## 4. Adapter to use

`toVercelMessages(context)`, `fromVercelMessages(messages)`,
`streamTextIntoBudget(textStream, budget, options?)`,
`reconcileUsage(message, usage)` (all from the package root), and
(client-side) `computeBudgetSnapshot(messages, config)` from the
`/react` subpath export.

## 5. Tests to add

- `streamTextIntoBudget` produces a final `BudgetMessage` whose content
  matches the concatenated stream, and that `stats().streaming` is empty
  again afterward (the stream closed cleanly).
- `reconcileUsage` output is inspected at least once against real API
  usage to understand how far the estimator's mid-stream count actually
  diverges from the SDK's own reported usage, per
  `references/troubleshooting.md`'s tokenizer-accuracy guidance.
- Tool call/result parts round-trip through `toVercelMessages` still
  linked.

## 6. Common mistakes

- Calling `addMessage` once with the fully-accumulated stream text
  instead of using `beginStream`/`appendStreamChunk`/`endStream` (or
  `streamTextIntoBudget`) — this loses mid-stream budget visibility and
  makes `onStrategyDuringStream` meaningless since the buffer never
  reflects an in-progress stream.
- Never calling `reconcileUsage` and assuming the estimator's count
  exactly matches the SDK's reported token usage — see "Token count
  differs from the provider" in `references/troubleshooting.md`.
