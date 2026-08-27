// Isolates ONE specific architectural claim: token-budget's addMessage()
// does O(1) amortized incremental accounting (count the new message,
// add it to a running total) instead of recomputing the whole history's
// token count on every add. No eviction happens in this benchmark
// (maxTokens is set absurdly high) — this is purely "what does it cost
// to add N messages and keep an accurate running total," nothing else.
//
// "Naive recount" is the other extremely common DIY pattern (distinct
// from the shift()-based one in context-management-bench.mjs): call
// `messages.reduce(...)` fresh every time you need to know the current
// total, because that's the obvious thing to write and it's *correct* —
// it's just quadratic.

import { TokenBudget } from '@shivam.dixit/token-budget';
import { measure, fmtMs } from './lib/stats.mjs';
import { messageText, approxCount } from './fixtures/messages.mjs';

const NO_EVICTION_BUDGET = Number.MAX_SAFE_INTEGER;

function runNaiveRecount(n) {
  const messages = [];
  let total;
  for (let i = 0; i < n; i++) {
    messages.push({ content: messageText(i) });
    total = messages.reduce((sum, m) => sum + approxCount(m.content), 0); // recomputed from scratch on every add
  }
  return total;
}

function runTokenBudgetIncremental(n) {
  const budget = new TokenBudget({
    maxTokens: NO_EVICTION_BUDGET,
    tokenizer: { count: approxCount },
    messageOverhead: () => 0,
  });
  for (let i = 0; i < n; i++) {
    budget.addMessage({ role: 'user', content: messageText(i) });
  }
  return budget.stats().tokensUsed;
}

function reportRow(name, stat, n) {
  console.log(
    `  ${name.padEnd(24)} median ${fmtMs(stat.median).padStart(11)}   p95 ${fmtMs(stat.p95).padStart(11)}   ${(stat.median / n * 1000).toFixed(2).padStart(7)} µs/add`,
  );
}

function main() {
  console.log('Incremental accounting benchmark — cost of add-time bookkeeping alone');
  console.log('───────────────────────────────────────────────────────────────────────');
  console.log('No eviction occurs in this benchmark (budget is unbounded) — this isolates');
  console.log('add-time accounting cost only: O(1) amortized (token-budget) vs recomputing');
  console.log('the running total from scratch on every add (naive recount).\n');

  const SIZES = [1000, 10000, 50000, 100000];

  for (const n of SIZES) {
    // Naive recount is genuinely O(n²) total work — at 100k that's ~5
    // billion additions. Trials are reduced at the largest sizes to keep
    // this finishable; the quadratic blowup is already unambiguous by
    // n=50,000, so a smaller sample at 100,000 doesn't weaken the point.
    const tbTrials = n >= 50000 ? { warmup: 1, trials: 3 } : { warmup: 3, trials: 10 };
    // naive recount is genuinely O(n^2): 100k is ~4x the work of 50k
    // squared, so it gets its own, smaller trial count independent of
    // token-budget's — reported honestly as a single run at the largest
    // size rather than silently skipped.
    const naiveTrials = n >= 100000 ? { warmup: 0, trials: 1 } : n >= 50000 ? { warmup: 1, trials: 3 } : { warmup: 3, trials: 10 };
    const note = n >= 50000 ? '  (reduced trials at this size — see source)' : '';

    console.log(`n = ${n.toLocaleString()} messages${note}`);

    let total;
    const tb = measure(() => {
      total = runTokenBudgetIncremental(n);
    }, tbTrials);
    reportRow('token-budget (incremental)', tb, n);

    const naive = measure(() => {
      total = runNaiveRecount(n);
    }, naiveTrials);
    reportRow('naive recount', naive, n);

    console.log('');
  }
}

main();
