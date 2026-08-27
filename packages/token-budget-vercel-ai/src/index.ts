import type { AddMessageInput, BudgetMessage, ContentBlock, TokenBudget } from '@shivam.dixit/token-budget';
import type {
  CoreAssistantMessage,
  CoreMessage,
  CoreToolMessage,
  CoreUserMessage,
  VercelAssistantPart,
  VercelUsage,
  VercelUserPart,
} from './types.js';

export type {
  CoreAssistantMessage,
  CoreMessage,
  CoreSystemMessage,
  CoreToolMessage,
  CoreUserMessage,
  VercelUsage,
} from './types.js';

function stringField(block: ContentBlock, key: string): string {
  const value = block[key];
  return typeof value === 'string' ? value : '';
}

function partToVercel(block: ContentBlock): VercelUserPart | VercelAssistantPart {
  switch (block.type) {
    case 'image':
      return { type: 'image', image: stringField(block, 'image') || stringField(block, 'url'), mimeType: typeof block['mimeType'] === 'string' ? (block['mimeType'] as string) : undefined };
    case 'tool_call':
      return { type: 'tool-call', toolCallId: stringField(block, 'id'), toolName: stringField(block, 'name'), args: (block['arguments'] as Record<string, unknown>) ?? {} };
    case 'text':
      return { type: 'text', text: block.text ?? '' };
    default:
      return { type: 'text', text: JSON.stringify(block) };
  }
}

function blockFromVercelPart(part: VercelUserPart | VercelAssistantPart): ContentBlock {
  switch (part.type) {
    case 'image':
      return { type: 'image', image: part.image, mimeType: part.mimeType };
    case 'tool-call':
      return { type: 'tool_call', id: part.toolCallId, name: part.toolName, arguments: part.args };
    case 'text':
      return { type: 'text', text: part.text };
  }
}

/** FR2-1.3.1: converts a raw `BudgetMessage[]` or a `getContext()` result into Vercel AI SDK `CoreMessage[]`. */
export function toVercelMessages(context: { messages: BudgetMessage[] } | BudgetMessage[]): CoreMessage[] {
  const messages = Array.isArray(context) ? context : context.messages;

  return messages.map((message): CoreMessage => {
    if (message.role === 'system') {
      return { role: 'system', content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) };
    }
    if (message.role === 'tool') {
      const blocks = Array.isArray(message.content) ? message.content.filter((b) => b.type === 'tool_result') : [];
      return {
        role: 'tool',
        content: blocks.map((b) => ({
          type: 'tool-result' as const,
          toolCallId: message.toolCallId ?? stringField(b, 'toolUseId'),
          toolName: stringField(b, 'toolName') || 'unknown',
          result: b['result'],
          isError: typeof b['isError'] === 'boolean' ? (b['isError'] as boolean) : undefined,
        })),
      };
    }
    const content = typeof message.content === 'string' ? message.content : message.content.map(partToVercel);
    return { role: message.role, content } as CoreAssistantMessage | CoreUserMessage;
  });
}

/** Inverse of `toVercelMessages`. Restores tool-call/tool-result linkage via `toolCallId` (FR2-1.3.1). */
export function fromVercelMessages(messages: CoreMessage[]): AddMessageInput[] {
  return messages.map((message): AddMessageInput => {
    if (message.role === 'system') return { role: 'system', content: message.content, pinned: true };

    if (message.role === 'tool') {
      const [first] = message.content;
      return {
        id: first ? `tool_result_${first.toolCallId}` : undefined,
        role: 'tool',
        content: message.content.map((p) => ({ type: 'tool_result', toolUseId: p.toolCallId, toolName: p.toolName, result: p.result, isError: p.isError })),
        toolCallId: first?.toolCallId,
      };
    }

    const content = typeof message.content === 'string' ? message.content : message.content.map(blockFromVercelPart);
    const toolCall = Array.isArray(content) ? content.find((b) => b.type === 'tool_call') : undefined;
    return { id: toolCall ? stringField(toolCall, 'id') : undefined, role: message.role, content };
  });
}

export interface StreamTextIntoBudgetOptions {
  /** Stream/message id. Defaults to a generated one. */
  id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * FR2-1.3.3: pipes a Vercel AI SDK `streamText()` result's `textStream`
 * into the Phase 2 streaming API (`beginStream`/`appendStreamChunk`/
 * `endStream`) chunk by chunk, so partial tokens are counted as they
 * arrive. On an upstream error, finalizes whatever was received so far
 * (`abortStream(id, 'keep-partial')`) before rethrowing.
 */
export async function streamTextIntoBudget(
  textStream: AsyncIterable<string>,
  budget: TokenBudget,
  options: StreamTextIntoBudgetOptions = {},
): Promise<BudgetMessage> {
  const id = options.id ?? `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  budget.beginStream(id, 'assistant', options.metadata);
  try {
    for await (const chunk of textStream) budget.appendStreamChunk(id, chunk);
  } catch (error) {
    budget.abortStream(id, 'keep-partial');
    throw error;
  }
  return budget.endStream(id);
}

export interface UsageReconciliation {
  estimatedTokens: number;
  actualTokens: number;
  driftTokens: number;
}

/**
 * FR2-1.3.4: compares a finalized streamed message's token estimate
 * against the Vercel AI SDK's own reported usage (from `streamText`'s
 * `onFinish` callback), for logging/telemetry. Does not mutate the
 * budget's ledger — `endStream()` already reconciled the estimate against
 * this package's own tokenizer; `usage` is the provider's ground truth,
 * which may differ from any local tokenizer's count.
 */
export function reconcileUsage(message: BudgetMessage, usage: VercelUsage): UsageReconciliation {
  const estimatedTokens = message.tokens ?? 0;
  const actualTokens = usage.completionTokens ?? estimatedTokens;
  return { estimatedTokens, actualTokens, driftTokens: actualTokens - estimatedTokens };
}
