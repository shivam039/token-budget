# Changelog

Engineering history of the monorepo, in the order it was built. Each
package's own README documents its current behavior; this file documents
how the project got here — useful for understanding *why* something is
shaped the way it is, not for deciding whether to install it today (see
the root [`README.md`](./README.md) for that).

## Phase 3 (in progress)

Cost & usage accounting (`costModel`, `maxCost`,
`getUsageReport()`/`exportUsageJSON()`/`exportUsageCSV()`) plus
[`token-budget-pricing`](./packages/token-budget-pricing); OpenTelemetry
instrumentation via [`token-budget-otel`](./packages/token-budget-otel);
the `semanticRelevance` strategy (hybrid semantic/recency/priority
scoring, a scoring timeout with fallback, per-instance score caching)
plus [`token-budget-embeddings`](./packages/token-budget-embeddings);
governance hooks (`redactor`, `auditLog`/`onAuditEvent`, `tags`); and
[`token-budget-devtools`](./packages/token-budget-devtools), a local Vite
app for inspecting a `serialize()` dump.
[`token-budget-py`](./packages/token-budget-py) (a Python port) is
started but explicitly partial — see its own README for exact scope.

Still to come: an ecosystem registry / scorer conformance suite, a VS
Code extension, a docs playground, and 1.0 release readiness.

## Phase 2 — ecosystem & hardening

Completed, in the order it was built:

- Anthropic and OpenAI framework adapters, plus the shared adapter
  conformance suite (`token-budget/test-utils`).
- `explain()` and the `decision` event.
- Streaming support (`beginStream`/`appendStreamChunk`/`endStream`/
  `abortStream`) plus `token-budget-vercel-ai`.
- `token-budget-tiktoken` (exact OpenAI-family tokenization).
- Recursive summarization (`maxSummaryDepth`, `onMaxDepthReached`,
  accumulating provenance, plus `budget.commit()` to make a strategized
  result stick across turns), verified with a 10,500-message soak test.
- Persistence (`serialize()`/`deserialize()`, `onPersist` with
  debouncing, `schemaVersion`).
- `token-budget-langchain` (`BaseMessage[]` conversion + a
  `TokenBudgetMemory` class).
- `token-budget-claude` (with a `calibrate()` utility) plus locale-aware
  estimation (`estimatorProfile`, real cl100k_base-measured ratios for
  `cjk`/`cyrillic`).
- Performance/scale hardening: a published benchmark suite at
  1k/10k/50k/100k messages (`test/soak/scale.soak.ts`), a multi-day-session
  memory/leak soak test (`test/soak/memory.soak.ts`), a scheduled
  (not per-commit) soak CI workflow, and a fix for an O(n²)
  `removeMessage` regression found while benchmarking (Map-backed message
  storage instead of an array — internal only, no public API change).
- Ecosystem/community docs: a tokenizer conformance suite
  (`runTokenizerConformanceSuite`, alongside the existing adapter suite,
  both dogfooded by every first-party tokenizer/adapter package's own
  tests), a four-recipe strategy cookbook with a real test per recipe,
  `CONTRIBUTING.md` (community package naming convention and review bar),
  and a compatibility matrix.

## Phase 1 — MVP

Core `TokenBudget` class, buffer management, the built-in strategies
(`dropOldest`, `slidingWindow`, `priority`, `summarizeOldest`, `chain`),
the heuristic estimator tokenizer, and the npm workspaces monorepo
structure.
