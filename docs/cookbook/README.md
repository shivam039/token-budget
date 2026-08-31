# Cookbook

Practical, single-problem guides. The four core "which strategy for which
app shape" recipes (customer support, coding agent, RAG chat, long-form
writing) already exist as tested, runnable code in
[`packages/token-budget/COOKBOOK.md`](../../packages/token-budget/COOKBOOK.md) — this
directory adds only the topics that aren't strategy recipes and aren't
already covered there, to avoid forking one tested source of truth into
two.

| Guide | Problem |
| --- | --- |
| [`basic-chat.md`](./basic-chat.md) | The smallest possible token-budget setup — a true 2-minute starting point. |
| [`pinned-system-prompt.md`](./pinned-system-prompt.md) | Guaranteeing a system prompt (or any instruction) survives every eviction strategy. |
| [`streaming.md`](./streaming.md) | Tracking token budget for a response that arrives incrementally, before it's a finished message. |
| [`serialization.md`](./serialization.md) | Persisting and restoring a session across process restarts. |

**Strategy-shaped recipes** (which strategy fits which agent, with a full
runnable example + test each): coding agent, customer-support bot, RAG
chat, long-form writing — see
[`packages/token-budget/COOKBOOK.md`](../../packages/token-budget/COOKBOOK.md).

**Framework integration** (OpenAI, Anthropic, Vercel AI SDK, LangChain):
each adapter package's own README is the authoritative integration guide
— see the [root README's packages table](../../README.md#packages).
Duplicating that content here would just create a second copy to keep in
sync.

**Tool-heavy agents / RAG context shape / long-running agents**: see
[`docs/architecture-patterns.md`](../architecture-patterns.md) for
priority-tier blueprints, and [`docs/strategy-guide.md`](../strategy-guide.md)
for the underlying decision table.
