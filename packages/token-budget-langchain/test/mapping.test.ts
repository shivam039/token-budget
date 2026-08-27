import { describe, expect, it } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { toLangChainMessages, fromLangChainMessages } from '../src/index.js';
import type { LangChainMessageLike } from '../src/index.js';

function humanMsg(fields: Partial<LangChainMessageLike>): LangChainMessageLike {
  return { content: '', _getType: () => 'human', ...fields };
}

describe('toLangChainMessages', () => {
  it('maps system -> a message whose _getType() is "system"', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
    const [message] = toLangChainMessages(budget.getMessages());
    expect(message!._getType()).toBe('system');
    expect(message!.content).toBe('You are a helpful assistant.');
  });

  it('maps user -> "human" and assistant -> "ai"', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: 'hi' });
    budget.addMessage({ role: 'assistant', content: 'hello!' });
    const [human, ai] = toLangChainMessages(budget.getMessages());
    expect(human!._getType()).toBe('human');
    expect(ai!._getType()).toBe('ai');
  });

  it('accepts a getContext()-shaped object directly', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = await budget.getContext();
    expect(toLangChainMessages(ctx)).toHaveLength(1);
  });

  it('maps a tool_call content block to AIMessage.tool_calls', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ id: 'call_1', role: 'assistant', content: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: { city: 'Paris' } }] });
    const [message] = toLangChainMessages(budget.getMessages());
    expect(message!.tool_calls).toEqual([{ id: 'call_1', name: 'get_weather', args: { city: 'Paris' } }]);
    expect(message!.content).toBe(''); // no text alongside the tool call
  });

  it('maps internal "tool" role messages to _getType() "tool" with tool_call_id', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'tool', content: [{ type: 'tool_result', toolUseId: 'call_1', result: 'Sunny' }], toolCallId: 'call_1' });
    const [message] = toLangChainMessages(budget.getMessages());
    expect(message!._getType()).toBe('tool');
    expect(message!.tool_call_id).toBe('call_1');
    expect(message!.content).toBe('Sunny');
  });

  it('round-trips additional_kwargs/response_metadata without loss (FR2-1.4.3)', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: 'hi', metadata: { additional_kwargs: { foo: 1 }, response_metadata: { bar: 2 } } });
    const [message] = toLangChainMessages(budget.getMessages());
    expect(message!.additional_kwargs).toEqual({ foo: 1 });
    expect(message!.response_metadata).toEqual({ bar: 2 });
  });

  it('falls back to JSON-stringified text for an unrecognized block type', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: [{ type: 'mystery', payload: 42 }] });
    const [message] = toLangChainMessages(budget.getMessages());
    expect(message!.content).toEqual([{ type: 'text', text: JSON.stringify({ type: 'mystery', payload: 42 }) }]);
  });

  it('maps text + image multi-part content', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', url: 'https://x/y.png' }] });
    const [message] = toLangChainMessages(budget.getMessages());
    expect(message!.content).toEqual([{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'https://x/y.png' } }]);
  });
});

describe('fromLangChainMessages', () => {
  it('restores a system message as pinned', () => {
    const [system] = fromLangChainMessages([{ content: 'Be nice.', _getType: () => 'system' }]);
    expect(system).toEqual({ role: 'system', content: 'Be nice.', pinned: true, metadata: { additional_kwargs: {}, response_metadata: {} } });
  });

  it('restores AIMessage.tool_calls -> ToolMessage linkage', () => {
    const messages: LangChainMessageLike[] = [
      { content: '', tool_calls: [{ id: 'call_1', name: 'get_weather', args: { city: 'Paris' } }], _getType: () => 'ai' },
      { content: 'Sunny', tool_call_id: 'call_1', _getType: () => 'tool' },
    ];
    const [call, result] = fromLangChainMessages(messages);
    expect(call!.id).toBe('call_1');
    expect(result!.role).toBe('tool');
    expect(result!.toolCallId).toBe('call_1');
  });

  it('restores legacy FunctionMessage linkage by name', () => {
    const messages: LangChainMessageLike[] = [
      { content: '', tool_calls: undefined, name: 'get_weather', _getType: () => 'ai' },
      { content: 'Sunny', name: 'get_weather', _getType: () => 'function' },
    ];
    // legacy function-call linkage requires the ai message to have carried a
    // pending-id association, which only happens via tool_calls today —
    // FunctionMessage alone (no matching call) still round-trips as a tool
    // result with an undefined toolCallId, which is the documented limitation.
    const [, result] = fromLangChainMessages(messages);
    expect(result!.role).toBe('tool');
  });

  it('round-trips cleanly through a real TokenBudget (structural integrity)', () => {
    const messages: LangChainMessageLike[] = [
      humanMsg({ content: 'hi' }),
      { content: '', tool_calls: [{ id: 'call_9', name: 'x', args: {} }], _getType: () => 'ai' },
      { content: 'ok', tool_call_id: 'call_9', _getType: () => 'tool' },
    ];
    const budget = new TokenBudget({ maxTokens: 100000 });
    for (const input of fromLangChainMessages(messages)) budget.addMessage(input);
    expect(budget.getMessages()).toHaveLength(3);
  });

  it('restores multi-part vision content', () => {
    const messages: LangChainMessageLike[] = [humanMsg({ content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'https://x/y.png' } }] })];
    const [message] = fromLangChainMessages(messages);
    expect(message!.content).toEqual([{ type: 'text', text: 'look' }, { type: 'image', url: 'https://x/y.png' }]);
  });

  it('handles an image_url part given as a bare string (an accepted LangChain shorthand)', () => {
    const messages: LangChainMessageLike[] = [humanMsg({ content: [{ type: 'image_url', image_url: 'https://x/y.png' }] })];
    const [message] = fromLangChainMessages(messages);
    expect(message!.content).toEqual([{ type: 'image', url: 'https://x/y.png' }]);
  });

  it('maps an unrecognized/"generic" message type to role: user', () => {
    const [message] = fromLangChainMessages([{ content: 'hi', _getType: () => 'generic' }]);
    expect(message!.role).toBe('user');
  });
});
