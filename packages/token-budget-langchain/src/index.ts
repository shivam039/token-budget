import type { AddMessageInput, BudgetMessage, ContentBlock, TokenBudget } from 'token-budget';
import type { LangChainContentPart, LangChainMessageLike, LangChainMessageType, LangChainToolCall } from './types.js';

export type { LangChainContentPart, LangChainMessageLike, LangChainMessageType, LangChainToolCall } from './types.js';

function stringField(block: ContentBlock, key: string): string {
  const value = block[key];
  return typeof value === 'string' ? value : '';
}

function metadataFor(message: BudgetMessage): { additional_kwargs: Record<string, unknown>; response_metadata: Record<string, unknown> } {
  const meta = message.metadata ?? {};
  return {
    additional_kwargs: (meta['additional_kwargs'] as Record<string, unknown>) ?? {},
    response_metadata: (meta['response_metadata'] as Record<string, unknown>) ?? {},
  };
}

function partToLangChain(block: ContentBlock): LangChainContentPart {
  if (block.type === 'image') return { type: 'image_url', image_url: { url: stringField(block, 'url') } };
  if (block.type === 'text') return { type: 'text', text: block.text ?? '' };
  return { type: 'text', text: JSON.stringify(block) };
}

function blockFromLangChain(part: LangChainContentPart): ContentBlock {
  if (part.type === 'image_url') return { type: 'image', url: typeof part.image_url === 'string' ? part.image_url : part.image_url.url };
  return { type: 'text', text: part.text };
}

function makeMessage(type: LangChainMessageType, fields: Omit<LangChainMessageLike, '_getType'>): LangChainMessageLike {
  return { ...fields, _getType: () => type };
}

/** FR2-1.4.1: converts a raw `BudgetMessage[]` or a `getContext()` result into LangChain `BaseMessage`-shaped objects. */
export function toLangChainMessages(context: { messages: BudgetMessage[] } | BudgetMessage[]): LangChainMessageLike[] {
  const messages = Array.isArray(context) ? context : context.messages;

  return messages.map((message): LangChainMessageLike => {
    const { additional_kwargs, response_metadata } = metadataFor(message);

    if (message.role === 'tool') {
      const block = Array.isArray(message.content) ? message.content.find((b) => b.type === 'tool_result') : undefined;
      const result = block ? block['result'] : undefined;
      return makeMessage('tool', {
        content: typeof result === 'string' ? result : JSON.stringify(result ?? ''),
        tool_call_id: message.toolCallId ?? (block ? stringField(block, 'toolUseId') : ''),
        additional_kwargs,
        response_metadata,
      });
    }

    const type: LangChainMessageType = message.role === 'system' ? 'system' : message.role === 'assistant' ? 'ai' : 'human';
    const toolCallBlocks = Array.isArray(message.content) ? message.content.filter((b) => b.type === 'tool_call') : [];
    const parts = typeof message.content === 'string' ? message.content : message.content.filter((b) => b.type !== 'tool_call').map(partToLangChain);
    const content = Array.isArray(parts) && parts.length === 0 ? '' : parts;

    return makeMessage(type, {
      content,
      additional_kwargs,
      response_metadata,
      name: message.name,
      tool_calls: toolCallBlocks.length > 0 ? toolCallBlocks.map((b) => ({ id: stringField(b, 'id'), name: stringField(b, 'name'), args: (b['arguments'] as Record<string, unknown>) ?? {} })) : undefined,
    });
  });
}

/**
 * Inverse of `toLangChainMessages` (FR2-1.4.1). Round-trips
 * `additional_kwargs`/`response_metadata` through `metadata` without loss
 * (FR2-1.4.3). Handles `AIMessage.tool_calls` and `ToolMessage`/legacy
 * `FunctionMessage`, restoring `toolCallId` linkage the same way as the
 * Anthropic/OpenAI adapters.
 */
export function fromLangChainMessages(messages: LangChainMessageLike[]): AddMessageInput[] {
  const pendingLegacyId = new Map<string, string>();

  return messages.map((message): AddMessageInput => {
    const metadata = { additional_kwargs: message.additional_kwargs ?? {}, response_metadata: message.response_metadata ?? {} };
    const content: BudgetMessage['content'] = typeof message.content === 'string' ? message.content : message.content.map(blockFromLangChain);
    const type = message._getType();

    if (type === 'system') return { role: 'system', content, pinned: true, metadata };
    if (type === 'tool') {
      return { id: `tool_result_${message.tool_call_id}`, role: 'tool', content: [{ type: 'tool_result', toolUseId: message.tool_call_id, result: message.content }], toolCallId: message.tool_call_id, metadata };
    }
    if (type === 'function') {
      const pendingId = message.name ? pendingLegacyId.get(message.name) : undefined;
      return { role: 'tool', content: [{ type: 'tool_result', toolUseId: pendingId, result: message.content }], toolCallId: pendingId, metadata };
    }
    if (type === 'ai' && message.tool_calls && message.tool_calls.length > 0) {
      const blocks: ContentBlock[] = typeof content === 'string' && content ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
      for (const call of message.tool_calls) blocks.push({ type: 'tool_call', id: call.id ?? call.name, name: call.name, arguments: call.args });
      return { id: message.tool_calls[0]!.id, role: 'assistant', content: blocks, metadata };
    }

    const role = type === 'ai' ? 'assistant' : 'user'; // 'human' and unrecognized/'generic' types both map to 'user'
    return { role, content, name: message.name, metadata };
  });
}

export interface TokenBudgetMemoryOptions {
  budget: TokenBudget;
  /** Key `loadMemoryVariables` returns the message history under. Default 'history'. */
  memoryKey?: string;
  /** Which `saveContext` input key holds the human turn. Auto-detected if there's exactly one key. */
  inputKey?: string;
  /** Which `saveContext` output key holds the AI turn. Auto-detected if there's exactly one key. */
  outputKey?: string;
}

function pickValue(values: Record<string, unknown>, key: string | undefined): unknown {
  if (key) return values[key];
  const keys = Object.keys(values);
  return keys.length === 1 ? values[keys[0]!] : undefined;
}

/**
 * FR2-1.4.2: a `BaseMemory`-shaped class (structurally compatible —
 * `loadMemoryVariables`/`saveContext`/`clear`, matching LangChain's
 * `BaseMemory` contract) that can be dropped into a `ConversationChain` or
 * agent's `memory` option with minimal changes, backed by a `TokenBudget`.
 */
export class TokenBudgetMemory {
  readonly budget: TokenBudget;
  private readonly memoryKeyValue: string;
  private readonly inputKey?: string;
  private readonly outputKey?: string;

  constructor(options: TokenBudgetMemoryOptions) {
    this.budget = options.budget;
    this.memoryKeyValue = options.memoryKey ?? 'history';
    this.inputKey = options.inputKey;
    this.outputKey = options.outputKey;
  }

  get memoryKeys(): string[] {
    return [this.memoryKeyValue];
  }

  async loadMemoryVariables(_values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ctx = await this.budget.getContext();
    return { [this.memoryKeyValue]: toLangChainMessages(ctx) };
  }

  async saveContext(inputValues: Record<string, unknown>, outputValues: Record<string, unknown>): Promise<void> {
    const input = pickValue(inputValues, this.inputKey);
    const output = pickValue(outputValues, this.outputKey);
    if (typeof input === 'string') this.budget.addMessage({ role: 'user', content: input });
    if (typeof output === 'string') this.budget.addMessage({ role: 'assistant', content: output });
    const ctx = await this.budget.getContext();
    this.budget.commit(ctx.messages);
  }

  async clear(): Promise<void> {
    this.budget.clear();
  }
}
