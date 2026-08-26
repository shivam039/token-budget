/**
 * Shared measurement helper: warms up, runs N timed trials, reports
 * median and p95 instead of a single best/worst run — a single number
 * is easy to cherry-pick (accidentally or not); a distribution isn't.
 *
 * Trial counts are configurable per call because some benchmarked
 * systems (LangChain's trimMessages at 50k+ messages) cost tens of
 * seconds *per run* — using the same 20-trial default there would make
 * the full suite impractically slow. Every call site that reduces
 * trials below the default says why in its own output.
 */
export function measure(fn, { warmup = 5, trials = 15 } = {}) {
  for (let i = 0; i < warmup; i++) fn();
  const samples = [];
  for (let i = 0; i < trials; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}

export async function measureAsync(fn, { warmup = 5, trials = 15 } = {}) {
  for (let i = 0; i < warmup; i++) await fn();
  const samples = [];
  for (let i = 0; i < trials; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return summarize(samples);
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    median: pick(0.5),
    p95: pick(0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    n: sorted.length,
  };
}

export function fmtMs(ms) {
  return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
}

/** Right-pads/aligns a label+value row for the plain-text console tables used across bench/*.mjs. */
export function row(label, value, width = 22) {
  return `${label.padEnd(width)} ${value}`;
}
