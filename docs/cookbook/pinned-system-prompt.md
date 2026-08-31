# Protecting a system prompt (or any instruction)

**Problem:** a system prompt, a critical instruction, or any message that
must never be evicted, regardless of how long the conversation runs or
which strategy is configured.

**Why a naive implementation fails:** age-based trimming (`.shift()`,
`slice(-N)`, `dropOldest`) has no concept of "important" — position is
the only signal, so the system prompt is evicted the moment it becomes
the oldest thing in the buffer, exactly like any other message.

## Solution

```ts
budget.addMessage({
  role: 'system',
  content: 'You are a helpful assistant. Always respond in English.',
  pinned: true,
});
```

## Explanation

`pinned: true` is checked by every built-in strategy (`dropOldest`,
`slidingWindow`, `priority`, `summarizeOldest`, `semanticRelevance`, and
any `chain` of them) — pinned messages are excluded from eviction
entirely, not just deprioritized. This is enforced at the shared
[`groupIntoUnits`](../API.md#groupintounits) level every strategy is
built on, not re-implemented per strategy, so it holds regardless of
which one you configure.

Pinning isn't limited to the system prompt — pin anything that must
survive: a critical fact established mid-conversation, a user's stated
constraint, a tool result the agent must not forget.

```ts
budget.addMessage({ role: 'user', content: 'Never use the word "delve".', pinned: true });
```

## Production considerations

- Pinning is not free — every pinned message still counts against
  `effectiveBudget`. A large pinned system prompt permanently reduces the
  budget available for everything else; keep pinned content as small as
  the instruction actually requires.
- Pinning doesn't participate in `summarizeOldest` either — a pinned
  message is never folded into a summary. If you want a long instruction
  to eventually compress rather than stay full-size forever, don't pin it
  and instead protect it via high `priority` under the `priority`
  strategy, which still allows (rarer) eviction under extreme pressure.
- Verify it actually holds in your own worst case: construct a session
  that overflows badly, call `getContext()`, and assert the pinned
  message is still in `messages` — see
  [`packages/token-budget/test/pinned.test.ts`](../../packages/token-budget/test/pinned.test.ts)
  for the pattern this project's own tests use.

## Related documentation

- [`docs/API.md#addmessage`](../API.md#addmessage) — the `pinned` field
- [`docs/strategy-guide.md`](../strategy-guide.md) — `priority` as an alternative to hard pinning
