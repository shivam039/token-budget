import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { toOpenAIMessages, fromOpenAIMessages, fromOpenAIResponse, createOpenAIMessageOverhead } from '../src/index.js';
import type { OpenAIMessage, OpenAIResponse } from '../src/index.js';

describe('toOpenAIMessages', () => {
  it('keeps the system message inline as role: system', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
    budget.addMessage({ role: 'user', content: 'hi' });

    const result = toOpenAIMessages(budget.getMessages());
    expect(result).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('accepts a getContext()-shaped object directly', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = await budget.getContext();
    expect(toOpenAIMessages(ctx)).toHaveLength(1);
  });

  it('maps a tool_call content block to a new-style tool_calls entry', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({
      id: 'call_1',
      role: 'assistant',
      content: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: { city: 'Paris' } }],
    });
    const [message] = toOpenAIMessages(budget.getMessages());
    expect(message!.tool_calls).toEqual([{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: JSON.stringify({ city: 'Paris' }) } }]);
  });

  it('maps internal "tool" role messages to role: tool with tool_call_id', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({
      role: 'tool',
      content: [{ type: 'tool_result', toolUseId: 'call_1', result: 'Sunny' }],
      toolCallId: 'call_1',
    });
    const [message] = toOpenAIMessages(budget.getMessages());
    expect(message).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'Sunny' });
  });

  it('maps text + image_url multi-part vision content', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'image', url: 'https://example.com/cat.png', detail: 'high' },
      ],
    });
    const [message] = toOpenAIMessages(budget.getMessages());
    expect(message!.content).toEqual([
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'https://example.com/cat.png', detail: 'high' } },
    ]);
  });
});

describe('fromOpenAIMessages', () => {
  it('restores a system message as pinned', () => {
    const messages: OpenAIMessage[] = [{ role: 'system', content: 'Be nice.' }];
    const [system] = fromOpenAIMessages(messages);
    expect(system).toEqual({ role: 'system', content: 'Be nice.', pinned: true });
  });

  it('restores new-style tool_calls -> tool linkage', () => {
    const messages: OpenAIMessage[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'Sunny' },
    ];
    const [call, result] = fromOpenAIMessages(messages);
    expect(call!.id).toBe('call_1');
    expect(result!.role).toBe('tool');
    expect(result!.toolCallId).toBe('call_1');
  });

  it('supports multiple tool_calls in a single assistant turn', () => {
    const messages: OpenAIMessage[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'a', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'b', arguments: '{}' } },
        ],
      },
    ];
    const [call] = fromOpenAIMessages(messages);
    expect(Array.isArray(call!.content) && call!.content).toHaveLength(2);
  });

  it('restores legacy function_call -> function-role linkage by name', () => {
    const messages: OpenAIMessage[] = [
      { role: 'assistant', content: null, function_call: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
      { role: 'function', name: 'get_weather', content: 'Sunny' },
    ];
    const [call, result] = fromOpenAIMessages(messages);
    expect(result!.role).toBe('tool');
    expect(result!.toolCallId).toBe(call!.id);
  });

  it('falls back to a raw-argument object when function arguments are not valid JSON', () => {
    const messages: OpenAIMessage[] = [{ role: 'assistant', content: null, function_call: { name: 'x', arguments: 'not json' } }];
    const [call] = fromOpenAIMessages(messages);
    const block = Array.isArray(call!.content) ? call!.content[0] : undefined;
    expect(block!['arguments']).toEqual({ raw: 'not json' });
  });

  it('restores multi-part vision content', () => {
    const messages: OpenAIMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'https://x/y.png' } }] },
    ];
    const [message] = fromOpenAIMessages(messages);
    expect(message!.content).toEqual([{ type: 'text', text: 'look' }, { type: 'image', url: 'https://x/y.png', detail: undefined }]);
  });

  it('treats null content as an empty string', () => {
    const [message] = fromOpenAIMessages([{ role: 'user', content: null }]);
    expect(message!.content).toBe('');
  });

  it('falls back to a counter-based id when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const messages: OpenAIMessage[] = [{ role: 'tool', tool_call_id: 'call_1', content: 'ok' }];
      const [result] = fromOpenAIMessages(messages);
      expect(result!.id).toMatch(/^openai_/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('fromOpenAIResponse', () => {
  it('appends the first choice as an assistant message', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const response: OpenAIResponse = { choices: [{ message: { role: 'assistant', content: 'hello!' } }] };
    fromOpenAIResponse(response, budget);
    expect(budget.getMessages()).toHaveLength(1);
    expect(budget.getMessages()[0]!.role).toBe('assistant');
  });

  it('is a no-op when there are no choices', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    fromOpenAIResponse({ choices: [] }, budget);
    expect(budget.getMessages()).toHaveLength(0);
  });

  it('preserves a tool_calls id when appending', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const response: OpenAIResponse = {
      choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'search', arguments: '{}' } }] } }],
    };
    fromOpenAIResponse(response, budget);
    expect(budget.getMessages()[0]!.id).toBe('call_9');
  });
});

describe('createOpenAIMessageOverhead', () => {
  it('returns tokens_per_message plus tokens_per_name when a name is present', () => {
    const overhead = createOpenAIMessageOverhead('gpt-4o');
    expect(overhead({ id: '1', role: 'user', content: 'hi' })).toBe(3);
    expect(overhead({ id: '1', role: 'user', content: 'hi', name: 'alice' })).toBe(4);
  });

  it('uses the gpt-3.5-turbo-0301 quirks (tokens_per_name: -1)', () => {
    const overhead = createOpenAIMessageOverhead('gpt-3.5-turbo-0301');
    expect(overhead({ id: '1', role: 'user', content: 'hi' })).toBe(4);
    expect(overhead({ id: '1', role: 'user', content: 'hi', name: 'alice' })).toBe(3);
  });

  it('falls back to the default profile for an unrecognized model', () => {
    const overhead = createOpenAIMessageOverhead('some-future-model-9000');
    expect(overhead({ id: '1', role: 'user', content: 'hi' })).toBe(3);
  });
});
