import { describe, expect, it } from 'vitest';
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';
import { escapeHtml, renderCompareTable, renderExplainPanel, renderResultList, renderStatsPanel } from '../src/render.js';

describe('escapeHtml', () => {
  it('escapes markup so untrusted message content cannot inject into the page', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('handles nullish input', () => {
    expect(escapeHtml(undefined)).toBe('');
  });
});

function budgetWithMessages() {
  const budget = new TokenBudget({ maxTokens: 30, strategy: strategies.dropOldest(), tokenizer: { count: (t) => Math.ceil(t.length / 4) } });
  budget.addMessage({ id: 'sys', role: 'system', content: 'pinned instruction', pinned: true });
  for (let i = 0; i < 10; i++) budget.addMessage({ id: `m${i}`, role: 'user', content: `message number ${i} with enough text to matter` });
  return budget;
}

describe('renderResultList against a real TokenBudget run', () => {
  it('tags evicted messages as EVICTED and survivors as KEPT, and the pinned message survives', async () => {
    const budget = budgetWithMessages();
    const original = budget.getMessages();
    const ctx = await budget.getContext();
    const html = renderResultList(original, ctx);

    expect(html).toContain('badge-evicted');
    expect(html).toContain('badge-kept');
    // the pinned system message must appear tagged PINNED and never EVICTED
    const sysRowStart = html.indexOf('pinned instruction');
    const sysRowContext = html.slice(Math.max(0, sysRowStart - 300), sysRowStart);
    expect(sysRowContext).toContain('badge-pinned');
    expect(sysRowContext).not.toContain('badge-evicted');
  });

  it('shows a placeholder before a budget has been applied', () => {
    expect(renderResultList([], undefined)).toContain('Click "Apply budget"');
  });
});

describe('renderStatsPanel', () => {
  it('reports before and after stats using real Stats/ContextResult shapes', async () => {
    const budget = budgetWithMessages();
    const before = budget.stats();
    const ctx = await budget.getContext();
    const html = renderStatsPanel(before, ctx, 30);
    expect(html).toContain(String(before.messageCount));
    expect(html).toContain(String(ctx.messages.length));
  });
});

describe('renderExplainPanel', () => {
  it('renders real eviction reasons from explain(), not placeholder text', async () => {
    const budget = budgetWithMessages();
    await budget.getContext();
    const report = budget.explain();
    const html = renderExplainPanel(report);
    expect(html).toContain('drop-oldest');
    expect(html).toMatch(/evicted <code>/);
  });

  it('shows a placeholder when nothing has run yet', () => {
    expect(renderExplainPanel(undefined)).toContain('Apply a budget');
  });
});

describe('renderCompareTable', () => {
  it('renders one row per strategy with escaped content', () => {
    const html = renderCompareTable([{ strategyName: 'dropOldest', description: 'oldest first', messagesKept: 5, tokens: 100, messagesRemoved: 3 }]);
    expect(html).toContain('dropOldest');
    expect(html).toContain('<td>5</td>');
    expect(html).toContain('<td>3</td>');
  });
});
