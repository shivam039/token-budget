import type { AddMessageInput, BudgetMessage, ContentBlock, TokenBudget } from '@shivam.dixit/token-budget';
import type { OpenAIContentPart, OpenAIImagePart, OpenAIMessage, OpenAIResponse, OpenAIToolCall } from './types.js';

export type { OpenAIContentPart, OpenAIMessage, OpenAIResponse, OpenAIToolCall } from './types.js';

function stringField(block: ContentBlock, key: string): string {
  const value = block[key];
  return typeof value === 'string' ? value : '';
}

function resultToString(result: unknown): string {
  return typeof result === 'string' ? result : JSON.stringify(result ?? '');
}

function safeParseArguments(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { raw: json };
  }
}

let idCounter = 0;
function genId(): string {
  const cryptoObj: { randomUUID?: () => string } | undefined = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  idCounter += 1;
  return `openai_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

function contentToOpenAIParts(content: BudgetMessage['content']): string | OpenAIContentPart[] | null {
  if (typeof content === 'string') return content;
  const parts: OpenAIContentPart[] = content
    .filter((b) => b.type === 'text' || b.type === 'image')
    .map((b) =>
      b.type === 'image'
        ? { type: 'image_url' as const, image_url: { url: stringField(b, 'url'), detail: b['detail'] as OpenAIImagePart['image_url']['detail'] } }
        : { type: 'text' as const, text: b.text ?? '' },
    );
  return parts.length > 0 ? parts : null;
}

function contentFromOpenAI(content: OpenAIMessage['content']): BudgetMessage['content'] {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  return content.map((part): ContentBlock =>
    part.type === 'image_url' ? { type: 'image', url: part.image_url.url, detail: part.image_url.detail } : { type: 'text', text: part.text },
  );
}

/** FR2-1.2.1: keeps the system message inline (OpenAI has no separate system field). */
export function toOpenAIMessages(context: { messages: BudgetMessage[] } | BudgetMessage[]): OpenAIMessage[] {
  const messages = Array.isArray(context) ? context : context.messages;

  return messages.map((message): OpenAIMessage => {
    if (message.role === 'tool') {
      const block = Array.isArray(message.content) ? message.content.find((b) => b.type === 'tool_result') : undefined;
      return { role: 'tool', tool_call_id: message.toolCallId ?? (block ? stringField(block, 'toolUseId') : ''), content: block ? resultToString(block['result']) : '' };
    }

    const toolCalls = Array.isArray(message.content) ? message.content.filter((b) => b.type === 'tool_call') : [];
    const out: OpenAIMessage = { role: message.role, content: contentToOpenAIParts(message.content) };
    if (message.name) out.name = message.name;
    if (toolCalls.length > 0) {
      out.tool_calls = toolCalls.map((b) => ({ id: stringField(b, 'id'), type: 'function', function: { name: stringField(b, 'name'), arguments: JSON.stringify(b['arguments'] ?? {}) } }));
    }
    return out;
  });
}

/**
 * Inverse of `toOpenAIMessages`. Handles both `tool_calls` (new-style,
 * possibly multiple per turn) and the legacy single `function_call` /
 * `function`-role format (FR2-1.2.2), restoring `toolCallId` linkage for
 * either. Legacy calls carry no id on the wire, so one is synthesized and
 * matched to its `function`-role result by function name.
 */
export function fromOpenAIMessages(messages: OpenAIMessage[]): AddMessageInput[] {
  const out: AddMessageInput[] = [];
  const pendingLegacyId = new Map<string, string>();

  for (const message of messages) {
    if (message.role === 'system') {
      out.push({ role: 'system', content: contentFromOpenAI(message.content), pinned: true });
    } else if (message.role === 'tool') {
      out.push({ id: genId(), role: 'tool', content: [{ type: 'tool_result', toolUseId: message.tool_call_id, result: message.content }], toolCallId: message.tool_call_id });
    } else if (message.role === 'function') {
      const pendingId = message.name ? pendingLegacyId.get(message.name) : undefined;
      out.push({ id: genId(), role: 'tool', content: [{ type: 'tool_result', toolUseId: pendingId, result: message.content }], toolCallId: pendingId });
    } else if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
      const blocks: ContentBlock[] = [];
      const text = contentFromOpenAI(message.content);
      if (typeof text === 'string' && text) blocks.push({ type: 'text', text });
      for (const call of message.tool_calls) blocks.push({ type: 'tool_call', id: call.id, name: call.function.name, arguments: safeParseArguments(call.function.arguments) });
      out.push({ id: message.tool_calls[0]!.id, role: 'assistant', content: blocks });
    } else if (message.role === 'assistant' && message.function_call) {
      const id = genId();
      pendingLegacyId.set(message.function_call.name, id);
      out.push({ id, role: 'assistant', content: [{ type: 'tool_call', id, name: message.function_call.name, arguments: safeParseArguments(message.function_call.arguments) }] });
    } else {
      out.push({ role: message.role as 'user' | 'assistant', content: contentFromOpenAI(message.content) });
    }
  }
  return out;
}

/** FR2-1.2.2: appends an OpenAI Chat Completions response back into the budget. */
export function fromOpenAIResponse(response: OpenAIResponse, budget: TokenBudget): void {
  const message = response.choices[0]?.message;
  if (!message) return;
  const [input] = fromOpenAIMessages([message]);
  if (input) budget.addMessage(input);
}

interface OverheadProfile {
  tokensPerMessage: number;
  tokensPerName: number;
}

const OVERHEAD_TABLE: Array<{ prefix: string } & OverheadProfile> = [
  { prefix: 'gpt-3.5-turbo-0301', tokensPerMessage: 4, tokensPerName: -1 },
  { prefix: 'gpt-3.5-turbo', tokensPerMessage: 3, tokensPerName: 1 },
  { prefix: 'gpt-4', tokensPerMessage: 3, tokensPerName: 1 },
  { prefix: 'o1', tokensPerMessage: 3, tokensPerName: 1 },
  { prefix: 'o3', tokensPerMessage: 3, tokensPerName: 1 },
];
const DEFAULT_OVERHEAD: OverheadProfile = { tokensPerMessage: 3, tokensPerName: 1 };

/**
 * FR2-1.2.3: OpenAI's documented per-message/per-name token overhead
 * formula, looked up by model-name prefix, with a reasonable fallback for
 * unrecognized models. Returns a function compatible with `TokenBudget`'s
 * `messageOverhead` config option.
 */
export function createOpenAIMessageOverhead(model = 'gpt-4o'): (message: BudgetMessage) => number {
  const profile = OVERHEAD_TABLE.find((entry) => model.startsWith(entry.prefix)) ?? DEFAULT_OVERHEAD;
  return (message: BudgetMessage) => profile.tokensPerMessage + (message.name ? profile.tokensPerName : 0);
}
