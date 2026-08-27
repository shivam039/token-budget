# token-budget

Model-agnostic token accounting and eviction strategies for multi-turn LLM
conversations. `token-budget` tracks how many tokens a growing message
buffer consumes and applies a configurable eviction/compression strategy
as it approaches a token budget, so your application never silently
overflows a model's context window.

- **Zero required runtime dependencies.**
- Works in Node.js ≥ 18, browsers, and edge runtimes (no Node built-ins).
- Fully typed, TypeScript-first.
- Pluggable tokenizers and eviction strategies — bring your own, or compose
  the built-ins.
- Not an LLM client: it never calls a model API itself, except optionally
  through a summarizer callback you supply.

## Install

```sh
npm install @shivam.dixit/token-budget
```

## Quickstart

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 8000,
  reserve: 1000,
  strategy: strategies.dropOldest(),
});

budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
budget.addMessage({ role: 'user', content: 'Hello!' });

const { messages, tokensUsed, tokensRemaining } = await budget.getContext();
```

`messages` is ready to send to your model's chat-completion API as-is.

## Core concepts

- **Effective budget** = `maxTokens - reserve`. Every strategy trims the
  buffer to fit inside this number, not `maxTokens` itself.
- **Pinned messages** (`pinned: true`) — typically your system prompt —
  are never evicted or summarized by any built-in strategy.
- **Priority** (`priority: number`, higher = more important) is used by
  the `priority` strategy to decide eviction order among non-pinned
  messages. Defaults to `0`.
- **Tool-call/tool-result atomicity** — set `toolCallId` on a tool-result
  message to the `id` of the message that produced the call it answers.
  Every built-in strategy treats the pair as one atomic unit: both survive
  or both are evicted/summarized together, so you never end up with a
  dangling tool result (which breaks most provider APIs).
- **Raw vs. strategized** — `getMessages()` returns the full, unfiltered
  buffer in insertion order; `getContext()`/`getContextSync()` return what
  a strategy decided to actually send.

## `TokenBudget`

```ts
new TokenBudget({
  maxTokens: 8000,        // required: total context window size
  reserve: 1000,          // optional, default 0: tokens reserved for output
  tokenizer: 'estimate',  // optional: 'estimate' (default) or a Tokenizer instance
  charsPerToken: 4,       // optional: tunes the 'estimate' tokenizer
  warningThreshold: 0.8,  // optional, default 0.8: fraction of budget that fires 'warning'
  strategy: strategies.dropOldest(), // optional, default dropOldest()
  messageOverhead: (m) => 4,         // optional: per-message fixed overhead
  contentCounters: { image: () => 85 }, // optional: per content-block-type token counters
});
```

Construction throws a descriptive error if `reserve >= maxTokens`, or if
`warningThreshold` is outside `[0, 1]`.

### Methods

| Method | Description |
| --- | --- |
| `addMessage(input)` | Appends a message, incrementally updates totals, returns the stored `BudgetMessage` (with generated `id`/`timestamp`/`tokens`). Throws if a caller-supplied `id` collides with an existing message — remove or edit it first. |
| `removeMessage(id)` | Removes a message by id, returns `false` if not found. |
| `editMessage(id, patch)` | Edits a message by id and recomputes totals; throws if not found. |
| `clear()` | Empties the buffer. |
| `commit(messages)` | Replaces the raw buffer with `messages` (typically a `getContext()`/`getContextSync()` result's `.messages`), recomputing totals — makes an eviction/summarization "stick" across turns, since `getContext()` itself never mutates the buffer. |
| `serialize(options?)` | Plain, JSON-serializable snapshot of messages + JSON-safe config. `{ includeOpenStreams? }`, default excluded. |
| `TokenBudget.deserialize(state, overrides?)` (static) | Reconstructs a fully-functional instance from a `serialize()` snapshot; `overrides` re-supplies non-serializable config (tokenizer, strategy, ...) and can override anything else too. |
| `getMessages()` | Raw, unfiltered buffer, in insertion order. |
| `getContext()` | `Promise<ContextResult>` — applies the configured strategy (works for async strategies like `summarizeOldest`). |
| `getContextSync()` | Sync `ContextResult`; throws if the configured strategy isn't guaranteed synchronous. |
| `estimateBeforeAdd(input)` | Token cost of a would-be message, without mutating state — handy for a "disable send" UI check. |
| `stats()` | `{ tokensUsed, tokensRemaining, maxTokens, reserve, messageCount, pinnedCount }`, synchronously, at any time. |
| `setMaxTokens(n)` / `setReserve(n)` | Reconfigure the budget at runtime without losing buffer state (e.g. the model/context size changed mid-session). |
| `on(event, handler)` / `off(event, handler)` | Subscribe/unsubscribe to events. `on` returns an unsubscribe function. |

```ts
const budget = new TokenBudget({ maxTokens: 4000 });

budget.addMessage({ role: 'user', content: 'Hi there' });
budget.editMessage(budget.getMessages()[0]!.id, { content: 'Hi there!' });
budget.removeMessage('some-id');

const cost = budget.estimateBeforeAdd({ role: 'user', content: 'a long draft…' });
if (cost > budget.stats().tokensRemaining) disableSendButton();

const ctx = await budget.getContext();     // async, strategy-agnostic
const sync = budget.getContextSync();      // sync, throws for async strategies

budget.setMaxTokens(8000); // e.g. the user switched to a bigger-context model
```

### `getContext()` / `getContextSync()` result

```ts
interface ContextResult {
  messages: BudgetMessage[]; // strategy-applied, ready to send
  tokensUsed: number;
  tokensRemaining: number;
  evicted: BudgetMessage[];  // original messages dropped/summarized away
  strategyApplied: string;
}
```

### Events

`TokenBudget` implements a minimal built-in emitter (no Node `events`
dependency, so it works identically in the browser):

| Event | Fires when | Payload |
| --- | --- | --- |
| `warning` | Usage crosses `warningThreshold` of the effective budget. | `Stats & { threshold }` |
| `overflow` | A single message exceeds the whole effective budget by itself, or the buffer is still over budget after the strategy ran (e.g. pinned content alone doesn't fit). | `{ reason, message?, tokensUsed, effectiveBudget }` |
| `evicted` | A strategy dropped and/or summarized messages. | `{ strategyApplied, messages, replacedBy }` |
| `strategy-error` | The configured strategy throws (e.g. a `summarize` callback that exhausts its retries with `onError: 'throw'`). | `{ strategyName, error, recovered }` |
| `decision` | Every time a strategy runs — mirrors `explain()`'s output. | `ExplainReport` |

```ts
budget.on('warning', (stats) => console.warn('Approaching budget', stats));
budget.on('evicted', (info) => console.log('Evicted', info.messages.length, 'messages via', info.strategyApplied));
budget.on('overflow', (info) => console.error('Cannot fit context:', info.reason));
budget.on('strategy-error', (info) => console.error(`Strategy "${info.strategyName}" failed`, info.error));
budget.on('decision', (report) => telemetry.record(report)); // your own sink — no built-in telemetry

budget.listenerCount('warning'); // 1 — useful for leak-checking in long-running processes
```

### `explain()` — debugging strategy decisions

`explain()` returns a structured, JSON-serializable trace of the most
recent `getContext()`/`getContextSync()` call: which strategy (or chain of
strategies, in order) ran, tokens before/after each step, and a
human-readable reason for every message that was evicted or folded into a
summary.

```ts
const ctx = budget.getContextSync();
const report = budget.explain();
// {
//   steps: [
//     { strategyName: 'sliding-window', tokensBefore: 512, tokensAfter: 300, messagesConsidered: 40,
//       evicted: [{ id: 'msg_12', reason: 'outside the last 20 turns (position 3 of 40)' }], synthesized: [] },
//     { strategyName: 'drop-oldest', tokensBefore: 300, tokensAfter: 180, messagesConsidered: 22,
//       evicted: [{ id: 'msg_15', reason: 'oldest non-pinned message (position 0 of 22)' }], synthesized: [] },
//   ],
//   tokensBefore: 512, tokensAfter: 180, tokensRemaining: 20,
//   strategyApplied: 'chain(sliding-window -> drop-oldest)', timestamp: 1730000000000,
// }
```

`explain()` returns `undefined` until `getContext()`/`getContextSync()` has
run at least once. Pass `devMode: true` to the constructor to
`console.debug`-log every report automatically (default `false` — never
logs unless explicitly opted in). Building the trace costs roughly what
the `evicted` event already costs (proportional to what was actually
evicted, not to buffer size) — negligible if you never call `explain()` or
listen to `decision`, and free of any built-in telemetry either way.

Writing a custom strategy? Call the optional `ctx.trace?.(step)` sink with
the same shape to participate in `explain()` — see [Write your own
strategy](#write-your-own-strategy).

## Streaming

For a message being streamed in token by token, track it incrementally
instead of waiting for the full response:

```ts
budget.beginStream('msg_1', 'assistant');       // throws if 'msg_1' is already open
for await (const chunk of textStream) {
  budget.appendStreamChunk('msg_1', chunk);      // O(chunk length), never O(total so far)
  console.log(budget.stats().tokensUsed);        // includes the running, approximate estimate
}
const message = budget.endStream('msg_1');       // exact recount; folds into the buffer as a normal message
```

- `stats().streaming` lists each open stream's id and running `estimatedTokens`,
  and `stats().tokensUsed` already includes them — so `warning` can fire
  mid-stream, before the response finishes.
- The running estimate is the sum of each chunk's own token count — fast
  (O(chunk length) per call) but only additive-approximate for tokenizers
  whose token boundaries can span a chunk seam. `endStream()` always
  reconciles to an exact count over the full accumulated content.
- `budget.abortStream(id, 'discard' | 'keep-partial')` handles a client/network
  abort mid-stream — `'discard'` (default) drops the partial message,
  `'keep-partial'` finalizes what arrived so far.
- An open stream is never visible to strategies — it isn't part of the
  buffer until `endStream`/`abortStream` runs, so it can never be evicted
  or summarized out from under you. `getContext()`/`getContextSync()`
  proceed normally with a stream open (`onStrategyDuringStream: 'skip'`,
  the default); set `onStrategyDuringStream: 'error'` if you'd rather they
  throw than build a context that doesn't reflect in-flight content.
- Multiple concurrent streams are supported — state is keyed per `id`.

See [`token-budget-vercel-ai`](../token-budget-vercel-ai) for a
`streamText()` integration (`streamTextIntoBudget`), and the raw-SSE
pattern is the same loop shown above with your own chunk-parsing in place
of `textStream`.

## Persistence

No storage backend is bundled or required — `token-budget` stays
storage-agnostic. `serialize()`/`deserialize()` give you a plain,
JSON-serializable snapshot to put wherever you like:

```ts
const state = budget.serialize(); // sync, JSON.stringify-able
await redis.set(`session:${id}`, JSON.stringify(state));

// ...later, in a new process:
const state = JSON.parse(await redis.get(`session:${id}`));
const budget = TokenBudget.deserialize(state, {
  tokenizer: myTokenizer, // re-supply anything that couldn't be serialized —
  strategy: myStrategy,   // the tokenizer instance, strategy, messageOverhead, contentCounters
});
```

`serialize()` captures messages (including synthetic summaries with full
metadata) and the JSON-safe half of the config (`maxTokens`, `reserve`,
`warningThreshold`, `charsPerToken`, ...); the tokenizer instance,
strategy, and `messageOverhead`/`contentCounters` functions can't
serialize generically, so `deserialize()`'s `overrides` is where you
re-supply them — and can override any other config too (e.g. restoring a
session under a bigger `maxTokens` for a new model). `deserialize()`
reconstructs a fully-functional, behaviorally-identical instance: same
next eviction decisions, same token counts.

Open streams are excluded by default — resuming a network stream
mid-flight is out of scope. Pass `serialize({ includeOpenStreams: true })`
to include their accumulated partial content instead, each marked
`wasInterrupted: true`; `deserialize()` restores them as still-open, and
resuming or finalizing them (`endStream`/`abortStream`) is up to you.

Snapshots carry a `schemaVersion`; `deserialize()` throws on a version
newer than the installed package supports, and warns (not throws) on an
older one — today that's a no-op beyond the warning, since v1 is the only
version that has ever existed. A future breaking change to this shape
will add a migration step and a changelog entry.

### Auto-persisting without calling `serialize()` everywhere

```ts
const budget = new TokenBudget({
  maxTokens: 128000,
  onPersist: (state) => redis.set(`session:${id}`, JSON.stringify(state)),
  persistDebounceMs: 500, // coalesce a burst of addMessage() calls into one write
});
```

`onPersist` fires after every buffer mutation (`addMessage`, `removeMessage`,
`editMessage`, `commit`, `clear`, and the streaming methods), debounced by
`persistDebounceMs` (default `0` — call it synchronously every time).
Debouncing is trailing-edge and never drops a call: rapid mutations
coalesce into one `onPersist` carrying the *latest* state once the window
elapses, they don't cancel it.

### Storage recipes

- **Redis**: `redis.set(key, JSON.stringify(state))` / `JSON.parse(await redis.get(key))` — as above. Consider a TTL matching your session lifetime.
- **SQLite**: store `JSON.stringify(state)` in a `TEXT`/`JSON` column keyed by session id; `deserialize(JSON.parse(row.state))` on read.
- **Browser `IndexedDB`**: structured-clone-safe as-is (`state` is plain objects/arrays/strings/numbers) — `store.put(state, sessionId)` directly, no `JSON.stringify` needed.

These are patterns, not bundled adapters — a `token-budget-persistence-*`
package family may follow if community demand justifies it (see
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) for the community package
naming convention).

## Cost & usage accounting (Phase 3)

Pass a `costModel` and `model` to track cost alongside tokens:

```ts
import { createCostModel } from '@shivam.dixit/token-budget-pricing'; // or bring your own CostModel

const budget = new TokenBudget({
  maxTokens: 128000,
  model: 'gpt-4o',
  costModel: createCostModel(), // { costPerToken(role, model, direction) => number }
  costWarningThreshold: 5.0, // fires 'costWarning' once cumulative cost crosses $5
  maxCost: 10.0,
  maxCostPolicy: 'block-new-messages', // or a callback: (info) => void
});

budget.addMessage({ role: 'user', content: 'Hello!' });
budget.stats().cost; // { inputCost, outputCost, totalCost, currency: 'USD' } — current buffer
budget.getUsageReport(); // cumulative, lifetime — see below
```

`stats().cost` and `getUsageReport()` answer different questions:
`stats()` reflects the *current* buffer (so cost drops if you
`removeMessage()` something), while `getUsageReport()` is a **lifetime
ledger** — `totalMessagesProcessed`/`totalTokensConsumed`/cost only ever
grow, the same way `totalMessagesProcessed` counts every message ever
added, including ones later evicted. Export it with
`exportUsageJSON()`/`exportUsageCSV()`.

`maxCostPolicy: 'block-new-messages'` throws from `addMessage()` **before**
any state changes — a rejected message leaves the buffer and usage/cost
accounting exactly as they were; it was never actually added. The message
that pushes cost *to* the ceiling is always recorded; only later ones are
blocked.

`onUsageSnapshot`/`usageSnapshotIntervalMs` fire a `usageSnapshot` event
(throttled by the interval; default: every `getContext()`/
`getContextSync()` call) — `onUsageSnapshot` in the config is just sugar
for subscribing at construction time; instrumentation wrapping an
already-constructed budget should use `budget.on('usageSnapshot', ...)`
directly (see `token-budget-otel`).

## Governance & multi-tenancy (Phase 3)

```ts
const budget = new TokenBudget({
  maxTokens: 8000,
  redactor: (message) => ({ ...message, content: stripPII(message.content) }), // runs before tokens are counted
  auditLog: true,
  onAuditEvent: (event) => auditSink.write(event), // { timestamp, strategyApplied, evictedIds, synthesizedIds, tags, ... }
  tags: { tenantId: 'acme-corp' }, // carried on UsageReport and every AuditEvent
});
```

`redactor` runs once per `addMessage()` call, before token counting and
storage — so redacted content is what gets buffered, counted, and
persisted, not the original. `onAuditEvent` fires after every
`getContext()`/`getContextSync()` call when `auditLog` is true; events are
plain, unsigned data — no built-in tamper-evidence/hashing — hash or sign
them yourself in the hook if your compliance requirements need that.

**Isolation**: separate `TokenBudget` instances never share buffer or
usage state (there's no module-level/static mutable state in this
package). The one thing to watch is a *shared strategy instance* with its
own internal cache — see `semanticRelevance()`'s note above — construct
one per budget rather than reusing a single instance across tenants.

## Strategies

All strategies implement:

```ts
interface Strategy {
  name: string;
  sync: boolean; // true only if apply() is guaranteed to never return a Promise
  apply(messages: BudgetMessage[], ctx: StrategyContext): Promise<BudgetMessage[]> | BudgetMessage[];
}
```

### `strategies.dropOldest()`

Removes the oldest non-pinned messages (tool-call/result pairs kept
together) until the buffer is back under budget.

```ts
new TokenBudget({ maxTokens: 4000, strategy: strategies.dropOldest() });
```

### `strategies.slidingWindow({ turns, enforceBudget? })`

Keeps only the last `turns` non-pinned atomic units, plus all pinned
messages, regardless of token count. A "turn" is one atomic unit — a
single message, or a tool-call kept together with its tool-result. Pass
`enforceBudget: true` to additionally trim that window down to the token
budget, oldest-first, if it's still too large.

```ts
strategies.slidingWindow({ turns: 20 });
strategies.slidingWindow({ turns: 20, enforceBudget: true });
```

### `strategies.priority()`

Evicts the lowest-`priority` non-pinned messages first; ties are broken by
age (oldest first).

```ts
new TokenBudget({ maxTokens: 4000, strategy: strategies.priority() });
budget.addMessage({ role: 'user', content: 'small talk', priority: 1 });
budget.addMessage({ role: 'user', content: "the user's actual question", priority: 10 });
```

### `strategies.summarizeOldest({ summarize, preThreshold?, blockSize?, onError?, retries?, maxSummaryDepth?, onMaxDepthReached? })`

When over budget (or over `preThreshold` × effective budget), takes the
oldest eligible block of non-pinned atomic units, passes them to your
`summarize` callback, and replaces them with a single synthetic
`{ role: 'system', content: summary, metadata: { synthetic: true, sourceIds, summaryDepth } }`
message.

```ts
strategies.summarizeOldest({
  summarize: async (messages) => callMyLLM(messages),
  onError: 'fallback-drop-oldest', // or 'throw' (default), with `retries` attempts first
  retries: 2,
});
```

`summarize-oldest` is hook-based only — bring your own summarization call.
Because it's heuristic (it doesn't know the new summary's own token cost
until `summarize` returns), it does **not** give the same hard "never
exceeds budget" guarantee as the other three built-ins. Chain it after
`slidingWindow`/`dropOldest` (see below) if you need a hard backstop.

#### Recursive summarization

A synthetic summary that's still the oldest eligible content when the
buffer overflows *again* gets folded into a new summary itself —
`sourceIds` accumulates across every pass (so a final summary always
traces back to every original message it represents, never just the
immediately-prior one), and `metadata.summaryDepth` increments each time.
Once a summary reaches `maxSummaryDepth` (default `3`), it's never
re-summarized further — `onMaxDepthReached` (default `'keep-forever'`)
governs what happens to it if it's still the oldest thing in an
over-budget buffer: leave it in place (`'keep-forever'`), evict it like
`drop-oldest` would (`'evict'`), or decide per-message with a callback
`(message) => 'evict' | 'keep-forever'`.

Two things to know before relying on this across turns:

- **`getContext()`/`getContextSync()` never mutate the buffer** — every
  call re-derives from the full raw history (`getMessages()` always
  returns everything, by design). For a summary to actually *stick* and
  be eligible for re-summarization later, commit each round's result back
  in before the next turn: `budget.commit(ctx.messages)`.
- **Give it headroom.** Because the new synthetic's cost isn't known
  until after `summarize()` returns, set `preThreshold` a bit below `1`
  (e.g. `0.7`–`0.85`) when chaining with a hard backstop like
  `dropOldest()` — otherwise the backstop can immediately evict a summary
  in the very round it was created, before it ever gets a chance to
  survive to a later round:

```ts
strategies.chain([
  strategies.summarizeOldest({
    summarize: callMyLLM,
    preThreshold: 0.8, // headroom for the synthetic's own token cost
    maxSummaryDepth: 3,
    onMaxDepthReached: 'keep-forever', // dropOldest is the "if absolutely necessary" backstop
  }),
  strategies.dropOldest(),
]);

// each turn:
const ctx = await budget.getContext();
budget.commit(ctx.messages); // make this round's compaction stick
```

### `strategies.chain([...strategies])`

Composes strategies into a pipeline — e.g. "sliding window, then summarize
on overflow, with drop-oldest as a hard backstop":

```ts
strategies.chain([
  strategies.slidingWindow({ turns: 20 }),
  strategies.summarizeOldest({ summarize: callMyLLM, onError: 'fallback-drop-oldest' }),
]);
```

A chain is `sync: true` only if every member strategy is; `getContextSync`
throws otherwise.

### `strategies.semanticRelevance({ scorer, weights?, mustRetain?, scoringTimeoutMs?, fallback?, auxiliaryContext? })` (Phase 3)

Scores every non-pinned message with your `scorer` — the most recent
`user` message is treated as the query — and retains the highest-scoring
atomic units until the budget is full, instead of purely age-based
eviction:

```ts
import { createEmbeddingsScorer } from '@shivam.dixit/token-budget-embeddings'; // or bring your own Scorer

strategies.semanticRelevance({
  scorer: createEmbeddingsScorer({ embed: myEmbeddingFn }),
  weights: { semantic: 0.8, recency: 0.2 }, // blend in recency; default is pure semantic
  mustRetain: (msg) => msg.metadata?.pinned_by_user === true,
  scoringTimeoutMs: 2000, // default
  fallback: strategies.dropOldest(), // used if scorer throws or times out
});
```

A `Scorer` is just `{ score(message, context): Promise<number> | number }`
— see `token-budget-embeddings` for a reference cosine-similarity
implementation, or write your own against any relevance signal.

**Construct one `semanticRelevance()` instance per `TokenBudget`.** Its
score cache is per-strategy-instance state, keyed by message id and
cleared when the query changes — sharing one instance across multiple
budgets can cross-contaminate cached scores if their messages happen to
share an id. The `scorer` itself is fine to share/reuse; only the
strategy object's own cache is instance-scoped.

## Tokenizers

By default, `TokenBudget` uses a zero-dependency heuristic estimator
(`chars / charsPerToken`, default `charsPerToken: 4`). Tune it directly for
token-dense text:

```ts
new TokenBudget({ maxTokens: 4000, charsPerToken: 2.5 }); // e.g. CJK-heavy content
```

### Locale-aware estimation

Instead of a manual ratio, pick a script profile — `estimatorProfile`
(default `'latin'`, ratio `4` — Phase 1's exact original behavior,
unchanged unless you opt in):

```ts
new TokenBudget({ maxTokens: 4000, estimatorProfile: 'cjk' });       // ratio 1
new TokenBudget({ maxTokens: 4000, estimatorProfile: 'cyrillic' });  // ratio 2
new TokenBudget({ maxTokens: 4000, estimatorProfile: 'auto-detect' }); // picks a ratio per message
```

`'auto-detect'` performs lightweight, zero-dependency Unicode-range
script detection on a prefix of each message (no language-detection
package — hand-rolled code-point range checks, staying inside the core
zero-dependency constraint). Mixed-script text gets a single best-effort
classification by majority, not a true per-character blend — for
precision on mixed content, use a real tokenizer adapter instead
(`token-budget-tiktoken`, `token-budget-claude`). `charsPerToken` always
takes precedence over `estimatorProfile` when both are set.

The three fixed ratios (`latin: 4`, `cjk: 1`, `cyrillic: 2`) were
calibrated against a small representative corpus, measured with OpenAI's
`cl100k_base` tokenizer (chosen as a real, widely-used, offline-computable
baseline — not a claim about any specific model's exact tokenizer, since
none of these scripts has one that's both public and free to run
offline):

| Sample | chars/token (cl100k_base) | Rounded profile ratio |
| --- | --- | --- |
| English prose | 4.23 | `latin`: 4 |
| Japanese (mixed Kanji/Hiragana) | 1.15 | `cjk`: 1 |
| Chinese | 0.94 | `cjk`: 1 |
| Russian | 1.98 | `cyrillic`: 2 |

Each sample was ~300–900 characters of representative prose, repeated for
a stable measurement; reproduce with `createTiktokenTokenizer({ encoding:
'cl100k_base' }).count(text)` from `token-budget-tiktoken`. These ratios
are deliberately conservative (rounded toward *more* estimated tokens per
character) — underestimating token cost risks silent context overflow,
which is worse than a bit of wasted budget headroom from overestimating.
For exact counts in any language, use a real tokenizer adapter.

Or supply an exact tokenizer via the `Tokenizer` interface:

```ts
interface Tokenizer {
  count(text: string): number;
  encode?(text: string): number[];
}

new TokenBudget({ maxTokens: 4000, tokenizer: myTokenizer });
```

[`token-budget-tiktoken`](../token-budget-tiktoken) implements this for
OpenAI's tokenizer (pure-JS by default, with an opt-in native/WASM path):

```ts
import { createTiktokenTokenizer } from '@shivam.dixit/token-budget-tiktoken';

const tokenizer = await createTiktokenTokenizer({ model: 'gpt-4o' }); // async: loads the encoding once
new TokenBudget({ maxTokens: 128000, tokenizer }); // count()/encode() are sync from here on
```

`messageOverhead` and `contentCounters` let you account for provider-
specific framing tokens and non-text content blocks (tool calls, tool
results, images):

```ts
new TokenBudget({
  maxTokens: 4000,
  messageOverhead: (m) => (m.role === 'system' ? 3 : 4),
  contentCounters: {
    image: (block) => estimateImageTokens(block),
  },
});
```

## Tokenizer adapters

- [`token-budget-tiktoken`](../token-budget-tiktoken) — exact OpenAI-family
  tokenizer, pure-JS (`js-tiktoken`) by default with an opt-in Node-only
  native/WASM path.
- [`token-budget-claude`](../token-budget-claude) — best-effort Claude
  approximation (Anthropic has never published a real tokenizer) with a
  `calibrate()` utility to tune it against your own real usage data. Read
  its README's accuracy disclaimer before relying on it for anything
  precision-sensitive.

Writing your own tokenizer package? Reuse the shared conformance suite
this package exports, the same way the two above do in their own test
suites:

```ts
import { runTokenizerConformanceSuite } from '@shivam.dixit/token-budget/test-utils';

runTokenizerConformanceSuite('my-tokenizer', await createMyTokenizer());
```

It verifies non-negative integer counts, determinism, rough monotonicity
with text length, `encode()`/`count()` self-consistency (when `encode` is
provided), and drop-in compatibility as a `TokenBudget` `tokenizer` option.
See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) at the repo root for the
full checklist and the community package naming convention.

## Framework adapters

Thin, independently-versioned packages that convert `token-budget`'s
message model to/from a specific provider's wire format, in both
directions:

- [`token-budget-anthropic`](../token-budget-anthropic) — Anthropic
  Messages API (`toAnthropicMessages`, `fromAnthropicResponse`).
- [`token-budget-openai`](../token-budget-openai) — OpenAI Chat
  Completions API (`toOpenAIMessages`, `fromOpenAIResponse`).
- [`token-budget-vercel-ai`](../token-budget-vercel-ai) — Vercel AI SDK
  `CoreMessage[]` conversion, `streamText()` integration, and an optional
  `/react` `useTokenBudget()` hook.
- [`token-budget-langchain`](../token-budget-langchain) — LangChain.js
  `BaseMessage[]` conversion and a `TokenBudgetMemory` class implementing
  the `BaseMemory` contract.

All four treat `token-budget` as a peer dependency and are each under 150
lines of actual conversion logic (`token-budget-langchain`'s
`TokenBudgetMemory` adds a bit more surface for its own contract). If
you're writing your own adapter (for another provider, or a community
package), reuse the shared conformance suite this package exports:

```ts
import { runAdapterConformanceSuite } from '@shivam.dixit/token-budget/test-utils';

runAdapterConformanceSuite({
  name: 'my-adapter',
  toExternal: (messages) => /* ... */,
  fromExternal: (external) => /* ... */,
  buildFixtureMessages: () => /* a pinned system message, a tool-call/tool-result pair, etc. */,
});
```

It verifies round-trip fidelity, tool-call/tool-result atomicity,
pinned-message handling, and post-conversion token accounting — call it
inside your own `*.test.ts` file (requires `vitest`, an optional peer
dependency of this export). See [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
at the repo root for the full checklist and the community package naming
convention, and [`COMPATIBILITY.md`](../../COMPATIBILITY.md) for how
adapters document what they're tested against without pinning the real
SDK as a dependency.

## Cost, observability & tooling (Phase 3)

- [`token-budget-pricing`](../token-budget-pricing) — static per-model
  pricing table / `CostModel` for the `costModel` config option.
- [`token-budget-otel`](../token-budget-otel) — OpenTelemetry
  instrumentation: spans per strategy decision, counters for tokens/cost/
  evictions.
- [`token-budget-embeddings`](../token-budget-embeddings) — reference
  cosine-similarity `Scorer` for `semanticRelevance`.
- [`token-budget-devtools`](../token-budget-devtools) — local Vite app for
  visually inspecting a `serialize()` dump. Not published to npm.
- [`token-budget-py`](../token-budget-py) — a Python port. **Work in
  progress**, not at feature parity — see its own README for exact scope.

## Cookbook

Four common application shapes — a customer-support bot, a coding agent, a
RAG chat app, and a long-form writing assistant — each with a runnable,
tested configuration recipe: see [`COOKBOOK.md`](./COOKBOOK.md).

## Write your own strategy

A strategy is just an object matching the `Strategy` interface. `apply`
receives the current message array and a `StrategyContext`:

```ts
interface StrategyContext {
  effectiveBudget: number;
  tokensUsed: number;
  countTokens: (messages: BudgetMessage[]) => number;
  countMessage: (message: BudgetMessage) => number;
  makeSynthetic: (content: string, sourceIds: string[]) => BudgetMessage;
  trace?: (step: StrategyStepTrace) => void; // optional: report to explain()/'decision'
}
```

If your strategy evicts anything, use the exported `groupIntoUnits` /
`filterByUnits` helpers so tool-call/tool-result pairs stay atomic and
insertion order is preserved exactly — the same helpers the built-ins use:

```ts
import type { Strategy } from '@shivam.dixit/token-budget';
import { groupIntoUnits, filterByUnits } from '@shivam.dixit/token-budget';

// Keeps only the single most recent non-pinned turn once over budget.
export function keepLatestOnly(): Strategy {
  return {
    name: 'keep-latest-only',
    sync: true,
    apply(messages, ctx) {
      if (ctx.countTokens(messages) <= ctx.effectiveBudget) return messages;

      const units = groupIntoUnits(messages);
      const pinned = units.filter((u) => u.pinned);
      const nonPinned = units.filter((u) => !u.pinned);
      const latest = nonPinned.at(-1);

      const survivors = latest ? [...pinned, latest] : pinned;
      return filterByUnits(messages, survivors);
    },
  };
}
```

See [`examples/customStrategy.ts`](./examples/customStrategy.ts) for the
full, tested version (exercised in
[`test/custom-strategy.test.ts`](./test/custom-strategy.test.ts)).

To participate in `explain()`/the `decision` event, call `ctx.trace?.(...)`
once per `apply()` with a `StrategyStepTrace` — see the built-in strategies'
source for the exact shape each uses (e.g. `src/strategies/priority.ts`).
It's optional and purely additive: omit it and your strategy still works,
it just won't show up in explain reports.

## Scale guidance

`addMessage` is O(1) amortized (incremental token accounting, no full
re-scan); `getContext()`/`getContextSync()` applying `dropOldest`,
`slidingWindow`, or `priority` is a single O(n) pass over the buffer. This
is verified, not just claimed: `test/soak/scale.soak.ts`
(`npm run test:soak`) benchmarks all three at 1k/10k/50k/100k messages
(best-of-3 trials each, to filter out GC/scheduling noise) on every run
and fails if per-message cost stops looking flat as the buffer grows.

Reference measurements (Node v22.22.2, 4 vCPU Intel Xeon @ 2.80GHz, Linux
x86_64 — `node --expose-gc` for accurate heap deltas; run
`npm run test:soak` yourself to measure on your own hardware):

| Messages | Strategy | `addMessage` (total) | `getContext` | Heap delta |
| --- | --- | --- | --- | --- |
| 1,000 | drop-oldest | 1.2ms | 1.6ms | 1.4MB |
| 10,000 | drop-oldest | 15.8ms | 23.1ms | 16.2MB |
| 50,000 | drop-oldest | 109.6ms | 80.5ms | 56.0MB |
| 100,000 | drop-oldest | 325.6ms | 203.8ms | 116.2MB |
| 1,000 | sliding-window | 2.2ms | 3.6ms | 1.6MB |
| 10,000 | sliding-window | 21.2ms | 30.0ms | 15.8MB |
| 50,000 | sliding-window | 109.1ms | 94.5ms | 56.6MB |
| 100,000 | sliding-window | 347.0ms | 233.9ms | 117.7MB |
| 1,000 | priority | 1.0ms | 1.1ms | 1.2MB |
| 10,000 | priority | 12.4ms | 50.3ms | 12.3MB |
| 50,000 | priority | 119.2ms | 198.2ms | 68.6MB |
| 100,000 | priority | 336.5ms | 452.0ms | 136.0MB |

(`summarize-oldest` isn't in this table — its cost is dominated by your
`summarize` callback, typically a network call, not by `token-budget`'s
own bookkeeping.)

**Practical guidance:**
- Tested up to 100,000 messages / ~1MB of buffer content — comfortably
  fits in memory and stays fast at this scale on typical hardware.
- Beyond that, or for very long-running processes, prefer periodic
  compaction over letting the raw buffer grow unbounded: call
  `budget.commit(ctx.messages)` each turn (see
  [Persistence](#persistence) and summarize-oldest's [recursive
  passes](#recursive-summarization)) so the buffer reflects only what
  survived eviction/summarization, not the full unbounded history.
  `getMessages()` returning the *full* history is a deliberate feature for
  buffers you keep bounded this way — for a session you intend to run
  forever, periodically `serialize()` and reset with a fresh, smaller
  buffer rather than relying on `getMessages()` to stay small on its own.
- A long-running-process memory/leak check (event listener accumulation,
  stream state cleanup across thousands of add/evict/stream cycles) lives
  in `test/soak/memory.soak.ts`, part of the same `test:soak` script. Soak
  tests run in CI on a schedule (weekly), not on every commit — see
  [`.github/workflows/soak.yml`](../../.github/workflows/soak.yml) at the
  repo root.

## Non-goals

`token-budget` is not a memory/RAG system (no vector search, no long-term
storage) and not an LLM client — it never sends requests to a model API
itself, except optionally through the `summarize` callback you supply to
`summarizeOldest`.

## Versioning

Semantic versioning is strictly enforced. Changes to the `Strategy`
interface, or to any built-in strategy's eviction semantics, are breaking
changes requiring a major version bump.

## License

MIT
