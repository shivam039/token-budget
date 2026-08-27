# Product Audit

Snapshot of what exists in this repository today, as of the rename/
positioning pass this document accompanies. Written before any new code
in that pass, specifically to prevent duplicating what's already built.
Re-read this before proposing new packages, strategies, or APIs — most
of what looks missing at a glance already exists somewhere below.

## 1. What currently exists

**Core (`packages/token-budget`, published as `@shivam.dixit/token-budget`,
zero required runtime dependencies):**

- `TokenBudget` class: `addMessage`/`removeMessage`/`editMessage`,
  `getContext()`/`getContextSync()`, `commit()`, `stats()`, `explain()`,
  event emitter (`warning`, `overflow`, `evicted`, `strategy-error`,
  `decision`, `costWarning`, `usageSnapshot`).
- Six strategies: `dropOldest`, `slidingWindow`, `priority`,
  `summarizeOldest` (with recursive re-summarization via
  `maxSummaryDepth`), `semanticRelevance` (pluggable `Scorer`), and
  `chain([...])` to compose them.
- **Atomic tool-call/tool-result pairing** (`toolCallId`) — every
  built-in strategy groups a call and its result into one unit via
  `internal/units.ts`; both survive or both go, never split.
- **Pinned messages** — never evicted or summarized by any built-in
  strategy.
- **`explain()`** — structured `ExplainReport` (steps, each with
  `tokensBefore`/`tokensAfter`, per-message eviction reasons, synthesized
  summaries) plus a mirrored `decision` event.
- **Incremental token accounting** — O(1) amortized bookkeeping per
  `addMessage`, not a recount from scratch (~100× faster than naive
  recount at 100k messages, per `docs/benchmarks.md`).
- Streaming API (`startStream`/`appendStream`/`endStream`/`abortStream`)
  with running token estimates.
- Persistence hooks (`serialize()`/`deserialize()`, `onPersist` with
  debounce) — no bundled storage backend, by design.
- Cost accounting (`costModel`, `maxCost`/`maxCostPolicy`,
  `getUsageReport()`/`exportUsageJSON()`/`exportUsageCSV()`).
- Governance hooks (`redactor`, `auditLog`/`onAuditEvent`, `tags`).
- `test-utils` sub-export: an adapter conformance suite other packages
  run against.
- Locale-aware heuristic estimator (`estimatorProfile`: latin/cjk/
  cyrillic/auto-detect) alongside pluggable real `Tokenizer`s.

**Published adapter/tokenizer packages** (all peer-depend on core, no
provider SDK bundled — structural typing, see `COMPATIBILITY.md`):

| Package | Status |
| --- | --- |
| `token-budget-openai` | Published, tested, conformance-suite passing |
| `token-budget-anthropic` | Published, tested |
| `token-budget-vercel-ai` | Published, tested, includes an optional React hook |
| `token-budget-langchain` | Published, tested, includes `TokenBudgetMemory` |
| `token-budget-tiktoken` | Published — exact OpenAI-family tokenizer, pure-JS default + opt-in native/WASM path |
| `token-budget-claude` | Published — best-effort approximation + `calibrate()` |
| `token-budget-pricing` | Published — static per-model pricing table |
| `token-budget-otel` | Published — OpenTelemetry spans + counters |
| `token-budget-embeddings` | Published — reference cosine-similarity `Scorer` |
| `token-budget-devtools` | Not published (intentionally) — local Vite app for inspecting `serialize()` dumps |
| `token-budget-py` | Not published (PyPI) — see §4, Python roadmap |

All 10 publishable packages currently ship under the `@shivam.dixit/`
npm scope (0.1.2, live and installable). An unscoped-name rename was
attempted and reverted — see git history (PR #6 + its revert) — blocked
by an npm new-account restriction on first unscoped publishes, not by
anything in this repo. Parked, not abandoned.

**Docs:** `README.md` (root), per-package READMEs, `COOKBOOK.md` (4
recipes: customer-support bot, coding agent, RAG chat, long-form writing),
`docs/benchmarks.md`, `docs/comparisons.md`, `COMPATIBILITY.md`,
`CONTRIBUTING.md`, `CHANGELOG.md`.

**Examples:** `examples/openai-long-conversation` (300-turn conversation
→ OpenAI wire format), `examples/coding-agent` (small, 6-message,
120-token-budget demo of tool-call atomicity + `priority` + `explain()`).

**Benchmarks (`bench/*.mjs`, reproducible via `npm run bench`):**
context-management (stress test + realistic bounded-window scenario vs.
naive DIY and LangChain `trimMessages`), incremental accounting, raw
tokenizer throughput (`token-budget-tiktoken` vs. `gpt-tokenizer` vs.
`llm-token-counter`) — with an explicit, published honest result where
`token-budget-tiktoken` loses on raw speed.

**CI:** `ci.yml` (build/typecheck/test on Node 18/20/22), `publish.yml`
(npm Trusted Publishing/OIDC, provenance), `soak.yml`.

**Test coverage:** 26 test files / ~197 tests in core alone; all 9
tested adapter/tokenizer packages green (roughly 360 tests total across
the monorepo as of this audit). Full suite passes on Node 18/20/22.

## 2. What is production-ready

- Core `TokenBudget` API and all six strategies — mature, tested,
  documented, benchmarked, and already carrying real version history
  (Phase 1 → Phase 3 per `CHANGELOG.md`).
- Tool-call/tool-result atomicity — this is the single most
  differentiated, hardest-to-hand-roll piece, and it's solid.
- `explain()` / audit trail — structurally complete (see §3 below for the
  one real gap).
- Package hygiene: zero required runtime deps in core, correct ESM/CJS
  dual exports (`main`/`module`/`types`/`exports` map), `sideEffects:
  false`, `files` allowlist excludes source/tests, adapters correctly use
  `peerDependencies` (not hard deps) for both core and any host SDK.
  Verified via `npm run build && npm run typecheck && npm run test`
  clean on Node 22 as part of this audit.
- CI publishing pipeline (OIDC Trusted Publishing) — proven working
  end-to-end for the scoped packages.

## 3. What is partially implemented

- **`explain()` reports what was evicted/synthesized, not explicitly
  what was *preserved*.** The information is derivable (surviving
  messages = `ctx.messages`, minus synthetic ones), but there's no
  single field a developer can print to answer "why did *this* message
  survive." Documented as a recipe rather than a schema change — see the
  new coding-agent example.
- **No content-level (sub-message) truncation.** Every strategy operates
  on whole messages/units — a 50,000-token tool result is kept or
  evicted as a unit, never shrunk to "first/last N tokens of this one
  result." This is a real, coding-agent-relevant gap (huge terminal
  output, file dumps). See `docs/PRODUCT_AUDIT.md` §5 and the Phase 3
  decision in this pass's changes.
- **Python port** — real but intentionally partial (see its own README):
  no tool-call atomicity, no recursive summarization, no events/
  streaming/persistence/cost/governance, no exact tokenizer, not
  published to PyPI. Documented in `docs/PYTHON_ROADMAP.md`.
- **Unscoped npm names** — code-ready (git history has the full rename),
  blocked on an external npm account restriction, parked.

## 4. What is missing

- A **realistic-scale, realistic-shape** coding-agent example. The
  existing `examples/coding-agent` is a good minimal proof of atomicity
  but uses 6 messages and a 120-token toy budget — it doesn't show a
  before/after budget-exceeded scenario with the actual shapes a coding
  agent accumulates (file reads, terminal output, test failures, old vs.
  recent turns). This is the highest-priority gap per the product
  thesis and is addressed in this pass (`examples/coding-agent-context/`).
- A documented, explicit answer to "why not a memory system" and "why
  not an agent framework" in the comparisons doc — the existing doc
  covers DIY, a tokenizer, LangChain, and provider-native truncation,
  but doesn't name the "memory system" and "agent framework" categories
  explicitly, even though the distinction is implicit throughout.
- A documented first-users acquisition plan — there is currently no
  `docs/FIRST_USERS.md` or equivalent; outreach has been ad hoc.
- No stated MCP position — nothing wrong with that (it shouldn't be
  built yet), but there's no doc explaining the eventual shape or why
  it's deferred, so the question keeps needing to be re-litigated.
- No explicit "do not build" list — scope creep risk without one.

## 5. What should NOT be built (right now)

- An MCP server. token-budget is a context-management library, not a
  tool host; wrapping it as an MCP server doesn't match how it's meant
  to be used (as middleware inside an agent's own message loop). See
  `docs/MCP.md`.
- A VS Code extension — no evidence of demand, and it doesn't advance
  the coding-agent-library use case (that's IDE tooling, not context
  management).
- A full Python rewrite to parity — P1, not P0. Acquiring real users of
  the JS package matters more right now than doubling the surface area
  to maintain. See `docs/PYTHON_ROADMAP.md`.
- More provider adapters (Gemini, Mistral, Cohere, etc.) without
  evidence someone actually needs one — the existing 4 (OpenAI,
  Anthropic, Vercel AI SDK, LangChain) already cover the large majority
  of real usage, and `COMPATIBILITY.md`'s structural-typing approach
  means a developer can often use the raw `TokenBudget` API against an
  unsupported provider without a dedicated adapter at all.
- A generic tool-output framework (truncation strategies, streaming
  summarizer pipelines, etc.) — see §4's tool-output gap; the fix should
  be the smallest possible primitive that composes with existing
  strategies, not a parallel system.
- Vector database integration, a hosted/SaaS dashboard, a "memory
  platform" — all out of scope; token-budget manages what stays in a
  budget, it does not store/retrieve long-term memory. See
  `docs/DO_NOT_BUILD_YET.md` for the full list and rationale.

## 6. What should be built next (this pass)

In priority order, matching the product thesis (coding agents as the
beachhead):

1. `examples/coding-agent-context/` — the realistic before/after demo
   (§4's highest-priority gap).
2. A minimal, composable tool-output-size primitive, if the coding-agent
   example surfaces a real need for one that existing strategies can't
   already cover (evaluate before building — see Phase 3 notes in the
   final report).
3. Small `explain()` documentation/recipe additions (a "preserved"
   helper snippet, not a schema change) — bundled with the new example.
4. A coding-agent-shaped benchmark workload, only if it produces a
   genuinely different signal from the existing realistic
   bounded-window benchmark (evaluate before building).
5. Minimal README/comparisons.md positioning edits — the existing copy
   is already strong; this is a trim, not a rewrite.
6. The six process docs this pass is chartered to produce:
   `FIRST_USERS.md`, `MCP.md`, `PYTHON_ROADMAP.md`,
   `DO_NOT_BUILD_YET.md`, `USER_VALIDATION.md`, and this audit.

Everything else in the original 14-phase task list (VS Code extension,
MCP server, full Python parity, more adapters) stays explicitly
deferred until real user evidence says otherwise.
