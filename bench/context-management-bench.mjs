// Large-history stress test: how each system performs keeping a SINGLE,
// large token budget (50,000 tokens) applied against a history that
// grows all the way up to (and past) that budget. This is the
// worst-case shape — see context-management-realistic-bench.mjs for the
// bounded-window scenario most real apps actually run (small window,
// large history), which is a fairer test of everyday usage.
//
// All three are given the SAME simple length-based token counter, so
// this isolates buffer/eviction machinery cost, not tokenizer speed
// (that's tokenizer-bench.mjs). All three produce the same "survivors"
// count at each size, confirming they're doing equivalent work.

import { TokenBudget, strategies } from 'token-budget';
import { trimMessages, HumanMessage, AIMessage } from '@langchain/core/messages';
import { measure, measureAsync, fmtMs } from './lib/stats.mjs';
import { messageText, approxCount } from './fixtures/messages.mjs';

const MAX_TOKENS = 50_000;

function runTokenBudget(n) {
  const budget = new TokenBudget({
    maxTokens: MAX_TOKENS,
    strategy: strategies.dropOldest(),
    tokenizer: { count: approxCount },
    messageOverhead: () => 0,
  });
  for (let i = 0; i < n; i++) {
    budget.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: messageText(i) });
  }
  return budget.getContextSync().messages.length;
}

function runNaiveDIY(n) {
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: messageText(i) });
    let total = messages.reduce((sum, m) => sum + approxCount(m.content), 0);
    while (total > MAX_TOKENS && messages.length > 0) {
      messages.shift();
      total = messages.reduce((sum, m) => sum + approxCount(m.content), 0);
    }
  }
  return messages.length;
}

async function runLangChain(n) {
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push(i % 2 === 0 ? new HumanMessage(messageText(i)) : new AIMessage(messageText(i)));
  }
  const tokenCounter = (msgs) => msgs.reduce((sum, m) => sum + approxCount(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
  const trimmed = await trimMessages(messages, { maxTokens: MAX_TOKENS, tokenCounter, strategy: 'last' });
  return trimmed.length;
}

function reportRow(name, stat, survivors, note = '') {
  console.log(
    `  ${name.padEnd(24)} median ${fmtMs(stat.median).padStart(11)}   p95 ${fmtMs(stat.p95).padStart(11)}   survivors=${survivors}${note}`,
  );
}

async function main() {
  console.log('Context-management benchmark — large-history stress test');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`Every run keeps only the tail of the conversation under a ${MAX_TOKENS.toLocaleString()}-token budget.\n`);

  const SIZES = [1000, 10000, 50000];

  for (const n of SIZES) {
    // token-budget and naive DIY stay fast even at 50k; LangChain's
    // trimMessages does not (~20s/run at n=50000 — see
    // docs/benchmarks.md), so its trial count is reduced there
    // specifically, and that reduction is stated in the output, not
    // hidden in it.
    const fastTrials = { warmup: 3, trials: 10 };
    const lcTrials = n >= 50000 ? { warmup: 0, trials: 2 } : { warmup: 3, trials: 10 };
    const lcNote = n >= 50000 ? '  (reduced trials: ~20s/run at this size)' : '';

    console.log(`n = ${n.toLocaleString()} messages`);

    let survivors;
    const tb = measure(() => {
      survivors = runTokenBudget(n);
    }, fastTrials);
    reportRow('token-budget', tb, survivors);

    const diy = measure(() => {
      survivors = runNaiveDIY(n);
    }, fastTrials);
    reportRow('naive DIY', diy, survivors);

    const lc = await measureAsync(async () => {
      survivors = await runLangChain(n);
    }, lcTrials);
    reportRow('LangChain trimMessages', lc, survivors, lcNote);

    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
