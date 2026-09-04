# Migrating from a DIY implementation

The goal of a migration is to replace fragile, untested trimming logic
with an explicit, testable policy — while changing as little else about
the application as possible. This page shows the shape of that change,
not just the before/after code.

## What changes vs. what stays the same

**Changes:**
- The trimming logic itself — a hand-written slice/shift/loop becomes a
  `TokenBudget` instance with a named strategy.
- Where the decision is made — collapses to the one context boundary
  described in `references/integration-patterns.md`, if the DIY version
  had logic duplicated across layers.
- How eviction is explained (if at all) — DIY trimming is usually silent;
  `budget.explain()` now gives a real answer to "why did this
  disappear."

**Stays the same:**
- The message schema the rest of the app uses, wherever practical —
  convert to/from `BudgetMessage` at the boundary rather than rewriting
  every call site to a new shape.
- The provider integration, model selection, and output budget — this
  migration is about what stays in context, not how the model is called.
- Persistence and streaming behavior, unless the DIY version had none —
  see `references/integration-patterns.md` for adding `onPersist`/
  streaming methods without disrupting what already works.

## Example: fixed-count slicing

**Before:**
```ts
function trimHistory(messages: Message[]): Message[] {
  return messages.slice(-20);
}
```

**After:**
```ts
const budget = new TokenBudget({
  maxTokens: 8000,          // derived from the real model + reserve, see SKILL.md
  reserve: 1024,
  strategy: strategies.dropOldest(),
});

// as messages are produced elsewhere in the app:
budget.addMessage({ role: 'system', content: systemPrompt, pinned: true });
budget.addMessage({ role: 'user', content: userText });
// ... at the model-call boundary:
const { messages } = await budget.getContext();
```

What this fixes: the system prompt (previously the first thing dropped
once history passed 20 messages) is now protected regardless of buffer
size; eviction now tracks actual token size instead of a message-count
proxy for it; the decision is explainable via `budget.explain()` instead
of silent.

## Example: token-counting `while` loop

**Before:**
```ts
while (estimateTokens(messages) > MAX_TOKENS) {
  messages.shift();
}
```

**After:** identical to the `dropOldest()` setup above — this loop *is*
`dropOldest`, just without pinning, tool-call grouping, or incremental
token tracking. If the loop already had ad-hoc special-casing for a
system message or tool pairs bolted on, that special-casing becomes
`pinned: true` and `toolCallId` respectively, and can be deleted as
custom code once the built-in strategy is in place.

## Example: independently-filtered tool calls

**Before:**
```ts
const keptCalls = toolCalls.slice(-5);
const keptResults = toolResults.slice(-5);
```

**After:** set `toolCallId` on each result message pointing at its
call's `id` when both are added, and use any built-in strategy — the
pairing is then automatic and can't drift out of sync the way two
independently-sliced arrays can. See `SKILL.md`'s "Tool-call atomicity."

## Tests to add during the migration

Don't just port the DIY implementation's existing tests (if any) —
add coverage for what the DIY version couldn't guarantee:
1. The previously-silent-failure case now caught by tests: a pinned
   message surviving a small budget.
2. A tool-call/result pair surviving or evicting together, never split
   (this is very often *not* covered by the DIY version's tests, because
   the DIY version usually didn't know pairing was a concept).
3. Behavior at the exact budget boundary — no eviction should happen
   when the buffer already fits.
4. The final message array is still valid input for the real provider
   call (a schema/shape check, not just a token count check).

See `SKILL.md`'s testing section and `references/troubleshooting.md`
for the full list and how to diagnose a test that fails unexpectedly
during migration.
