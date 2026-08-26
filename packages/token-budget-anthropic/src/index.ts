import type { AddMessageInput, BudgetMessage, ContentBlock, TokenBudget } from 'token-budget';
import type {
  AnthropicContentBlock,
  AnthropicContext,
  AnthropicDocumentSource,
  AnthropicImageSource,
  AnthropicMessage,
  AnthropicResponse,
  AnthropicToolDefinition,
  AnthropicToolResultBlock,
} from './types.js';

export type {
  AnthropicContentBlock,
  AnthropicContext,
  AnthropicMessage,
  AnthropicResponse,
  AnthropicToolDefinition,
} from './types.js';

function stringField(block: ContentBlock, key: string): string {
  const value = block[key];
  return typeof value === 'string' ? value : '';
}

function blockToAnthropic(block: ContentBlock): AnthropicContentBlock {
  switch (block.type) {
    case 'tool_call':
      return {
        type: 'tool_use',
        id: stringField(block, 'id'),
        name: stringField(block, 'name'),
        input: (block['arguments'] as Record<string, unknown>) ?? {},
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: stringField(block, 'toolUseId'),
        content: typeof block['result'] === 'string' ? (block['result'] as string) : JSON.stringify(block['result'] ?? ''),
        is_error: typeof block['isError'] === 'boolean' ? (block['isError'] as boolean) : undefined,
      };
    case 'image':
      return { type: 'image', source: block['source'] as AnthropicImageSource };
    case 'document':
      return {
        type: 'document',
        source: block['source'] as AnthropicDocumentSource,
        title: typeof block['title'] === 'string' ? (block['title'] as string) : undefined,
      };
    case 'text':
      return { type: 'text', text: block.text ?? '' };
    default:
      return { type: 'text', text: JSON.stringify(block) };
  }
}

function blockFromAnthropic(block: AnthropicContentBlock): ContentBlock {
  switch (block.type) {
    case 'tool_use':
      return { type: 'tool_call', id: block.id, name: block.name, arguments: block.input };
    case 'tool_result':
      return { type: 'tool_result', toolUseId: block.tool_use_id, result: block.content, isError: block.is_error };
    case 'image':
      return { type: 'image', source: block.source };
    case 'document':
      return { type: 'document', source: block.source, title: block.title };
    case 'text':
      return { type: 'text', text: block.text };
  }
}

function contentToAnthropic(content: BudgetMessage['content']): string | AnthropicContentBlock[] {
  return typeof content === 'string' ? content : content.map(blockToAnthropic);
}

function contentFromAnthropic(content: string | AnthropicContentBlock[]): BudgetMessage['content'] {
  return typeof content === 'string' ? content : content.map(blockFromAnthropic);
}

function findToolResult(content: string | AnthropicContentBlock[]): AnthropicToolResultBlock | undefined {
  return Array.isArray(content) ? content.find((b): b is AnthropicToolResultBlock => b.type === 'tool_result') : undefined;
}

function findToolCallId(content: BudgetMessage['content']): string | undefined {
  if (typeof content === 'string') return undefined;
  const block = content.find((b) => b.type === 'tool_call');
  return block ? stringField(block, 'id') || undefined : undefined;
}

/**
 * FR2-1.1.1: splits pinned system-role messages into Anthropic's separate
 * `system` field — Anthropic has no `system` role inside `messages[]`.
 * Accepts either a raw message array or a `getContext()`-shaped object.
 */
export function toAnthropicMessages(context: { messages: BudgetMessage[] } | BudgetMessage[]): AnthropicContext {
  const messages = Array.isArray(context) ? context : context.messages;
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(typeof message.content === 'string' ? message.content : JSON.stringify(message.content));
      continue;
    }
    const role = message.role === 'tool' ? 'user' : message.role;
    out.push({ role, content: contentToAnthropic(message.content) });
  }

  return systemParts.length > 0 ? { system: systemParts.join('\n\n'), messages: out } : { messages: out };
}

/**
 * Inverse of `toAnthropicMessages`. Restores tool_use/tool_result pairing
 * (FR2-1.1.4) by keying a tool_use block's own `id` as the resulting
 * message's `id`, and a tool_result's `tool_use_id` as `toolCallId` — the
 * same linkage `addMessage` and every built-in strategy expect.
 *
 * Note: only the first tool_use in a turn is linked; Anthropic supports
 * multiple parallel tool calls per turn, but token-budget's `toolCallId` is
 * scalar per message (a Phase 1 core constraint), so only the common
 * single-tool-call-per-turn pattern round-trips its linkage exactly.
 */
export function fromAnthropicContext(context: AnthropicContext): AddMessageInput[] {
  const out: AddMessageInput[] = [];
  if (context.system) out.push({ role: 'system', content: context.system, pinned: true });

  for (const message of context.messages) {
    const toolResult = findToolResult(message.content);
    const content = contentFromAnthropic(message.content);
    if (toolResult) {
      out.push({ id: `tool_result_${toolResult.tool_use_id}`, role: 'tool', content, toolCallId: toolResult.tool_use_id });
      continue;
    }
    out.push({ id: findToolCallId(content), role: message.role, content });
  }
  return out;
}

/** FR2-1.1.2: appends an Anthropic response (including tool_use blocks) back into the budget. */
export function fromAnthropicResponse(response: AnthropicResponse, budget: TokenBudget): void {
  const content = contentFromAnthropic(response.content);
  budget.addMessage({ id: findToolCallId(content), role: 'assistant', content });
}

/**
 * FR2-1.1.5: approximate per-message and per-tool-definition overhead.
 * Anthropic does not publish an exact token-overhead formula, so these
 * constants are best-effort estimates, not ground truth.
 */
export function countAnthropicOverhead(message: BudgetMessage, tools: AnthropicToolDefinition[] = []): number {
  let overhead = 3;
  if (Array.isArray(message.content)) {
    overhead += message.content.filter((b) => b.type === 'tool_call' || b.type === 'tool_result').length * 8;
  }
  overhead += tools.reduce((sum, tool) => sum + 10 + Math.ceil(JSON.stringify(tool.input_schema).length / 4), 0);
  return overhead;
}
