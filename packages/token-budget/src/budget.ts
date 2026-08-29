import { Emitter } from './emitter.js';
import { getModelContextWindow } from './modelContextWindows.js';
import { dropOldest } from './strategies/dropOldest.js';
import {
  countMessageTokens,
  createDefaultContentCounters,
  createEstimateTokenizer,
  defaultMessageOverhead,
  type CounterSet,
} from './tokenizer.js';
import type {
  AddMessageInput,
  AuditEvent,
  BudgetMessage,
  ContentBlock,
  ContextResult,
  CostCeilingPolicy,
  CostModel,
  ExplainReport,
  Role,
  SerializedState,
  SerializedStream,
  Stats,
  Strategy,
  StrategyContext,
  StrategyStepTrace,
  TokenBudgetConfig,
  TokenBudgetEvents,
  TokenBudgetEventName,
  UsageReport,
} from './types.js';

const SCHEMA_VERSION = 1;

type ConsoleLike = { debug?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };

function getConsole(): ConsoleLike | undefined {
  return (globalThis as { console?: ConsoleLike }).console;
}

function warnOnce(message: string): void {
  getConsole()?.warn?.(`[token-budget] ${message}`);
}

// Node's `@types/node` and the DOM lib both declare setTimeout/clearTimeout
// ambiently, but this package deliberately doesn't depend on either lib
// (Node-only / browser-only) to stay universally runtime-agnostic — access
// them the same way as `crypto`/`console` above, via a typed globalThis cast.
interface TimerLike {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

function getTimers(): TimerLike {
  return globalThis as unknown as TimerLike;
}

interface StreamState {
  role: Role;
  parts: Array<string | ContentBlock>;
  metadata?: Record<string, unknown>;
  estimatedTokens: number;
}

/**
 * Joins accumulated stream chunks into final message content: plain text
 * throughout collapses to a single string; any content block anywhere
 * promotes the whole thing to `ContentBlock[]`, merging adjacent string
 * chunks into single text blocks along the way.
 */
function foldStreamParts(parts: Array<string | ContentBlock>): BudgetMessage['content'] {
  if (parts.every((part) => typeof part === 'string')) return (parts as string[]).join('');

  const blocks: ContentBlock[] = [];
  let buffer = '';
  for (const part of parts) {
    if (typeof part === 'string') {
      buffer += part;
      continue;
    }
    if (buffer) {
      blocks.push({ type: 'text', text: buffer });
      buffer = '';
    }
    blocks.push(part);
  }
  if (buffer) blocks.push({ type: 'text', text: buffer });
  return blocks;
}

/**
 * Manages a growing message buffer's token accounting against a fixed
 * budget, applying a pluggable eviction/compression strategy so callers
 * never silently overflow a model's context window.
 */
export class TokenBudget {
  // A Map (not an array) so addMessage/removeMessage/editMessage are O(1)
  // — no O(n) findIndex-by-id, no O(n) splice-shift on removal — while
  // still iterating in insertion order (a standard JS Map guarantee),
  // which every ordering-sensitive method here relies on (FR2-8.4).
  private messages = new Map<string, BudgetMessage>();
  private totalTokens = 0;
  private maxTokensValue: number;
  private reserveValue: number;
  private warningThreshold: number;
  private strategy: Strategy;
  private counters: CounterSet;
  private emitter = new Emitter<TokenBudgetEvents>();
  private warned = false;
  private idCounter = 0;
  private devMode: boolean;
  private streams = new Map<string, StreamState>();
  private onStrategyDuringStream: 'skip' | 'error';
  private lastExplainReport: ExplainReport | undefined;
  private charsPerTokenValue: number;
  private onPersistHook: ((state: SerializedState) => void | Promise<void>) | undefined;
  private persistDebounceMs: number;
  private persistTimer: unknown;

  // ---- cost & governance (Phase 3) ----------------------------------------
  private cumulativeCost = 0;
  private costWarned = false;
  private costModel?: CostModel;
  private modelName?: string;
  private costWarningThreshold?: number;
  private maxCost?: number;
  private maxCostPolicy?: CostCeilingPolicy;
  private usageReport: UsageReport;
  private usageSnapshotIntervalMs?: number;
  private lastUsageSnapshotAt = 0;
  private tags?: Record<string, string>;
  private redactor?: (message: BudgetMessage) => BudgetMessage;
  private auditLog: boolean;
  private onAuditEventHook?: (event: AuditEvent) => void | Promise<void>;

  /**
   * `config.maxTokens` as given, or — if omitted — derived from
   * `config.model` via `MODEL_CONTEXT_WINDOWS`. Throws a descriptive error
   * rather than falling back to some arbitrary number: an unrecognized
   * budget should never be silently guessed.
   */
  private static resolveMaxTokens(config: TokenBudgetConfig): number {
    if (config.maxTokens !== undefined) return config.maxTokens;
    if (!config.model) {
      throw new Error(
        'TokenBudget: config.maxTokens is required unless config.model names a recognized model ' +
          '(see MODEL_CONTEXT_WINDOWS). Pass maxTokens explicitly, or set model to a listed name.',
      );
    }
    const known = getModelContextWindow(config.model);
    if (known === undefined) {
      throw new Error(
        `TokenBudget: config.maxTokens was omitted and config.model ("${config.model}") is not in ` +
          'MODEL_CONTEXT_WINDOWS. Pass maxTokens explicitly, or use a listed model name.',
      );
    }
    return known;
  }

  constructor(config: TokenBudgetConfig) {
    const maxTokens = TokenBudget.resolveMaxTokens(config);
    if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens) || maxTokens <= 0) {
      throw new Error('TokenBudget: config.maxTokens must be a positive finite number.');
    }
    const reserve = config.reserve ?? 0;
    if (typeof reserve !== 'number' || !Number.isFinite(reserve) || reserve < 0) {
      throw new Error('TokenBudget: config.reserve must be a non-negative finite number.');
    }
    if (reserve >= maxTokens) {
      throw new Error(
        `TokenBudget: config.reserve (${reserve}) must be less than config.maxTokens (${maxTokens}).`,
      );
    }
    const warningThreshold = config.warningThreshold ?? 0.8;
    if (typeof warningThreshold !== 'number' || warningThreshold < 0 || warningThreshold > 1) {
      throw new Error('TokenBudget: config.warningThreshold must be a number between 0 and 1.');
    }

    this.maxTokensValue = maxTokens;
    this.reserveValue = reserve;
    this.warningThreshold = warningThreshold;
    this.strategy = config.strategy ?? dropOldest();
    this.devMode = config.devMode ?? false;
    this.onStrategyDuringStream = config.onStrategyDuringStream ?? 'skip';
    this.charsPerTokenValue = config.charsPerToken ?? 4;
    this.onPersistHook = config.onPersist;
    this.persistDebounceMs = config.persistDebounceMs ?? 0;

    this.costModel = config.costModel;
    this.modelName = config.model;
    this.costWarningThreshold = config.costWarningThreshold;
    this.maxCost = config.maxCost;
    this.maxCostPolicy = config.maxCostPolicy;
    this.usageSnapshotIntervalMs = config.usageSnapshotIntervalMs;
    this.tags = config.tags;
    this.redactor = config.redactor;
    this.auditLog = config.auditLog ?? false;
    this.onAuditEventHook = config.onAuditEvent;
    if (config.onUsageSnapshot) this.on('usageSnapshot', config.onUsageSnapshot);

    this.usageReport = {
      totalMessagesProcessed: 0,
      totalTokensConsumed: { user: 0, assistant: 0, system: 0, tool: 0 },
      totalEvictions: {},
      tags: this.tags,
      ...(this.costModel ? { totalCost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' } } : {}),
    };

    const tokenizer =
      config.tokenizer && config.tokenizer !== 'estimate'
        ? config.tokenizer
        : createEstimateTokenizer(config.charsPerToken, config.estimatorProfile);
    this.counters = {
      tokenizer,
      messageOverhead: config.messageOverhead ?? defaultMessageOverhead,
      contentCounters: { ...createDefaultContentCounters(tokenizer), ...(config.contentCounters ?? {}) },
    };
  }

  // ---- config -----------------------------------------------------------

  get maxTokens(): number {
    return this.maxTokensValue;
  }

  get reserve(): number {
    return this.reserveValue;
  }

  get effectiveBudget(): number {
    return this.maxTokensValue - this.reserveValue;
  }

  /** Reconfigure the context window size without losing buffer state (FR-2.6). */
  setMaxTokens(n: number): void {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
      throw new Error('TokenBudget: setMaxTokens(n) requires a positive finite number.');
    }
    if (this.reserveValue >= n) {
      throw new Error(`TokenBudget: reserve (${this.reserveValue}) must be less than maxTokens (${n}).`);
    }
    this.maxTokensValue = n;
    this.checkWarning();
  }

  /** Reconfigure the output-reserve size without losing buffer state (FR-2.6). */
  setReserve(n: number): void {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
      throw new Error('TokenBudget: setReserve(n) requires a non-negative finite number.');
    }
    if (n >= this.maxTokensValue) {
      throw new Error(`TokenBudget: reserve (${n}) must be less than maxTokens (${this.maxTokensValue}).`);
    }
    this.reserveValue = n;
    this.checkWarning();
  }

  // ---- events -------------------------------------------------------------

  on<K extends TokenBudgetEventName>(event: K, handler: TokenBudgetEvents[K]): () => void {
    return this.emitter.on(event, handler);
  }

  off<K extends TokenBudgetEventName>(event: K, handler: TokenBudgetEvents[K]): void {
    this.emitter.off(event, handler);
  }

  /** Number of currently-registered listeners for `event` — useful for leak-checking (FR2-8.3). */
  listenerCount<K extends TokenBudgetEventName>(event: K): number {
    return this.emitter.listenerCount(event);
  }

  // ---- buffer management --------------------------------------------------

  /**
   * Appends a message and incrementally recomputes running totals (FR-3.1).
   * Throws if `input.id` collides with an existing message, or if
   * `maxCostPolicy: 'block-new-messages'` and this message would push
   * cumulative cost to `maxCost` — that check runs *before* any state is
   * touched, so a rejected message leaves the buffer and usage/cost
   * accounting exactly as they were (Phase 3).
   */
  addMessage(input: AddMessageInput): BudgetMessage {
    const id = input.id ?? this.generateId();
    if (input.id !== undefined && this.messages.has(id)) {
      throw new Error(`TokenBudget: a message with id "${id}" already exists. Use editMessage() to update it, or removeMessage() first.`);
    }
    let message: BudgetMessage = {
      id,
      role: input.role,
      content: input.content,
      name: input.name,
      pinned: input.pinned,
      priority: input.priority,
      toolCallId: input.toolCallId,
      metadata: input.metadata,
      timestamp: input.timestamp ?? Date.now(),
    };
    if (this.redactor) message = this.redactor(message);
    message.tokens = this.computeTokens(message);

    let cost = 0;
    let costDirection: 'input' | 'output' | undefined;
    if (this.costModel && this.modelName) {
      costDirection = message.role === 'assistant' ? 'output' : 'input';
      cost = this.costModel.costPerToken(message.role, this.modelName, costDirection) * message.tokens;
    }

    // Blocking check happens before any mutation below — a throw here must
    // leave usage/cost accounting untouched, since the message was never
    // actually added.
    if (this.maxCost !== undefined && this.maxCostPolicy === 'block-new-messages' && this.cumulativeCost + cost >= this.maxCost) {
      throw new Error(`TokenBudget: maxCost ceiling (${this.maxCost}) reached.`);
    }

    this.messages.set(id, message);
    this.totalTokens += message.tokens;

    this.usageReport.totalMessagesProcessed++;
    this.usageReport.totalTokensConsumed[message.role] = (this.usageReport.totalTokensConsumed[message.role] ?? 0) + message.tokens;
    if (costDirection && this.usageReport.totalCost) {
      this.cumulativeCost += cost;
      if (costDirection === 'input') this.usageReport.totalCost.inputCost += cost;
      else this.usageReport.totalCost.outputCost += cost;
      this.usageReport.totalCost.totalCost += cost;
    }
    this.checkCostCeiling();

    if (message.tokens > this.effectiveBudget) {
      this.emitter.emit('overflow', {
        reason: 'single-message-exceeds-budget',
        message,
        tokensUsed: this.totalTokens,
        effectiveBudget: this.effectiveBudget,
      });
    }
    this.checkWarning();
    return message;
  }

  /** Removes a message by id and recomputes totals (FR-3.5). Returns false if not found. */
  removeMessage(id: string): boolean {
    const removed = this.messages.get(id);
    if (!removed) return false;
    this.messages.delete(id);
    this.totalTokens -= removed.tokens ?? 0;
    this.checkWarning();
    return true;
  }

  /** Edits a message by id and recomputes totals (FR-3.5). Throws if not found. */
  editMessage(id: string, patch: Partial<Omit<BudgetMessage, 'id'>>): BudgetMessage {
    const existing = this.messages.get(id);
    if (!existing) throw new Error(`TokenBudget: no message with id "${id}".`);
    const updated: BudgetMessage = { ...existing, ...patch, id: existing.id };
    updated.tokens = this.computeTokens(updated);
    this.totalTokens += updated.tokens - (existing.tokens ?? 0);
    this.messages.set(id, updated); // Map.set on an existing key preserves its original iteration position
    this.checkWarning();
    return updated;
  }

  clear(): void {
    this.messages = new Map();
    this.totalTokens = 0;
    this.checkWarning();
  }

  /**
   * Replaces the raw buffer with `messages` — typically a `getContext()`/
   * `getContextSync()` result's `.messages` — recomputing totals.
   * `getContext()` itself never mutates the buffer (every call re-derives
   * from the full history), so making an eviction or summarization
   * "stick" across turns requires explicitly committing its result back in
   * before the next `addMessage()`/`getContext()` cycle. This is what lets
   * `summarize-oldest` re-summarize a previous summary on a later call
   * (Phase 2 §3.5) instead of re-deriving from the same full history
   * every time.
   */
  commit(messages: BudgetMessage[]): void {
    this.messages = new Map(messages.map((m) => [m.id, m]));
    this.totalTokens = messages.reduce((sum, m) => sum + (m.tokens ?? this.computeTokens(m)), 0);
    this.checkWarning();
  }

  /**
   * Plain, JSON-serializable snapshot of this budget's state (FR2-6.1):
   * messages (including synthetic summaries with full metadata) and the
   * JSON-safe half of its config. Excludes the tokenizer instance,
   * strategy, and `messageOverhead`/`contentCounters` functions — nothing
   * generic can serialize a function; re-supply those via
   * `deserialize()`'s `overrides` if you didn't use the defaults.
   *
   * Open streams are excluded by default (FR2-6.4) — resuming a network
   * stream mid-flight is out of scope for this library. Pass
   * `{ includeOpenStreams: true }` to include their accumulated partial
   * content instead, each marked `wasInterrupted: true`; resuming or
   * finalizing them on restore is left to the caller.
   */
  serialize(options: { includeOpenStreams?: boolean } = {}): SerializedState {
    const state: SerializedState = {
      schemaVersion: SCHEMA_VERSION,
      maxTokens: this.maxTokensValue,
      reserve: this.reserveValue,
      warningThreshold: this.warningThreshold,
      charsPerToken: this.charsPerTokenValue,
      devMode: this.devMode,
      onStrategyDuringStream: this.onStrategyDuringStream,
      messages: this.getMessages(),
    };
    if (options.includeOpenStreams && this.streams.size > 0) {
      state.streaming = [...this.streams.entries()].map(
        ([id, s]): SerializedStream => ({ id, role: s.role, parts: [...s.parts], metadata: s.metadata, wasInterrupted: true }),
      );
    }
    return state;
  }

  /**
   * Reconstructs a fully-functional `TokenBudget` from a `serialize()`
   * snapshot (FR2-6.2). `overrides` both fills in what couldn't be
   * serialized (`tokenizer`, `strategy`, `messageOverhead`,
   * `contentCounters`, `onPersist`, ...) and can override any of the
   * JSON-safe config too — e.g. restoring a session but pointing at a
   * different tokenizer instance, or a bigger `maxTokens` for a new model.
   *
   * Throws if `state.schemaVersion` is newer than this package supports.
   * Warns (via `console.warn`) if it's older — today that's a no-op
   * beyond the warning, since schema v1 is the only version that has
   * existed; a future breaking change to this shape will add a migration
   * step here and document it in the changelog.
   */
  static deserialize(state: SerializedState, overrides: Partial<TokenBudgetConfig> = {}): TokenBudget {
    if (state.schemaVersion > SCHEMA_VERSION) {
      throw new Error(
        `TokenBudget.deserialize: state has schemaVersion ${state.schemaVersion}, newer than this package supports (${SCHEMA_VERSION}). Upgrade token-budget.`,
      );
    }
    if (state.schemaVersion < SCHEMA_VERSION) {
      warnOnce(
        `TokenBudget.deserialize: state has schemaVersion ${state.schemaVersion}, older than this package's ${SCHEMA_VERSION}. ` +
          'No migration was needed for this version, but check the changelog if you see unexpected behavior.',
      );
    }

    const budget = new TokenBudget({
      maxTokens: state.maxTokens,
      reserve: state.reserve,
      warningThreshold: state.warningThreshold,
      charsPerToken: state.charsPerToken,
      devMode: state.devMode,
      onStrategyDuringStream: state.onStrategyDuringStream,
      ...overrides,
    });
    budget.commit(state.messages);

    for (const stream of state.streaming ?? []) {
      budget.beginStream(stream.id, stream.role, stream.metadata);
      for (const part of stream.parts) budget.appendStreamChunk(stream.id, part);
    }

    return budget;
  }

  /** Raw, unfiltered buffer contents in insertion order (FR-3.7). */
  getMessages(): BudgetMessage[] {
    return [...this.messages.values()];
  }

  /** Previews a message's token cost without mutating buffer state (FR-5.3). */
  estimateBeforeAdd(input: AddMessageInput): number {
    const draft: BudgetMessage = {
      id: input.id ?? '__preview__',
      role: input.role,
      content: input.content,
      name: input.name,
      pinned: input.pinned,
      priority: input.priority,
      toolCallId: input.toolCallId,
      metadata: input.metadata,
      timestamp: input.timestamp,
    };
    return this.computeTokens(draft);
  }

  stats(): Stats {
    const streaming = [...this.streams.entries()].map(([id, s]) => ({ id, estimatedTokens: s.estimatedTokens }));
    const tokensUsed = this.totalTokens + this.streamingTokensTotal();
    return {
      tokensUsed,
      tokensRemaining: Math.max(0, this.effectiveBudget - tokensUsed),
      maxTokens: this.maxTokensValue,
      reserve: this.reserveValue,
      messageCount: this.messages.size,
      pinnedCount: [...this.messages.values()].reduce((n, m) => n + (m.pinned ? 1 : 0), 0),
      streaming,
      cost: this.usageReport.totalCost ? { ...this.usageReport.totalCost } : undefined,
    };
  }

  // ---- cost & usage analytics (Phase 3) -----------------------------------

  /**
   * Cumulative, lifetime usage/cost ledger — see `UsageReport`'s doc for
   * how it differs from `stats()`. Returns a deep copy; mutating the
   * result has no effect on the budget.
   */
  getUsageReport(): UsageReport {
    return JSON.parse(JSON.stringify(this.usageReport)) as UsageReport;
  }

  /** JSON-serialized `getUsageReport()`, indented for readability. */
  exportUsageJSON(): string {
    return JSON.stringify(this.usageReport, null, 2);
  }

  /** Flat `Metric,Value` CSV of `getUsageReport()`'s scalar fields. */
  exportUsageCSV(): string {
    const rows: Array<[string, string | number]> = [
      ['totalMessagesProcessed', this.usageReport.totalMessagesProcessed],
      ['userTokens', this.usageReport.totalTokensConsumed.user ?? 0],
      ['assistantTokens', this.usageReport.totalTokensConsumed.assistant ?? 0],
      ['systemTokens', this.usageReport.totalTokensConsumed.system ?? 0],
      ['toolTokens', this.usageReport.totalTokensConsumed.tool ?? 0],
    ];
    if (this.usageReport.totalCost) {
      rows.push(['inputCost', this.usageReport.totalCost.inputCost]);
      rows.push(['outputCost', this.usageReport.totalCost.outputCost]);
      rows.push(['totalCost', this.usageReport.totalCost.totalCost]);
    }
    return ['Metric,Value', ...rows.map(([metric, value]) => `${metric},${value}`)].join('\n');
  }

  // ---- streaming (Phase 2 §3.3) -------------------------------------------

  /** Registers a new in-progress streamed message. Throws if `id` is already open (FR2-3.1). */
  beginStream(id: string, role: Role, metadata?: Record<string, unknown>): void {
    if (this.streams.has(id)) {
      throw new Error(`TokenBudget: stream "${id}" is already open. Call endStream()/abortStream() first, or use a different id.`);
    }
    this.streams.set(id, { role, parts: [], metadata, estimatedTokens: 0 });
  }

  /**
   * Appends a chunk to an open stream and updates its running, approximate
   * token estimate — O(chunk length), never O(total accumulated length)
   * per call (FR2-3.9): each chunk is counted on its own and summed, which
   * is fast but only additive-approximate for tokenizers whose token
   * boundaries can span chunks; `endStream()` reconciles to an exact count.
   */
  appendStreamChunk(id: string, chunk: string | ContentBlock): void {
    const stream = this.streams.get(id);
    if (!stream) throw new Error(`TokenBudget: no open stream "${id}". Call beginStream() first.`);
    stream.parts.push(chunk);
    stream.estimatedTokens += this.countChunkTokens(chunk);
    this.checkWarning();
  }

  /**
   * Finalizes a stream: exact recount over the full accumulated content,
   * reconciling any drift from the running estimate, and folds it into the
   * main buffer as a normal message (FR2-3.3).
   */
  endStream(id: string): BudgetMessage {
    const stream = this.streams.get(id);
    if (!stream) throw new Error(`TokenBudget: no open stream "${id}".`);
    this.streams.delete(id);
    const content = foldStreamParts(stream.parts);
    return this.addMessage({ id, role: stream.role, content, metadata: stream.metadata });
  }

  /**
   * Handles a client/network abort mid-stream (FR2-3.4). `'discard'`
   * (default) drops the partial message entirely; `'keep-partial'`
   * finalizes whatever content was received so far, same as `endStream`.
   */
  abortStream(id: string, policy: 'discard' | 'keep-partial' = 'discard'): void {
    if (!this.streams.has(id)) throw new Error(`TokenBudget: no open stream "${id}".`);
    if (policy === 'keep-partial') {
      this.endStream(id);
      return;
    }
    this.streams.delete(id);
    this.checkWarning();
  }

  // ---- context retrieval ---------------------------------------------------

  /** Strategy-applied, ready-to-send context (FR-3.7, FR-5.1). Async: strategies may be async. */
  async getContext(): Promise<ContextResult> {
    this.assertNoOpenStreamsIfConfigured();
    const original = [...this.messages.values()];
    const steps: StrategyStepTrace[] = [];
    const ctx = this.buildStrategyContext(this.totalTokens, steps);
    let strategized: BudgetMessage[];
    try {
      strategized = await this.strategy.apply(original, ctx);
    } catch (error) {
      this.emitter.emit('strategy-error', { strategyName: this.strategy.name, error, recovered: false });
      throw error;
    }
    return this.finalizeContext(original, strategized, steps);
  }

  /**
   * Sync variant of `getContext`, for strategies guaranteed to be
   * synchronous (drop-oldest, sliding-window, priority, and chains of only
   * those). Throws a descriptive error if the configured strategy isn't
   * sync (FR-5.2).
   */
  getContextSync(): ContextResult {
    this.assertNoOpenStreamsIfConfigured();
    if (!this.strategy.sync) {
      throw new Error(
        `TokenBudget: configured strategy "${this.strategy.name}" is not synchronous (strategy.sync === false); ` +
          'use getContext() instead of getContextSync().',
      );
    }
    const original = [...this.messages.values()];
    const steps: StrategyStepTrace[] = [];
    const ctx = this.buildStrategyContext(this.totalTokens, steps);
    let strategized: BudgetMessage[];
    try {
      const result = this.strategy.apply(original, ctx);
      if (result instanceof Promise) {
        throw new Error(
          `TokenBudget: strategy "${this.strategy.name}" returned a Promise despite declaring sync: true; ` +
            'fix the strategy or use getContext() instead of getContextSync().',
        );
      }
      strategized = result;
    } catch (error) {
      this.emitter.emit('strategy-error', { strategyName: this.strategy.name, error, recovered: false });
      throw error;
    }
    return this.finalizeContext(original, strategized, steps);
  }

  /**
   * Structured trace of the most recent `getContext()`/`getContextSync()`
   * call (FR2-4.1) — strategy name(s) in chain order, tokens before/after
   * each step, and a human-readable reason per evicted/summarized message.
   * Returns `undefined` if neither has been called yet.
   */
  explain(): ExplainReport | undefined {
    return this.lastExplainReport;
  }

  // ---- internals ------------------------------------------------------------

  private generateId(): string {
    const cryptoObj: { randomUUID?: () => string } | undefined = (globalThis as any).crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    this.idCounter += 1;
    return `msg_${Date.now().toString(36)}_${this.idCounter.toString(36)}`;
  }

  private computeTokens(message: BudgetMessage): number {
    return countMessageTokens(message, this.counters);
  }

  private countChunkTokens(chunk: string | ContentBlock): number {
    if (typeof chunk === 'string') return this.counters.tokenizer.count(chunk);
    const counter = this.counters.contentCounters[chunk.type];
    return counter ? counter(chunk) : this.counters.tokenizer.count(JSON.stringify(chunk));
  }

  private streamingTokensTotal(): number {
    let sum = 0;
    for (const stream of this.streams.values()) sum += stream.estimatedTokens;
    return sum;
  }

  private assertNoOpenStreamsIfConfigured(): void {
    if (this.onStrategyDuringStream === 'error' && this.streams.size > 0) {
      throw new Error(
        `TokenBudget: ${this.streams.size} stream(s) still open (onStrategyDuringStream: 'error'); ` +
          'call endStream()/abortStream() on each before building a context, or configure onStrategyDuringStream: "skip".',
      );
    }
  }

  /** Post-mutation bookkeeping: called at the end of every state-mutating method. */
  private checkWarning(): void {
    this.schedulePersist();
    const tokensUsed = this.totalTokens + this.streamingTokensTotal();
    const ratio = tokensUsed / this.effectiveBudget;
    if (ratio >= this.warningThreshold) {
      if (!this.warned) {
        this.warned = true;
        this.emitter.emit('warning', { ...this.stats(), threshold: this.warningThreshold });
      }
    } else {
      this.warned = false;
    }
  }

  /**
   * Post-commit cost bookkeeping, called after `addMessage` has already
   * updated `cumulativeCost` — the blocking ceiling check runs earlier,
   * *before* that commit (see `addMessage`). This only handles the
   * non-blocking paths: the one-time `costWarning` event, and invoking a
   * callback `maxCostPolicy`.
   */
  private checkCostCeiling(): void {
    if (this.costWarningThreshold !== undefined) {
      if (this.cumulativeCost >= this.costWarningThreshold) {
        if (!this.costWarned) {
          this.costWarned = true;
          this.emitter.emit('costWarning', {
            cumulativeCost: this.cumulativeCost,
            threshold: this.costWarningThreshold,
            currency: 'USD',
          });
        }
      } else {
        this.costWarned = false;
      }
    }

    if (this.maxCost !== undefined && this.cumulativeCost >= this.maxCost && typeof this.maxCostPolicy === 'function') {
      this.maxCostPolicy({ cumulativeCost: this.cumulativeCost, threshold: this.maxCost, currency: 'USD' });
    }
  }

  /**
   * Emits a `usageSnapshot` event with the current lifetime usage report,
   * throttled by `usageSnapshotIntervalMs` (Phase 3). Called at the end of
   * every `getContext()`/`getContextSync()` call, after this call's
   * evictions have been tallied into the report.
   */
  private snapshotUsageIfNeeded(): void {
    const now = Date.now();
    if (this.usageSnapshotIntervalMs && now - this.lastUsageSnapshotAt < this.usageSnapshotIntervalMs) return;
    this.lastUsageSnapshotAt = now;
    this.emitter.emit('usageSnapshot', { ...this.usageReport }, now);
  }

  /** FR2-6.3: debounced (or immediate, if persistDebounceMs is 0) auto-persist after a mutation. */
  private schedulePersist(): void {
    if (!this.onPersistHook) return;
    if (this.persistDebounceMs <= 0) {
      void this.onPersistHook(this.serialize());
      return;
    }
    const timers = getTimers();
    if (this.persistTimer !== undefined) timers.clearTimeout(this.persistTimer);
    this.persistTimer = timers.setTimeout(() => {
      this.persistTimer = undefined;
      void this.onPersistHook!(this.serialize());
    }, this.persistDebounceMs);
  }

  private buildStrategyContext(tokensUsed: number, steps: StrategyStepTrace[]): StrategyContext {
    const countMessage = (m: BudgetMessage): number => m.tokens ?? this.computeTokens(m);
    return {
      effectiveBudget: this.effectiveBudget,
      tokensUsed,
      countMessage,
      countTokens: (msgs: BudgetMessage[]) => msgs.reduce((sum, m) => sum + countMessage(m), 0),
      makeSynthetic: (content: string, sourceIds: string[], extraMetadata?: Record<string, unknown>) =>
        this.makeSynthetic(content, sourceIds, extraMetadata),
      trace: (step: StrategyStepTrace) => steps.push(step),
    };
  }

  private makeSynthetic(content: string, sourceIds: string[], extraMetadata?: Record<string, unknown>): BudgetMessage {
    const message: BudgetMessage = {
      id: this.generateId(),
      role: 'system',
      content,
      metadata: { synthetic: true, sourceIds, ...extraMetadata },
      timestamp: Date.now(),
    };
    message.tokens = this.computeTokens(message);
    return message;
  }

  private finalizeContext(original: BudgetMessage[], strategized: BudgetMessage[], steps: StrategyStepTrace[]): ContextResult {
    const originalIds = new Set(original.map((m) => m.id));
    const resultIds = new Set(strategized.map((m) => m.id));
    const evictedMessages = original.filter((m) => !resultIds.has(m.id));
    const replacedBy = strategized.filter((m) => !originalIds.has(m.id));

    if (evictedMessages.length > 0 || replacedBy.length > 0) {
      this.emitter.emit('evicted', {
        strategyApplied: this.strategy.name,
        messages: evictedMessages,
        replacedBy,
      });
    }

    const tokensUsed = strategized.reduce((sum, m) => sum + (m.tokens ?? this.computeTokens(m)), 0);
    if (tokensUsed > this.effectiveBudget) {
      this.emitter.emit('overflow', {
        reason: 'unresolvable-after-strategy',
        tokensUsed,
        effectiveBudget: this.effectiveBudget,
      });
    }

    const tokensBefore = original.reduce((sum, m) => sum + (m.tokens ?? this.computeTokens(m)), 0);
    const report: ExplainReport = {
      steps,
      tokensBefore,
      tokensAfter: tokensUsed,
      tokensRemaining: Math.max(0, this.effectiveBudget - tokensUsed),
      strategyApplied: this.strategy.name,
      timestamp: Date.now(),
    };
    this.lastExplainReport = report;
    if (this.devMode) getConsole()?.debug?.('[token-budget] decision', report);
    this.emitter.emit('decision', report);

    for (const step of steps) {
      if (step.evicted.length > 0) {
        this.usageReport.totalEvictions[step.strategyName] = (this.usageReport.totalEvictions[step.strategyName] ?? 0) + step.evicted.length;
      }
    }
    this.snapshotUsageIfNeeded();

    if (this.auditLog && this.onAuditEventHook) {
      void this.onAuditEventHook({
        timestamp: Date.now(),
        strategyApplied: this.strategy.name,
        tokensBefore,
        tokensAfter: tokensUsed,
        effectiveBudget: this.effectiveBudget,
        messagesConsidered: original.length,
        evictedIds: steps.flatMap((step) => step.evicted.map((e) => e.id)),
        synthesizedIds: steps.flatMap((step) => step.synthesized.map((s) => s.id)),
        tags: this.tags,
      });
    }

    return {
      messages: strategized,
      tokensUsed,
      tokensRemaining: Math.max(0, this.effectiveBudget - tokensUsed),
      evicted: evictedMessages,
      strategyApplied: this.strategy.name,
    };
  }
}
