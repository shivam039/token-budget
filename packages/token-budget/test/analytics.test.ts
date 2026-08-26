import { describe, it, expect, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import type { Role } from '../src/types.js';

describe('Cost & Analytics Core (Phase 3)', () => {
  it('tracks cumulative cost and total tokens properly', () => {
    const budget = new TokenBudget({
      maxTokens: 1000,
      model: 'test-model',
      costModel: {
        costPerToken: (_role: Role, _model: string, dir) => (dir === 'input' ? 0.001 : 0.002),
      },
    });

    budget.addMessage({ role: 'user', content: 'hello' });

    const usage = budget.getUsageReport();
    expect(usage.totalMessagesProcessed).toBe(1);
    expect(usage.totalTokensConsumed.user).toBeGreaterThan(0);
    expect(usage.totalCost?.inputCost).toBeGreaterThan(0);
    expect(usage.totalCost?.outputCost).toBe(0);
    expect(usage.totalCost?.totalCost).toBe(usage.totalCost?.inputCost);
  });

  it('exposes cumulative cost via stats() too', () => {
    const budget = new TokenBudget({
      maxTokens: 1000,
      model: 'test-model',
      costModel: { costPerToken: () => 0.001 },
    });
    budget.addMessage({ role: 'user', content: 'hello' });
    expect(budget.stats().cost?.totalCost).toBeGreaterThan(0);
  });

  it('emits costWarning once when cost warning threshold is reached', () => {
    const costWarningHandler = vi.fn();
    const budget = new TokenBudget({
      maxTokens: 1000,
      model: 'expensive-model',
      costWarningThreshold: 0.1,
      costModel: { costPerToken: () => 1.0 }, // $1 per token
    });
    budget.on('costWarning', costWarningHandler);

    budget.addMessage({ role: 'user', content: 'hello' });
    expect(costWarningHandler).toHaveBeenCalledOnce();

    // Cumulative cost never decreases, so it shouldn't fire again.
    budget.addMessage({ role: 'user', content: 'world' });
    expect(costWarningHandler).toHaveBeenCalledOnce();
  });

  it('enforces maxCost with block-new-messages policy', () => {
    const budget = new TokenBudget({
      maxTokens: 1000,
      model: 'expensive-model',
      maxCost: 0.1,
      maxCostPolicy: 'block-new-messages',
      costModel: { costPerToken: () => 1.0 },
    });

    expect(() => {
      budget.addMessage({ role: 'user', content: 'hello' });
    }).toThrow(/maxCost ceiling.*reached/);
  });

  it('a message blocked by maxCost leaves usage/cost accounting untouched (no partial state)', () => {
    // Regression test: addMessage() used to update usageReport/cumulativeCost
    // *before* the blocking check ran, so a rejected message still
    // permanently inflated cost/usage counters for a message that was
    // never actually added to the buffer.
    const budget = new TokenBudget({
      maxTokens: 1000,
      model: 'expensive-model',
      maxCost: 0.1,
      maxCostPolicy: 'block-new-messages',
      costModel: { costPerToken: () => 1.0 },
    });

    expect(() => budget.addMessage({ role: 'user', content: 'hello' })).toThrow();

    const usage = budget.getUsageReport();
    expect(usage.totalMessagesProcessed).toBe(0);
    expect(usage.totalCost?.totalCost).toBe(0);
    expect(budget.getMessages()).toHaveLength(0);
    expect(budget.stats().messageCount).toBe(0);
  });

  it('enforces maxCost with a callback policy without blocking the message', () => {
    const policyCb = vi.fn();
    const budget = new TokenBudget({
      maxTokens: 1000,
      model: 'expensive-model',
      maxCost: 0.1,
      maxCostPolicy: policyCb,
      costModel: { costPerToken: () => 1.0 },
    });

    const msg = budget.addMessage({ role: 'user', content: 'hello' });
    expect(msg).toBeTruthy();
    expect(budget.getMessages()).toHaveLength(1);
    expect(policyCb).toHaveBeenCalledOnce();
    expect(policyCb).toHaveBeenCalledWith(expect.objectContaining({ cumulativeCost: expect.any(Number), threshold: 0.1, currency: 'USD' }));
  });

  it('exports usage as JSON and CSV', () => {
    const budget = new TokenBudget({
      maxTokens: 1000,
      model: 'expensive-model',
      tags: { tenantId: 'tenant-123' },
      costModel: { costPerToken: () => 0.001 },
    });

    budget.addMessage({ role: 'user', content: 'hello' });
    const json = JSON.parse(budget.exportUsageJSON());
    expect(json.totalMessagesProcessed).toBe(1);
    expect(json.tags.tenantId).toBe('tenant-123');

    const csv = budget.exportUsageCSV();
    expect(csv).toContain('totalMessagesProcessed,1');
    expect(csv).toContain('inputCost');
  });

  it('emits usageSnapshot on every getContext() call by default', () => {
    const snapshotCb = vi.fn();
    const budget = new TokenBudget({ maxTokens: 1000, onUsageSnapshot: snapshotCb });

    budget.addMessage({ role: 'user', content: 'hello' });
    expect(snapshotCb).not.toHaveBeenCalled(); // only fires from getContext()/getContextSync()

    budget.getContextSync();
    expect(snapshotCb).toHaveBeenCalledOnce();
    expect(snapshotCb.mock.calls[0]![0].totalMessagesProcessed).toBe(1);
  });

  it('usageSnapshotIntervalMs throttles emissions instead of suppressing them entirely', async () => {
    const snapshotCb = vi.fn();
    const budget = new TokenBudget({ maxTokens: 1000, onUsageSnapshot: snapshotCb, usageSnapshotIntervalMs: 20 });

    budget.addMessage({ role: 'user', content: 'a' });
    budget.getContextSync();
    expect(snapshotCb).toHaveBeenCalledTimes(1); // first call always fires

    budget.getContextSync();
    expect(snapshotCb).toHaveBeenCalledTimes(1); // too soon since the last snapshot

    await new Promise((resolve) => setTimeout(resolve, 25));
    budget.getContextSync();
    expect(snapshotCb).toHaveBeenCalledTimes(2); // interval elapsed
  });

  it('usageSnapshot can be subscribed to after construction via on()', () => {
    // This is what an instrumentation package (e.g. token-budget-otel)
    // relies on: it receives an already-constructed budget, so
    // onUsageSnapshot's constructor-only config can't help it.
    const budget = new TokenBudget({ maxTokens: 1000 });
    const handler = vi.fn();
    budget.on('usageSnapshot', handler);

    budget.addMessage({ role: 'user', content: 'hello' });
    budget.getContextSync();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("usageReport is a lifetime ledger — removeMessage doesn't retroactively adjust it", () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    const msg = budget.addMessage({ role: 'user', content: 'hello' });
    budget.removeMessage(msg.id);

    expect(budget.getUsageReport().totalMessagesProcessed).toBe(1);
    expect(budget.stats().messageCount).toBe(0);
  });
});
