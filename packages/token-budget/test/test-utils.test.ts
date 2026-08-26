import { runAdapterConformanceSuite, type AdapterUnderTest } from '../src/test-utils.js';
import type { AddMessageInput, BudgetMessage } from '../src/types.js';

/**
 * Dogfoods `runAdapterConformanceSuite` against a trivial passthrough
 * adapter, so the suite itself is covered and its contract is demonstrated
 * end-to-end (this is the same shape `token-budget-anthropic` and
 * `token-budget-openai` implement against their real wire formats).
 */
type ExternalMessage = Pick<BudgetMessage, 'role' | 'content' | 'toolCallId'> & { id: string; pinned?: boolean };

const passthroughAdapter: AdapterUnderTest<ExternalMessage[]> = {
  name: 'passthrough (reference)',
  toExternal: (messages) =>
    messages.map((m) => ({ id: m.id, role: m.role, content: m.content, pinned: m.pinned, toolCallId: m.toolCallId })),
  fromExternal: (external): AddMessageInput[] =>
    external.map((m) => ({ id: m.id, role: m.role, content: m.content, pinned: m.pinned, toolCallId: m.toolCallId })),
  buildFixtureMessages: () => [
    { role: 'system', content: 'You are a helpful assistant.', pinned: true },
    { role: 'user', content: 'What is the weather in Paris?' },
    { id: 'toolcall-1', role: 'assistant', content: [{ type: 'tool_call', name: 'get_weather', arguments: { city: 'Paris' } }] },
    { id: 'toolresult-1', role: 'tool', content: [{ type: 'tool_result', result: 'Sunny, 22°C' }], toolCallId: 'toolcall-1' },
    { role: 'assistant', content: 'The weather in Paris is sunny and 22°C.' },
  ],
};

runAdapterConformanceSuite(passthroughAdapter);
