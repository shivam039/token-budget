# token-budget vs. LangChain

**Direct answer: not a replacement for LangChain — a narrower,
composable piece you can use with or without it.** If you're already
all-in on LangChain.js, `trim_messages` and `SummarizationMiddleware`
cover basic trimming and summarization, and for many apps that's
genuinely enough. `token-budget` is worth adding when you need the same
eviction/summarization logic to work identically outside LangChain too,
a *chain* of strategies with a hard budget guarantee, or an explainable
decision trail — not because LangChain's trimming is bad at what it's
built for.

## Scope difference

| | LangChain.js `trim_messages` / `SummarizationMiddleware` | `token-budget` |
| --- | --- | --- |
| **Scope** | Part of a full agent-orchestration framework | A standalone context-management library |
| **Framework lock-in** | Tied to LangChain's message types and pipeline | Works identically against LangChain, Vercel AI SDK, or a raw provider client |
| **Strategy composition** | Trim, or summarize — one mechanism per call | `chain([...])` composes strategies (e.g. summarize-oldest, then drop-oldest as a hard backstop) |
| **Explainability** | A trimmed/summarized array | `explain()` — a structured trace of what was evicted/summarized and why |
| **Tool-call safety** | — | Atomic tool-call/tool-result pairing built into every strategy |

## The benchmark: what was actually tested

**Workload:** a 50,000-message history, built once and queried at four
everyday window sizes (1,000–10,000 tokens) — the shape most real chat
apps run, not a worst-case stress test. All systems under test are given
the same simple length-based token counter, so the comparison measures
buffer/eviction machinery, not tokenizer speed.

| Window (tokens) | `token-budget` (query only) | LangChain `trimMessages` |
| --- | --- | --- |
| 1,000 | 73.9 ms | 28,012 ms |
| 2,000 | 67.5 ms | 24,393 ms |
| 5,000 | 61.1 ms | 22,231 ms |
| 10,000 | 76.6 ms | 21,883 ms |

**What this shows:** `trimMessages`' cost here doesn't shrink with a
smaller window — it's driven by the 50,000-message history, not the
~35–357 messages actually retained at each window size. `token-budget`'s
row times only the query (`setMaxTokens()` + `getContextSync()`)
against an already-built history, since real usage builds the history
once and re-queries it as the effective window changes per turn.

We read this as `trim_messages` not being built for repeated,
large-scale eviction against a big history — which is exactly the
scenario `token-budget` targets — not as "LangChain is bad at
trimming." Full methodology, hardware, versions, and the separate
worst-case stress test:
[`docs/benchmarks.md#context-management-benchmark`](../benchmarks.md#context-management-benchmark).

## Use them together

`token-budget-langchain` converts `BaseMessage[]` to/from
`token-budget`'s message model and provides a `TokenBudgetMemory` class
implementing LangChain's `BaseMemory` contract — you can keep your
LangChain pipeline and swap only the trimming/summarization step:

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { toLangChainMessages, fromLangChainMessages } from '@shivam.dixit/token-budget-langchain';

const budget = new TokenBudget({ maxTokens: 128000, strategy: strategies.summarizeOldest({ summarize }) });
budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });

const ctx = await budget.getContext();
const messages = toLangChainMessages(ctx); // pass straight to a LangChain model/chain
```

## FAQ

**Is token-budget an alternative to LangChain?** No — see
[`docs/FAQ.md#is-token-budget-an-alternative-to-langchain`](../FAQ.md#is-token-budget-an-alternative-to-langchain).

**Does token-budget work with LangChain?** Yes —
[`token-budget-langchain`](../../packages/token-budget-langchain).

**Is token-budget "100x faster" than LangChain?** No claim like that is
made anywhere in this project — see the exact tested workload and
numbers above, and the full methodology/caveats in
[`docs/benchmarks.md`](../benchmarks.md).

---

Part of the broader [comparisons overview](../comparisons.md), which
also covers DIY trimming, `gpt-tokenizer`, and provider-native
truncation.
