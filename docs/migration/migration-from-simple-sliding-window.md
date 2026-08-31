# Migrating from a simple sliding window

A step up from `.shift()`-when-over-budget: keep a fixed number of recent
messages, unconditionally.

## The starting point

```ts
function keepLastN(messages: Message[], n: number): Message[] {
  return messages.slice(-n);
}
```

## Where it breaks down

- **A fixed message *count* isn't a fixed token *count*.** `slice(-10)`
  might be 200 tokens one turn and 8,000 tokens the next turn, depending
  on what's in those 10 messages — a one-line reply vs. a large tool
  result. There's no actual budget guarantee, just a message-count
  guarantee that happens to correlate with tokens most of the time.
- **No concept of "important."** The system prompt, a pinned instruction,
  or a fact established 15 messages ago all get sliced away identically
  to genuinely stale content — position is the only signal.
- **A tool-call pair can straddle the window boundary** — if the call is
  at position `-11` and the result at `-10`, one survives the slice and
  the other doesn't, the same orphaned-tool-result problem manual
  trimming has.

## The token-budget equivalent

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens,
  strategy: strategies.slidingWindow({ turns: n, enforceBudget: true }),
});

budget.addMessage({ role: 'system', content: systemPrompt, pinned: true });
for (const m of history) budget.addMessage({ role: m.role, content: m.content, toolCallId: m.toolCallId });

const { messages } = budget.getContextSync();
```

`slidingWindow({ turns: n })` keeps the same "last N" shape you already
have, but counts a tool-call/tool-result pair as **one** turn (never
split), keeps pinned messages regardless of position, and
`enforceBudget: true` adds the actual token-budget guarantee `slice(-n)`
never had — if the kept window still doesn't fit, it trims further,
oldest-first, down to size.

## When a fixed window still isn't enough

If your agent has content that matters *outside* the last N turns (a
decision made early in the conversation, a file read several tool calls
ago that's still relevant), a fixed window structurally can't keep it
without pinning it explicitly. That's the signal to move to `priority` —
see [`docs/strategy-guide.md`](../strategy-guide.md#priority).

## Related documentation

- [`docs/why-token-budget.md#why-not-messagesslice-n`](../why-token-budget.md#why-not-messagesslice-n)
- [`docs/strategy-guide.md`](../strategy-guide.md)
