// A coding-agent loop: system instructions + conversation + tool calls +
// tool results, kept inside a token budget — with tool-call/tool-result
// pairs guaranteed to survive or be evicted TOGETHER, never split. Most
// provider APIs reject a request with an orphaned tool result (a
// tool_call_id with no matching call, or vice versa) — this is the
// mechanic that makes hand-rolled `messages.slice()` truncation unsafe
// for agent loops specifically.
//
// Run it: npm install && npm start

import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const budget = new TokenBudget({
  maxTokens: 120,
  strategy: strategies.priority(),
  tokenizer: { count: (t) => Math.ceil(t.length / 4) },
});

budget.addMessage({
  role: 'system',
  content: 'You are a coding agent with read_file and run_tests tools. Fix the failing test in src/validate.ts.',
  pinned: true,
});

// Turn 1: the agent reads a file that turns out to be irrelevant, then
// moves on — this tool call/result pair should be evicted together once
// the agent is done with it.
const call1 = budget.addMessage({
  role: 'assistant',
  content: [{ type: 'tool_call', name: 'read_file', arguments: { path: 'src/old-helpers.ts' } }],
  priority: 1, // low priority: this file turned out not to matter
});
budget.addMessage({
  role: 'tool',
  content: [{ type: 'tool_result', result: 'export function unused() { /* ...300 lines... */ }' }],
  toolCallId: call1.id,
  priority: 1,
});

// Turn 2: the agent reads the file that actually matters, and runs the
// failing test — both stay high priority, since this is the agent's
// current focus.
const call2 = budget.addMessage({
  role: 'assistant',
  content: [{ type: 'tool_call', name: 'read_file', arguments: { path: 'src/validate.ts' } }],
  priority: 5,
});
budget.addMessage({
  role: 'tool',
  content: [{ type: 'tool_result', result: 'export function validate(input: string) { return input.length > 0; } // bug: should also trim()' }],
  toolCallId: call2.id,
  priority: 5,
});

const call3 = budget.addMessage({
  role: 'assistant',
  content: [{ type: 'tool_call', name: 'run_tests', arguments: { file: 'src/validate.test.ts' } }],
  priority: 5,
});
budget.addMessage({
  role: 'tool',
  content: [{ type: 'tool_result', result: 'FAIL: validate("  ") should return false, got true' }],
  toolCallId: call3.id,
  priority: 5,
});

const ctx = budget.getContextSync();
const report = budget.explain()!;

console.log(`Token budget: ${budget.maxTokens}`);
console.log(`Messages kept: ${ctx.messages.length} of ${budget.getMessages().length}\n`);

console.log('Evicted, and why:');
for (const step of report.steps) {
  for (const e of step.evicted) console.log(`  - ${e.id}: ${e.reason}`);
}

// Prove atomicity: every surviving tool-result's toolCallId points to a
// surviving tool-call — never an orphan.
const survivingIds = new Set(ctx.messages.map((m) => m.id));
const orphans = ctx.messages.filter((m) => m.toolCallId && !survivingIds.has(m.toolCallId));
console.log(`\nOrphaned tool results (toolCallId with no matching surviving call): ${orphans.length}`);
console.log('(should always be 0 — that\'s the atomicity guarantee, not a coincidence)');
