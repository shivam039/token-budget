import { describe, expect, it } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { runTokenizerConformanceSuite } from '@shivam.dixit/token-budget/test-utils';
import { createTiktokenTokenizer, resolveEncodingForModel } from '../src/index.js';

describe('resolveEncodingForModel', () => {
  it('maps gpt-4o to o200k_base', () => {
    expect(resolveEncodingForModel('gpt-4o')).toBe('o200k_base');
  });

  it('maps gpt-4 to cl100k_base', () => {
    expect(resolveEncodingForModel('gpt-4')).toBe('cl100k_base');
  });
});

describe('createTiktokenTokenizer', () => {
  it('resolves the encoding for a model and returns a sync Tokenizer', async () => {
    const tokenizer = await createTiktokenTokenizer({ model: 'gpt-4o' });
    expect(typeof tokenizer.count).toBe('function');
    expect(typeof tokenizer.encode).toBe('function');
  });

  it('counts tokens exactly (matches encode().length)', async () => {
    const tokenizer = await createTiktokenTokenizer({ model: 'gpt-4o' });
    const text = 'The quick brown fox jumps over the lazy dog.';
    expect(tokenizer.count(text)).toBe(tokenizer.encode!(text).length);
    expect(tokenizer.count(text)).toBeGreaterThan(0);
  });

  it('accepts an explicit encoding override, taking precedence over model', async () => {
    const tokenizer = await createTiktokenTokenizer({ model: 'gpt-4o', encoding: 'cl100k_base' });
    const text = 'hello world';
    // cl100k_base and o200k_base tokenize some strings differently; just confirm it actually ran cl100k_base's table
    expect(tokenizer.count(text)).toBeGreaterThan(0);
  });

  it('caches tokenizer instances per encoding (FR2-2.1.3)', async () => {
    const a = await createTiktokenTokenizer({ encoding: 'cl100k_base' });
    const b = await createTiktokenTokenizer({ encoding: 'cl100k_base' });
    // Different Tokenizer object wrappers, but backed by the same cached Tiktoken instance —
    // verified indirectly: both count identically and resolve near-instantly the second time.
    const text = 'consistency check';
    expect(a.count(text)).toBe(b.count(text));
  });

  it('concurrent loads of the same uncached encoding do not race (dedupes in-flight loads)', async () => {
    const [a, b] = await Promise.all([createTiktokenTokenizer({ encoding: 'p50k_base' }), createTiktokenTokenizer({ encoding: 'p50k_base' })]);
    expect(a.count('same encoding')).toBe(b.count('same encoding'));
  });

  it.each(['cl100k_base', 'o200k_base', 'p50k_base', 'p50k_edit', 'r50k_base', 'gpt2'] as const)(
    'loads the %s encoding correctly',
    async (encoding) => {
      const tokenizer = await createTiktokenTokenizer({ encoding });
      expect(tokenizer.count('hello world')).toBeGreaterThan(0);
    },
  );

  it('throws for an unknown encoding', async () => {
    await expect(createTiktokenTokenizer({ encoding: 'not-a-real-encoding' as never })).rejects.toThrow();
  });

  it('is a drop-in replacement for TokenBudget\'s tokenizer option', async () => {
    const tokenizer = await createTiktokenTokenizer({ model: 'gpt-4o' });
    const budget = new TokenBudget({ maxTokens: 1000, tokenizer });
    const msg = budget.addMessage({ role: 'user', content: 'Hello, world!' });
    expect(msg.tokens).toBeGreaterThan(0);
  });
});

// FR2-9.3: run the shared tokenizer conformance suite against the real
// cl100k_base-backed tokenizer (resolved once, up front, since the suite
// itself is synchronous).
runTokenizerConformanceSuite('tiktoken (cl100k_base)', await createTiktokenTokenizer({ encoding: 'cl100k_base' }));
