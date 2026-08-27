// A long-running OpenAI conversation kept inside its context window.
//
//   messages ──▶ token-budget ──▶ context management ──▶ OpenAI ──▶ response
//
// Run it:
//   npm install && npm start
//
// Set OPENAI_API_KEY to actually call the API; without it, this prints
// the request payload it *would* send instead, so the example runs
// (and demonstrates the token-budget part) with zero setup.

import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { toOpenAIMessages } from '@shivam.dixit/token-budget-openai';

const MODEL = 'gpt-4o-mini';

const budget = new TokenBudget({
  maxTokens: 16000,
  reserve: 1000,
  // Old turns get folded into a running summary instead of dropped
  // outright; drop-oldest is the hard backstop if the summary itself
  // doesn't leave enough room (see the README's "Recursive summarization"
  // section for why preThreshold leaves headroom here).
  strategy: strategies.chain([
    strategies.summarizeOldest({
      summarize: async (messages) => `Summary of ${messages.length} earlier turns: the user and assistant discussed onboarding, billing, and API usage questions.`,
      preThreshold: 0.85,
    }),
    strategies.dropOldest(),
  ]),
});

budget.addMessage({
  role: 'system',
  content: 'You are a support assistant for Acme Cloud. Be concise and cite the specific setting or endpoint involved.',
  pinned: true,
});

// Simulate a long support conversation — real code would call
// budget.addMessage() once per turn as the conversation happens.
const TOPICS = ['billing', 'API keys', 'rate limits', 'webhooks', 'SSO setup', 'data export', 'team roles', 'usage alerts'];
for (let i = 0; i < 300; i++) {
  const topic = TOPICS[i % TOPICS.length];
  budget.addMessage({ role: 'user', content: `Question ${i}: I'm having trouble understanding how ${topic} works in my account, can you walk me through it?` });
  budget.addMessage({ role: 'assistant', content: `Answer ${i}: Here's how ${topic} works — go to Settings > ${topic}, then follow the on-screen steps. Let me know if that resolves it.` });
}

const before = budget.stats().tokensUsed;
const ctx = await budget.getContext();
const report = budget.explain()!;

const evictedCount = report.steps.flatMap((s) => s.evicted).length;
const summarizedCount = report.steps.flatMap((s) => s.synthesized).flatMap((s) => s.sourceIds).length;

console.log(`Token budget:  ${budget.maxTokens.toLocaleString()}`);
console.log(`Before:        ${before.toLocaleString()} tokens`);
console.log(`After:         ${ctx.tokensUsed.toLocaleString()} tokens`);
console.log(`Evicted:       ${evictedCount} messages`);
console.log(`Summarized:    ${summarizedCount} messages (folded into ${report.steps.flatMap((s) => s.synthesized).length} summary message(s))`);
console.log(`Remaining:     ${ctx.tokensRemaining.toLocaleString()} tokens\n`);

const openaiMessages = toOpenAIMessages(ctx);

if (process.env.OPENAI_API_KEY) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: openaiMessages }),
  });
  const data = await response.json();
  console.log('OpenAI response:\n', data.choices?.[0]?.message?.content ?? data);
} else {
  console.log('OPENAI_API_KEY not set — printing the request payload that would be sent instead:\n');
  console.log(JSON.stringify({ model: MODEL, messages: openaiMessages.slice(0, 3).concat([{ role: 'user', content: '... (truncated for display) ...' } as any]) }, null, 2));
}
