import { describe, expect, it } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { toOpenAIMessages, fromOpenAIMessages, fromOpenAIResponse } from '../src/index.js';
import type { OpenAIResponse } from '../src/index.js';

/**
 * FR2-1.2's analogue to FR2-1.1.6: full round trip against a live-shaped
 * OpenAI response fixture (new-style tool_calls), asserting no data loss
 * and correct token accounting.
 */
describe('OpenAI adapter full round trip', () => {
  it('builds messages -> appends a live-shaped tool_calls response -> rebuilds with no data loss', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'system', content: 'You are a weather assistant.', pinned: true });
    budget.addMessage({ role: 'user', content: 'What is the weather in Paris?' });

    const before = await budget.getContext();
    const openaiMessages = toOpenAIMessages(before);
    expect(openaiMessages[0]).toEqual({ role: 'system', content: 'You are a weather assistant.' });

    const liveResponse: OpenAIResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_01AbC', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };
    fromOpenAIResponse(liveResponse, budget);

    budget.addMessage({ role: 'tool', content: [{ type: 'tool_result', toolUseId: 'call_01AbC', result: 'Sunny, 22°C' }], toolCallId: 'call_01AbC' });
    budget.addMessage({ role: 'assistant', content: 'The weather in Paris is sunny and 22°C.' });

    const after = await budget.getContext();
    expect(after.messages).toHaveLength(5);
    expect(after.tokensUsed).toBeGreaterThan(before.tokensUsed);

    const rebuiltMessages = toOpenAIMessages(after);
    const rebuiltInputs = fromOpenAIMessages(rebuiltMessages);
    const rebuilt = new TokenBudget({ maxTokens: 100000 });
    for (const input of rebuiltInputs) rebuilt.addMessage(input);

    expect(rebuilt.getMessages()).toHaveLength(5);
    expect(rebuilt.stats().tokensUsed).toBeGreaterThan(0);

    const toolCall = rebuilt.getMessages().find((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_call'));
    const toolResult = rebuilt.getMessages().find((m) => m.toolCallId);
    expect(toolCall).toBeTruthy();
    expect(toolResult!.toolCallId).toBe(toolCall!.id);
  });
});
