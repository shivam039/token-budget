/**
 * Preloaded conversation examples and context-size presets. Model context
 * windows are pulled directly from @shivam.dixit/token-budget's own
 * exported MODEL_CONTEXT_WINDOWS table — never hardcoded here — so this
 * file can't drift from what the library actually knows.
 */
import { MODEL_CONTEXT_WINDOWS } from '@shivam.dixit/token-budget';
import type { EditableMessage } from './state.js';

let idCounter = 0;
function id(): string {
  return `demo_${idCounter++}`;
}

function msg(partial: Omit<EditableMessage, 'id'> & { id?: string }): EditableMessage {
  return { id: partial.id ?? id(), ...partial };
}

/**
 * The coding-agent JWT/auth example from the task brief, expanded with
 * enough earlier low-value turns that it actually overflows a small
 * budget — a preset that doesn't demonstrate eviction doesn't demonstrate
 * anything.
 */
export function codingAgentExample(): EditableMessage[] {
  const messages: EditableMessage[] = [
    msg({ role: 'system', content: "You are a coding assistant. Follow the user's requirements and preserve important project constraints.", pinned: true }),
    msg({ role: 'user', content: 'Can you review the linting config first?' }),
    msg({ role: 'assistant', content: 'Sure, it looks standard — ESLint with the recommended TypeScript rules.' }),
    msg({ role: 'user', content: "What's our current test coverage?" }),
    msg({ role: 'assistant', content: 'Around 82% across the repo, mostly missing edge cases in the API layer.' }),
    msg({ role: 'user', content: 'Help me implement authentication.' }),
    msg({ role: 'assistant', content: 'Sure. We should first decide whether the application uses sessions or JWTs.' }),
    msg({ role: 'user', content: 'The application uses JWTs.', priority: 5 }),
    msg({ role: 'assistant', content: 'Then we should use short-lived access tokens with a separate refresh-token rotation strategy.', priority: 5 }),
  ];
  const callId = id();
  messages.push(msg({ id: callId, role: 'assistant', content: '[tool_call] get_user_profile(userId: "current")', priority: 5 }));
  messages.push(msg({ role: 'tool', content: '{ "id": "u_1", "roles": ["admin"], "mfaEnabled": true }', toolCallId: callId, priority: 5 }));
  messages.push(msg({ role: 'user', content: 'Also make sure the solution works with refresh tokens.', priority: 5 }));
  messages.push(msg({ role: 'assistant', content: "Got it — I'll add refresh-token rotation with a revocation list on logout.", priority: 5 }));
  return messages;
}

/** Demonstrates a pinned system prompt surviving heavy eviction under a small budget. */
export function pinnedMessageDemo(): EditableMessage[] {
  const messages: EditableMessage[] = [
    msg({ role: 'system', content: 'You are a secure production coding assistant. Never expose credentials.', pinned: true }),
  ];
  for (let i = 0; i < 24; i++) {
    messages.push(msg({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Turn ${i + 1}: routine conversational filler, nothing critical.` }));
  }
  return messages;
}

/** Demonstrates atomic tool-call/tool-result pairing under a small budget. */
export function toolAtomicityDemo(): EditableMessage[] {
  const messages: EditableMessage[] = [
    msg({ role: 'system', content: 'You are an assistant that calls external tools.', pinned: true }),
  ];
  for (let i = 0; i < 3; i++) {
    messages.push(msg({ role: 'user', content: `Small talk turn ${i + 1}.` }));
  }
  const callId = id();
  messages.push(msg({ id: callId, role: 'assistant', content: '[tool_call] get_weather(city: "Paris")' }));
  messages.push(msg({ role: 'tool', content: 'Temperature: 28°C, clear skies.', toolCallId: callId }));
  for (let i = 0; i < 6; i++) {
    messages.push(msg({ role: i % 2 === 0 ? 'user' : 'assistant', content: `More small talk, turn ${i + 4}.` }));
  }
  return messages;
}

export interface ContextPreset {
  label: string;
  maxTokens: number;
  source: string;
}

/** Small/Medium/Large are arbitrary demo sizes, labeled as such. Model presets come directly from the library's own table. */
export function contextPresets(): ContextPreset[] {
  const arbitrary: ContextPreset[] = [
    { label: 'Small (600 tokens, demo)', maxTokens: 600, source: 'Arbitrary demo size, not tied to any model.' },
    { label: 'Medium (4,000 tokens, demo)', maxTokens: 4000, source: 'Arbitrary demo size, not tied to any model.' },
    { label: 'Large (16,000 tokens, demo)', maxTokens: 16000, source: 'Arbitrary demo size, not tied to any model.' },
  ];
  const modelPresets: ContextPreset[] = Object.entries(MODEL_CONTEXT_WINDOWS).map(([model, tokens]) => ({
    label: `${model} (${tokens.toLocaleString()} tokens)`,
    maxTokens: tokens,
    source: 'From @shivam.dixit/token-budget\'s own MODEL_CONTEXT_WINDOWS table — see docs/model-budgets.md.',
  }));
  return [...arbitrary, ...modelPresets];
}
