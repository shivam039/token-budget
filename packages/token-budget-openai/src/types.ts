/**
 * Minimal structural types matching OpenAI's public Chat Completions API
 * shapes. This package has no dependency on the `openai` SDK — these types
 * are structurally compatible with it, so either works as input/output
 * without pulling the SDK in as a dependency.
 */

export interface OpenAITextPart {
  type: 'text';
  text: string;
}

export interface OpenAIImagePart {
  type: 'image_url';
  image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
}

export type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** Legacy single-call format, superseded by `tool_calls` but still accepted by the API. */
export interface OpenAIFunctionCall {
  name: string;
  arguments: string;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  content?: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  function_call?: OpenAIFunctionCall;
}

export interface OpenAIChoice {
  message: OpenAIMessage;
  finish_reason?: string | null;
}

export interface OpenAIResponse {
  choices: OpenAIChoice[];
}
