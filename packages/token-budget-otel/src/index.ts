import { type Meter, type Tracer, trace, metrics } from '@opentelemetry/api';
import type { TokenBudget, UsageReport } from 'token-budget';

export interface OTelConfig {
  meterProviderName?: string;
  tracerProviderName?: string;
  meter?: Meter;
  tracer?: Tracer;
}

/**
 * Wires OpenTelemetry spans/counters up to an already-constructed
 * `TokenBudget`: one span per strategy decision (`decision` event), one
 * per `costWarning`/`overflow`, and counters for tokens consumed, cost
 * accrued, and messages evicted — updated from each `usageSnapshot` (the
 * lifetime usage ledger), via `budget.on('usageSnapshot', ...)`.
 *
 * Also returns the raw snapshot handler, in case you want to feed it
 * usage reports manually (e.g. replaying serialized history) — but you
 * don't need to call it yourself for normal use: this function already
 * subscribes it to the budget's `usageSnapshot` event, which is what
 * actually keeps the counters live. `onUsageSnapshot` in `TokenBudget`'s
 * config only fires at construction time, which doesn't help here since
 * `instrumentBudget` receives an already-constructed budget — subscribing
 * via `on()` is the only way to attach after the fact.
 */
export function instrumentBudget(budget: TokenBudget, config: OTelConfig = {}): (report: UsageReport, timestamp: number) => void {
  const meter = config.meter ?? metrics.getMeter(config.meterProviderName ?? 'token-budget');
  const tracer = config.tracer ?? trace.getTracer(config.tracerProviderName ?? 'token-budget');

  const tokensConsumedCounter = meter.createCounter('token_budget.tokens_consumed', {
    description: 'Total tokens consumed by the budget',
  });
  const costAccruedCounter = meter.createCounter('token_budget.cost_accrued', {
    description: 'Total cost accrued (in USD)',
  });
  const evictionsCounter = meter.createCounter('token_budget.evictions', {
    description: 'Total number of messages evicted or summarized',
  });

  // Tracks the last-seen cumulative snapshot so counters record deltas,
  // not the running total (OTel counters are meant to be incremented, not
  // set).
  let lastReport: UsageReport | null = null;

  budget.on('decision', (report) => {
    tracer.startActiveSpan('token_budget.decision', (span) => {
      span.setAttribute('strategy', report.strategyApplied);
      span.setAttribute('tokens.before', report.tokensBefore);
      span.setAttribute('tokens.after', report.tokensAfter);

      let totalEvicted = 0;
      for (const step of report.steps) {
        if (step.evicted.length > 0) {
          totalEvicted += step.evicted.length;
          evictionsCounter.add(step.evicted.length, { strategy: step.strategyName });
        }
      }

      span.setAttribute('evictions.total', totalEvicted);
      span.end();
    });
  });

  budget.on('costWarning', (info) => {
    tracer.startActiveSpan('token_budget.costWarning', (span) => {
      span.setAttribute('cost.cumulative', info.cumulativeCost);
      span.setAttribute('cost.threshold', info.threshold);
      span.end();
    });
  });

  budget.on('overflow', (info) => {
    tracer.startActiveSpan('token_budget.overflow', (span) => {
      span.setAttribute('overflow.reason', info.reason);
      span.setAttribute('tokens.used', info.tokensUsed);
      span.end();
    });
  });

  const onUsageSnapshot = (report: UsageReport, _timestamp: number): void => {
    const reportTags = report.tags ?? {};

    const lastTokens = lastReport?.totalTokensConsumed ?? { user: 0, assistant: 0, system: 0, tool: 0 };
    for (const [role, count] of Object.entries(report.totalTokensConsumed)) {
      const lastCount = (lastTokens as Record<string, number>)[role] ?? 0;
      if (count > lastCount) {
        tokensConsumedCounter.add(count - lastCount, { role, ...reportTags });
      }
    }

    if (report.totalCost) {
      const lastCost = lastReport?.totalCost?.totalCost ?? 0;
      if (report.totalCost.totalCost > lastCost) {
        costAccruedCounter.add(report.totalCost.totalCost - lastCost, { ...reportTags });
      }
    }

    lastReport = JSON.parse(JSON.stringify(report)) as UsageReport;
  };

  budget.on('usageSnapshot', onUsageSnapshot);

  return onUsageSnapshot;
}
