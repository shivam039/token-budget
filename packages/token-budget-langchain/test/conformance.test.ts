import { runAdapterConformanceSuite, type AdapterUnderTest } from '@shivam.dixit/token-budget/test-utils';
import type { AddMessageInput, BudgetMessage } from '@shivam.dixit/token-budget';
import { toLangChainMessages, fromLangChainMessages } from '../src/index.js';
import type { LangChainMessageLike } from '../src/index.js';

const langchainAdapter: AdapterUnderTest<LangChainMessageLike[]> = {
  name: 'token-budget-langchain',
  toExternal: (messages: BudgetMessage[]) => toLangChainMessages(messages),
  fromExternal: (external: LangChainMessageLike[]): AddMessageInput[] => fromLangChainMessages(external),
  buildFixtureMessages: () => [
    { role: 'system', content: 'You are a helpful assistant.', pinned: true },
    { role: 'user', content: 'What is the weather in Paris?' },
    { id: 'call_1', role: 'assistant', content: [{ type: 'tool_call', id: 'call_1', name: 'get_weather', arguments: { city: 'Paris' } }] },
    { role: 'tool', content: [{ type: 'tool_result', toolUseId: 'call_1', result: 'Sunny, 22°C' }], toolCallId: 'call_1' },
    { role: 'assistant', content: 'The weather in Paris is sunny and 22°C.' },
  ],
};

runAdapterConformanceSuite(langchainAdapter);
