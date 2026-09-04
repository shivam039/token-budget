// Generates datasets/context-management-bench/data/*.jsonl — deterministic,
// reproducible records built by actually running the real @shivam.dixit/
// token-budget engine (not hand-authored "expected" output), so every
// record's evicted/kept/reason fields are genuinely what the library does,
// not an approximation of it.
//
// Run: npm run generate:dataset   (from the repo root, after `npm run build`)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TokenBudget, strategies, type BudgetMessage } from '@shivam.dixit/token-budget';
import { ALL_CATEGORIES, generateConversation, type ConversationCategory, type GeneratedMessage } from './lib/generateConversation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'datasets', 'context-management-bench', 'data');

interface DatasetRecord {
  id: string;
  scenario: ConversationCategory;
  messages: Array<Pick<BudgetMessage, 'id' | 'role' | 'content' | 'pinned' | 'priority' | 'toolCallId'>>;
  token_budget: number;
  token_count_estimate: number;
  token_count_is_estimate: true;
  strategy: string;
  pinned_message_ids: string[];
  protected_tool_groups: Array<{ call_id: string; result_id: string }>;
  evicted_message_ids: string[];
  retained_message_ids: string[];
  expected_behavior: string;
  notes: string;
}

/** Budget deliberately small relative to the generated conversation, so real eviction happens — a record where nothing was evicted wouldn't demonstrate anything. */
const BUDGET_BY_CATEGORY: Record<ConversationCategory, number> = {
  'coding-agent': 800,
  'research-agent': 900,
  'customer-support': 500,
  'tool-heavy-agent': 900,
  'long-running-agent': 700,
  'pinned-instruction': 400,
  'tool-call-atomicity': 350,
  'priority-based-context': 600,
};

const STRATEGY_BY_CATEGORY: Record<ConversationCategory, 'dropOldest' | 'slidingWindow' | 'priority'> = {
  'coding-agent': 'priority',
  'research-agent': 'priority',
  'customer-support': 'slidingWindow',
  'tool-heavy-agent': 'priority',
  'long-running-agent': 'priority',
  'pinned-instruction': 'dropOldest',
  'tool-call-atomicity': 'dropOldest',
  'priority-based-context': 'priority',
};

const EXPECTED_BEHAVIOR: Record<ConversationCategory, string> = {
  'coding-agent':
    'Recent, high-priority implementation details (JWT/refresh-token decisions) survive; low-value filler acknowledgements are evicted first.',
  'research-agent': 'Tool-call/tool-result pairs (search queries and their retrieved content) remain coherent; no orphaned tool result.',
  'customer-support': 'Recent useful context (the actual issue and its resolution) remains; repetitive greeting/filler turns are evicted.',
  'tool-heavy-agent': 'High-priority tool calls (the regression investigation) outlast low-priority ones (a stale, already-resolved lookup).',
  'long-running-agent': 'The current task-state messages survive across many turns; the original objective is never lost because it is high priority.',
  'pinned-instruction': 'The pinned system instruction survives eviction regardless of how small the budget is, even when hundreds of other messages do not.',
  'tool-call-atomicity': 'Every surviving tool-result message has a surviving tool-call it answers, and vice versa — never one without the other.',
  'priority-based-context': 'Messages tagged high priority (current task) survive over low-priority ones (earlier, unrelated discussion), regardless of age.',
};

function toolGroupsIn(messages: readonly GeneratedMessage[]): Array<{ call_id: string; result_id: string }> {
  const groups: Array<{ call_id: string; result_id: string }> = [];
  for (const m of messages) {
    if (m.toolCallId) groups.push({ call_id: m.toolCallId, result_id: m.id });
  }
  return groups;
}

function buildStrategy(name: 'dropOldest' | 'slidingWindow' | 'priority') {
  if (name === 'dropOldest') return strategies.dropOldest();
  if (name === 'slidingWindow') return strategies.slidingWindow({ turns: 12, enforceBudget: true });
  return strategies.priority();
}

function generateRecord(category: ConversationCategory, messageCount: number, index: number): DatasetRecord {
  const generated = generateConversation(category, messageCount, /* seed */ 1000 + index);
  const tokenBudget = BUDGET_BY_CATEGORY[category];
  const strategyName = STRATEGY_BY_CATEGORY[category];

  const budget = new TokenBudget({ maxTokens: tokenBudget, strategy: buildStrategy(strategyName) });
  for (const m of generated) budget.addMessage(m);

  const before = budget.stats();
  const ctx = budget.getContextSync();
  const retainedIds = new Set(ctx.messages.map((m) => m.id));
  const evictedIds = generated.filter((m) => !retainedIds.has(m.id)).map((m) => m.id);

  return {
    id: `${category}-${String(index).padStart(3, '0')}`,
    scenario: category,
    messages: generated.map(({ id, role, content, pinned, priority, toolCallId }) => ({ id, role, content, pinned, priority, toolCallId })),
    token_budget: tokenBudget,
    token_count_estimate: before.tokensUsed,
    token_count_is_estimate: true,
    strategy: strategyName,
    pinned_message_ids: generated.filter((m) => m.pinned).map((m) => m.id),
    protected_tool_groups: toolGroupsIn(generated),
    evicted_message_ids: evictedIds,
    retained_message_ids: [...retainedIds],
    expected_behavior: EXPECTED_BEHAVIOR[category],
    notes:
      'token_count_estimate uses the built-in heuristic estimator (~4 chars/token), the same default TokenBudget uses ' +
      'when no real tokenizer is configured — it is an estimate, not an exact count from any specific model\'s tokenizer.',
  };
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  let totalRecords = 0;

  for (const category of ALL_CATEGORIES) {
    const records: DatasetRecord[] = [
      generateRecord(category, 30, 1),
      generateRecord(category, 80, 2),
      generateRecord(category, 150, 3),
    ];
    const path = join(OUT_DIR, `${category}.jsonl`);
    writeFileSync(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    totalRecords += records.length;
    console.log(`wrote ${records.length} records -> ${path}`);
  }

  console.log(`\nDone: ${totalRecords} records across ${ALL_CATEGORIES.length} categories.`);
}

main();
