import type { BudgetMessage, Scorer, ScoringContext } from 'token-budget';

export interface EmbeddingFunction {
  (text: string): Promise<number[]>;
}

export interface EmbeddingsScorerOptions {
  embed: EmbeddingFunction;
}

function extractText(msg: BudgetMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n');
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('token-budget-embeddings: vector dimension mismatch.');
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Reference `Scorer` for `semanticRelevance` backed by cosine similarity
 * over embeddings you supply via `embed`. Safe to construct once and
 * reuse across many `TokenBudget` instances/concurrent requests — a
 * single `TokenBudget` scores every message against one shared vector
 * cache, keyed by text, not by a single mutable "last query" slot.
 *
 * (An earlier version cached the query vector in one shared slot and
 * re-read it *after* `await embed(queryText)` resolved — under
 * concurrency, a second call's `embed()` could overwrite that slot before
 * the first call read it back, scoring one caller's messages against a
 * different caller's query. Every vector this scorer returns is now taken
 * from a value the call itself resolved or was handed by an in-flight
 * dedup, never re-read from shared mutable state after an `await`.)
 */
export function createEmbeddingsScorer(options: EmbeddingsScorerOptions): Scorer {
  const embed = options.embed;

  // Keyed by text, not a single "last query" slot — concurrent calls for
  // different queries don't clobber each other, and concurrent calls for
  // the *same* uncached query/message share one in-flight embed() call.
  const queryVectorCache = new Map<string, Promise<number[]>>();
  const messageVectorCache = new Map<string, Promise<number[]>>();

  return {
    async score(msg: BudgetMessage, ctx: ScoringContext): Promise<number> {
      const queryText = extractText(ctx.query);
      if (!queryText) return 0;

      let queryVectorPromise = queryVectorCache.get(queryText);
      if (!queryVectorPromise) {
        queryVectorPromise = embed(queryText);
        queryVectorCache.set(queryText, queryVectorPromise);
      }

      const msgText = extractText(msg);
      if (!msgText) return 0;

      let msgVectorPromise = messageVectorCache.get(msg.id);
      if (!msgVectorPromise) {
        msgVectorPromise = embed(msgText);
        messageVectorCache.set(msg.id, msgVectorPromise);
      }

      const [queryVector, msgVector] = await Promise.all([queryVectorPromise, msgVectorPromise]);
      return cosineSimilarity(queryVector, msgVector);
    },
  };
}
