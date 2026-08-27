import { Tiktoken, getEncodingNameForModel, type TiktokenBPE, type TiktokenEncoding, type TiktokenModel } from 'js-tiktoken/lite';
import type { Tokenizer } from 'token-budget';

export type { TiktokenEncoding, TiktokenModel } from 'js-tiktoken/lite';

/**
 * Per-encoding rank tables, loaded on demand via dynamic import so
 * choosing one encoding never pulls the others into the bundle (FR2-2.1.1)
 * — each is ~1MB+ of BPE rank data.
 */
const rankLoaders: Record<TiktokenEncoding, () => Promise<{ default: TiktokenBPE }>> = {
  cl100k_base: () => import('js-tiktoken/ranks/cl100k_base'),
  o200k_base: () => import('js-tiktoken/ranks/o200k_base'),
  p50k_base: () => import('js-tiktoken/ranks/p50k_base'),
  p50k_edit: () => import('js-tiktoken/ranks/p50k_edit'),
  r50k_base: () => import('js-tiktoken/ranks/r50k_base'),
  gpt2: () => import('js-tiktoken/ranks/gpt2'),
};

/** FR2-2.1.3: cache tokenizer instances per encoding, not per call. */
const instanceCache = new Map<TiktokenEncoding, Tiktoken>();
const pendingLoads = new Map<TiktokenEncoding, Promise<Tiktoken>>();

async function loadEncoding(encoding: TiktokenEncoding): Promise<Tiktoken> {
  const cached = instanceCache.get(encoding);
  if (cached) return cached;

  const pending = pendingLoads.get(encoding);
  if (pending) return pending;

  const loader = rankLoaders[encoding];
  if (!loader) {
    throw new Error(`token-budget-tiktoken: unknown encoding "${encoding}". Supported: ${Object.keys(rankLoaders).join(', ')}.`);
  }

  const promise = loader().then(({ default: ranks }) => {
    const tk = new Tiktoken(ranks);
    instanceCache.set(encoding, tk);
    pendingLoads.delete(encoding);
    return tk;
  });
  pendingLoads.set(encoding, promise);
  return promise;
}

export interface CreateTiktokenTokenizerOptions {
  /** Auto-selects an encoding via `getEncodingNameForModel`. Default 'gpt-4o'. */
  model?: TiktokenModel;
  /** Explicit encoding, overriding `model` (FR2-2.1.2). */
  encoding?: TiktokenEncoding;
}

/**
 * FR2-2.1.2/.4: resolves and loads the tiktoken encoding for a model (or an
 * explicit override), returning a `Tokenizer` — `count`/`encode` are
 * synchronous once resolved (FR2-2.3.2: this `async` factory is the one
 * required initialization step; the returned tokenizer is a drop-in
 * replacement for the core heuristic estimator with no other code changes).
 */
export async function createTiktokenTokenizer(options: CreateTiktokenTokenizerOptions = {}): Promise<Tokenizer> {
  const encoding = options.encoding ?? getEncodingNameForModel(options.model ?? 'gpt-4o');
  const tk = await loadEncoding(encoding);
  return {
    count: (text: string) => tk.encode(text).length,
    encode: (text: string) => tk.encode(text),
  };
}

/** Resolves the tiktoken encoding name js-tiktoken would pick for a model, without loading it. */
export function resolveEncodingForModel(model: TiktokenModel): TiktokenEncoding {
  return getEncodingNameForModel(model);
}
