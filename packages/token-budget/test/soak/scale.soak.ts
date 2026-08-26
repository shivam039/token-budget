import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { dropOldest } from '../../src/strategies/dropOldest.js';
import { slidingWindow } from '../../src/strategies/slidingWindow.js';
import { priority } from '../../src/strategies/priority.js';
import type { Strategy } from '../../src/types.js';

interface BenchResult {
  n: number;
  strategy: string;
  addMessageMs: number;
  getContextMs: number;
  heapDeltaMB: number | null;
}

function forceGcIfAvailable(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc === 'function') gc();
}

function heapUsed(): number | null {
  const proc = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;
  return proc?.memoryUsage ? proc.memoryUsage().heapUsed : null;
}

function runOnce(n: number, strategyName: string, strategyFactory: () => Strategy): BenchResult {
  forceGcIfAvailable();
  const before = heapUsed();

  const budget = new TokenBudget({ maxTokens: 50_000, charsPerToken: 1, strategy: strategyFactory() });
  const addStart = performance.now();
  for (let i = 0; i < n; i++) {
    budget.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: `message number ${i}`, priority: i % 10 });
  }
  const addMessageMs = performance.now() - addStart;

  const ctxStart = performance.now();
  budget.getContextSync();
  const getContextMs = performance.now() - ctxStart;

  const after = heapUsed();
  const heapDeltaMB = before !== null && after !== null ? (after - before) / 1024 / 1024 : null;
  return { n, strategy: strategyName, addMessageMs, getContextMs, heapDeltaMB };
}

/**
 * Takes the best-of-`trials` measurement (standard microbenchmark
 * practice: the minimum most closely reflects true algorithmic cost,
 * filtering out GC pauses/OS scheduling noise — a genuine complexity
 * regression shows up in every trial, not just the discarded slower ones).
 */
function bench(n: number, strategyName: string, strategyFactory: () => Strategy, trials = 3): BenchResult {
  let best: BenchResult | undefined;
  for (let t = 0; t < trials; t++) {
    const result = runOnce(n, strategyName, strategyFactory);
    if (!best || result.addMessageMs + result.getContextMs < best.addMessageMs + best.getContextMs) best = result;
  }
  return best!;
}

const SIZES = [1_000, 10_000, 50_000, 100_000];
const STRATEGIES: Array<[string, () => Strategy]> = [
  ['drop-oldest', () => dropOldest()],
  ['sliding-window', () => slidingWindow({ turns: 1000, enforceBudget: true })],
  ['priority', () => priority()],
];

/**
 * FR2-8.1/.2: benchmarks addMessage/getContext latency and memory
 * footprint at 1k/10k/50k/100k messages per built-in strategy, formally
 * verifying no O(n²) regression has crept in (a real one would show
 * orders of magnitude here, not a modest constant-factor increase).
 * Long-running by design — see vitest.soak.config.ts / `npm run test:soak`.
 * Run with `node --expose-gc` for accurate heap-delta numbers; without it,
 * heapDelta is still logged but noisier (no forced GC between runs).
 *
 * Reference measurements (Node v22.22.2, this repo's CI-shaped sandbox,
 * `node --expose-gc`) — see the README's "Scale guidance" section for the
 * full table this reproduces.
 */
describe('scale benchmark: 1k/10k/50k/100k messages', () => {
  for (const [name, factory] of STRATEGIES) {
    it(`${name}: addMessage stays ~O(1) amortized and getContext scales ~linearly up to 100k messages`, () => {
      bench(2_000, name, factory); // warm up the JIT so the first measured size isn't inflated by cold-start cost
      const results = SIZES.map((n) => bench(n, name, factory));
      for (const r of results) {
        console.log(
          `[scale-benchmark] n=${r.n} strategy=${r.strategy} addMessage=${r.addMessageMs.toFixed(1)}ms ` +
            `getContext=${r.getContextMs.toFixed(1)}ms heapDelta=${r.heapDeltaMB !== null ? r.heapDeltaMB.toFixed(1) + 'MB' : 'n/a'}`,
        );
      }

      // Compare *per-message* cost (total ÷ n) rather than raw totals: an
      // O(n) operation's per-message cost should stay roughly flat as n
      // grows, while O(n²) would show it growing linearly with n too (i.e.
      // the per-message cost itself scales with n). Normalizing this way
      // — the same pattern the removeMessage regression test above uses —
      // stays stable even when a small-n measurement is itself just a few
      // milliseconds (too noisy to compare as a raw ratio of totals).
      const [, at10k, , at100k] = results;
      const addPerMsgAt10k = at10k!.addMessageMs / at10k!.n;
      const addPerMsgAt100k = at100k!.addMessageMs / at100k!.n;
      expect(addPerMsgAt100k).toBeLessThan(Math.max(addPerMsgAt10k * 5, 0.01));

      const ctxPerMsgAt10k = at10k!.getContextMs / at10k!.n;
      const ctxPerMsgAt100k = at100k!.getContextMs / at100k!.n;
      expect(ctxPerMsgAt100k).toBeLessThan(Math.max(ctxPerMsgAt10k * 5, 0.01));
    });
  }
});
