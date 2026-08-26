/**
 * Minimal structural types matching Anthropic's public Messages API shapes.
 * This package has no dependency on `@anthropic-ai/sdk` — these types are
 * structurally compatible with it (and with plain fetch/JSON usage), so
 * either works as input/output without pulling the SDK in as a dependency.
 */

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicImageSource {
  type: 'base64' | 'url';
  media_type?: string;
  data?: string;
  url?: string;
}

export interface AnthropicImageBlock {
  type: 'image';
  source: AnthropicImageSource;
}

export interface AnthropicDocumentSource {
  type: 'base64' | 'url' | 'text';
  media_type?: string;
  data?: string;
  url?: string;
}

export interface AnthropicDocumentBlock {
  type: 'document';
  source: AnthropicDocumentSource;
  title?: string;
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content?: string | AnthropicTextBlock[];
  is_error?: boolean;
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicDocumentBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContext {
  system?: string;
  messages: AnthropicMessage[];
}

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicResponse {
  role: 'assistant';
  content: AnthropicContentBlock[];
  stop_reason?: string | null;
}
