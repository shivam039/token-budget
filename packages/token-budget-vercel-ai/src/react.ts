import { useMemo } from 'react';
import { TokenBudget } from '@shivam.dixit/token-budget';
import type { TokenBudgetConfig } from '@shivam.dixit/token-budget';

export interface ChatMessageLike {
  role: string;
  content: string;
}

export type UseTokenBudgetConfig = Pick<TokenBudgetConfig, 'maxTokens' | 'reserve' | 'tokenizer' | 'charsPerToken' | 'warningThreshold'>;

export interface UseTokenBudgetResult {
  tokensUsed: number;
  tokensRemaining: number;
  isNearLimit: boolean;
}

/**
 * Pure computation behind `useTokenBudget` (FR2-1.3.2), extracted so it's
 * testable without a React renderer. Builds a disposable `TokenBudget`
 * from `useChat()`'s live message list — it never mutates a budget
 * instance of your own, it's purely a token-stats snapshot.
 */
export function computeBudgetSnapshot(messages: ChatMessageLike[], config: UseTokenBudgetConfig): UseTokenBudgetResult {
  const budget = new TokenBudget(config);
  for (const message of messages) {
    if (message.role === 'user' || message.role === 'assistant' || message.role === 'system') {
      budget.addMessage({ role: message.role, content: message.content });
    }
  }
  const stats = budget.stats();
  const threshold = config.warningThreshold ?? 0.8;
  const effectiveBudget = config.maxTokens - (config.reserve ?? 0);
  return {
    tokensUsed: stats.tokensUsed,
    tokensRemaining: stats.tokensRemaining,
    isNearLimit: effectiveBudget > 0 && stats.tokensUsed / effectiveBudget >= threshold,
  };
}

/**
 * FR2-1.3.2: wraps `useChat()`'s message state (pass its `messages`
 * directly) and reactively exposes `{ tokensUsed, tokensRemaining,
 * isNearLimit }`. Memoized on `messages`/`config` identity — pass a stable
 * `config` object (e.g. from `useMemo` or module scope).
 */
/* c8 ignore start -- trivial useMemo wrapper; requires a React renderer to exercise, computeBudgetSnapshot above carries the real logic and is fully tested */
export function useTokenBudget(messages: ChatMessageLike[], config: UseTokenBudgetConfig): UseTokenBudgetResult {
  return useMemo(() => computeBudgetSnapshot(messages, config), [messages, config]);
}
/* c8 ignore stop */
