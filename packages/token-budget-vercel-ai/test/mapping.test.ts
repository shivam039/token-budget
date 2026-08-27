import { describe, expect, it } from 'vitest';
import { TokenBudget } from 'token-budget';
import { toVercelMessages, fromVercelMessages, reconcileUsage } from '../src/index.js';
import type { CoreMessage } from '../src/index.js';

describe('toVercelMessages', () => {
  it('keeps the system message inline as role: system', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
    budget.addMessage({ role: 'user', content: 'hi' });

    const result = toVercelMessages(budget.getMessages());
    expect(result).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('accepts a getContext()-shaped object directly', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = await budget.getContext();
    expect(toVercelMessages(ctx)).toHaveLength(1);
  });

  it('maps a tool_call content block to a tool-call part', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({
      id: 'call_1',
      role: 'assistant',
      content: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: { city: 'Paris' } }],
    });
    const [message] = toVercelMessages(budget.getMessages());
    expect(message!.content).toEqual([{ type: 'tool-call', toolCallId: 'call_1', toolName: 'get_weather', args: { city: 'Paris' } }]);
  });

  it('maps internal "tool" role messages to role: tool with a tool-result part', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({
      role: 'tool',
      content: [{ type: 'tool_result', toolUseId: 'call_1', toolName: 'get_weather', result: 'Sunny' }],
      toolCallId: 'call_1',
    });
    const [message] = toVercelMessages(budget.getMessages());
    expect(message).toEqual({
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'get_weather', result: 'Sunny', isError: undefined }],
    });
  });

  it('falls back to JSON-stringified text for an unrecognized block type', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: [{ type: 'mystery', payload: 42 }] });
    const [message] = toVercelMessages(budget.getMessages());
    expect(message!.content).toEqual([{ type: 'text', text: JSON.stringify({ type: 'mystery', payload: 42 }) }]);
  });

  it('maps text + image multi-part content', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image', image: 'https://example.com/cat.png', mimeType: 'image/png' },
      ],
    });
    const [message] = toVercelMessages(budget.getMessages());
    expect(message!.content).toEqual([
      { type: 'text', text: 'What is in this image?' },
      { type: 'image', image: 'https://example.com/cat.png', mimeType: 'image/png' },
    ]);
  });
});

describe('fromVercelMessages', () => {
  it('restores a system message as pinned', () => {
    const messages: CoreMessage[] = [{ role: 'system', content: 'Be nice.' }];
    const [system] = fromVercelMessages(messages);
    expect(system).toEqual({ role: 'system', content: 'Be nice.', pinned: true });
  });

  it('restores tool-call/tool-result linkage via toolCallId', () => {
    const messages: CoreMessage[] = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'get_weather', args: { city: 'Paris' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'get_weather', result: 'Sunny' }] },
    ];
    const [call, result] = fromVercelMessages(messages);
    expect(call!.id).toBe('call_1');
    expect(result!.role).toBe('tool');
    expect(result!.toolCallId).toBe('call_1');
  });

  it('round-trips cleanly through a real TokenBudget (structural integrity)', () => {
    const messages: CoreMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call_9', toolName: 'x', args: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_9', toolName: 'x', result: 'ok' }] },
    ];
    const budget = new TokenBudget({ maxTokens: 100000 });
    for (const input of fromVercelMessages(messages)) budget.addMessage(input);
    expect(budget.getMessages()).toHaveLength(4);
    expect(budget.getMessages().some((m) => m.pinned)).toBe(true);
  });

  it('restores multi-part vision content', () => {
    const messages: CoreMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', image: 'https://x/y.png' }] }];
    const [message] = fromVercelMessages(messages);
    expect(message!.content).toEqual([{ type: 'text', text: 'look' }, { type: 'image', image: 'https://x/y.png', mimeType: undefined }]);
  });
});

describe('reconcileUsage', () => {
  it('reports drift between the local estimate and the SDK-reported usage', () => {
    const message = { id: '1', role: 'assistant' as const, content: 'hi', tokens: 5 };
    const result = reconcileUsage(message, { completionTokens: 8 });
    expect(result).toEqual({ estimatedTokens: 5, actualTokens: 8, driftTokens: 3 });
  });

  it('falls back to the estimate when usage omits completionTokens', () => {
    const message = { id: '1', role: 'assistant' as const, content: 'hi', tokens: 5 };
    const result = reconcileUsage(message, {});
    expect(result).toEqual({ estimatedTokens: 5, actualTokens: 5, driftTokens: 0 });
  });
});
