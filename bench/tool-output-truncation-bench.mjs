// Measures the one new primitive this pass adds: truncateToolOutput().
// This is NOT a context-management benchmark (no message buffer, no
// eviction) and it is NOT compared against a competitor — there isn't
// really a competing library for "shrink one oversized string to fit a
// token budget." The only question worth answering honestly here is:
// does the binary-search implementation stay fast on the size of tool
// output a real coding agent actually produces (a big file, a verbose
// CI log), including the pathological "way bigger than the budget" case?

import { truncateToolOutput, createEstimateTokenizer } from '@shivam.dixit/token-budget';
import { measure, fmtMs } from './lib/stats.mjs';

const tokenizer = createEstimateTokenizer();

function buildLog(lines) {
  return Array.from({ length: lines }, (_, i) => `[${i.toString().padStart(6, '0')}] step completed ok, elapsed=12ms`).join('\n');
}

function reportRow(name, stat) {
  console.log(`  ${name.padEnd(40)} median ${fmtMs(stat.median).padStart(11)}   p95 ${fmtMs(stat.p95).padStart(11)}`);
}

function main() {
  console.log('Tool-output truncation benchmark — truncateToolOutput() at scale');
  console.log('───────────────────────────────────────────────────────────────────────');
  console.log("Binary search over character length, re-counting the candidate's tokens");
  console.log('at each step (O(log n) tokenizer calls) — this checks that stays fast even');
  console.log('on genuinely large tool output, not just the small examples in the docs.\n');

  const CASES = [
    { lines: 130, maxTokens: 500 },
    { lines: 1300, maxTokens: 1000 },
    { lines: 13000, maxTokens: 1000, note: '(worst case: keep << text)' },
    { lines: 13000, maxTokens: 50000, note: '(barely over — cap close to input size)' },
  ];

  for (const { lines, maxTokens, note = '' } of CASES) {
    const text = buildLog(lines);
    const sizeKB = (text.length / 1024).toFixed(0);
    console.log(`${sizeKB} KB input, cap ${maxTokens.toLocaleString()} tokens${note ? ' ' + note : ''}`);
    const stat = measure(() => truncateToolOutput(text, maxTokens, tokenizer), { warmup: 3, trials: 10 });
    reportRow('truncateToolOutput', stat);
    console.log('');
  }

  console.log('For reference: full-context-buffer eviction performance (many messages,');
  console.log('not one large string) is covered separately — see context-management-bench.mjs');
  console.log('and context-management-realistic-bench.mjs.');
}

main();
