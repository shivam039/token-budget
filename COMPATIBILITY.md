# Compatibility matrix

`token-budget`'s framework/SDK adapter packages use **structural typing**
against each provider's public shape rather than depending on the real SDK
package — an adapter accepts anything that looks like the right shape
(same fields, same methods), so it works whether your app uses the actual
SDK, a hand-rolled `fetch` client, or a mock in tests. This also means an
adapter has no version of its own SDK to "pin": the table below tracks what
each adapter is actually *tested* against today, so a future breaking
change upstream has a documented baseline to diff against.

| Package | Core peer range | Target | Tested against | Runtime dependency? |
| --- | --- | --- | --- | --- |
| [`token-budget-anthropic`](./packages/token-budget-anthropic) | `^0.1.0 || ^0.2.0` | Anthropic Messages API wire format | Messages API JSON shape (structural — no SDK) | None |
| [`token-budget-openai`](./packages/token-budget-openai) | `^0.1.0 || ^0.2.0` | OpenAI Chat Completions API wire format | Chat Completions JSON shape (structural — no SDK) | None |
| [`token-budget-vercel-ai`](./packages/token-budget-vercel-ai) | `^0.1.0 || ^0.2.0` | Vercel AI SDK `CoreMessage[]` + `streamText()` | `ai` SDK message/stream shape (structural — no SDK dep); optional React hook tested against `react@^18.3.0` | None (peer: `react >=18`, optional) |
| [`token-budget-langchain`](./packages/token-budget-langchain) | `^0.1.0 || ^0.2.0` | LangChain.js `BaseMessage[]` + `BaseMemory` | `@langchain/core@^0.3.0` message/memory shape (structural — no SDK dep) | None |
| [`token-budget-tiktoken`](./packages/token-budget-tiktoken) | `^0.1.0 || ^0.2.0` | OpenAI-family exact tokenization | `js-tiktoken@^1.0.20` (pure JS, always available); optional native path against `tiktoken@^1.0.20` (Node-only, opt-in) | `js-tiktoken`; optional peer `tiktoken` |
| [`token-budget-claude`](./packages/token-budget-claude) | `^0.1.0 || ^0.2.0` | Claude token-count approximation | Built on `token-budget-tiktoken`'s `cl100k_base`; no empirical Claude-count validation baked in — see the package's own README and `calibrate()` | `token-budget-tiktoken` |
| [`token-budget-pricing`](./packages/token-budget-pricing) | `^0.1.0 || ^0.2.0` | `CostModel` pricing table | A point-in-time OpenAI/Anthropic/Google pricing snapshot — see the package's own README; use `overrides` for current rates | None |
| [`token-budget-otel`](./packages/token-budget-otel) | `^0.1.0 || ^0.2.0` | OpenTelemetry instrumentation | `@opentelemetry/api@^1.9.0` (structural — no SDK/exporter dependency) | None (peer: `@opentelemetry/api >=1.0.0`) |
| [`token-budget-embeddings`](./packages/token-budget-embeddings) | `^0.1.0 || ^0.2.0` | `Scorer` for `semanticRelevance` | Bring-your-own embedding function (structural — no embeddings SDK dependency) | None |

Every adapter declares `token-budget` as a **peer** dependency. Current
adapter releases support core `^0.1.0 || ^0.2.0`; the peer range is a
semver contract, not a pinned exact version. Satellite releases remain
independent, and each changed adapter release republishes its compatibility
metadata.

The current release set was built and type-checked in the monorepo against
core `0.2.0`; the adapter conformance suites exercise each package's mapping
behavior. Provider SDK entries above describe the structural shapes covered
by those tests, not a promise that every upstream SDK minor release was
installed in the test matrix.

## Versioning policy

The core package and satellite packages have independent version tracks.
A satellite version changes when that package's own published behavior or
metadata changes; a core release does not imply a version bump or republish
for every satellite. Adapter peer ranges communicate which core versions
each adapter supports. Check this matrix and each package manifest before
combining versions; do not infer compatibility from matching version
numbers.

## What "structural typing" means here in practice

None of the framework/SDK adapters import `@anthropic-ai/sdk`, `openai`,
`ai`, or `@langchain/core` as a real dependency. Each adapter instead
declares a local TypeScript interface matching the subset of that SDK's
public shape it actually touches (e.g. `{ role, content }` for a chat
message, or `_getType()` for a LangChain `BaseMessage`). A real SDK object
satisfies that interface automatically — TypeScript's structural typing
doesn't require a declared relationship — so:

- You never need to install the real SDK just to use the adapter.
- If you do have the real SDK installed, its actual message/response
  objects pass through the adapter with no manual mapping.
- If the upstream SDK's shape changes in a way that breaks structural
  compatibility, the adapter's own conformance suite (see
  [`packages/token-budget/src/test-utils.ts`](./packages/token-budget/src/test-utils.ts),
  `runAdapterConformanceSuite`) is what catches it — see
  [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how that suite is used and
  extended.

## Node.js / TypeScript

All packages target Node.js `>=18` and are published as dual ESM/CJS
builds with TypeScript type declarations. `packages/token-budget` itself
has **zero required runtime dependencies**.

## Python

[`packages/token-budget-py`](./packages/token-budget-py) is a separate,
explicitly work-in-progress Python port — not npm-published, not part of
this matrix or the workspaces build, and not at feature parity with the
JS package. Targets Python `>=3.8`; see its own README for exactly what's
implemented today.
