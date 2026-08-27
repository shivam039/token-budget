import { runAdapterConformanceSuite, type AdapterUnderTest } from 'token-budget/test-utils';
import type { AddMessageInput, BudgetMessage } from 'token-budget';
import { toAnthropicMessages, fromAnthropicContext } from '../src/index.js';
import type { AnthropicContext } from '../src/index.js';

const anthropicAdapter: AdapterUnderTest<AnthropicContext> = {
  name: 'token-budget-anthropic',
  toExternal: (messages: BudgetMessage[]) => toAnthropicMessages(messages),
  fromExternal: (external: AnthropicContext): AddMessageInput[] => fromAnthropicContext(external),
  buildFixtureMessages: () => [
    { role: 'system', content: 'You are a helpful assistant.', pinned: true },
    { role: 'user', content: 'What is the weather in Paris?' },
    { id: 'toolu_1', role: 'assistant', content: [{ type: 'tool_call', id: 'toolu_1', name: 'get_weather', arguments: { city: 'Paris' } }] },
    { role: 'tool', content: [{ type: 'tool_result', toolUseId: 'toolu_1', result: 'Sunny, 22°C' }], toolCallId: 'toolu_1' },
    { role: 'assistant', content: 'The weather in Paris is sunny and 22°C.' },
  ],
};

runAdapterConformanceSuite(anthropicAdapter);
