# token-budget-claude

Best-effort Claude tokenizer approximation for
[`token-budget`](https://www.npmjs.com/package/token-budget), with a
`calibrate()` utility to tune it against your own real usage data.

**Read the [Accuracy](#accuracy) section before relying on this for
anything precision-sensitive.** This is an estimate, not ground truth.

## Install

```sh
npm install token-budget token-budget-claude
```

`token-budget` is a peer dependency. `token-budget-tiktoken` (and its
`js-tiktoken` dependency) is a regular dependency — it's the counting
engine this approximation is built on.

## Usage

```ts
import { TokenBudget } from 'token-budget';
import { createClaudeTokenizer } from 'token-budget-claude';

const tokenizer = await createClaudeTokenizer(); // async: loads cl100k_base once
const budget = new TokenBudget({ maxTokens: 200000, tokenizer }); // count() is sync from here on
```

### Calibrating against your own data

If you have access to real Claude API usage or billing token counts for
some sample texts, use them to fit a scaling ratio for your own content
distribution:

```ts
import { createClaudeTokenizer, calibrate } from 'token-budget-claude';

const ratio = await calibrate([
  { text: 'a real prompt from your app', actualTokens: 42 }, // from Claude's usage.input_tokens, etc.
  { text: 'another real sample', actualTokens: 108 },
  // more real (text, actualTokens) pairs — more, and more representative
  // of your actual traffic, is better
]);

const tokenizer = await createClaudeTokenizer({ ratio });
```

## API

| Export | Description |
| --- | --- |
| `createClaudeTokenizer(options?)` | `Promise<Tokenizer>` — `{ ratio? }` (default `1`, unscaled) scales the underlying `cl100k_base` count. |
| `calibrate(samples)` | `Promise<number>` — fits a scaling ratio from real `{ text, actualTokens }` pairs (ratio-of-sums: total actual ÷ total base count). Throws if `samples` is empty. |

`count()` on the returned tokenizer is synchronous once the async factory
resolves — the async step is the encoding load, matching the core
`Tokenizer` interface exactly as a drop-in replacement. `encode()` is
intentionally **not** exposed: the underlying token ids are `cl100k_base`
ids, not real Claude token ids, so returning them would be misleading —
counting is the only thing this approximation supports.

## Accuracy

**Anthropic has never published Claude's real tokenizer.** There is no
public, offline way to count Claude tokens exactly outside of Anthropic's
own API. This package's approximation method:

1. Counts text using OpenAI's `cl100k_base` BPE tokenizer (a real,
   well-tested tokenizer, via [`token-budget-tiktoken`](../token-budget-tiktoken))
   as a stand-in.
2. Multiplies by a `ratio` you supply (default `1` — no scaling).

**No accuracy number is claimed or baked in**, because this package was
built without access to real Claude token counts to validate against —
inventing a specific error-percentage claim without having measured one
would be worse than admitting the gap. What you get by default is exactly
`cl100k_base`'s count, unscaled — a reasonable, real BPE tokenizer's
opinion, but not Claude's.

**Before relying on this for anything precision-sensitive** (hard budget
enforcement, billing estimates), call `calibrate()` with real
`(text, actualTokens)` pairs from your own Claude API usage or billing
data — ideally text representative of your actual traffic (prompt
style, language mix, code vs. prose) — and use the resulting `ratio`.
Re-calibrate periodically and whenever Anthropic changes models, since
tokenizers can differ between model families.

If you need exact counts and can tolerate a network call, Anthropic's own
[token counting endpoint](https://docs.anthropic.com/en/api/messages-count-tokens)
(`POST /v1/messages/count_tokens`) is ground truth — this package exists
for the offline/zero-network-call case that a `Tokenizer` implementation
requires.

See [`CHANGELOG.md`](./CHANGELOG.md) for how this approximation gets
revisited if Anthropic ever publishes tokenizer details (FR2-2.2.2).

## License

MIT
