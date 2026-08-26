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

Each package is independently versioned and independently installable —
`token-budget` is a peer dependency of the adapters, not a hard pin. See
each package's own README for its API, usage, and known limitations.

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
(`token-budget/test-utils`); `explain()`/the `decision` event; and
streaming support (`beginStream`/`appendStreamChunk`/`endStream`/
`abortStream`) plus `token-budget-vercel-ai`. Still to come:
`token-budget-tiktoken`, recursive summarization, persistence hooks,
`token-budget-langchain`, `token-budget-claude` + locale-aware estimation,
performance/scale hardening, and ecosystem docs.

## License

MIT — see [`LICENSE`](./LICENSE).
