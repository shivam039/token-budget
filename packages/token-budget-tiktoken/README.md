# token-budget-tiktoken

Exact tiktoken counting for [`token-budget`](https://www.npmjs.com/package/token-budget),
backed by pure-JS [`js-tiktoken`](https://www.npmjs.com/package/js-tiktoken)
by default, with an optional Node-only native/WASM path.

## Install

```sh
npm install @shivam.dixit/token-budget @shivam.dixit/token-budget-tiktoken
```

`token-budget` is a peer dependency. `js-tiktoken` is a regular dependency
(it *is* this package's job). The optional `./native` subpath additionally
needs the `tiktoken` package — install it yourself if you want it.

## Usage

```ts
import { TokenBudget } from '@shivam.dixit/token-budget';
import { createTiktokenTokenizer } from '@shivam.dixit/token-budget-tiktoken';

// Async: resolves the encoding for the model and loads its rank table
// (dynamic import — only the encoding you use is fetched, not all of them).
const tokenizer = await createTiktokenTokenizer({ model: 'gpt-4o' });

const budget = new TokenBudget({ maxTokens: 128000, tokenizer });
```

`count()`/`encode()` on the returned tokenizer are fully synchronous once
resolved — the `async` factory is the only initialization step, matching
the core `Tokenizer` interface exactly with no other code changes required.

Pass `encoding` instead of/as well as `model` to pick one explicitly:

```ts
await createTiktokenTokenizer({ encoding: 'cl100k_base' });
```

### Native (Node-only, opt-in)

For Node-only, performance-critical use, swap in the native/WASM
`tiktoken` package via the `/native` subpath. Install `tiktoken` yourself
first (`npm install tiktoken`) — it's an optional peer dependency, not
pulled in by default:

```ts
import { createTiktokenNativeTokenizer } from '@shivam.dixit/token-budget-tiktoken/native';

// Fully synchronous — no async factory needed; the native build loads
// its WASM eagerly at import time in Node.
const tokenizer = createTiktokenNativeTokenizer({ model: 'gpt-4o' });
const budget = new TokenBudget({ maxTokens: 128000, tokenizer });
```

## API

| Export | Description |
| --- | --- |
| `createTiktokenTokenizer(options?)` | `Promise<Tokenizer>` — pure-JS, works in Node/browser/edge. `{ model? }` (default `'gpt-4o'`) auto-selects an encoding; `{ encoding }` overrides it. |
| `resolveEncodingForModel(model)` | Returns the encoding name a model would resolve to, without loading it. |
| `createTiktokenNativeTokenizer(options?)` (from `/native`) | `Tokenizer`, synchronous — same options, Node-only. |

Tokenizer instances are cached per encoding (not per call, and concurrent
loads of the same uncached encoding are de-duplicated) — construct as many
`createTiktokenTokenizer()` calls as you like; loading each encoding's
rank table only happens once.

## Throughput

Measured on this package's own CI-shaped test run (`test/benchmark.test.ts`),
counting a ~2,200-word English sample repeatedly, `o200k_base` encoding:

| Path | Throughput |
| --- | --- |
| `js-tiktoken` (pure JS) | ~480,000 tokens/sec |
| native `tiktoken` (WASM) | ~330,000–470,000 tokens/sec |

Take these as an order-of-magnitude reference, not a guarantee — both
comfortably exceed real-time chat-application throughput needs; reach for
the native path only if you're counting tokens for very large volumes of
text in a tight Node-only hot path. Re-run `npm run test -- benchmark`
in this package to measure on your own hardware.

## Accuracy vs. the heuristic estimator

Exact tiktoken counts vs. `token-budget`'s built-in `chars/4` heuristic
estimator, on a shared sample corpus (see `test/benchmark.test.ts` for the
throughput half; this table was generated with the snippet in
[`packages/token-budget/README.md`](../token-budget#tokenizers)):

| Sample | Exact (tiktoken, `o200k_base`) | Heuristic (`chars/4`) | Error |
| --- | --- | --- | --- |
| English prose | 201 | 225 | +11.9% |
| Code | 280 | 195 | −30.4% |
| JSON | 560 | 345 | −38.4% |
| Non-Latin (Japanese) | 320 | 150 | −53.1% |

The heuristic is within Phase 1's documented ≤10% tolerance for plain
English prose, but degrades sharply for code, structured data, and
non-Latin scripts — exactly the cases this package (or
`token-budget-claude`'s calibration utility) exists for.

## License

MIT
