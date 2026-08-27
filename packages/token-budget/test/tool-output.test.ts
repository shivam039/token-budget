import { describe, expect, it } from 'vitest';
import { truncateToolOutput } from '../src/toolOutput.js';
import { createEstimateTokenizer } from '../src/tokenizer.js';

const tokenizer = createEstimateTokenizer(1); // 1 char = 1 token, for exact assertions

describe('truncateToolOutput', () => {
  it('returns text unchanged when it already fits', () => {
    const text = 'short';
    expect(truncateToolOutput(text, 100, tokenizer)).toBe(text);
  });

  it('returns an empty string when maxTokens is 0 or negative', () => {
    expect(truncateToolOutput('anything', 0, tokenizer)).toBe('');
    expect(truncateToolOutput('anything', -5, tokenizer)).toBe('');
  });

  it('keeps the tail by default (most relevant for terminal/test output)', () => {
    const text = 'a'.repeat(50) + 'IMPORTANT_TAIL';
    const result = truncateToolOutput(text, 45, tokenizer);
    expect(result.endsWith('IMPORTANT_TAIL')).toBe(true);
    expect(tokenizer.count(result)).toBeLessThanOrEqual(45);
  });

  it('keeps the head when keep: "start"', () => {
    const text = 'IMPORTANT_HEAD' + 'a'.repeat(50);
    const result = truncateToolOutput(text, 45, tokenizer, { keep: 'start' });
    expect(result.startsWith('IMPORTANT_HEAD')).toBe(true);
    expect(tokenizer.count(result)).toBeLessThanOrEqual(45);
  });

  it('keeps both a head and a tail when keep: "both"', () => {
    const text = 'HEAD_MARK' + 'a'.repeat(100) + 'TAIL_MARK';
    const result = truncateToolOutput(text, 55, tokenizer, { keep: 'both' });
    expect(result.startsWith('HEAD_MARK')).toBe(true);
    expect(result.endsWith('TAIL_MARK')).toBe(true);
    expect(tokenizer.count(result)).toBeLessThanOrEqual(55);
  });

  it('never exceeds maxTokens, across a range of budgets', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
    for (const maxTokens of [5, 10, 25, 50, 100, 500]) {
      const result = truncateToolOutput(text, maxTokens, tokenizer);
      expect(tokenizer.count(result)).toBeLessThanOrEqual(maxTokens);
    }
  });

  it('uses a custom marker when provided', () => {
    const text = 'a'.repeat(100);
    const result = truncateToolOutput(text, 20, tokenizer, {
      marker: (omitted) => `<<cut:${omitted}>>`,
    });
    expect(result).toContain('<<cut:');
  });

  it('degrades to an empty string if even the marker does not fit', () => {
    const text = 'a'.repeat(100);
    const result = truncateToolOutput(text, 2, tokenizer, {
      marker: () => 'this marker alone is way too long to ever fit in two tokens',
    });
    expect(result).toBe('');
  });

  it('composes with addMessage: a truncated tool result never blows the budget on its own', () => {
    const hugeLog = 'BUILD LOG\n' + 'compiling module...\n'.repeat(2000) + 'BUILD FAILED: see above';
    const capped = truncateToolOutput(hugeLog, 200, tokenizer);
    expect(tokenizer.count(capped)).toBeLessThanOrEqual(200);
    expect(capped.endsWith('BUILD FAILED: see above')).toBe(true);
  });
});
