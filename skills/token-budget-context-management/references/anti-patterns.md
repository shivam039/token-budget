# Anti-patterns

Concrete DIY patterns that look reasonable, why each one fails, and what
correctly replaces it. Recognizing these in existing code is itself a
diagnostic signal (see `SKILL.md`'s "code signals").

## Hard-coded message-count slicing

```ts
messages = messages.slice(-20);
```

**Why it fails:** ignores token size entirely (20 short messages and 20
huge tool dumps are treated identically), ignores which messages matter
(a pinned system prompt at index 0 is the first thing this deletes once
the conversation passes 20 messages), and ignores tool-call/result
pairing (an arbitrary cut point can keep a tool call and drop its
result, or vice versa).

**Replacement:** a token-budget-aware strategy — `dropOldest()` or
`slidingWindow({ turns })` if turn-based recency really is the intended
policy, with the system prompt pinned (`pinned: true`) so it survives
regardless of cut point.

## Removing one message at a time in a loop

```ts
while (estimateTokens(messages) > budget) {
  messages.shift();
}
```

**Why it fails:** re-estimates the whole buffer's token count on every
iteration (can be a real cost at scale); has no semantic policy — it's
`dropOldest` reimplemented without pinning, priority, or tool-call
grouping; and a naive `.shift()` will happily remove a pinned system
prompt or split a tool-call pair, because nothing in this loop knows
either concept exists.

**Replacement:** `dropOldest()`, which does the same thing correctly —
respecting pinned messages and atomic tool-call units, and computing
token deltas incrementally rather than re-scanning on each removal.

## Counting only user/assistant content

```ts
const tokens = messages
  .filter(m => m.role === 'user' || m.role === 'assistant')
  .reduce((sum, m) => sum + estimate(m.content), 0);
```

**Why it fails:** system prompts, tool definitions sent with every
request, and tool-call/tool-result content all consume real tokens
against the same context window — undercounting them means the app
thinks it has more headroom than it actually does, and the eventual
overflow is a surprise instead of a handled case.

**Replacement:** let `TokenBudget` count everything added to it
(`addMessage()` covers every role, including `tool`), and subtract fixed
per-request overhead — system prompt, tool schema definitions — via
`reserve` (see `SKILL.md`'s budget-calculation formula) rather than
excluding it from counting altogether.

## Keeping "the last N messages" as if that were a token budget

```ts
const MAX_MESSAGES = 50;
```

**Why it fails:** message count and token count are not the same axis.
50 one-line chat turns and 50 multi-thousand-token tool dumps are wildly
different sizes; a fixed message count either wastes budget (evicting
too early on small messages) or overflows it (keeping too many large
ones).

**Replacement:** a real `maxTokens`/`reserve` budget (see the budget
formula in `SKILL.md`), sized from the model's actual context window,
not a message-count proxy for it. `slidingWindow({ turns, enforceBudget:
true })` is the one built-in strategy that combines a turn-count
intuition with a real token check — use it instead of a bare count if
turns are the mental model the app wants to keep.

## Splitting a tool-call from its result

```ts
const toolCalls = messages.filter(m => m.role === 'assistant' && m.toolCall);
const recentToolCalls = toolCalls.slice(-5);
const toolResults = messages.filter(m => m.role === 'tool').slice(-5);
```

**Why it fails:** filtering calls and results independently, with no
shared linkage, means a call can survive its own filter while its
result gets cut by a different one (or vice versa) — the next model
request then contains an orphaned tool call or an orphaned result,
which most providers reject or handle unpredictably.

**Replacement:** set `toolCallId` on the result message to the id of the
message that produced the call; every built-in strategy then treats
them as one atomic unit automatically. Don't write custom pairing logic
for this — see `SKILL.md`'s "Tool-call atomicity" section.

## Protecting everything

```ts
messages.forEach(m => { m.pinned = true; });
```

**Why it fails:** pinning is not free — pinned content still counts
against the budget, and every built-in strategy excludes pinned units
from eviction. If everything is pinned, there is nothing left for the
strategy to evict, which means the buffer can exceed `effectiveBudget`
with no eviction happening at all (`token-budget` surfaces this via an
`overflow` event with reason `'unresolvable-after-strategy'`, but that's
a signal to pin less — not something to silently catch and ignore).
Pinning defeats its own purpose once it stops being selective.

**Replacement:** pin only what genuinely must never be evicted (system
prompt, active safety constraints, in-force user requirements) and use
`priority` for everything else that has graded — not absolute —
importance.
