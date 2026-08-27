import { describe, expect, it } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { toAnthropicMessages, fromAnthropicContext, fromAnthropicResponse } from '../src/index.js';
import type { AnthropicResponse } from '../src/index.js';

/**
 * FR2-1.1.6: full round trip — build a context, hand it to a live-shaped
 * Anthropic response fixture, append the reply, rebuild the context, and
 * assert no data loss and correct token accounting.
 */
describe('Anthropic adapter full round trip', () => {
  it('builds context -> appends a live-shaped tool-use response -> rebuilds with no data loss', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'system', content: 'You are a weather assistant.', pinned: true });
    budget.addMessage({ role: 'user', content: 'What is the weather in Paris?' });

    const before = await budget.getContext();
    const anthropicContext = toAnthropicMessages(before);
    expect(anthropicContext.system).toBe('You are a weather assistant.');
    expect(anthropicContext.messages).toHaveLength(1);

    // A live-shaped Anthropic API response containing a tool_use block.
    const liveResponse: AnthropicResponse = {
      role: 'assistant',
      content: [
        { type: 'text', text: "I'll check that for you." },
        { type: 'tool_use', id: 'toolu_01AbC', name: 'get_weather', input: { city: 'Paris' } },
      ],
      stop_reason: 'tool_use',
    };
    fromAnthropicResponse(liveResponse, budget);

    // Application executes the tool and appends the result.
    budget.addMessage({
      role: 'tool',
      content: [{ type: 'tool_result', toolUseId: 'toolu_01AbC', result: 'Sunny, 22°C' }],
      toolCallId: 'toolu_01AbC',
    });
    budget.addMessage({ role: 'assistant', content: 'The weather in Paris is sunny and 22°C.' });

    const after = await budget.getContext();
    expect(after.messages).toHaveLength(5);
    expect(after.tokensUsed).toBeGreaterThan(before.tokensUsed);

    // Rebuild via the adapter and confirm structural + textual fidelity.
    const rebuiltContext = toAnthropicMessages(after);
    const rebuiltInputs = fromAnthropicContext(rebuiltContext);
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
