# Basic chat: the smallest useful setup

**Problem:** you have a simple chat loop — a system prompt, user/assistant
turns — and want it to stop breaking once the conversation gets long,
without thinking hard about strategies yet.

**Why a naive implementation fails:** `messages.push()` forever, with no
budget at all, eventually hits the provider's hard context-window error —
usually mid-session, on whatever turn happens to push it over, which
makes it feel random even though it isn't.

## Solution

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 8000,
  reserve: 1000, // tokens reserved for the model's output
  strategy: strategies.dropOldest(),
});

budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });

function chat(userText: string) {
  budget.addMessage({ role: 'user', content: userText });
  // send budget.getContextSync().messages to your model, then:
  // budget.addMessage({ role: 'assistant', content: theReply });
}
```

## Explanation

`dropOldest` (the default strategy if you omit `strategy` entirely) drops
the oldest non-pinned messages once the buffer exceeds `maxTokens -
reserve`. `pinned: true` on the system message means it's never among
them, regardless of how long the conversation runs. `getContextSync()` is
safe to call every turn — it never mutates the buffer itself; see
["The lifecycle"](../../README.md#the-lifecycle-addmessage--getcontext--send--commit)
in the root README for why `getContext()` and eviction "sticking" are
separate steps.

## Production considerations

- Set `maxTokens` from your actual model instead of a guess — see
  [`docs/model-budgets.md`](../model-budgets.md) (`model: 'gpt-4o'` instead
  of a hardcoded number, for a recognized model).
- `dropOldest` is a fine default for a simple chat app; if turns vary a
  lot in importance, see [`docs/strategy-guide.md`](../strategy-guide.md).

## Related documentation

- [`examples/quickstart`](../../examples/quickstart) — this exact example, runnable
- [`docs/strategy-guide.md`](../strategy-guide.md) — choosing beyond the default
- [`docs/API.md`](../API.md) — full reference
