/**
 * Minimal structural types matching the Vercel AI SDK's `CoreMessage`
 * shapes (`ai` package, v3/v4). This package has no dependency on `ai` —
 * these types are structurally compatible with it, so either works as
 * input/output without pulling the SDK in as a dependency.
 */

export interface VercelTextPart {
  type: 'text';
  text: string;
}

export interface VercelImagePart {
  type: 'image';
  image: string;
  mimeType?: string;
}

export interface VercelToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface VercelToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export type VercelUserPart = VercelTextPart | VercelImagePart;
export type VercelAssistantPart = VercelTextPart | VercelToolCallPart;

export interface CoreSystemMessage {
  role: 'system';
  content: string;
}

export interface CoreUserMessage {
  role: 'user';
  content: string | VercelUserPart[];
}

export interface CoreAssistantMessage {
  role: 'assistant';
  content: string | VercelAssistantPart[];
}

export interface CoreToolMessage {
  role: 'tool';
  content: VercelToolResultPart[];
}

export type CoreMessage = CoreSystemMessage | CoreUserMessage | CoreAssistantMessage | CoreToolMessage;

/** Shape of `streamText()`'s completion-token usage, passed to its `onFinish` callback. */
export interface VercelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
