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

  it('returns an empty string unchanged (fits trivially, no marker inserted)', () => {
    expect(truncateToolOutput('', 10, tokenizer)).toBe('');
    expect(truncateToolOutput('', 0, tokenizer)).toBe('');
  });

  // Regression: String.prototype.slice operates on UTF-16 code units, not
  // code points — an unguarded boundary can land between an emoji's two
  // surrogate halves, leaving a lone/malformed surrogate in the output.
  // Real tool output (file contents, terminal logs with status emoji)
  // hits this routinely, not just in adversarial input.
  describe('surrogate-pair safety (emoji / astral-plane characters)', () => {
    const hasLoneSurrogate = (s: string) =>
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

    it('never splits a surrogate pair with keep: "start"', () => {
      const text = '🎉'.repeat(50) + 'TAIL';
      for (let maxTokens = 5; maxTokens <= 60; maxTokens++) {
        const result = truncateToolOutput(text, maxTokens, tokenizer, { keep: 'start' });
        expect(hasLoneSurrogate(result)).toBe(false);
        expect(tokenizer.count(result)).toBeLessThanOrEqual(maxTokens);
      }
    });

    it('never splits a surrogate pair with keep: "end" (the default)', () => {
      const text = 'HEAD' + '🎉'.repeat(50);
      for (let maxTokens = 5; maxTokens <= 60; maxTokens++) {
        const result = truncateToolOutput(text, maxTokens, tokenizer);
        expect(hasLoneSurrogate(result)).toBe(false);
        expect(tokenizer.count(result)).toBeLessThanOrEqual(maxTokens);
      }
    });

    it('never splits a surrogate pair with keep: "both"', () => {
      const text = '🎉'.repeat(20) + 'a'.repeat(50) + '🎉'.repeat(20);
      for (let maxTokens = 10; maxTokens <= 80; maxTokens++) {
        const result = truncateToolOutput(text, maxTokens, tokenizer, { keep: 'both' });
        expect(hasLoneSurrogate(result)).toBe(false);
        expect(tokenizer.count(result)).toBeLessThanOrEqual(maxTokens);
      }
    });
  });

  it('handles a very large string (multi-MB) without exceeding the budget or hanging', () => {
    const text = 'x'.repeat(5_000_000); // 5 MB
    const start = performance.now();
    const result = truncateToolOutput(text, 1000, tokenizer);
    const elapsedMs = performance.now() - start;
    expect(tokenizer.count(result)).toBeLessThanOrEqual(1000);
    expect(elapsedMs).toBeLessThan(1000); // binary search over length, not linear scans per char
  });
});
