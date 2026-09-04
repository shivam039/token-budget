# OpenAI Chat Completions integration

Package: `@shivam.dixit/token-budget-openai`.

## 1. Where context enters the provider

The `messages` array passed to `openai.chat.completions.create({ messages, ... })`
(or the Responses API's equivalent input array) is the boundary — this
is the single request payload token-budget needs to produce.

## 2. Where to insert token-budget

At the point in the app that currently assembles that `messages` array
before the API call — not inside a UI component, not duplicated in a
background job. Call `budget.addMessage()` as each turn is produced
(user input, assistant reply, tool call, tool result), and call
`toOpenAIMessages(await budget.getContext())` immediately before the
`create()` call.

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { toOpenAIMessages, fromOpenAIResponse, createOpenAIMessageOverhead } from '@shivam.dixit/token-budget-openai';

const budget = new TokenBudget({
  model: 'gpt-4o',
  reserve: 4096,
  strategy: strategies.priority(),
  messageOverhead: createOpenAIMessageOverhead('gpt-4o'),
});

budget.addMessage({ role: 'system', content: systemPrompt, pinned: true });
budget.addMessage({ role: 'user', content: userInput, priority: 5 });

const context = await budget.getContext();
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: toOpenAIMessages(context),
});

fromOpenAIResponse(response, budget); // adds the assistant reply back into the buffer
```

## 3. What must be preserved

- `system` messages that carry instructions the app depends on — pin
  them (`pinned: true`), don't rely on ordering alone.
- Tool call / tool result pairs — OpenAI's function/tool-calling
  messages must round-trip through the adapter with `toolCallId` intact
  on both sides so the built-in strategies keep them atomic (see
  `SKILL.md`'s "Tool-call atomicity").

## 4. Adapter to use

`toOpenAIMessages(context)` (buffer → API request shape),
`fromOpenAIMessages(messages)` (API shape → `AddMessageInput[]`, useful
when importing an existing conversation), `fromOpenAIResponse(response,
budget)` (adds the model's reply straight into the buffer),
`createOpenAIMessageOverhead(model)` (a `messageOverhead` function
accounting for OpenAI's per-message formatting overhead — pass it via
`TokenBudgetConfig.messageOverhead` rather than estimating it by hand).

## 5. Tests to add

- A round trip through `toOpenAIMessages`/`fromOpenAIResponse` preserves
  message roles and tool-call ids exactly.
- A tool call added via `addMessage` and its result (with matching
  `toolCallId`) survive or evict together under the configured strategy.
- The array from `toOpenAIMessages(context)` is accepted by a real (or
  mocked) `chat.completions.create` call without a schema error.

## 6. Common mistakes

- Converting messages by hand instead of using `toOpenAIMessages`/
  `fromOpenAIMessages` — this is exactly the kind of duplicated,
  drift-prone logic `references/anti-patterns.md` warns about, and it's
  easy to lose the `toolCallId` link doing it manually.
- Forgetting `createOpenAIMessageOverhead` and using a raw content-only
  token estimate — OpenAI's chat format has real per-message formatting
  overhead beyond the content string.
- Calling `fromOpenAIResponse` before evicting, so the model's own reply
  gets added, then immediately considered for eviction on the *next*
  call before the user even sees the current turn resolve — this is
  usually fine, but confirm it's the intended ordering for the app.
