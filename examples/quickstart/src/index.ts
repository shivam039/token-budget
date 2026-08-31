// The smallest possible token-budget setup. Read top to bottom — this is
// meant to be understood in under 2 minutes, not to demonstrate every
// feature. For a realistic, larger session that actually overflows a
// budget, see ../coding-agent-context instead.
//
// Run it: npm install && npm start (after the one-time repo-root setup
// in ../README.md)

import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

// A small budget on purpose, so this script visibly overflows and evicts
// something — with a real model you'd set maxTokens from the model's
// actual context window instead (see docs/model-budgets.md).
const budget = new TokenBudget({
  maxTokens: 60,
  strategy: strategies.dropOldest(),
  tokenizer: { count: (text) => Math.ceil(text.length / 4) }, // deterministic, no external dependency
});

// pinned: true means this never gets evicted, no matter how full the
// buffer gets or how many turns pass.
budget.addMessage({ role: 'system', content: 'You are a concise assistant.', pinned: true });

budget.addMessage({ role: 'user', content: 'What is the capital of France?' });
budget.addMessage({ role: 'assistant', content: 'The capital of France is Paris.' });
budget.addMessage({ role: 'user', content: 'What is the capital of Japan?' });
budget.addMessage({ role: 'assistant', content: 'The capital of Japan is Tokyo.' });
budget.addMessage({ role: 'user', content: 'And Germany?' });

const before = budget.stats();
const { messages, tokensUsed, evicted } = budget.getContextSync();

console.log(`Before: ${before.messageCount} messages, ${before.tokensUsed} tokens (budget: ${budget.effectiveBudget})`);
console.log(`After:  ${messages.length} messages, ${tokensUsed} tokens`);
console.log(`Evicted: ${evicted.length} message(s) —`, evicted.map((m) => `"${String(m.content).slice(0, 30)}..."`));
console.log('System prompt survived:', messages.some((m) => m.pinned));

// See exactly why each message was evicted:
console.log(JSON.stringify(budget.explain(), null, 2));
