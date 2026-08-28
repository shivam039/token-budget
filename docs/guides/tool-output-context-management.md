# How do you prevent large tool results from consuming an LLM context window?

**Direct answer:** shrink the oversized result to a token budget
*before* it becomes a message — with `truncateToolOutput()` — rather
than relying on message-level eviction, which can't help with a single
result that's already bigger than your whole budget.

## Why this is a different problem from eviction

`token-budget`'s strategies (`dropOldest`, `priority`, `summarizeOldest`,
etc.) operate on whole messages: a message is either kept or evicted as
a unit. That's the right granularity for "too many messages." It's the
wrong granularity for a *single* tool result that's already larger than
the entire budget — a 50,000-token CI log, a full file dump, a verbose
test-suite run. No eviction strategy can partially keep one message; it
can only keep it whole or drop it whole, and dropping the one tool
result that actually answers the user's question isn't the fix either.

## The fix: shrink the content, not the message

```ts
import { TokenBudget, truncateToolOutput, createEstimateTokenizer } from '@shivam.dixit/token-budget';

const tokenizer = createEstimateTokenizer(); // or the same real tokenizer you pass TokenBudget
const budget = new TokenBudget({ maxTokens: 8000, reserve: 500, tokenizer });

const rawBuildLog = runBuild(); // could be 50,000+ tokens on its own

budget.addMessage({
  role: 'tool',
  content: [{
    type: 'tool_result',
    // keep: 'end' (the default) — a build/test log's actionable line is
    // almost always last (the failure, the final PASS/FAIL summary).
    result: truncateToolOutput(rawBuildLog, 1000, tokenizer),
  }],
  toolCallId: buildCallId,
});
```

This is a content-prep step, not a strategy — it has nothing to do with
the message buffer, eviction, or `toolCallId` pairing, and doesn't touch
any of them. It composes with whichever strategy you're already using;
apply it once, before `addMessage()`, and every existing strategy
continues to work exactly as before, just against a tool result that
can no longer single-handedly blow the budget.

## Choosing what to keep

`truncateToolOutput(text, maxTokens, tokenizer, options?)` supports
three modes via `options.keep`:

| `keep` | Keeps | Best for |
| --- | --- | --- |
| `'end'` (default) | The tail | Terminal output, test runners, stack traces — the actionable line (the failure, the final result) is almost always last. |
| `'start'` | The head | A log whose relevant part is up front. |
| `'both'` | A head and a tail, middle cut | A file read, where both the imports/header and the tail matter. |

A short marker (`…[N chars cut]…` by default, customizable via
`options.marker`) shows where content was removed. The function never
splits a UTF-16 surrogate pair (an emoji or other astral-plane
character right at the cut boundary) — the output is always
well-formed, even if that costs one character fewer than the absolute
token ceiling technically allows.

## Performance at realistic-to-pathological sizes

Binary search over character length means this stays fast regardless of
input size — median 0.01ms even shrinking a 521 KB input down to 1,000
tokens. Full numbers and methodology:
[`docs/benchmarks.md#tool-output-truncation-benchmark`](../benchmarks.md#tool-output-truncation-benchmark).

## See it in a realistic session

[`examples/coding-agent-context`](../../examples/coding-agent-context)'s
"bonus" section demonstrates a ~1,225-token CI log capped to 150 tokens
with the tail (the PASS/FAIL line) intact — real output, not
illustrative.

## Related

- [`docs/guides/ai-agent-context-management.md`](./ai-agent-context-management.md) — the broader context-management problem this is one piece of
- [`docs/FAQ.md`](../FAQ.md) — "How do you truncate large tool results?" and related questions
- [`packages/token-budget/COOKBOOK.md`](../../packages/token-budget/COOKBOOK.md) — the coding-agent recipe this technique appears in
