# Real-world architecture patterns

Three common agent shapes and how their messages should actually be tagged
(`pinned`/`priority`) — concrete blueprints, not new APIs. Each maps onto
the strategy recommended in [`docs/strategy-guide.md`](./strategy-guide.md);
each has a fully runnable, tested version in
[`packages/token-budget/COOKBOOK.md`](../packages/token-budget/COOKBOOK.md).

## Coding agent

```
System instructions       PINNED
Current task               HIGH
Recent tool results        HIGH
Recent conversation        MEDIUM
Old tool results            LOW
Old conversation             LOW
```

```ts
const budget = new TokenBudget({ maxTokens: 70000, strategy: strategies.priority() });

budget.addMessage({ role: 'system', content: 'You are a coding agent...', pinned: true });
budget.addMessage({ role: 'user', content: 'Fix the validation bug in src/current-file.ts.', priority: 5 });
budget.addMessage({ role: 'assistant', content: 'Reading src/current-file.ts...', priority: 5, toolCallId: undefined });
budget.addMessage({ role: 'tool', content: currentFileContents, priority: 5, toolCallId: readCallId });
// an earlier, now-irrelevant file read stays in the buffer at a lower priority:
budget.addMessage({ role: 'tool', content: oldFileContents, priority: 1, toolCallId: earlierReadCallId });
```

`priority` evicts the stale (`priority: 1`) tool output before the
current file's content, regardless of which is older — see the full
recipe: [COOKBOOK.md § Coding agent](../packages/token-budget/COOKBOOK.md#coding-agent).
For one tool result too large on its own (a full test-suite log), shrink
it first with `truncateToolOutput` — see
[`docs/guides/tool-output-context-management.md`](./guides/tool-output-context-management.md).

## RAG (retrieval-augmented) agent

```
System prompt              PINNED
Current question             HIGH
Retrieved documents        PRIORITY (re-injected fresh each turn)
Conversation                MEDIUM
Old tool output               LOW
```

```ts
const budget = new TokenBudget({
  maxTokens: 32000,
  strategy: strategies.summarizeOldest({ summarize: mySummarizer }),
});

budget.addMessage({ role: 'system', content: 'Answer from the retrieved docs below.', pinned: true });
budget.addMessage({ role: 'user', content: 'How do I configure step 1?' });
budget.addMessage({ role: 'assistant', content: retrievedAnswer /* grounded in freshly retrieved chunks */ });
```

Retrieved chunks are cheap to regenerate each turn (the retrieval step
re-runs regardless), so they don't need eviction logic of their own — drop
the previous turn's chunks and re-inject fresh ones. `summarizeOldest`
protects what retrieval *can't* regenerate: the conversational thread
itself. Full recipe: [COOKBOOK.md § RAG chat](../packages/token-budget/COOKBOOK.md#rag-chat).

## Customer support agent

```
System prompt (brand/policy)   PINNED
Current ticket context           HIGH
Last few turns                MEDIUM (sliding window)
Earlier turns                 EVICTED (ticket-scoped, not needed)
```

```ts
const budget = new TokenBudget({
  maxTokens: 2000,
  strategy: strategies.slidingWindow({ turns: 4, enforceBudget: true }),
});

budget.addMessage({ role: 'system', content: 'You are a support agent for Acme Cloud.', pinned: true });
```

Support conversations are usually scoped to one ticket — once resolved,
earlier turns rarely matter again, so a fixed recent-turn window
(`slidingWindow`) is cheaper and more predictable than summarization here.
Full recipe: [COOKBOOK.md § Customer-support bot](../packages/token-budget/COOKBOOK.md#customer-support-bot).

## Related documentation

- [`docs/strategy-guide.md`](./strategy-guide.md) — the general decision table these three specialize
- [`packages/token-budget/COOKBOOK.md`](../packages/token-budget/COOKBOOK.md) — every recipe above, runnable and tested
- [`docs/explainability.md`](./explainability.md) — confirming a real session actually behaves like the blueprint above
