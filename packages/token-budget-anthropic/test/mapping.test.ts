import { describe, expect, it } from 'vitest';
import { TokenBudget } from 'token-budget';
import { toAnthropicMessages, fromAnthropicContext, fromAnthropicResponse, countAnthropicOverhead } from '../src/index.js';
import type { AnthropicContext, AnthropicResponse } from '../src/index.js';

describe('toAnthropicMessages', () => {
  it('splits pinned system messages into a separate system field', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
    budget.addMessage({ role: 'user', content: 'hi' });

    const result = toAnthropicMessages(budget.getMessages());
    expect(result.system).toBe('You are a helpful assistant.');
    expect(result.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('accepts a getContext()-shaped object directly', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = await budget.getContext();
    const result = toAnthropicMessages(ctx);
    expect(result.messages).toHaveLength(1);
  });

  it('maps internal "tool" role messages to Anthropic user-role tool_result blocks', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const call = budget.addMessage({ role: 'assistant', content: [{ type: 'tool_call', id: 'toolu_1', name: 'get_weather', arguments: { city: 'Paris' } }] });
    budget.addMessage({ role: 'tool', content: [{ type: 'tool_result', toolUseId: 'toolu_1', result: 'Sunny' }], toolCallId: call.id });

    const result = toAnthropicMessages(budget.getMessages());
    expect(result.messages[1]!.role).toBe('user');
    expect(result.messages[1]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Sunny', is_error: undefined }]);
  });

  it('maps image and document content blocks without data loss', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
        { type: 'document', source: { type: 'text', data: 'contents' }, title: 'notes.txt' },
      ],
    });
    const result = toAnthropicMessages(budget.getMessages());
    expect(result.messages[0]!.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
      { type: 'document', source: { type: 'text', data: 'contents' }, title: 'notes.txt' },
    ]);
  });

  it('falls back to JSON-stringified text for an unrecognized block type', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: [{ type: 'mystery', payload: 42 }] });
    const result = toAnthropicMessages(budget.getMessages());
    expect(result.messages[0]!.content).toEqual([{ type: 'text', text: JSON.stringify({ type: 'mystery', payload: 42 }) }]);
  });
});

describe('fromAnthropicContext', () => {
  it('restores the system field as a pinned system message', () => {
    const context: AnthropicContext = { system: 'Be nice.', messages: [{ role: 'user', content: 'hi' }] };
    const [system, user] = fromAnthropicContext(context);
    expect(system).toEqual({ role: 'system', content: 'Be nice.', pinned: true });
    expect(user!.role).toBe('user');
  });

  it('restores tool_use/tool_result linkage via id/toolCallId', () => {
    const context: AnthropicContext = {
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Paris' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Sunny' }] },
      ],
    };
    const [call, result] = fromAnthropicContext(context);
    expect(call!.id).toBe('toolu_1');
    expect(result!.role).toBe('tool');
    expect(result!.toolCallId).toBe('toolu_1');
  });

  it('restores image and document content blocks without data loss', () => {
    const context: AnthropicContext = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
            { type: 'document', source: { type: 'text', data: 'contents' }, title: 'notes.txt' },
          ],
        },
      ],
    };
    const [message] = fromAnthropicContext(context);
    expect(message!.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
      { type: 'document', source: { type: 'text', data: 'contents' }, title: 'notes.txt' },
    ]);
  });

  it('round-trips cleanly through a real TokenBudget (structural integrity)', () => {
    const context: AnthropicContext = {
      system: 'sys',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_9', name: 'x', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_9', content: 'ok' }] },
      ],
    };
    const budget = new TokenBudget({ maxTokens: 100000 });
    for (const input of fromAnthropicContext(context)) budget.addMessage(input);
    expect(budget.getMessages()).toHaveLength(4);
    expect(budget.getMessages().some((m) => m.pinned)).toBe(true);
  });
});

describe('fromAnthropicResponse', () => {
  it('appends a plain text reply', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const response: AnthropicResponse = { role: 'assistant', content: [{ type: 'text', text: 'hello!' }] };
    fromAnthropicResponse(response, budget);
    expect(budget.getMessages()).toHaveLength(1);
    expect(budget.getMessages()[0]!.role).toBe('assistant');
  });

  it('appends a reply containing a tool_use block, preserving its id', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const response: AnthropicResponse = {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_5', name: 'search', input: { q: 'weather' } }],
    };
    fromAnthropicResponse(response, budget);
    expect(budget.getMessages()[0]!.id).toBe('toolu_5');
  });
});

describe('countAnthropicOverhead', () => {
  it('returns a positive baseline overhead', () => {
    expect(countAnthropicOverhead({ id: '1', role: 'user', content: 'hi' })).toBeGreaterThan(0);
  });

  it('adds overhead for tool_use/tool_result content blocks', () => {
    const withoutTool = countAnthropicOverhead({ id: '1', role: 'user', content: 'hi' });
    const withTool = countAnthropicOverhead({ id: '1', role: 'assistant', content: [{ type: 'tool_call', id: 'x', name: 'y', arguments: {} }] });
    expect(withTool).toBeGreaterThan(withoutTool);
  });

  it('adds overhead per tool definition, scaled by schema size', () => {
    const base = countAnthropicOverhead({ id: '1', role: 'user', content: 'hi' }, []);
    const withTools = countAnthropicOverhead({ id: '1', role: 'user', content: 'hi' }, [
      { name: 'get_weather', input_schema: { type: 'object', properties: { city: { type: 'string' } } } },
    ]);
    expect(withTools).toBeGreaterThan(base);
  });
});
