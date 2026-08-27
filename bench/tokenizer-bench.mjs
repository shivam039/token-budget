// Raw tokenizer throughput: token-budget-tiktoken vs gpt-tokenizer vs
// llm-token-counter, on the SAME text and the SAME encoding family
// (o200k_base — gpt-tokenizer's own default, not tilted toward
// token-budget's choice).
//
// This benchmark is NOT flattering to token-budget-tiktoken — see
// docs/benchmarks.md's "Raw tokenizer benchmark" section. It's kept and
// run honestly rather than hidden: token-budget answers "what should
// remain in context," gpt-tokenizer answers "how many tokens is this" —
// see context-management-bench.mjs and incremental-accounting-bench.mjs
// for the benchmarks that test what token-budget is actually for.

import { createTiktokenTokenizer } from '@shivam.dixit/token-budget-tiktoken';
import { countTokens as gptTokenizerCount } from 'gpt-tokenizer';
import { countTokens as llmTokenCounterCount } from 'llm-token-counter';
import { measure, fmtMs } from './lib/stats.mjs';
import { bulkCorpus, shortMessage } from './fixtures/messages.mjs';

function reportThroughput(name, stat, tokenCount) {
  const tokPerSec = Math.round(tokenCount / (stat.median / 1000));
  console.log(`  ${name.padEnd(24)} median ${fmtMs(stat.median).padStart(10)}   p95 ${fmtMs(stat.p95).padStart(10)}   ${tokPerSec.toLocaleString().padStart(12)} tok/sec`);
}

function reportPerCall(name, stat, n) {
  console.log(
    `  ${name.padEnd(24)} median ${fmtMs(stat.median).padStart(10)}   p95 ${fmtMs(stat.p95).padStart(10)}   ${(stat.median / n * 1000).toFixed(2).padStart(8)} µs/call`,
  );
}

async function main() {
  console.log('Tokenizer throughput benchmark');
  console.log('───────────────────────────────');
  const tbTokenizer = await createTiktokenTokenizer({ encoding: 'o200k_base' });

  console.log('\nScenario A — bulk-encode one large corpus (warm)\n');
  const bigText = bulkCorpus();
  const tokenCount = tbTokenizer.count(bigText);
  console.log(`  corpus: ${bigText.length.toLocaleString()} chars, ~${tokenCount.toLocaleString()} tokens (15 trials, 5 warmup)\n`);

  reportThroughput('token-budget-tiktoken', measure(() => tbTokenizer.count(bigText)), tokenCount);
  reportThroughput('gpt-tokenizer', measure(() => gptTokenizerCount(bigText)), tokenCount);
  reportThroughput('llm-token-counter', measure(() => llmTokenCounterCount(bigText, { model: 'gpt-4o' })), tokenCount);

  console.log('\nScenario B — many short messages, one tokenizer call each');
  console.log('(the realistic pattern: counting each new chat message as it arrives)\n');

  const N_FAST = 2000;
  const fastMessages = Array.from({ length: N_FAST }, () => shortMessage());
  console.log(`  n=${N_FAST} (15 trials, 5 warmup)\n`);

  reportPerCall(
    'token-budget-tiktoken',
    measure(() => {
      for (const m of fastMessages) tbTokenizer.count(m);
    }),
    N_FAST,
  );
  reportPerCall(
    'gpt-tokenizer',
    measure(() => {
      for (const m of fastMessages) gptTokenizerCount(m);
    }),
    N_FAST,
  );

  // llm-token-counter creates a fresh native tiktoken encoder
  // (encoding_for_model) and frees it on EVERY call — no caching. At
  // n=2,000 that made 15 trials impractically slow (multiple minutes per
  // trial); n is deliberately much smaller here to keep this finishable —
  // the per-call cost is what matters, not the total, and the gap is
  // large enough that a smaller sample still makes the point honestly.
  const N_SLOW = 50;
  const slowMessages = Array.from({ length: N_SLOW }, () => shortMessage());
  console.log(`\n  llm-token-counter: n=${N_SLOW} (2 trials, 0 warmup — see note in source for why)\n`);
  reportPerCall(
    'llm-token-counter',
    measure(
      () => {
        for (const m of slowMessages) llmTokenCounterCount(m, { model: 'gpt-4o' });
      },
      { warmup: 0, trials: 2 },
    ),
    N_SLOW,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
