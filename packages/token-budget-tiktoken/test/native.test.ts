import { describe, expect, it } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { createTiktokenNativeTokenizer } from '../src/native.js';

describe('createTiktokenNativeTokenizer', () => {
  it('is fully synchronous (no Promise involved)', () => {
    const tokenizer = createTiktokenNativeTokenizer({ model: 'gpt-4o' });
    expect(typeof tokenizer.count).toBe('function');
  });

  it('counts tokens exactly and matches encode().length', () => {
    const tokenizer = createTiktokenNativeTokenizer({ model: 'gpt-4o' });
    const text = 'The quick brown fox jumps over the lazy dog.';
    expect(tokenizer.count(text)).toBe(tokenizer.encode!(text).length);
    expect(tokenizer.count(text)).toBeGreaterThan(0);
  });

  it('encode() returns a plain number[], matching the core Tokenizer interface', () => {
    const tokenizer = createTiktokenNativeTokenizer({ model: 'gpt-4o' });
    const encoded = tokenizer.encode!('hi');
    expect(Array.isArray(encoded)).toBe(true);
    expect(encoded.every((n) => typeof n === 'number')).toBe(true);
  });

  it('accepts an explicit encoding override', () => {
    const tokenizer = createTiktokenNativeTokenizer({ encoding: 'cl100k_base' });
    expect(tokenizer.count('hello world')).toBeGreaterThan(0);
  });

  it('agrees with the pure-JS js-tiktoken tokenizer on the same encoding', async () => {
    const { createTiktokenTokenizer } = await import('../src/index.js');
    const pureJs = await createTiktokenTokenizer({ encoding: 'cl100k_base' });
    const native = createTiktokenNativeTokenizer({ encoding: 'cl100k_base' });
    const text = 'Cross-checking pure-JS against native tiktoken output.';
    expect(native.count(text)).toBe(pureJs.count(text));
    expect(native.encode!(text)).toEqual(pureJs.encode!(text));
  });

  it('is a drop-in replacement for TokenBudget\'s tokenizer option', () => {
    const tokenizer = createTiktokenNativeTokenizer({ model: 'gpt-4o' });
    const budget = new TokenBudget({ maxTokens: 1000, tokenizer });
    const msg = budget.addMessage({ role: 'user', content: 'Hello, world!' });
    expect(msg.tokens).toBeGreaterThan(0);
  });
});
