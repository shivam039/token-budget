import { TokenBudget, strategies, truncateToolOutput } from '../src/index.js';

export function runToolHeavyAgent() {
  const tokenizer = { count: (text: string) => Math.ceil(text.length / 4) };
  const budget = new TokenBudget({
    maxTokens: 120,
    reserve: 10,
    tokenizer,
    strategy: strategies.smartPriority(),
  });

  budget.addMessage({ role: 'system', content: 'You are an agent. Preserve the current task and keep tool pairs atomic.' });
  const toolPairs: Array<{ callId: string; resultId: string; cappedOutput: string }> = [];
  for (let turn = 0; turn < 3; turn++) {
    const call = budget.addMessage({
      role: 'assistant',
      content: [{ type: 'tool_call', name: 'run_tests', arguments: { turn } }],
    });
    const rawOutput = `TEST RUN ${turn}\n${'old passing test output\n'.repeat(80)}FINAL: tests passed on attempt ${turn + 1}`;
    const cappedOutput = truncateToolOutput(rawOutput, 45, tokenizer, { keep: 'end' });
    const result = budget.addMessage({
      role: 'tool',
      content: [{ type: 'tool_result', result: cappedOutput }],
      toolCallId: call.id,
    });
    toolPairs.push({ callId: call.id, resultId: result.id, cappedOutput });
  }
  budget.addMessage({ role: 'user', content: 'Fix the failing validation test in src/validate.ts.' });
  budget.addMessage({ role: 'assistant', content: 'I am inspecting validation behavior and will update the failing branch.' });

  return { context: budget.getContextSync(), toolPairs, tokenizer };
}
