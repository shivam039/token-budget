/**
 * Minimal structural types matching LangChain.js's public message shapes
 * (`@langchain/core/messages`, tested against `^0.3.0`). This package has
 * no dependency on `@langchain/core` — real `SystemMessage`/`HumanMessage`/
 * `AIMessage`/`ToolMessage`/`FunctionMessage` instances satisfy this
 * structurally (they expose the same fields and a `_getType()` method), so
 * either works as input without pulling the package in as a dependency.
 *
 * Known limitation: `toLangChainMessages` returns plain objects shaped
 * like these classes (with a working `_getType()`), not real class
 * instances — code that checks `_getType()` (the documented, intended way)
 * works correctly; code that does `instanceof HumanMessage` will not
 * recognize them. See the README's "Known limitations" section.
 */

export type LangChainMessageType = 'system' | 'human' | 'ai' | 'tool' | 'function' | 'generic';

export interface LangChainTextPart {
  type: 'text';
  text: string;
}

export interface LangChainImagePart {
  type: 'image_url';
  image_url: { url: string } | string;
}

export type LangChainContentPart = LangChainTextPart | LangChainImagePart;

export interface LangChainToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

/** Structural shape shared by all `BaseMessage` subclasses. */
export interface LangChainMessageLike {
  content: string | LangChainContentPart[];
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
  name?: string;
  /** Present on `ToolMessage`. */
  tool_call_id?: string;
  /** Present on `AIMessage`. */
  tool_calls?: LangChainToolCall[];
  _getType(): LangChainMessageType;
}
