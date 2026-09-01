/**
 * Deterministic synthetic-conversation generator — the single source of
 * truth for both the Hugging Face playground's "Generate long
 * conversation" button and scripts/generate-context-dataset.ts. Written
 * once here so neither reimplements the other (a browser bundle and a
 * Node script both import this same module); it produces plain
 * `BudgetMessage`-shaped objects and has no dependency on the DOM, Node
 * built-ins, or the token-budget package itself, so it works unmodified
 * in both environments.
 *
 * Deterministic: the same seed always produces the same conversation, so
 * a user (or a test) can reproduce exactly what they saw.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

/** Matches @shivam.dixit/token-budget's AddMessageInput shape closely enough to pass straight to addMessage(). */
export interface GeneratedMessage {
  id: string;
  role: Role;
  content: string;
  pinned?: boolean;
  priority?: number;
  toolCallId?: string;
}

export type ConversationCategory =
  | 'coding-agent'
  | 'research-agent'
  | 'customer-support'
  | 'tool-heavy-agent'
  | 'long-running-agent'
  | 'pinned-instruction'
  | 'tool-call-atomicity'
  | 'priority-based-context';

/** Small, seedable PRNG (mulberry32) — no external dependency, same output on every platform. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('generateConversation: pick() called with an empty array');
  return item;
}

const LOW_VALUE_FILLER = [
  'Got it, thanks.',
  'Sounds good.',
  'OK, let me check.',
  'Sure, one moment.',
  'Understood.',
  'Thanks for confirming.',
  'Noted, moving on.',
  'Will do.',
] as const;

const FILE_NAMES = ['src/auth.ts', 'src/routes/users.ts', 'src/middleware/session.ts', 'src/db/schema.ts', 'src/utils/jwt.ts'] as const;

/**
 * Generates a deterministic conversation of `messageCount` messages for
 * `category`, seeded by `seed` (default: a fixed constant so repeated
 * calls with the same arguments always match).
 *
 * Every category interleaves: a pinned system instruction, a mix of
 * "important" recent messages, atomic tool-call/tool-result pairs, and
 * repetitive low-value filler — so every generated conversation actually
 * demonstrates something about eviction, not just volume.
 */
export function generateConversation(
  category: ConversationCategory,
  messageCount: number,
  seed = 42,
): GeneratedMessage[] {
  const rng = mulberry32(seed + hashCategory(category));
  const messages: GeneratedMessage[] = [];
  let idCounter = 0;
  const nextId = (): string => `msg_${category}_${idCounter++}`;

  const pinnedInstruction = pinnedInstructionFor(category);
  messages.push({ id: nextId(), role: 'system', content: pinnedInstruction, pinned: true });

  let toolCallOpen: string | undefined;
  for (let i = 1; i < messageCount; i++) {
    const roll = rng();
    if (roll < 0.12 && messages.length > 2) {
      // A tool-call/tool-result pair — atomic by construction, generated together.
      const callId = nextId();
      messages.push({
        id: callId,
        role: 'assistant',
        content: `[tool_call] ${toolNameFor(category, rng)}(${toolArgsFor(category, rng)})`,
        priority: highPriorityMessage(rng) ? 5 : 2,
      });
      messages.push({
        id: nextId(),
        role: 'tool',
        content: toolResultFor(category, rng),
        toolCallId: callId,
        priority: highPriorityMessage(rng) ? 5 : 2,
      });
      i++; // consumed two slots
      continue;
    }
    if (roll < 0.35) {
      // Low-value, repetitive filler — the content that should get evicted first.
      messages.push({ id: nextId(), role: rng() < 0.5 ? 'user' : 'assistant', content: pick(rng, LOW_VALUE_FILLER), priority: 0 });
      continue;
    }
    // A substantive turn.
    const isImportant = highPriorityMessage(rng);
    messages.push({
      id: nextId(),
      role: i % 2 === 0 ? 'assistant' : 'user',
      content: substantiveMessageFor(category, i, rng),
      priority: isImportant ? 5 : 1,
    });
  }

  return messages;
}

function hashCategory(category: string): number {
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) | 0;
  return h;
}

function highPriorityMessage(rng: () => number): boolean {
  return rng() < 0.25;
}

function pinnedInstructionFor(category: ConversationCategory): string {
  switch (category) {
    case 'coding-agent':
    case 'tool-heavy-agent':
      return 'You are a coding assistant. Follow the user\'s requirements and preserve important project constraints (the app uses JWTs with refresh tokens, not sessions).';
    case 'research-agent':
      return 'You are a research assistant. Always cite the source of any claim you make from retrieved documents.';
    case 'customer-support':
      return 'You are a support agent for Acme Cloud. Be concise, and never share account credentials in plain text.';
    case 'long-running-agent':
      return 'You are a long-running autonomous agent. Track the current task state and never lose sight of the original objective.';
    case 'pinned-instruction':
      return 'You are a secure production coding assistant. Never expose credentials, API keys, or secrets in any response.';
    case 'tool-call-atomicity':
      return 'You are an assistant that calls external tools. Every tool call must be answered by exactly one tool result.';
    case 'priority-based-context':
      return 'You are an assistant prioritizing the current task above historical discussion.';
  }
}

function toolNameFor(category: ConversationCategory, rng: () => number): string {
  const byCategory: Record<ConversationCategory, readonly string[]> = {
    'coding-agent': ['read_file', 'run_tests', 'grep_codebase'],
    'tool-heavy-agent': ['read_file', 'run_tests', 'grep_codebase', 'lint'],
    'research-agent': ['web_search', 'fetch_document', 'summarize_source'],
    'customer-support': ['lookup_account', 'get_order_status', 'get_user_profile'],
    'long-running-agent': ['get_task_state', 'update_task_state', 'run_tests'],
    'pinned-instruction': ['read_file', 'get_user_profile'],
    'tool-call-atomicity': ['get_weather', 'get_user_profile'],
    'priority-based-context': ['read_file', 'get_task_state'],
  };
  return pick(rng, byCategory[category]);
}

function toolArgsFor(category: ConversationCategory, rng: () => number): string {
  if (category === 'coding-agent' || category === 'tool-heavy-agent' || category === 'pinned-instruction') {
    return `path: "${pick(rng, FILE_NAMES)}"`;
  }
  return 'query: "..."';
}

function toolResultFor(category: ConversationCategory, rng: () => number): string {
  switch (category) {
    case 'tool-call-atomicity':
      return rng() < 0.5 ? 'Temperature: 28°C, clear skies.' : '{ "userId": "u_42", "plan": "pro" }';
    default:
      return `Result: ${Math.floor(rng() * 1000)} lines returned, no errors.`;
  }
}

function substantiveMessageFor(category: ConversationCategory, index: number, rng: () => number): string {
  const options: Record<ConversationCategory, readonly string[]> = {
    'coding-agent': [
      'We should first decide whether the application uses sessions or JWTs.',
      'The application uses JWTs.',
      'Then we should use a refresh-token rotation strategy for security.',
      'Also make sure the solution works with refresh tokens.',
      `Let's implement the middleware in ${pick(rng, FILE_NAMES)}.`,
    ],
    'tool-heavy-agent': [
      'The test suite is currently failing on the auth middleware.',
      'Let me check the recent commits that touched that file.',
      'I found the regression — a missing null check on the refresh token.',
    ],
    'research-agent': [
      'According to the retrieved paper, the method achieves a 12% improvement.',
      'The second source contradicts the first on this specific claim.',
      'Let me cross-reference this against the primary source.',
    ],
    'customer-support': [
      'Hi, I was double-charged on my last invoice.',
      "I've found the duplicate charge and I'm processing a refund now.",
      'How long will the refund take to appear?',
    ],
    'long-running-agent': [
      'Current objective: migrate the billing service to the new schema.',
      'Step 3 of 7 complete: schema migration applied to staging.',
      'Reminder: the original objective was a zero-downtime migration.',
    ],
    'pinned-instruction': [
      'Can you show me the current database connection string?',
      "I can't share credentials directly, but here's how to retrieve them securely.",
      'Understood — use the secrets manager instead.',
    ],
    'tool-call-atomicity': ["What's the weather like for tomorrow's deploy window?", 'Let me check the current account plan too.'],
    'priority-based-context': [
      'Earlier we discussed unrelated formatting preferences.',
      'The current task takes priority: fix the failing deploy.',
      'Focus on the deploy issue, not the earlier formatting question.',
    ],
  };
  return pick(rng, options[category]) + (index % 7 === 0 ? ' (turn ' + index + ')' : '');
}

export const ALL_CATEGORIES: readonly ConversationCategory[] = [
  'coding-agent',
  'research-agent',
  'customer-support',
  'tool-heavy-agent',
  'long-running-agent',
  'pinned-instruction',
  'tool-call-atomicity',
  'priority-based-context',
];
