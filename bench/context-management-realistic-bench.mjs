// Realistic bounded-window benchmark: a single 50,000-message history,
// querying progressively SMALLER target windows (1,000 / 2,000 / 5,000 /
// 10,000 tokens) — the shape most real chat apps actually run (a large
// accumulated history, a much smaller effective context window), rather
// than context-management-bench.mjs's worst-case "keep almost the whole
// 50k-token history" stress test. Exists specifically so the stress-test
// result can't be dismissed as "nobody uses LangChain that way" — this
// tests the way people actually do.
//
// token-budget's history is built ONCE (unmeasured setup) and then
// re-queried at each window via setMaxTokens()+getContextSync() — this
// mirrors real usage: the buffer accumulates once, the effective window
// can change per turn/model without rebuilding history. DIY has no
// build/query split in its real-world form (the budget is baked into the
// per-add eviction loop), so it's rebuilt fresh per window, timed as a
// whole — that rebuild cost is itself a real finding, not an oversight.

import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { trimMessages, HumanMessage, AIMessage } from '@langchain/core/messages';
import { measure, measureAsync, fmtMs } from './lib/stats.mjs';
import { messageText, approxCount } from './fixtures/messages.mjs';

const HISTORY_SIZE = 50_000;
const WINDOWS = [1000, 2000, 5000, 10000];

function buildTokenBudget() {
  const budget = new TokenBudget({
    maxTokens: HISTORY_SIZE, // overwritten per window via setMaxTokens before each query
    strategy: strategies.dropOldest(),
    tokenizer: { count: approxCount },
    messageOverhead: () => 0,
  });
  for (let i = 0; i < HISTORY_SIZE; i++) {
    budget.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: messageText(i) });
  }
  return budget;
}

function buildLangChainHistory() {
  const messages = [];
  for (let i = 0; i < HISTORY_SIZE; i++) {
    messages.push(i % 2 === 0 ? new HumanMessage(messageText(i)) : new AIMessage(messageText(i)));
  }
  return messages;
}

function naiveDIYWindow(windowTokens) {
  // Real-world DIY re-runs the whole per-add eviction loop with the new
  // threshold baked in — there's no "change the budget after the fact"
  // in code that never separated build from query.
  const messages = [];
  for (let i = 0; i < HISTORY_SIZE; i++) {
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: messageText(i) });
    let total = messages.reduce((sum, m) => sum + approxCount(m.content), 0);
    while (total > windowTokens && messages.length > 0) {
      messages.shift();
      total = messages.reduce((sum, m) => sum + approxCount(m.content), 0);
    }
  }
  return messages.length;
}

function reportRow(name, stat, survivors, note = '') {
  console.log(`  ${name.padEnd(24)} median ${fmtMs(stat.median).padStart(11)}   p95 ${fmtMs(stat.p95).padStart(11)}   survivors=${survivors}${note}`);
}

async function main() {
  console.log('Context-management benchmark — realistic bounded-window scenario');
  console.log('────────────────────────────────────────────────────────────────');
  console.log(`History: ${HISTORY_SIZE.toLocaleString()} messages, built once. Querying progressively smaller windows.\n`);

  const tbBudget = buildTokenBudget();
  const lcHistory = buildLangChainHistory();

  for (const windowTokens of WINDOWS) {
    console.log(`window = ${windowTokens.toLocaleString()} tokens`);

    let survivors;
    const tb = measure(() => {
      tbBudget.setMaxTokens(windowTokens);
      survivors = tbBudget.getContextSync().messages.length;
    }, { warmup: 3, trials: 10 });
    reportRow('token-budget (query only)', tb, survivors);

    const diy = measure(() => {
      survivors = naiveDIYWindow(windowTokens);
    }, { warmup: 1, trials: 3 });
    reportRow('naive DIY (full rebuild)', diy, survivors);

    // Early runs showed trimMessages' cost here is dominated by the
    // 50,000-message history, not the (much smaller) target window — it
    // doesn't exit early once enough messages are found, so a single run
    // still takes many seconds regardless of window size. Trial count is
    // reduced accordingly; this is itself the finding this benchmark
    // exists to surface, not a shortcut around an inconvenient number.
    const tokenCounter = (msgs) => msgs.reduce((sum, m) => sum + approxCount(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
    const lc = await measureAsync(async () => {
      const trimmed = await trimMessages(lcHistory, { maxTokens: windowTokens, tokenCounter, strategy: 'last' });
      survivors = trimmed.length;
    }, { warmup: 0, trials: 1 });
    reportRow('LangChain trimMessages', lc, survivors, '  (single run — see note in source)');

    console.log('');
  }

  console.log('Note: token-budget\'s row times ONLY the query (setMaxTokens + getContextSync)');
  console.log('against an already-built history — the history is built once, above, unmeasured.');
  console.log('DIY has no equivalent "query an existing buffer at a new budget" operation in its');
  console.log('real-world form, so its row times a full rebuild — that gap is itself a finding.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
