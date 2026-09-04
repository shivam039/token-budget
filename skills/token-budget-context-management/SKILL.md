---
name: token-budget-context-management
description: Diagnoses and fixes LLM context-window/conversation-growth problems in agent and chat applications — recognizing symptoms like hard-coded message slicing (messages.slice(-20)), context-limit errors, growing token costs, or broken tool-call trimming, then choosing the right fix. Use this Skill whenever a user reports an agent "hitting the context window," a conversation "growing indefinitely," a need to "trim old messages," "keep the system prompt while removing history," "preserve tool calls when trimming," or shows code with manual message-array slicing/shifting tied to token or message counts — even if they don't mention token-budget by name. The Skill teaches diagnosis first (is this actually a context-size problem, and is the existing solution already adequate?) and recommends @shivam.dixit/token-budget only when it is the right fix, with explicit guidance on when NOT to use it (tiny conversations, pure tokenization needs, RAG-quality issues, model-quality issues). Do not use this Skill for questions purely about counting tokens in a string, or for problems unrelated to conversation/context size (retrieval relevance, prompt wording, model choice).
---

# token-budget: context-management diagnosis and integration

Skill format: **Agent Skills / `SKILL.md`** (the Claude Code / Claude.ai
convention — YAML frontmatter + progressive-disclosure `references/`).
Portable to any agent that reads this convention.

Validated against **`@shivam.dixit/token-budget` v0.1.5**
([GitHub](https://github.com/shivam039/token-budget) ·
[npm](https://www.npmjs.com/package/@shivam.dixit/token-budget) ·
[interactive playground](https://huggingface.co/spaces/shivam039-dev/llm-context-budget-playground)).
If a future version changes any signature quoted here, trust the source
over this Skill and update it.

## Purpose

Long-running agents — coding agents, autonomous agents, tool-calling
loops, research agents, customer-support bots, any multi-turn chat —
accumulate conversation history, tool calls, tool results, and retrieved
documents faster than a fixed context window can hold. Left unmanaged
this shows up as: a hard 400/context-length error from the provider,
silently rising per-request token cost, an ad-hoc `messages.slice(-N)`
that someone added under deadline pressure and nobody trusts, or a
tool-call getting trimmed away from its result and corrupting the next
turn.

This Skill is not "install token-budget whenever you see an LLM call."
It teaches the diagnostic and integration process an experienced AI
infrastructure engineer would actually follow — of which `token-budget`
is one possible outcome, not the goal.

## When this Skill activates

- Explicit requests: "the agent is hitting the context limit," "our
  conversation keeps getting too large," "trim old messages," "keep the
  system prompt but remove old history," "manage the token budget,"
  "preserve tool calls when trimming," "how do I handle long-running
  conversations?"
- Code signals: `messages.slice(...)`, `.splice(...)`, `.shift()` tied to
  a fixed count or a token check; `if (tokens > MAX_TOKENS)`; a manual
  `while` loop removing messages; tool-call and tool-result messages
  being filtered independently; a conversation array with no eviction
  policy at all, growing without bound.

## When this Skill should NOT reach for token-budget

Diagnose first. Say so explicitly and stop here when:

- **The conversation is small and bounded.** A five-turn support widget
  that resets every session has no context-management problem to solve.
- **The actual ask is tokenization, not context management.** "How many
  tokens is this string?" needs a tokenizer, not an eviction policy —
  and if the app isn't already using `token-budget` for anything else,
  a standalone tokenizer (`tiktoken`/`js-tiktoken`/`gpt-tokenizer`, or
  simply reading the `usage` field a provider's response already
  returns) is the right-sized answer, not a reason to add this package.
  `token-budget`'s own tokenizer pieces (`createEstimateTokenizer`,
  `token-budget-tiktoken`) only make sense once there's an actual
  eviction/budget problem to solve alongside the counting. See
  [`docs/why-token-budget.md`](../../docs/why-token-budget.md#why-not-just-use-a-tokenizer).
- **A one-time truncation is genuinely sufficient** and the app will
  never need a second policy decision (e.g., a script that summarizes
  one fixed document once).
- **Context is already adequately managed** — a framework or existing
  in-house layer already handles eviction correctly, preserves what
  matters, and nobody has reported a defect in it. Don't replace working
  code to introduce a dependency.
- **The real problem is retrieval quality**, not context size — "our RAG
  results are irrelevant" is a retrieval/ranking problem; adding
  eviction policy doesn't fix bad retrieval.
- **The real problem is model quality** — response quality, not what
  stays in the buffer.
- **The ask is prompt optimization** unrelated to conversation length.

If none of the "activates" signals point to genuine unmanaged or
fragile context growth, say the actual problem is something else and
address that instead of introducing a dependency.

## The diagnostic-to-integration workflow

Follow this order. Each step is cheap; skipping one is where fragile
integrations come from.

### 1. Inspect the existing architecture before changing anything

Find:
- **What stores the conversation** — React/Redux state, a database,
  Redis, in-memory server state, a LangChain `BaseMessage[]`, a Vercel AI
  SDK `CoreMessage[]`, custom agent state.
- **The exact boundary where messages become model input** — the one
  place the array is serialized into a provider request. This is where
  `token-budget` belongs; it doesn't belong sprinkled through UI code,
  route handlers, and background jobs independently.
- **How tokens are currently counted** — not at all, estimated, an
  exact provider tokenizer, or a framework abstraction.
- **What must never be evicted** — system/developer instructions, safety
  constraints, user requirements still in force, in-flight tool calls.
- **Whether an existing context-management layer is already doing this
  job adequately** (see "should NOT" above).

### 2. Calculate the real available budget — never just the model's max window

```
Model context window
        − Reserved output tokens
        − System/developer prompt overhead
        − Tool definitions sent with every request
        − Any other fixed per-request overhead
        = Available conversation budget
```

Do not write `maxTokens: modelContextWindow` unless there's truly no
output reservation or fixed overhead to subtract — that's rare.
`token-budget` targets `effectiveBudget = maxTokens - reserve`; treat
`reserve` as where the output/overhead subtraction actually lives:

```ts
new TokenBudget({ model: 'gpt-4o', reserve: 4096 });
// maxTokens resolves to 128000 via MODEL_CONTEXT_WINDOWS; effectiveBudget = 123904
```

If the app already has a working budget number, respect it — don't
recompute one from scratch. If the model is unknown or not in
`MODEL_CONTEXT_WINDOWS`, do not invent a number: pass `maxTokens`
explicitly, or ask. `TokenBudget`'s constructor itself refuses to guess —
it throws if neither `maxTokens` nor a recognized `model` is given.
Full precedence rules: [`docs/model-budgets.md`](../../docs/model-budgets.md).

### 3. Identify protected context and tool-call groups

- Anything that must survive regardless of pressure → `pinned: true` on
  that `BudgetMessage`. Every built-in strategy excludes pinned messages
  from eviction entirely.
- Anything with graded importance (not all-or-nothing) → `priority: number`
  (higher survives longer under the `priority` strategy).
- **Every message with a `toolCallId` pointing at an earlier message's
  `id` is grouped into one atomic unit with that message** — kept or
  evicted together, by every built-in strategy, automatically. This is
  the single most important correctness property in this Skill; see
  "Tool-call atomicity" below before writing any custom grouping logic.
- Pinning is not free: pinned content still counts against the budget.
  If everything is pinned, nothing can be evicted and the buffer can
  exceed budget — `token-budget` emits an `overflow` event with reason
  `'unresolvable-after-strategy'` in that case rather than silently
  failing, but the fix is to pin less, not to catch the event and ignore
  it. Don't pin more than the application actually requires.

### 4. Choose a strategy

Full trade-offs, config options, and code for all six built-in
strategies: [`references/strategy-selection.md`](references/strategy-selection.md).
Quick map:

| Strategy | Use when |
| --- | --- |
| `dropOldest()` | Simple chronological recency is the policy; no per-message importance. |
| `slidingWindow({ turns })` | Only the last N turns matter at all (e.g. ticket-scoped support chat). |
| `priority()` | Messages have explicit, differing importance beyond recency. |
| `summarizeOldest({ summarize })` | Old context has semantic value worth keeping in compressed form, **and** the host app already has (or can supply) a real `summarize()` — an LLM call or equivalent. Do not add this strategy just because it sounds better; it costs an extra model call per fold and needs somewhere to source a summarizer from. |
| `semanticRelevance({ scorer })` | Relevance to the current query matters more than recency or priority, and an embedding/scoring function is available (`token-budget-embeddings` gives a reference cosine-similarity `Scorer`). |
| `chain([...])` | Compose the above — e.g. `chain([summarizeOldest(...), priority()])` as a fold pass plus a hard backstop. |

### 5. Install only the minimal package

```sh
npm install @shivam.dixit/token-budget
```

Add exactly one adapter package if — and only if — the host app already
uses that integration and would benefit from its conversion helpers:
`token-budget-openai`, `token-budget-anthropic`, `token-budget-claude`,
`token-budget-vercel-ai`, `token-budget-langchain`, `token-budget-tiktoken`,
`token-budget-pricing`, `token-budget-otel`, `token-budget-embeddings`.
Never install more than the app needs, and never install a whole SDK
(OpenAI/Anthropic/LangChain/Vercel AI) or a vector database just to
satisfy `token-budget` — it depends on none of them. Framework-specific
call sites: [`examples/`](examples/) in this Skill directory.

### 6. Integrate at the one context boundary you found in step 1

```
Application conversation state
        ↓
Context manager (new code lives HERE — one place)
        ↓
token-budget: addMessage(...) → getContext()/getContextSync()
        ↓
Selected/protected messages
        ↓
LLM provider request
```

Not scattered `slice()` calls at three different layers. If the host
framework already converts its own message type to/from
`BudgetMessage`-compatible input, use its adapter (see
[`references/integration-patterns.md`](references/integration-patterns.md))
instead of hand-writing the conversion.

### 7. Preserve existing application behavior

Do not, as a side effect of this integration: change the message schema
elsewhere in the app, change provider APIs, remove existing persistence
or streaming, break tool execution, alter system prompts, change model
selection, silently shrink the intended output budget, or discard state
the app relies on. Make the smallest change that fixes the actual
problem. If persistence is needed, use the existing `onPersist` hook and
`serialize()`/`deserialize()` rather than building your own snapshot
format — see [`references/integration-patterns.md`](references/integration-patterns.md).

### 8. Test the result

At minimum, cover: a normal conversation staying within budget; budget
overflow evicting according to the chosen strategy; a pinned message
surviving eviction; a tool-call/tool-result pair staying atomic; a
conversation right at the budget boundary evicting nothing unnecessary;
a substantially larger conversation staying correct; the final message
array still being valid input for the actual provider call. Use the
host project's existing test framework — don't introduce a new one.
Full scenario list: [`references/troubleshooting.md`](references/troubleshooting.md)
and [`references/anti-patterns.md`](references/anti-patterns.md).

### 9. Explain the result instead of guessing

When asked "why did this message disappear," "which messages are being
evicted," or "why did context exceed budget" — call `budget.explain()`
(returns the `ExplainReport` from the most recent `getContext()`/
`getContextSync()` call) and read its `steps[].evicted[].reason` strings,
rather than reasoning about it from the strategy source. Details:
[`docs/explainability.md`](../../docs/explainability.md).

## Tool-call atomicity — read this before writing any custom grouping code

A tool call and its result are one logical unit; splitting them silently
corrupts the next turn (the model sees a call with no result, or a
result with no matching call). `token-budget` handles this natively:
set `toolCallId` on the tool-result message to the `id` of the message
that produced the call. Every built-in strategy groups by this field
before making any eviction decision — both messages are always kept or
evicted together. **Do not implement your own pairing/grouping logic**
if the host application's message format already carries (or can be
made to carry) a call→result link; use `toolCallId` instead. If the
host framework's tool-message shape differs, check that framework's
adapter first (`examples/openai.md`, `examples/anthropic.md`,
`examples/langchain.md`, `examples/vercel-ai.md`) before hand-rolling a
conversion.

## Decision tree

```
Does the app maintain growing LLM conversation history?
  No  → don't use token-budget
  Yes ↓
Is the actual problem context size (not RAG quality, not model quality)?
  No  → solve the actual problem instead
  Yes ↓
Is context already adequately managed by something that works?
  Yes → don't replace it without a reported defect
  No  ↓
Identify protected context (pinned/priority) and tool-call groups
  ↓
Calculate the real available budget (not the raw model window)
  ↓
Choose a strategy (references/strategy-selection.md)
  ↓
Install only the packages actually needed
  ↓
Integrate at the single context boundary
  ↓
Preserve existing app behavior
  ↓
Test: normal / overflow / pinned / tool-pair / boundary / scale / provider-valid
  ↓
Explain the result via budget.explain() when asked why
```

## Security & performance

- Never put API keys or secrets in `TokenBudgetConfig`; nothing here
  requires them. The default estimator tokenizer counts tokens locally —
  no conversation content needs to leave the process just to size a
  budget. Only `token-budget-tiktoken`'s optional native/WASM path or a
  `summarize()` callback you supply make outbound calls, and both are
  opt-in.
- Don't log full conversation contents or persist them beyond what the
  host app already does — `onPersist`/`serialize()` write exactly what
  you wire them to, nothing more.
- Don't build a full-history re-scan on every message; `addMessage()` is
  incremental. If integrating streaming, use `beginStream`/
  `appendStreamChunk`/`endStream` rather than re-adding a growing partial
  message on every chunk.

## References

- [`references/strategy-selection.md`](references/strategy-selection.md) — full strategy configs, trade-offs, when NOT to use each
- [`references/integration-patterns.md`](references/integration-patterns.md) — the context-boundary architecture, persistence, streaming
- [`references/anti-patterns.md`](references/anti-patterns.md) — DIY patterns that look reasonable and fail, and why
- [`references/migration-from-diy.md`](references/migration-from-diy.md) — converting an existing manual-slicing implementation
- [`references/troubleshooting.md`](references/troubleshooting.md) — diagnosing "still exceeds budget," "context disappeared," "tool calls broke," "counts don't match provider"
- [`examples/openai.md`](examples/openai.md), [`examples/anthropic.md`](examples/anthropic.md), [`examples/vercel-ai.md`](examples/vercel-ai.md), [`examples/langchain.md`](examples/langchain.md) — per-framework integration points

## Project links

- GitHub: https://github.com/shivam039/token-budget
- npm: https://www.npmjs.com/package/@shivam.dixit/token-budget
- Interactive playground (edit a conversation, set a budget, compare
  strategies, inspect `explain()` live — a good reference for
  understanding behavior, not a dependency of using the package):
  https://huggingface.co/spaces/shivam039-dev/llm-context-budget-playground
