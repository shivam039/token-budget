import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { dropOldest } from '../../src/strategies/dropOldest.js';

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FR2-8.3: simulates a multi-day session — thousands of add/evict cycles,
 * interleaved with streaming — checking for the two leak sources the spec
 * calls out specifically: event listener accumulation and stream state
 * cleanup. Uses structural counts (Map/Set sizes), which are deterministic,
 * rather than raw heap measurements, which are GC-timing-dependent and
 * noisy as a pass/fail signal (heap footprint is covered separately, as a
 * best-effort logged number, in scale.soak.ts).
 *
 * Long-running by design — see vitest.soak.config.ts / `npm run test:soak`.
 */
describe('soak: multi-day session memory/leak check', () => {
  it('buffer size, stream state, and listener counts all stay bounded across 8,000 cycles', async () => {
    const CYCLES = 8_000;
    const rng = mulberry32(42);

    const budget = new TokenBudget({ maxTokens: 2000, charsPerToken: 1, strategy: dropOldest() });

    // Subscribe a handful of long-lived listeners up front, the way a real
    // application would for the life of a session.
    const seen = { warning: 0, evicted: 0, decision: 0 };
    const unsubscribers = [
      budget.on('warning', () => seen.warning++),
      budget.on('evicted', () => seen.evicted++),
      budget.on('decision', () => seen.decision++),
    ];
    expect(budget.listenerCount('warning')).toBe(1);
    expect(budget.listenerCount('evicted')).toBe(1);
    expect(budget.listenerCount('decision')).toBe(1);

    for (let i = 0; i < CYCLES; i++) {
      budget.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'x'.repeat(5 + Math.floor(rng() * 20)) });

      // Every so often, run a full streamed-response cycle too — this is
      // the specific leak risk called out for streaming: does `streams`
      // ever fail to clean up an entry?
      if (i % 7 === 0) {
        const id = `stream_${i}`;
        budget.beginStream(id, 'assistant');
        budget.appendStreamChunk(id, 'partial ');
        budget.appendStreamChunk(id, 'response');
        if (i % 21 === 0) {
          budget.abortStream(id, 'discard'); // the other cleanup path
        } else {
          budget.endStream(id);
        }
      }

      const ctx = await budget.getContext();
      expect(ctx.tokensUsed).toBeLessThanOrEqual(budget.effectiveBudget);
      // getContext() never mutates the buffer by design (Phase 1) — a real
      // long-running session commits each round's result back in, or the
      // raw buffer (intentionally, per getMessages()'s "full history"
      // contract) just keeps growing forever. See README: "Persistence" /
      // summarize-oldest's "recursive summarization" section.
      budget.commit(ctx.messages);

      // Listener counts must never drift from what was actually
      // subscribed — no internal code path should be adding its own.
      expect(budget.listenerCount('warning')).toBe(1);
      expect(budget.listenerCount('evicted')).toBe(1);
      expect(budget.listenerCount('decision')).toBe(1);

      // No stream should ever survive past its own cycle.
      expect(budget.stats().streaming).toHaveLength(0);
    }

    // The message buffer itself must stay bounded by the strategy, not
    // grow proportionally to how many cycles ran (that would itself be a
    // leak, independent of streams/listeners).
    expect(budget.getMessages().length).toBeLessThan(500);

    // Unsubscribing must actually remove listeners — verifies the
    // unsubscribe path (not just that we never over-added).
    for (const unsubscribe of unsubscribers) unsubscribe();
    expect(budget.listenerCount('warning')).toBe(0);
    expect(budget.listenerCount('evicted')).toBe(0);
    expect(budget.listenerCount('decision')).toBe(0);

    expect(seen.evicted).toBeGreaterThan(0); // the scenario actually exercised eviction
  });
});
