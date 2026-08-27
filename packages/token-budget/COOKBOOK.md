# Strategy cookbook

Four common LLM-application shapes and the `token-budget` configuration
that fits each. Every recipe below is a real, runnable example under
[`examples/`](./examples), each covered by a test under [`test/`](./test)
that asserts the specific behavior described here — so these recipes stay
true as the library evolves instead of rotting into stale prose.

| Recipe | Strategy | Why |
| --- | --- | --- |
| [Customer-support bot](#customer-support-bot) | `slidingWindow` | Only the last few turns matter for the current ticket. |
| [Coding agent](#coding-agent) | `priority` | Stale tool output should go before still-relevant context, not just old context. |
| [RAG chat](#rag-chat) | `summarizeOldest` | Retrieved docs are re-injected each turn, but conversational continuity should survive. |
| [Long-form writing assistant](#long-form-writing-assistant) | `summarizeOldest` + `maxSummaryDepth` | A long session needs many rounds of re-summarization, not just one. |

## Customer-support bot

Support conversations are short-lived, and resolving the current ticket
only needs the last few turns — not the full history. `slidingWindow` caps
the buffer to a fixed number of recent turns, which is cheaper and more
predictable than summarization for this shape of chat.

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 2000,
  strategy: strategies.slidingWindow({ turns: 4, enforceBudget: true }),
});

budget.addMessage({ role: 'system', content: 'You are a customer support agent for Acme Cloud.', pinned: true });
budget.addMessage({ role: 'user', content: 'Still seeing the login error.' });
budget.addMessage({ role: 'assistant', content: 'Have you tried clearing cookies?' });
// ... more turns as the conversation continues ...

const { messages } = budget.getContextSync();
// messages: the pinned system prompt + only the last 4 turns
```

Full example: [`examples/cookbook-customer-support.ts`](./examples/cookbook-customer-support.ts).
Test: [`test/cookbook-customer-support.test.ts`](./test/cookbook-customer-support.test.ts).

## Coding agent

Tool outputs (file reads, grep results) pile up fast and go stale the
moment the agent moves to a different file, while the system prompt and
the *currently open* file stay relevant all session. `priority` evicts
stale, low-priority tool output first — ahead of anything still marked
important — instead of purely age-based eviction, which would drop
still-relevant content just as readily as stale content.

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 70,
  strategy: strategies.priority(),
});

budget.addMessage({ role: 'system', content: 'You are a coding agent with file read/grep tools.', pinned: true });
budget.addMessage({ role: 'assistant', content: 'Reading src/old-module.ts...', priority: 1 }); // stale once the agent moves on
budget.addMessage({ role: 'tool', content: '...' /* old file contents */, priority: 1 });
budget.addMessage({ role: 'user', content: 'Now fix the validation bug in src/current-file.ts.', priority: 5 });
budget.addMessage({ role: 'assistant', content: 'Reading src/current-file.ts...', priority: 5 }); // the file being edited now
budget.addMessage({ role: 'tool', content: '...' /* current file contents */, priority: 5 });

const { messages, evicted } = budget.getContextSync();
// evicted: the priority-1 (stale) messages; messages: pinned prompt + priority-5 (current) content
```

Full example: [`examples/cookbook-coding-agent.ts`](./examples/cookbook-coding-agent.ts).
Test: [`test/cookbook-coding-agent.test.ts`](./test/cookbook-coding-agent.test.ts).

### One tool result too big for the whole budget

`priority`/`dropOldest`/etc. evict whole messages — the right tool for
"too many tool results," but not for "one tool result (a file dump, a
verbose build log) that alone is bigger than the entire budget." For
that, shrink the text **before** it becomes a message, with
`truncateToolOutput`:

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

This has nothing to do with eviction or `toolCallId` pairing — it's a
content-prep step, so it composes with whichever strategy you're already
using rather than replacing any part of it. Use `keep: 'start'` for a
log whose relevant part is up front, or `keep: 'both'` (e.g. a file
read, where the imports *and* the tail both matter) to keep a head and a
tail with the middle cut.

## RAG chat

Retrieved document chunks are pinned for the current turn (the app
re-injects fresh chunks each time, so old ones can be dropped outright),
but the conversational back-and-forth itself should stay legible as the
session grows. `summarizeOldest` folds old turns into a running summary
instead of silently dropping them, so the model still has a thread to
follow even after many turns.

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 150,
  strategy: strategies.summarizeOldest({
    summarize: async (messages) => callYourOwnSummarizerHere(messages),
  }),
});

budget.addMessage({ role: 'system', content: 'You are a support assistant answering from the retrieved docs below.', pinned: true });
budget.addMessage({ role: 'user', content: 'How do I configure step 1 of account setup?' });
budget.addMessage({ role: 'assistant', content: '...' /* answer, grounded in retrieved docs */ });
// ... more turns ...

const { messages } = await budget.getContext();
// messages: the pinned prompt + a synthetic summary of old turns + recent turns in full
```

Full example: [`examples/cookbook-rag-chat.ts`](./examples/cookbook-rag-chat.ts).
Test: [`test/cookbook-rag-chat.test.ts`](./test/cookbook-rag-chat.test.ts).

## Long-form writing assistant

A single drafting session can run for hours across many rounds of "draft,
critique, revise." Dropping early drafts loses the throughline of the
piece, so `summarizeOldest` with a higher `maxSummaryDepth` lets old
summaries fold into progressively higher-level ones across rounds, instead
of only ever summarizing once. `budget.commit()` after each round is what
makes each round's strategized result the new starting point for the
next — `getContext()` itself never mutates the buffer (see the main
README's "Recursive summarization" section for why).

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 150,
  strategy: strategies.summarizeOldest({
    summarize: async (messages) => callYourOwnSummarizerHere(messages),
    preThreshold: 0.7, // leave headroom so a fresh summary doesn't immediately overflow again
    maxSummaryDepth: 5, // allow up to 5 rounds of re-summarization before a summary is kept forever
  }),
});

budget.addMessage({ role: 'system', content: 'You are a long-form writing assistant helping draft a novella.', pinned: true });

for (let round = 0; round < manyRounds; round++) {
  budget.addMessage({ role: 'user', content: 'Here is my revised paragraph, please critique it.' });
  budget.addMessage({ role: 'assistant', content: '...' /* critique */ });
  const result = await budget.getContext();
  budget.commit(result.messages); // makes this round's summary "stick" as the new baseline
}
```

Full example: [`examples/cookbook-long-form-writing.ts`](./examples/cookbook-long-form-writing.ts).
Test: [`test/cookbook-long-form-writing.test.ts`](./test/cookbook-long-form-writing.test.ts).
