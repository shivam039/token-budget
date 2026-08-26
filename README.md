# token-budget monorepo

Model-agnostic token accounting and eviction strategies for multi-turn LLM
conversations, plus thin framework adapters that connect it to real
provider SDKs.

## Packages

| Package | Description |
| --- | --- |
| [`packages/token-budget`](./packages/token-budget) | Core: budget config, message buffer, strategies, streaming, explain(), events. Zero required runtime dependencies. |
| [`packages/token-budget-anthropic`](./packages/token-budget-anthropic) | Anthropic Messages API adapter. |
| [`packages/token-budget-openai`](./packages/token-budget-openai) | OpenAI Chat Completions API adapter. |
| [`packages/token-budget-vercel-ai`](./packages/token-budget-vercel-ai) | Vercel AI SDK adapter, streaming integration, optional React hook. |
| [`packages/token-budget-tiktoken`](./packages/token-budget-tiktoken) | Exact OpenAI-family tokenizer (pure-JS by default, opt-in native/WASM path). |
| [`packages/token-budget-langchain`](./packages/token-budget-langchain) | LangChain.js adapter: `BaseMessage[]` conversion and a `TokenBudgetMemory` class. |
| [`packages/token-budget-claude`](./packages/token-budget-claude) | Best-effort Claude tokenizer approximation, with a `calibrate()` utility. |

Each package is independently versioned and independently installable —
`token-budget` is a peer dependency of the adapters, not a hard pin. See
each package's own README for its API, usage, and known limitations.

## Docs

- [`packages/token-budget/COOKBOOK.md`](./packages/token-budget/COOKBOOK.md) — four tested configuration recipes (customer-support bot, coding agent, RAG chat, long-form writing assistant).
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to add a community tokenizer, strategy, or framework adapter; the `token-budget-{tokenizer,strategy,adapter}-*` naming convention; and the review bar.
- [`COMPATIBILITY.md`](./COMPATIBILITY.md) — what each adapter/tokenizer package is tested against, and why they use structural typing instead of a real SDK dependency.

## Development

This is an npm workspaces monorepo — one `npm install` at the root wires
every package together (adapters resolve `token-budget` from
`packages/token-budget` via a workspace symlink).

```sh
npm install
npm run build       # builds every package (core first, so adapters can resolve it)
npm run typecheck   # tsc --noEmit in every package
npm run test         # vitest run in every package
npm run test:coverage
```

Each package also has its own scripts (`npm run test --workspace=token-budget-anthropic`).

## Roadmap

Done so far, in the project's own suggested sprint order: the Anthropic
and OpenAI framework adapters plus the shared adapter conformance suite
(`token-budget/test-utils`); `explain()`/the `decision` event; streaming
support (`beginStream`/`appendStreamChunk`/`endStream`/`abortStream`) plus
`token-budget-vercel-ai`; `token-budget-tiktoken`; recursive summarization
(`maxSummaryDepth`, `onMaxDepthReached`, accumulating provenance, plus
`budget.commit()` to make a strategized result stick across turns) with a
10,500-message soak test; persistence (`serialize()`/`deserialize()`,
`onPersist` with debouncing, `schemaVersion`); `token-budget-langchain`
(`BaseMessage[]` conversion + a `TokenBudgetMemory` class); and
`token-budget-claude` (with a `calibrate()` utility) + locale-aware
estimation (`estimatorProfile`, real cl100k_base-measured ratios for
`cjk`/`cyrillic`); and performance/scale hardening — a published
benchmark suite at 1k/10k/50k/100k messages
(`test/soak/scale.soak.ts`), a multi-day-session memory/leak soak test
(`test/soak/memory.soak.ts`), a scheduled (not per-commit) soak CI
workflow, and a fix for an O(n²) `removeMessage` regression found while
benchmarking (Map-backed message storage instead of an array — internal
only, no public API change); and ecosystem/community docs — a tokenizer
conformance suite (`runTokenizerConformanceSuite`, alongside the existing
adapter suite, both now dogfooded by every first-party tokenizer/adapter
package's own tests), a four-recipe strategy cookbook with a real test per
recipe, `CONTRIBUTING.md` (community package naming convention and review
bar), and a compatibility matrix. All eleven sprints from the Phase 2 spec
are complete.

## License

MIT — see [`LICENSE`](./LICENSE).
