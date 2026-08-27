# token-budget-embeddings

Reference cosine-similarity `Scorer` for
[`token-budget`](https://www.npmjs.com/package/token-budget)'s
`semanticRelevance` strategy. Bring your own embedding function — this
package doesn't call out to any embedding API itself.

## Install

```sh
npm install @shivam.dixit/token-budget @shivam.dixit/token-budget-embeddings
```

`token-budget` is a peer dependency (semver range, not pinned).

## Usage

```ts
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { createEmbeddingsScorer } from '@shivam.dixit/token-budget-embeddings';

async function embed(text: string): Promise<number[]> {
  // Call your own embeddings API here (OpenAI, Cohere, a local model, ...).
  const res = await fetch('https://api.example.com/embeddings', {
    method: 'POST',
    body: JSON.stringify({ input: text }),
  });
  return (await res.json()).embedding;
}

const budget = new TokenBudget({
  maxTokens: 8000,
  strategy: strategies.semanticRelevance({ scorer: createEmbeddingsScorer({ embed }) }),
});
```

## Concurrency and reuse

`createEmbeddingsScorer()` is safe to construct once and reuse across many
`TokenBudget` instances or concurrent requests — every vector it returns
comes from a cache keyed by text (query vectors) or message id (message
vectors), never from a single shared "last query" slot that a concurrent
call could overwrite mid-flight. Concurrent calls for the same
not-yet-cached text also share one in-flight `embed()` call rather than
each issuing their own.

The caches themselves are unbounded for the lifetime of the scorer
instance — construct a fresh one periodically (e.g. per long-running
process restart) if that matters for your memory footprint.

## License

MIT
