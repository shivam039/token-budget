# Changelog

Engineering history of the monorepo, in the order it was built. Each
package's own README documents its current behavior; this file documents
how the project got here — useful for understanding *why* something is
shaped the way it is, not for deciding whether to install it today (see
the root [`README.md`](./README.md) for that).

## Model-aware `maxTokens`

`maxTokens` is now optional: set `model` to a name listed in the new
`MODEL_CONTEXT_WINDOWS` export instead, and its known context-window size
is used automatically (`new TokenBudget({ model: 'gpt-4o' })` →
`maxTokens` 128000). An explicit `maxTokens` always wins if set; omitting
both, or naming an unrecognized model, still throws — an unresolved
budget is never silently guessed. `model` already existed as the name
passed to `costModel.costPerToken()` for cost accounting; it now serves
both purposes from the same field. `token-budget-vercel-ai`'s
`useTokenBudget()`/`computeBudgetSnapshot()` picked up `model` too, and
its internal `effectiveBudget` calculation now reads it off the
constructed `TokenBudget` instance instead of recomputing it from
`config.maxTokens` directly (which could no longer assume that field was
set). No breaking changes — every existing explicit-`maxTokens` call
site is unaffected. Full monorepo build/typecheck/test verified clean.

## Release-hardening pass

Not a feature sprint — cleanup ahead of real user validation. Fixed a
real bug found by testing (not assuming) the documented "clean checkout"
promise: every example's `npm install && npm start` instructions failed
on a truly fresh clone, because `token-budget`'s `dist/` isn't built
until the repo-root `npm run build` runs first; corrected in all three
example READMEs and `examples/README.md`. Found and fixed a genuine
`truncateToolOutput()` correctness bug via targeted fuzzing: an
unguarded slice boundary could split a UTF-16 surrogate pair (an emoji
or other astral-plane character), leaving a malformed lone surrogate in
the output — fixed with a boundary-safe slice helper, 5 new regression
tests. Investigated removing `vitest` as an optional peer dependency of
the core package (it only serves the opt-in `test-utils` sub-export);
verified in practice that removing it breaks the conformance-suite
feature in an npm-workspaces monorepo (a deduping issue, not a
theoretical one) — kept it, documented why. Reordered the README to
match a new-developer's actual question order (problem → audience → why
not a tokenizer/DIY/LangChain → install → smallest example → realistic
coding-agent example) and moved project-strategy docs (`PRODUCT_AUDIT`,
`FIRST_USERS`, `USER_VALIDATION`, `DO_NOT_BUILD_YET`, `MCP`,
`PYTHON_ROADMAP`) into one clearly-labeled section instead of
interleaving them with usage docs. Corrected a stale benchmark version
reference. Full monorepo build/typecheck/test verified clean throughout
(378 tests, 0 failures) — see the session's own audit for the complete
before/after.

## Product positioning pass

An audit-first pass ([`docs/PRODUCT_AUDIT.md`](./docs/PRODUCT_AUDIT.md))
to turn the existing engineering work into a compelling coding-agent
context-management story, without duplicating anything already built.
Added: `examples/coding-agent-context` (a realistic, before/after
budget-overflow demo); `truncateToolOutput()` in core (0.1.3) — a small
primitive for the one gap the audit found (a single oversized tool
result too big for the whole strategy machinery to help with), plus its
own benchmark and COOKBOOK recipe; `explain()` documentation additions
(no API change — the information was already there); README/
`comparisons.md` positioning trims. Also added the process docs this
pass is chartered to keep the project honest about scope:
`docs/DO_NOT_BUILD_YET.md`, `docs/MCP.md`, `docs/PYTHON_ROADMAP.md`,
`docs/FIRST_USERS.md`, `docs/USER_VALIDATION.md`. Explicitly did NOT
build: an MCP server, a VS Code extension, a Python rewrite, or new
provider adapters — see those docs for why.

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
