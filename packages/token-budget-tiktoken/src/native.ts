import { get_encoding, encoding_for_model } from 'tiktoken';
import type { TiktokenEncoding, TiktokenModel } from 'tiktoken';
import type { Tokenizer } from 'token-budget';

export type { TiktokenEncoding, TiktokenModel } from 'tiktoken';

export interface CreateTiktokenNativeTokenizerOptions {
  model?: TiktokenModel;
  encoding?: TiktokenEncoding;
}

/**
 * FR2-2.1.1: opt-in Node-only path backed by the native/WASM `tiktoken`
 * package for performance-critical use, instead of the default pure-JS
 * `js-tiktoken`. `tiktoken` is an optional peer dependency — install it
 * yourself to use this subpath.
 *
 * Unlike `createTiktokenTokenizer` (the default export, async because it
 * dynamically imports a rank table), this is fully synchronous: the
 * native package's Node build loads its WASM eagerly at `require`/import
 * time, so `get_encoding`/`encoding_for_model` return immediately.
 */
export function createTiktokenNativeTokenizer(options: CreateTiktokenNativeTokenizerOptions = {}): Tokenizer {
  const tk = options.encoding ? get_encoding(options.encoding) : encoding_for_model(options.model ?? 'gpt-4o');
  return {
    count: (text: string) => tk.encode(text).length,
    encode: (text: string) => Array.from(tk.encode(text)),
  };
}
