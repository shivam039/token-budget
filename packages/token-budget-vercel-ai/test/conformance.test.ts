import { runAdapterConformanceSuite, type AdapterUnderTest } from 'token-budget/test-utils';
import type { AddMessageInput, BudgetMessage } from 'token-budget';
import { toVercelMessages, fromVercelMessages } from '../src/index.js';
import type { CoreMessage } from '../src/index.js';

const vercelAdapter: AdapterUnderTest<CoreMessage[]> = {
  name: 'token-budget-vercel-ai',
  toExternal: (messages: BudgetMessage[]) => toVercelMessages(messages),
  fromExternal: (external: CoreMessage[]): AddMessageInput[] => fromVercelMessages(external),
  buildFixtureMessages: () => [
    { role: 'system', content: 'You are a helpful assistant.', pinned: true },
    { role: 'user', content: 'What is the weather in Paris?' },
    { id: 'call_1', role: 'assistant', content: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: { city: 'Paris' } }] },
    { role: 'tool', content: [{ type: 'tool_result', toolUseId: 'call_1', toolName: 'get_weather', result: 'Sunny, 22°C' }], toolCallId: 'call_1' },
    { role: 'assistant', content: 'The weather in Paris is sunny and 22°C.' },
  ],
};

runAdapterConformanceSuite(vercelAdapter);
