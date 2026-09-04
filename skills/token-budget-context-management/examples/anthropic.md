# Anthropic Messages API integration

Package: `@shivam.dixit/token-budget-anthropic`.

## 1. Where context enters the provider

The `messages` array (plus a separate top-level `system` string) passed
to `anthropic.messages.create({ system, messages, ... })` — Anthropic
keeps the system prompt outside the `messages` array entirely, which
matters for how it's counted (see below).

## 2. Where to insert token-budget

At the point that currently assembles `messages`/`system` before the
`create()` call:

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { toAnthropicMessages, fromAnthropicResponse, countAnthropicOverhead } from '@shivam.dixit/token-budget-anthropic';

const budget = new TokenBudget({
  model: 'claude-3-5-sonnet-20240620',
  reserve: 4096,
  strategy: strategies.priority(),
});

budget.addMessage({ role: 'system', content: systemPrompt, pinned: true });
budget.addMessage({ role: 'user', content: userInput, priority: 5 });

const context = await budget.getContext();
const { system, messages } = toAnthropicMessages(context);
const response = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20240620',
  system,
  messages,
  max_tokens: 4096,
});

fromAnthropicResponse(response, budget);
```

## 3. What must be preserved

- The system prompt — still tracked as a pinned `system`-role
  `BudgetMessage` inside `token-budget`'s buffer (so it's counted and
  can be inspected via `explain()`), even though Anthropic's own API
  wants it delivered as a separate top-level field. `toAnthropicMessages`
  handles this split; don't reconstruct it manually.
- Tool use / tool result content blocks — Anthropic represents these as
  content blocks within a message rather than always as separate
  messages; the adapter's conversion is responsible for producing
  correctly-linked `toolCallId`s on the `token-budget` side. Verify this
  round-trips correctly for the app's actual tool-use patterns before
  relying on it in production.

## 4. Adapter to use

`toAnthropicMessages(context)` (buffer → `{ system, messages }` shaped
for the Messages API), `fromAnthropicContext(context)` (API shape →
`AddMessageInput[]`, for importing an existing conversation),
`fromAnthropicResponse(response, budget)` (adds the model's reply into
the buffer), `countAnthropicOverhead(message, tools?)` (accounts for
Anthropic-specific formatting/tool-definition overhead — feed this into
`reserve` sizing or `messageOverhead` rather than guessing).

## 5. Tests to add

- The pinned system message round-trips into the top-level `system`
  field, not into `messages`, and survives eviction regardless of
  budget pressure.
- A tool-use block and its tool-result block stay linked through
  `toAnthropicMessages`/an equivalent import path.
- `countAnthropicOverhead` is actually wired into the budget's overhead
  accounting if the app sends tool definitions with every request.

## 6. Common mistakes

- Treating the system prompt as just another buffer message that
  happens to render first — Anthropic's API contract requires it
  separately; skipping `toAnthropicMessages` and hand-assembling the
  request risks sending it in the wrong place.
- Not accounting for `countAnthropicOverhead` when the app sends tool
  definitions on every request, leading to underestimated `reserve` and
  the "context still exceeds the limit" symptom in
  `references/troubleshooting.md`.
