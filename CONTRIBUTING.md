# Contributing

This is an npm workspaces monorepo. `packages/token-budget` is the core
package (zero required runtime dependencies); everything else is a thin
adapter or tokenizer package that depends on it as a peer.

```sh
npm install
npm run build       # builds every package (core first, so adapters can resolve it)
npm run typecheck   # tsc --noEmit in every package
npm run test         # vitest run in every package
npm run test:coverage
```

## Adding a community package

Three kinds of community packages plug into `token-budget`: **tokenizers**,
**strategies**, and **framework adapters**. Each has a contract to satisfy
and a conformance suite to pass before it's considered done.

### Naming convention

- `token-budget-tokenizer-*` — a `Tokenizer` implementation for a model
  family not already covered (e.g. `token-budget-tokenizer-mistral`).
- `token-budget-strategy-*` — a reusable `Strategy` implementation beyond
  the built-ins (e.g. `token-budget-strategy-semantic-dedup`).
- `token-budget-adapter-*` — conversion helpers for a framework/SDK's
  message format (e.g. `token-budget-adapter-llamaindex`).

First-party packages published before this convention was written —
`token-budget-anthropic`, `token-budget-openai`, `token-budget-vercel-ai`,
`token-budget-tiktoken`, `token-budget-langchain`, `token-budget-claude`,
`token-budget-pricing`, `token-budget-otel`, `token-budget-embeddings` —
predate it and keep their existing names rather than being renamed; the
convention applies going forward, to new *community-extension-shaped*
packages. `token-budget-mcp` doesn't fit any of the three buckets above
— it's a testing/tooling surface (an MCP server), not a tokenizer,
strategy, or message-format adapter — so it keeps a plain descriptive
name rather than being forced into one.

### Tokenizers

Implement the `Tokenizer` interface from `token-budget`:

```ts
interface Tokenizer {
  count(text: string): number;
  encode?(text: string): number[]; // optional — omit if you can't produce real token ids
}
```

Then run the shared conformance suite against your resolved tokenizer
instance, inside your package's own test file:

```ts
import { runTokenizerConformanceSuite } from '@shivam.dixit/token-budget/test-utils';
import { createYourTokenizer } from '../src/index.js';

runTokenizerConformanceSuite('your-tokenizer-name', await createYourTokenizer());
```

This checks: non-negative integer counts, determinism, rough monotonicity
with text length, `encode()`/`count()` self-consistency (when `encode` is
provided), and drop-in compatibility as a `TokenBudget` `tokenizer` option.
See `packages/token-budget-tiktoken/test/tokenizer.test.ts` and
`packages/token-budget-claude/test/tokenizer.test.ts` for real examples —
including one that omits `encode()` entirely.

If your tokenizer only *approximates* a model's real token count (rather
than using that model's real vocabulary), say so explicitly in your
README and point at the provider's real counting API as ground truth —
see `packages/token-budget-claude/README.md` for the pattern. Don't state
an accuracy number you haven't actually measured against real API output.

### Strategies

Implement the `Strategy` interface from `token-budget` — see
`packages/token-budget/src/strategies/*.ts` for reference implementations,
and the internal `groupIntoUnits`/`filterByUnits`/`unitTokens` helpers
(exported from the package root) for respecting tool-call/tool-result
atomicity and pinned messages, which every built-in strategy relies on.
There's no shared strategy conformance suite today (strategies vary too
much in shape for one to be meaningful); instead:

- Respect pinned messages — never evict something with `pinned: true`.
- Respect tool-call/tool-result atomicity — a tool call and its result
  should be evicted or kept together, never split.
- Call `ctx.trace?.(...)` when you evict or synthesize content, so
  `budget.explain()` and the `decision` event work for your strategy too.
- Add tests covering: under-budget no-op, over-budget eviction, the
  pinned-message guarantee, and (if applicable) tool-call atomicity.

### Framework adapters

Implement `toExternal`/`fromExternal` conversion functions against the
target framework's message shape (structural typing — no need to add the
real SDK as a dependency; see [`COMPATIBILITY.md`](./COMPATIBILITY.md) for
why). Then run the shared conformance suite:

```ts
import { runAdapterConformanceSuite, type AdapterUnderTest } from '@shivam.dixit/token-budget/test-utils';

const adapter: AdapterUnderTest<YourExternalFormat> = {
  name: 'your-framework',
  toExternal: (messages) => /* ... */,
  fromExternal: (external) => /* ... */,
  buildFixtureMessages: () => [
    { role: 'system', content: '...', pinned: true },
    { role: 'user', content: '...' },
    { id: 'toolcall-1', role: 'assistant', content: [{ type: 'tool_call', name: '...', arguments: {} }] },
    { id: 'toolresult-1', role: 'tool', content: [{ type: 'tool_result', result: '...' }], toolCallId: 'toolcall-1' },
    { role: 'assistant', content: '...' },
  ],
};

runAdapterConformanceSuite(adapter);
```

This checks round-trip fidelity, pinned-message preservation, tool-call/
tool-result atomicity, and correct post-conversion token accounting. See
`packages/token-budget-langchain/test/*.test.ts` for a full real-world
example, and its README's "Compatibility matrix" section for the pattern
of documenting what version of the target framework you tested against.

## Review bar

A community package is ready to link from the root README's package table
once it:

1. Passes the relevant conformance suite(s) above.
2. Has its own README: install instructions, a usage example, and (for
   tokenizers/adapters) a compatibility matrix entry per
   [`COMPATIBILITY.md`](./COMPATIBILITY.md)'s format.
3. Passes `npm run typecheck` and `npm run test` cleanly, with no
   `--no-verify`-style workarounds.
4. Has no required runtime dependency on the thing it adapts (structural
   typing — see above) unless there's a concrete reason it can't work
   that way (e.g. `token-budget-tiktoken`'s dependency on `js-tiktoken` for
   its BPE tables, which can't be structurally typed around).

## License

MIT — see [`LICENSE`](./LICENSE).
