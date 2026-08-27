import { describe, it, expect, vi, beforeEach } from 'vitest';
import { instrumentBudget } from '../src/index.js';
import { TokenBudget } from '@shivam.dixit/token-budget';

// Mock OTel since we just want to verify it calls the API correctly.
vi.mock('@opentelemetry/api', () => {
  const span = { setAttribute: vi.fn(), end: vi.fn() };
  const tracer = { startActiveSpan: vi.fn((_name: string, cb: (span: unknown) => void) => cb(span)) };
  const counter = { add: vi.fn() };
  const meter = { createCounter: vi.fn(() => counter) };
  return {
    trace: { getTracer: vi.fn(() => tracer) },
    metrics: { getMeter: vi.fn(() => meter) },
    tracerMock: tracer,
    meterMock: meter,
    counterMock: counter,
    spanMock: span,
  };
});

describe('token-budget-otel', () => {
  let tracerMock: any;
  let counterMock: any;
  let spanMock: any;

  beforeEach(async () => {
    const OTel = await import('@opentelemetry/api');
    tracerMock = (OTel as any).tracerMock;
    counterMock = (OTel as any).counterMock;
    spanMock = (OTel as any).spanMock;
    vi.clearAllMocks();
  });

  it('wires counters up to the real budget lifecycle — no manual invocation needed', () => {
    // Regression test: instrumentBudget() used to return a detached
    // callback the caller had to remember to invoke themselves, with no
    // way to actually connect it to real usage. It must now fire from
    // genuine getContext()/getContextSync() calls.
    const budget = new TokenBudget({ maxTokens: 1000, model: 'test-model', costModel: { costPerToken: () => 0.01 } });
    instrumentBudget(budget);

    budget.addMessage({ role: 'user', content: 'hello' });
    budget.getContextSync(); // this is what should trigger the usageSnapshot -> counter wiring

    expect(counterMock.add).toHaveBeenCalled();
    const tokenCall = counterMock.add.mock.calls.find((call: unknown[]) => (call[1] as any)?.role === 'user');
    expect(tokenCall).toBeTruthy();
    expect(tokenCall![0]).toBeGreaterThan(0);
  });

  it('the returned handler can also be invoked manually with a hand-built report', () => {
    const budget = new TokenBudget({ maxTokens: 100 });
    const onSnapshot = instrumentBudget(budget);

    onSnapshot(
      {
        totalMessagesProcessed: 1,
        totalTokensConsumed: { user: 10, assistant: 0, system: 0, tool: 0 },
        totalEvictions: {},
        totalCost: { inputCost: 0.1, outputCost: 0, totalCost: 0.1, currency: 'USD' },
      },
      Date.now(),
    );

    expect(counterMock.add).toHaveBeenCalledWith(10, { role: 'user' });
    expect(counterMock.add).toHaveBeenCalledWith(0.1, {});
  });

  it('emits spans on decision/overflow events', () => {
    const budget = new TokenBudget({ maxTokens: 100 });
    instrumentBudget(budget);

    budget.addMessage({ role: 'user', content: 'x'.repeat(1000) });
    expect(tracerMock.startActiveSpan).toHaveBeenCalledWith('token_budget.overflow', expect.any(Function));
    expect(spanMock.setAttribute).toHaveBeenCalledWith('overflow.reason', 'single-message-exceeds-budget');

    budget.getContextSync();
    expect(tracerMock.startActiveSpan).toHaveBeenCalledWith('token_budget.decision', expect.any(Function));
  });

  it('emits a costWarning span from a real cost-ceiling crossing', () => {
    const budget = new TokenBudget({
      maxTokens: 1000,
      model: 'expensive-model',
      costWarningThreshold: 0.01,
      costModel: { costPerToken: () => 1.0 },
    });
    instrumentBudget(budget);

    budget.addMessage({ role: 'user', content: 'hello' });
    expect(tracerMock.startActiveSpan).toHaveBeenCalledWith('token_budget.costWarning', expect.any(Function));
  });

  it('counter deltas do not double-count across repeated snapshots of the same cumulative state', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    instrumentBudget(budget);

    budget.addMessage({ role: 'user', content: 'hello' });
    budget.getContextSync();
    counterMock.add.mockClear();

    budget.getContextSync(); // no new messages since the last snapshot
    const tokenCall = counterMock.add.mock.calls.find((call: unknown[]) => (call[1] as any)?.role === 'user');
    expect(tokenCall).toBeUndefined(); // delta is 0, so add() shouldn't be called for tokens again
  });
});
