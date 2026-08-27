// In an installed project this import would be `from '@shivam.dixit/token-budget'`.
import { TokenBudget, strategies } from '../src/index.js';

/**
 * Coding agent: tool outputs (file reads, grep results) pile up fast and
 * go stale the moment the agent moves to a different file, while the
 * system prompt and the *currently open* file stay relevant all session.
 * `priority` lets stale tool output get evicted first, ahead of anything
 * still marked important — instead of purely age-based eviction, which
 * would drop the still-relevant system prompt content just as readily.
 */
export function runCodingAgent() {
  const budget = new TokenBudget({
    maxTokens: 70,
    strategy: strategies.priority(),
  });

  budget.addMessage({ role: 'system', content: 'You are a coding agent with file read/grep tools.', pinned: true });
  budget.addMessage({ role: 'assistant', content: 'Reading src/old-module.ts to understand the bug...', priority: 1 });
  budget.addMessage({ role: 'tool', content: 'export function legacy() { /* 200 lines of old code */ }', priority: 1 });
  budget.addMessage({ role: 'user', content: 'Now fix the validation bug in src/current-file.ts.', priority: 5 });
  budget.addMessage({ role: 'assistant', content: 'Reading src/current-file.ts...', priority: 5 });
  budget.addMessage({ role: 'tool', content: 'export function validate(input: string) { /* the file being edited */ }', priority: 5 });

  return budget.getContextSync();
}
