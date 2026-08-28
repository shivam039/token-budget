# token-budget vs. gpt-tokenizer

**Direct answer: they're not competitors — `gpt-tokenizer` is a
tokenizer, `token-budget` is context-management infrastructure, and
`gpt-tokenizer` is honestly faster at the one job it does.** This page
exists because "token-budget vs gpt-tokenizer" is a real search a
developer evaluating either would type — the answer is that you likely
want both, not one instead of the other.

## Different jobs

| | `gpt-tokenizer` | `token-budget` |
| --- | --- | --- |
| **Answers** | "How many tokens is this text?" | "Given a growing buffer and a token budget, what should stay, in what order, and why?" |
| **Category** | Tokenizer | Context-management infrastructure |
| **Output** | A number (or an array of token ids) | A managed message list, an eviction/summarization trace, and events |
| **Knows about** | Text | A whole conversation: pinned messages, tool-call/tool-result pairs, priorities, strategies |

A tokenizer counting fast doesn't tell an application what to evict once
it's over budget, how to keep a tool-call paired with its result, or how
to explain a trimming decision afterward. Those are the actual problems
`token-budget` solves — counting tokens is a small, necessary piece of
that, not the whole job.

## token-budget does not claim to be a faster tokenizer

This project ships its own tokenizer package,
[`token-budget-tiktoken`](../../packages/token-budget-tiktoken) (a
`js-tiktoken`-backed OpenAI-family tokenizer) — and it is **honestly
slower** than `gpt-tokenizer` at raw counting. Published without spin,
same text and same encoding family (`o200k_base`, `gpt-tokenizer`'s own
default) for both:

**Bulk-encode one large corpus (~88,000 tokens, warm):**

| Tokenizer | Median | Throughput |
| --- | --- | --- |
| `gpt-tokenizer` | 15.4 ms | 5.7M tok/sec |
| `token-budget-tiktoken` | 168.8 ms | 521k tok/sec |

**Many short messages, one call each (n=2,000):**

| Tokenizer | Median (total) | Per call |
| --- | --- | --- |
| `gpt-tokenizer` | 6.5 ms | 3.3 µs |
| `token-budget-tiktoken` | 71.7 ms | 35.8 µs |

`gpt-tokenizer` is a genuinely faster pure-JS tokenizer than
`js-tiktoken` (what `token-budget-tiktoken` wraps). By design,
`token-budget-tiktoken` prioritizes portability and compatibility with
the wider `js-tiktoken` ecosystem, not raw throughput. Full methodology,
hardware, and versions:
[`docs/benchmarks.md#raw-tokenizer-benchmark`](../benchmarks.md#raw-tokenizer-benchmark).

## Use them together

`gpt-tokenizer` works as `token-budget`'s `tokenizer` option directly —
anything with a `count(text): number` method does:

```ts
import { TokenBudget } from '@shivam.dixit/token-budget';
import { encode } from 'gpt-tokenizer';

const budget = new TokenBudget({
  maxTokens: 128000,
  tokenizer: { count: (text) => encode(text).length },
});
```

If raw counting speed is your actual bottleneck, use `gpt-tokenizer` for
counting and let `token-budget` handle eviction, prioritization,
tool-call safety, and explainability on top of it — they're
complementary, not competing.

## FAQ

**Is token-budget a tokenizer?** No — see
[`docs/FAQ.md#is-token-budget-a-tokenizer`](../FAQ.md#is-token-budget-a-tokenizer).

**Is token-budget faster than gpt-tokenizer?** No, and this project
doesn't claim otherwise — see the numbers above.

**Can I use gpt-tokenizer with token-budget?** Yes, directly, as shown
above.

**When should I use gpt-tokenizer instead of token-budget?** When
counting is the only requirement — no eviction, prioritization, or
tool-call-safety concern. See
[`docs/FAQ.md#when-should-i-use-a-tokenizer-instead-of-token-budget`](../FAQ.md#when-should-i-use-a-tokenizer-instead-of-token-budget).

---

Part of the broader [comparisons overview](../comparisons.md), which
also covers DIY trimming, LangChain, and provider-native truncation.
