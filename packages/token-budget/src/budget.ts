import { Emitter } from './emitter.js';
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
  BudgetMessage,
  ContextResult,
  ExplainReport,
  Stats,
  Strategy,
  StrategyContext,
  StrategyStepTrace,
  TokenBudgetConfig,
  TokenBudgetEvents,
  TokenBudgetEventName,
} from './types.js';

/**
 * Manages a growing message buffer's token accounting against a fixed
 * budget, applying a pluggable eviction/compression strategy so callers
 * never silently overflow a model's context window.
 */
export class TokenBudget {
  private messages: BudgetMessage[] = [];
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
  private lastExplainReport: ExplainReport | undefined;

  constructor(config: TokenBudgetConfig) {
    if (typeof config.maxTokens !== 'number' || !Number.isFinite(config.maxTokens) || config.maxTokens <= 0) {
      throw new Error('TokenBudget: config.maxTokens must be a positive finite number.');
    }
    const reserve = config.reserve ?? 0;
    if (typeof reserve !== 'number' || !Number.isFinite(reserve) || reserve < 0) {
      throw new Error('TokenBudget: config.reserve must be a non-negative finite number.');
    }
    if (reserve >= config.maxTokens) {
      throw new Error(
        `TokenBudget: config.reserve (${reserve}) must be less than config.maxTokens (${config.maxTokens}).`,
      );
    }
    const warningThreshold = config.warningThreshold ?? 0.8;
    if (typeof warningThreshold !== 'number' || warningThreshold < 0 || warningThreshold > 1) {
      throw new Error('TokenBudget: config.warningThreshold must be a number between 0 and 1.');
    }

    this.maxTokensValue = config.maxTokens;
    this.reserveValue = reserve;
    this.warningThreshold = warningThreshold;
    this.strategy = config.strategy ?? dropOldest();
    this.devMode = config.devMode ?? false;

    const tokenizer =
      config.tokenizer && config.tokenizer !== 'estimate' ? config.tokenizer : createEstimateTokenizer(config.charsPerToken);
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

  // ---- buffer management --------------------------------------------------

  /** Appends a message and incrementally recomputes running totals (FR-3.1). */
  addMessage(input: AddMessageInput): BudgetMessage {
    const message: BudgetMessage = {
      id: input.id ?? this.generateId(),
      role: input.role,
      content: input.content,
      name: input.name,
      pinned: input.pinned,
      priority: input.priority,
      toolCallId: input.toolCallId,
      metadata: input.metadata,
      timestamp: input.timestamp ?? Date.now(),
    };
    message.tokens = this.computeTokens(message);

    this.messages.push(message);
    this.totalTokens += message.tokens;

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
    const index = this.messages.findIndex((m) => m.id === id);
    if (index === -1) return false;
    const [removed] = this.messages.splice(index, 1);
    this.totalTokens -= removed?.tokens ?? 0;
    this.checkWarning();
    return true;
  }

  /** Edits a message by id and recomputes totals (FR-3.5). Throws if not found. */
  editMessage(id: string, patch: Partial<Omit<BudgetMessage, 'id'>>): BudgetMessage {
    const index = this.messages.findIndex((m) => m.id === id);
    if (index === -1) throw new Error(`TokenBudget: no message with id "${id}".`);
    const existing = this.messages[index]!;
    const updated: BudgetMessage = { ...existing, ...patch, id: existing.id };
    updated.tokens = this.computeTokens(updated);
    this.totalTokens += updated.tokens - (existing.tokens ?? 0);
    this.messages[index] = updated;
    this.checkWarning();
    return updated;
  }

  clear(): void {
    this.messages = [];
    this.totalTokens = 0;
    this.warned = false;
  }

  /** Raw, unfiltered buffer contents in insertion order (FR-3.7). */
  getMessages(): BudgetMessage[] {
    return [...this.messages];
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
    return {
      tokensUsed: this.totalTokens,
      tokensRemaining: Math.max(0, this.effectiveBudget - this.totalTokens),
      maxTokens: this.maxTokensValue,
      reserve: this.reserveValue,
      messageCount: this.messages.length,
      pinnedCount: this.messages.reduce((n, m) => n + (m.pinned ? 1 : 0), 0),
    };
  }

  // ---- context retrieval ---------------------------------------------------

  /** Strategy-applied, ready-to-send context (FR-3.7, FR-5.1). Async: strategies may be async. */
  async getContext(): Promise<ContextResult> {
    const original = [...this.messages];
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
    if (!this.strategy.sync) {
      throw new Error(
        `TokenBudget: configured strategy "${this.strategy.name}" is not synchronous (strategy.sync === false); ` +
          'use getContext() instead of getContextSync().',
      );
    }
    const original = [...this.messages];
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

  private checkWarning(): void {
    const ratio = this.totalTokens / this.effectiveBudget;
    if (ratio >= this.warningThreshold) {
      if (!this.warned) {
        this.warned = true;
        this.emitter.emit('warning', { ...this.stats(), threshold: this.warningThreshold });
      }
    } else {
      this.warned = false;
    }
  }

  private buildStrategyContext(tokensUsed: number, steps: StrategyStepTrace[]): StrategyContext {
    const countMessage = (m: BudgetMessage): number => m.tokens ?? this.computeTokens(m);
    return {
      effectiveBudget: this.effectiveBudget,
      tokensUsed,
      countMessage,
      countTokens: (msgs: BudgetMessage[]) => msgs.reduce((sum, m) => sum + countMessage(m), 0),
      makeSynthetic: (content: string, sourceIds: string[]) => this.makeSynthetic(content, sourceIds),
      trace: (step: StrategyStepTrace) => steps.push(step),
    };
  }

  private makeSynthetic(content: string, sourceIds: string[]): BudgetMessage {
    const message: BudgetMessage = {
      id: this.generateId(),
      role: 'system',
      content,
      metadata: { synthetic: true, sourceIds },
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
    if (this.devMode) {
      const consoleObj: { debug?: (...args: unknown[]) => void } | undefined = (
        globalThis as { console?: { debug?: (...args: unknown[]) => void } }
      ).console;
      consoleObj?.debug?.('[token-budget] decision', report);
    }
    this.emitter.emit('decision', report);

    return {
      messages: strategized,
      tokensUsed,
      tokensRemaining: Math.max(0, this.effectiveBudget - tokensUsed),
      evicted: evictedMessages,
      strategyApplied: this.strategy.name,
    };
  }
}
