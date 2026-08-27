# token-budget-anthropic

Anthropic Messages API adapter for [`token-budget`](https://www.npmjs.com/package/token-budget).

No dependency on `@anthropic-ai/sdk` — the types here are structurally
compatible with it (and with plain `fetch`/JSON usage), so either works
without pulling the SDK in as a dependency.

## Install

```sh
npm install @shivam.dixit/token-budget @shivam.dixit/token-budget-anthropic
```

`token-budget` is a peer dependency (semver range, not pinned).

## Usage

```ts
import { TokenBudget } from '@shivam.dixit/token-budget';
import { toAnthropicMessages, fromAnthropicResponse } from '@shivam.dixit/token-budget-anthropic';

const budget = new TokenBudget({ maxTokens: 200000, reserve: 4096 });
budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
budget.addMessage({ role: 'user', content: 'What is the weather in Paris?' });

// Build the request: pinned system messages become Anthropic's separate
// `system` field (Anthropic has no `system` role inside `messages[]`).
const ctx = await budget.getContext();
const { system, messages } = toAnthropicMessages(ctx);

const response = await anthropicClient.messages.create({
  model: 'claude-opus-4-6',
  system,
  messages,
  max_tokens: 4096,
});

// Append the reply (including any tool_use blocks) back into the budget.
fromAnthropicResponse(response, budget);

// If the reply asked for a tool call, run it and append the result:
budget.addMessage({
  role: 'tool',
  content: [{ type: 'tool_result', toolUseId: 'toolu_...', result: 'Sunny, 22°C' }],
  toolCallId: 'toolu_...', // the same id as the tool_use block
});
```

## API

| Export | Description |
| --- | --- |
| `toAnthropicMessages(context)` | Converts a raw `BudgetMessage[]` or a `getContext()` result into `{ system?, messages }`. |
| `fromAnthropicContext(context)` | Inverse: converts `{ system?, messages }` back into `addMessage`-ready input. |
| `fromAnthropicResponse(response, budget)` | Appends an Anthropic API response directly into a `TokenBudget`. |
| `countAnthropicOverhead(message, tools?)` | Best-effort per-message + per-tool-definition token overhead estimate — Anthropic does not publish an exact formula. |

## Content block mapping

| token-budget `ContentBlock.type` | Anthropic block |
| --- | --- |
| `text` | `text` |
| `tool_call` | `tool_use` (block `id` becomes the message's `id`, for linking) |
| `tool_result` | `tool_result` (`toolUseId` becomes the message's `toolCallId`) |
| `image` | `image` |
| `document` | `document` |
| anything else | `text` (JSON-stringified) — a lossy fallback for unrecognized block types |

Anthropic has no `tool` role: a token-budget message with `role: 'tool'` is
sent as `{ role: 'user', content: [{ type: 'tool_result', ... }] }`, and
restored back to `role: 'tool'` on the way in.

## Known limitations

- Only the first `tool_use` block in an assistant turn is linked via
  `toolCallId`. Anthropic supports multiple parallel tool calls per turn,
  but `token-budget`'s `toolCallId` is scalar per message (a core Phase 1
  constraint) — the common single-tool-call-per-turn pattern round-trips
  exactly; turns with several simultaneous tool calls will only link the
  first.
- `countAnthropicOverhead` is a documented approximation, not ground truth
  — Anthropic does not publish exact per-message/per-tool overhead figures.

## Testing

This package's test suite includes the shared adapter conformance suite
from `token-budget/test-utils` (round-trip fidelity, tool-call atomicity,
pinned-message handling, token accounting) plus a full round-trip
integration test against a live-shaped response fixture.

## License

MIT
