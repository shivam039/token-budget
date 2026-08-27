import { describe, expect, it } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { runTokenizerConformanceSuite } from '@shivam.dixit/token-budget/test-utils';
import { createClaudeTokenizer, calibrate } from '../src/index.js';

describe('createClaudeTokenizer', () => {
  it('returns a sync-callable Tokenizer after the async factory resolves', async () => {
    const tokenizer = await createClaudeTokenizer();
    expect(typeof tokenizer.count).toBe('function');
    expect(tokenizer.count('The quick brown fox jumps over the lazy dog.')).toBeGreaterThan(0);
  });

  it('does not expose encode() — cl100k_base ids are not real Claude token ids', async () => {
    const tokenizer = await createClaudeTokenizer();
    expect(tokenizer.encode).toBeUndefined();
  });

  it('defaults to ratio 1 (raw, unscaled cl100k_base counts)', async () => {
    const unscaled = await createClaudeTokenizer();
    const explicit = await createClaudeTokenizer({ ratio: 1 });
    const text = 'Some representative sample text for counting.';
    expect(unscaled.count(text)).toBe(explicit.count(text));
  });

  it('applies a custom ratio as a scaling factor, rounded to the nearest integer', async () => {
    const base = await createClaudeTokenizer({ ratio: 1 });
    const scaled = await createClaudeTokenizer({ ratio: 1.1 });
    const text = 'The quick brown fox jumps over the lazy dog, repeatedly, to get enough tokens to see scaling.';
    expect(scaled.count(text)).toBe(Math.round(base.count(text) * 1.1));
    expect(scaled.count(text)).toBeGreaterThan(base.count(text));
  });

  it('is a drop-in replacement for TokenBudget\'s tokenizer option', async () => {
    const tokenizer = await createClaudeTokenizer();
    const budget = new TokenBudget({ maxTokens: 1000, tokenizer });
    const msg = budget.addMessage({ role: 'user', content: 'Hello, world!' });
    expect(msg.tokens).toBeGreaterThan(0);
  });
});

describe('calibrate', () => {
  it('fits ratio 1 when actual counts exactly match the base tokenizer', async () => {
    const text = 'Consistent sample text used for both calibration and verification.';
    const base = await createClaudeTokenizer({ ratio: 1 });
    const actualTokens = base.count(text);
    const ratio = await calibrate([{ text, actualTokens }]);
    expect(ratio).toBeCloseTo(1, 5);
  });

  it('fits a ratio above 1 when actual counts run higher than the base tokenizer', async () => {
    const text = 'Some sample text where the real Claude count runs higher than cl100k_base.';
    const base = await createClaudeTokenizer({ ratio: 1 });
    const baseCount = base.count(text);
    const ratio = await calibrate([{ text, actualTokens: Math.round(baseCount * 1.2) }]);
    expect(ratio).toBeCloseTo(1.2, 1);
  });

  it('averages across multiple samples (ratio-of-sums)', async () => {
    const base = await createClaudeTokenizer({ ratio: 1 });
    const samples = [
      { text: 'first sample text', ratio: 1.0 },
      { text: 'second, quite different sample text here', ratio: 1.4 },
    ];
    const calibrationSamples = samples.map((s) => ({ text: s.text, actualTokens: Math.round(base.count(s.text) * s.ratio) }));
    const ratio = await calibrate(calibrationSamples);
    // ratio-of-sums lands between the two per-sample ratios
    expect(ratio).toBeGreaterThan(1.0);
    expect(ratio).toBeLessThan(1.4);
  });

  it('throws for an empty sample set', async () => {
    await expect(calibrate([])).rejects.toThrow();
  });

  it('a calibrated ratio round-trips into createClaudeTokenizer', async () => {
    const text = 'Round trip calibration check.';
    const base = await createClaudeTokenizer({ ratio: 1 });
    const actualTokens = base.count(text) * 2;
    const ratio = await calibrate([{ text, actualTokens }]);
    const calibrated = await createClaudeTokenizer({ ratio });
    expect(calibrated.count(text)).toBe(actualTokens);
  });
});

// FR2-9.3: run the shared tokenizer conformance suite against this
// package's real tokenizer (resolved once, up front, since the suite
// itself is synchronous). No encode() is exposed here (see above), so the
// suite's encode()-dependent checks are skipped automatically.
runTokenizerConformanceSuite('claude (best-effort approximation)', await createClaudeTokenizer());
