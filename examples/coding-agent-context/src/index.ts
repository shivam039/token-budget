// A realistic long-running coding-agent session — not a toy. This is what
// actually accumulates in an agent loop's context over ~20 turns: a pinned
// system prompt, file reads (some relevant, some dead ends), verbose
// terminal output, a full test-suite run, a stack trace, and a mix of old
// (now-stale) and recent (still-relevant) conversation.
//
// It deliberately overflows a realistic token budget, then shows exactly
// what token-budget does about it and why — before/after token counts,
// what got evicted, what got folded into a summary, and what survived.
//
// Run it: npm install && npm start

import { TokenBudget, strategies, truncateToolOutput, createEstimateTokenizer } from '@shivam.dixit/token-budget';
import type { BudgetMessage } from '@shivam.dixit/token-budget';

// ---------------------------------------------------------------------------
// 1. Build the session. `addMessage()` never evicts anything on its own —
//    the buffer is allowed to grow past budget here, exactly like a real
//    agent loop that just keeps appending until someone calls getContext().
// ---------------------------------------------------------------------------

const budget = new TokenBudget({
  maxTokens: 700,
  reserve: 100, // leave room for the model's next reply
  strategy: strategies.chain([
    // Pass 1: fold the oldest stale block into one short summary, if we're
    // over budget at all (preThreshold defaults to 1 — only fires on overflow).
    strategies.summarizeOldest({
      blockSize: 4,
      // Stand-in for a real summarizer call (your own LLM, or a cheaper
      // model) — deterministic here so the example has no external
      // dependency and reproducible output.
      summarize: async (messages) => {
        const files = new Set<string>();
        for (const m of messages) {
          const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          const match = text.match(/[\w./-]+\.(ts|md)/);
          if (match) files.add(match[0]);
        }
        const scope = files.size > 0 ? ` touching ${[...files].join(', ')}` : '';
        return `[summary] ${messages.length} earlier turns${scope}: agent explored the codebase, ` +
          `ruled out one file, and inspected another before finding the actual bug.`;
      },
    }),
    // Pass 2: backstop — if summarizing one block wasn't enough, evict
    // whatever's left, lowest priority first.
    strategies.priority(),
  ]),
  // Default 'estimate' tokenizer — zero dependencies, ~4 chars/token. Swap
  // in `token-budget-tiktoken` for an exact count against a real model.
});

function readFileCall(path: string) {
  return budget.addMessage({
    role: 'assistant',
    content: [{ type: 'tool_call', name: 'read_file', arguments: { path } }],
  });
}
function readFileResult(callId: string, path: string, body: string, priority: number) {
  budget.addMessage({
    role: 'tool',
    content: [{ type: 'tool_result', name: 'read_file', result: `# ${path}\n${body}` }],
    toolCallId: callId,
    priority,
  });
}

// --- system prompt: survives every strategy, always ---
budget.addMessage({
  role: 'system',
  pinned: true,
  content:
    'You are a coding agent working in the `checkout-service` repository. ' +
    'Fix the failing test in `src/cart/pricing.test.ts` without changing any public API. ' +
    'Run the full test suite before declaring the fix complete.',
});

// --- turn 1 (old): user reports the failure ---
budget.addMessage({
  role: 'user',
  priority: 2,
  content: 'The pricing test is failing on main. Here is the CI output:\n' +
    'FAIL src/cart/pricing.test.ts\n' +
    '  ✗ applyDiscount rounds to 2 decimal places (14 ms)\n' +
    '    Expected: 19.99\n    Received: 19.9900000001',
});

// --- turn 2 (old, becomes a dead end): reads the wrong file ---
const call1 = readFileCall('src/cart/discounts.ts');
readFileResult(
  call1.id,
  'src/cart/discounts.ts',
  Array.from({ length: 22 }, (_, i) => `export const DISCOUNT_TIER_${i} = { min: ${i * 10}, pct: 0.0${i} };`).join('\n'),
  1, // low priority: turned out irrelevant to the actual bug
);

// --- turn 3 (old): reads the file that actually matters ---
const call2 = readFileCall('src/cart/pricing.ts');
readFileResult(
  call2.id,
  'src/cart/pricing.ts',
  [
    'export function applyDiscount(price: number, pct: number): number {',
    '  const discounted = price * (1 - pct);',
    '  return Math.round(discounted * 100) / 100; // <- floating point drift here',
    '}',
    '',
    'export function formatPrice(cents: number): string {',
    '  return (cents / 100).toFixed(2);',
    '}',
  ].join('\n'),
  4,
);

// --- turn 4 (old): first (partial) test run, still red ---
const call3 = readFileCall('run_tests(src/cart/pricing.test.ts)');
budget.addMessage({
  role: 'tool',
  content: [
    {
      type: 'tool_result',
      name: 'run_tests',
      result:
        'RUN src/cart/pricing.test.ts\n' +
        Array.from({ length: 12 }, (_, i) => `  ${i % 4 === 0 ? '✗' : '✓'} pricing case ${i}`).join('\n') +
        '\n\nFAIL: applyDiscount rounds to 2 decimal places\n  Expected: 19.99\n  Received: 19.9900000001\n  at Object.<anonymous> (src/cart/pricing.test.ts:14:22)',
    },
  ],
  toolCallId: call3.id,
  priority: 3,
});

// --- turn 5 (recent-ish): user narrows the diagnosis ---
budget.addMessage({
  role: 'user',
  priority: 4,
  content: 'Looks like a floating-point rounding issue, not a logic bug. Check applyDiscount\'s rounding.',
});

// --- turn 6 (recent): finds the real cause ---
budget.addMessage({
  role: 'assistant',
  priority: 5,
  content:
    "Confirmed — `Math.round(discounted * 100) / 100` is subject to floating-point drift for values " +
    "like 0.1 + 0.2. Switching to a decimal-safe rounding helper (e.g. `Number(x.toFixed(2))`) fixes it " +
    'without changing the function signature.',
});

// --- turn 7 (recent): full test suite run — large, and the most important tool result in the session ---
const call4 = readFileCall('run_tests(all)');
budget.addMessage({
  role: 'tool',
  content: [
    {
      type: 'tool_result',
      name: 'run_tests',
      result:
        'RUN full suite (214 tests)\n' +
        Array.from({ length: 40 }, (_, i) => `  ✓ ${['cart', 'checkout', 'inventory', 'shipping'][i % 4]} test ${i}`).join('\n') +
        '\n\n  ✓ applyDiscount rounds to 2 decimal places (11 ms)\n\n' +
        'Test Suites: 1 failed, 41 passed, 42 total\n' +
        'Tests:       3 skipped, 1 fixed, 210 passed, 214 total\n' +
        '(3 pre-existing snapshot failures in checkout/legacy-invoice.test.ts, unrelated to this change)',
    },
  ],
  toolCallId: call4.id,
  priority: 5, // this is the evidence the fix actually works — keep it
});

// --- turn 8 (most recent): user asks for a final check ---
budget.addMessage({
  role: 'user',
  priority: 5,
  content: 'Great — update CHANGELOG.md and show me the final diff for src/cart/pricing.ts.',
});

// ---------------------------------------------------------------------------
// 2. BEFORE: the buffer as it stands, unmanaged.
// ---------------------------------------------------------------------------

const before = budget.stats();
const bar = (used: number, max: number, width = 40) => {
  const filled = Math.min(width, Math.round((used / max) * width));
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
};

console.log('='.repeat(72));
console.log('BEFORE — raw session, nothing evicted yet');
console.log('='.repeat(72));
console.log(`Messages:  ${budget.getMessages().length}`);
console.log(`Context:   ~${before.tokensUsed} tokens`);
console.log(`Budget:    ~${before.maxTokens - before.reserve} tokens (${before.maxTokens} max, ${before.reserve} reserved)`);
console.log(`Status:    ${before.tokensUsed > before.maxTokens - before.reserve ? 'OVER BUDGET' : 'within budget'}`);
console.log(`           [${bar(before.tokensUsed, before.maxTokens)}]`);

// ---------------------------------------------------------------------------
// 3. Apply the strategy chain (async: summarizeOldest calls our summarizer).
// ---------------------------------------------------------------------------

const ctx = await budget.getContext();
const report = budget.explain()!;

console.log();
console.log('='.repeat(72));
console.log('AFTER — token-budget applied: summarize-oldest, then priority as backstop');
console.log('='.repeat(72));
console.log(`Messages:  ${ctx.messages.length} (was ${budget.getMessages().length})`);
console.log(`Context:   ~${ctx.tokensUsed} tokens`);
console.log(`Budget:    ~${before.maxTokens - before.reserve} tokens`);
console.log(`Status:    ${ctx.tokensUsed <= before.maxTokens - before.reserve ? 'WITHIN BUDGET' : 'STILL OVER BUDGET'}`);
console.log(`           [${bar(ctx.tokensUsed, before.maxTokens)}]`);
console.log(`Saved:     ~${before.tokensUsed - ctx.tokensUsed} tokens`);

// ---------------------------------------------------------------------------
// 4. WHAT changed, and WHY — explain() is the point of this example.
// ---------------------------------------------------------------------------

console.log();
console.log('--- what token-budget did, and why -------------------------------');
for (const step of report.steps) {
  console.log(`\n[${step.strategyName}] ${step.tokensBefore} -> ${step.tokensAfter} tokens`);
  for (const s of step.synthesized) {
    console.log(`  + synthesized ${s.id}: ${s.reason}`);
  }
  for (const e of step.evicted) {
    console.log(`  - evicted ${e.id}: ${e.reason}`);
  }
  if (step.evicted.length === 0 && step.synthesized.length === 0) {
    console.log('  (no-op — already under this step\'s trigger threshold)');
  }
}

// "Why was this message preserved?" — explain() reports what left; anything
// still in ctx.messages and not synthetic is a "preserved" answer:
const preservedOriginal = ctx.messages.filter((m) => !m.metadata?.['synthetic']);
console.log(`\n--- preserved (${preservedOriginal.length} original messages) ---`);
for (const m of preservedOriginal) {
  const label = m.pinned ? 'pinned' : `priority=${m.priority ?? 0}`;
  const preview = (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 60).replace(/\n/g, ' ');
  console.log(`  ${m.id} [${m.role}, ${label}]: ${preview}...`);
}

// ---------------------------------------------------------------------------
// 5. Prove the one guarantee a hand-rolled `messages.slice()` can't make:
//    every surviving tool-result's toolCallId points at a surviving call.
// ---------------------------------------------------------------------------

const survivingIds = new Set(ctx.messages.map((m: BudgetMessage) => m.id));
const orphans = ctx.messages.filter((m: BudgetMessage) => m.toolCallId && !survivingIds.has(m.toolCallId));
console.log(`\nOrphaned tool results: ${orphans.length} (must be 0 — every pair survives or evicts together)`);

const systemSurvived = ctx.messages.some((m: BudgetMessage) => m.role === 'system' && m.pinned);
console.log(`System prompt survived: ${systemSurvived}`);

// ---------------------------------------------------------------------------
// 6. Bonus: the case eviction strategies can't fix on their own — a single
//    tool result larger than the whole budget. This happens all the time
//    in real coding agents (a CI log, a huge file). truncateToolOutput()
//    shrinks it BEFORE it becomes a message, so it never has to be evicted
//    whole just because it was too big to have coexisted with anything else.
// ---------------------------------------------------------------------------

console.log();
console.log('--- bonus: an oversized tool result, capped before it becomes a message ---');
const massiveCiLog =
  'CI RUN #4821\n' +
  Array.from({ length: 300 }, (_, i) => `  [${i.toString().padStart(3, '0')}] step ok`).join('\n') +
  '\n\nFAILED: 1 flaky integration test, retried and passed on attempt 2\nCI RUN #4821: PASSED';
const tokenizer = createEstimateTokenizer();
const rawTokens = tokenizer.count(massiveCiLog);
const capped = truncateToolOutput(massiveCiLog, 150, tokenizer);
console.log(`Raw CI log:    ~${rawTokens} tokens (would have blown a 150-token cap on its own)`);
console.log(`Capped to:     ~${tokenizer.count(capped)} tokens (keep: 'end', the default — the PASS/FAIL line survives)`);
console.log(`Ends with:     "...${capped.slice(-40)}"`);
