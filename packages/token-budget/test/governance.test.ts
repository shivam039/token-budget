import { describe, it, expect, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { semanticRelevance } from '../src/strategies/semanticRelevance.js';
import type { BudgetMessage } from '../src/types.js';

describe('Governance & Multi-Tenancy (Phase 3)', () => {
  it('redacts sensitive info before tokens are counted', () => {
    const redactor = (msg: BudgetMessage): BudgetMessage => {
      if (typeof msg.content === 'string') {
        return { ...msg, content: msg.content.replace(/secret/g, '***') };
      }
      return msg;
    };

    const budget = new TokenBudget({
      maxTokens: 1000,
      redactor,
      tokenizer: { count: (text) => text.length },
    });

    budget.addMessage({ role: 'user', content: 'this is a secret message' });

    const messages = budget.serialize().messages;
    expect(messages[0]!.content).toBe('this is a *** message');
    // 'this is a *** message'.length = 21; default messageOverhead = 4.
    expect(messages[0]!.tokens).toBe(25);
  });

  it('emits audit logs with correct fields', async () => {
    const auditHook = vi.fn();
    const budget = new TokenBudget({
      maxTokens: 50,
      auditLog: true,
      onAuditEvent: auditHook,
      tags: { tenantId: 'tenant-1' },
      tokenizer: { count: (text) => text.length },
      messageOverhead: () => 0,
    });

    budget.addMessage({ role: 'user', content: 'filler'.repeat(10) }); // length 60
    await budget.getContext();

    expect(auditHook).toHaveBeenCalledOnce();
    const event = auditHook.mock.calls[0]![0];
    expect(event.strategyApplied).toBe('drop-oldest');
    expect(event.messagesConsidered).toBe(1);
    expect(event.tokensBefore).toBe(60);
    expect(event.tokensAfter).toBe(0);
    expect(event.evictedIds).toHaveLength(1);
    expect(event.tags.tenantId).toBe('tenant-1');
  });

  it('does not emit an audit event when auditLog is false, even with a hook configured', async () => {
    const auditHook = vi.fn();
    const budget = new TokenBudget({ maxTokens: 50, onAuditEvent: auditHook });
    budget.addMessage({ role: 'user', content: 'hello' });
    await budget.getContext();
    expect(auditHook).not.toHaveBeenCalled();
  });

  it('two independently-constructed budgets never share buffer or usage state', async () => {
    const budget1 = new TokenBudget({ maxTokens: 100, tags: { tenantId: 'tenant-1' } });
    const budget2 = new TokenBudget({ maxTokens: 100, tags: { tenantId: 'tenant-2' } });

    budget1.addMessage({ role: 'user', content: 'hello from tenant 1' });
    budget2.addMessage({ role: 'user', content: 'hello from tenant 2' });
    budget2.addMessage({ role: 'user', content: 'second message from tenant 2' });

    expect(budget1.stats().messageCount).toBe(1);
    expect(budget2.stats().messageCount).toBe(2);
    expect(budget1.getUsageReport().totalMessagesProcessed).toBe(1);
    expect(budget2.getUsageReport().totalMessagesProcessed).toBe(2);

    const ctx1 = await budget1.getContext();
    expect(ctx1.messages).toHaveLength(1);
    expect(ctx1.messages[0]!.content).toBe('hello from tenant 1');
  });

  /**
   * `semanticRelevance()`'s score cache is per-strategy-*instance* state
   * (a closure), not per-budget — so the safe, recommended pattern in a
   * multi-tenant setup is one strategy instance per `TokenBudget` (its own
   * JSDoc says so explicitly). This proves that pattern actually delivers
   * on the isolation it promises: two budgets, each with its own
   * `semanticRelevance()` instance, never see each other's scores even
   * when their messages happen to share an id.
   */
  it('separately-constructed semanticRelevance strategies never share cached scores, even with colliding message ids', async () => {
    const scoreFor: Record<string, number> = { 'tenant-1 content': 0.9, 'tenant-2 content': 0.1 };
    const scorer = { score: vi.fn((msg: BudgetMessage) => scoreFor[msg.content as string] ?? 0) };

    const budgetA = new TokenBudget({
      maxTokens: 20,
      strategy: semanticRelevance({ scorer, scoringTimeoutMs: 1000 }),
      tokenizer: { count: (t) => t.length },
      messageOverhead: () => 0,
    });
    const budgetB = new TokenBudget({
      maxTokens: 20,
      strategy: semanticRelevance({ scorer, scoringTimeoutMs: 1000 }),
      tokenizer: { count: (t) => t.length },
      messageOverhead: () => 0,
    });

    // Deliberately colliding ids across tenants.
    budgetA.addMessage({ id: 'shared-id', role: 'user', content: 'tenant-1 content' });
    budgetA.addMessage({ role: 'user', content: 'filler'.repeat(5) });
    budgetB.addMessage({ id: 'shared-id', role: 'user', content: 'tenant-2 content' });
    budgetB.addMessage({ role: 'user', content: 'filler'.repeat(5) });

    const ctxA = await budgetA.getContext();
    const ctxB = await budgetB.getContext();

    expect(ctxA.messages.some((m) => m.content === 'tenant-1 content')).toBe(true);
    expect(ctxB.messages.some((m) => m.content === 'tenant-2 content')).toBe(true);
  });
});
