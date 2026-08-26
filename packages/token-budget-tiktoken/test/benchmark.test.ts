import { describe, expect, it } from 'vitest';
import { createTiktokenTokenizer } from '../src/index.js';
import { createTiktokenNativeTokenizer } from '../src/native.js';

/**
 * FR2-2.1.5: benchmarks and documents counting throughput so users can
 * judge suitability for high-throughput scenarios. Asserts only a low,
 * stable floor (catches a catastrophic regression) — see the README for
 * actual measured numbers from a real run, since absolute throughput is
 * hardware-dependent and not meaningful to hard-assert in CI.
 */
const SAMPLE = 'The quick brown fox jumps over the lazy dog. '.repeat(200); // ~2,200 words

function benchmarkCount(tokenizer: { count: (text: string) => number }, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) tokenizer.count(SAMPLE);
  const elapsedSeconds = (performance.now() - start) / 1000;
  const tokensPerRun = tokenizer.count(SAMPLE);
  return (tokensPerRun * iterations) / elapsedSeconds;
}

describe('throughput benchmark', () => {
  it('js-tiktoken (pure JS) sustains a reasonable tokens/sec floor', async () => {
    const tokenizer = await createTiktokenTokenizer({ model: 'gpt-4o' });
    const tokensPerSecond = benchmarkCount(tokenizer, 50);
    console.log(`[token-budget-tiktoken] js-tiktoken (o200k_base): ~${Math.round(tokensPerSecond).toLocaleString()} tokens/sec`);
    expect(tokensPerSecond).toBeGreaterThan(10_000);
  });

  it('native tiktoken (WASM) sustains a reasonable tokens/sec floor', () => {
    const tokenizer = createTiktokenNativeTokenizer({ model: 'gpt-4o' });
    const tokensPerSecond = benchmarkCount(tokenizer, 50);
    console.log(`[token-budget-tiktoken] native tiktoken (o200k_base): ~${Math.round(tokensPerSecond).toLocaleString()} tokens/sec`);
    expect(tokensPerSecond).toBeGreaterThan(10_000);
  });
});
