# token-budget vs. manual trimming (`messages.shift()` / `.slice()`)

**Direct answer: manual trimming is a reasonable place to start, and most
teams write it before reaching for a library — it breaks down at specific,
predictable moments, not everywhere.** This page exists because "should I
just write my own trimming logic" is the single most common question a
developer evaluating token-budget actually has — see also
[`docs/why-token-budget.md`](../why-token-budget.md) for the shorter
version and [`docs/migration/migration-from-manual-trimming.md`](../migration/migration-from-manual-trimming.md)
for the concrete before/after code.

## What manual trimming gets right

- Zero dependencies.
- Full control — you can read every line of what it does.
- Obvious to a new team member, at least until it needs a special case.

These are real advantages, not strawmen. For a prototype, a short-lived
script, or genuinely simple chat history, hand-rolled trimming can be the
right call.

## Where it breaks down, specifically

| Failure mode | What manual trimming usually does | What breaks |
| --- | --- | --- |
| System prompt eviction | Oldest-first logic treats the system prompt like any other message once it's oldest | The agent silently loses its instructions after enough turns — usually noticed only once behavior degrades, not at the moment it happens |
| Tool-call/tool-result splitting | A call and its result are separate messages in the array; nothing links them | Most provider APIs reject the resulting request outright once one half survives without the other |
| No decision trail | The array is just shorter afterward | "Why did it drop *that* message" has no answer — not hidden, genuinely not recorded anywhere |
| Token accounting | Recomputed from scratch on each check (`estimateTokens(messages)` inside the loop) | Quadratic at scale — see the [incremental-accounting benchmark](../benchmarks.md#incremental-accounting-benchmark): ~100× slower than incremental accounting at 100,000 messages |
| Importance | Position (age) is the only signal available | A still-relevant early message and a genuinely stale recent one are treated identically |

## What token-budget is, concretely

The same core loop — evict until it fits — with each of the above solved
once: `pinned` for guaranteed survival, `toolCallId` for atomic pairing,
`explain()`/the `decision` event for a recorded trail, incremental
per-message token accounting instead of a full rescan, and `priority`/
`semanticRelevance` as importance signals beyond age. See
[`docs/API.md`](../API.md) for the exact mechanism behind each.

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({ maxTokens, strategy: strategies.dropOldest() });
budget.addMessage({ role: 'system', content: systemPrompt, pinned: true });
for (const m of history) budget.addMessage({ role: m.role, content: m.content, toolCallId: m.toolCallId });
const { messages } = budget.getContextSync();
```

## FAQ

**Is manual trimming ever the right call over token-budget?** Yes — short
scripts, prototypes, or conversations that structurally can't hit the
failure modes above (no tool calls, no system prompt to protect, small
enough history that quadratic accounting never matters).

**Does token-budget claim manual trimming is always wrong?** No — see
"What manual trimming gets right" above. The claim is narrower: these
five specific failure modes are common and this project has already
fixed them once.

**What does migrating actually look like?**
[`docs/migration/migration-from-manual-trimming.md`](../migration/migration-from-manual-trimming.md)
has the full before/after.

---

Part of the broader [comparisons overview](../comparisons.md), which also
covers `gpt-tokenizer`, LangChain, and provider-native truncation.
