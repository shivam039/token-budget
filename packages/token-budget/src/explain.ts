import type { ExplainReport, StrategyStepTrace, TraceDecision } from './types.js';

export type ExplainSummaryMode = 'compact' | 'verbose';

export interface ExplainSummaryStep {
  strategyName: string;
  tokensBefore: number;
  tokensAfter: number;
  messagesConsidered: number;
  evictedCount: number;
  synthesizedCount: number;
  evicted?: TraceDecision[];
  synthesized?: StrategyStepTrace['synthesized'];
}

/** A small, JSON-friendly roll-up of an ExplainReport. */
export interface ExplainSummary {
  strategyApplied: string;
  timestamp: number;
  tokensBefore: number;
  tokensAfter: number;
  tokensRemaining: number;
  totals: { steps: number; evicted: number; synthesized: number };
  steps: ExplainSummaryStep[];
}

/**
 * Creates a machine-readable summary without changing the raw ExplainReport.
 * Compact mode keeps per-step counts; verbose mode also includes every reason
 * and synthetic-message source list.
 */
export function summarizeExplain(report: ExplainReport, mode: ExplainSummaryMode = 'compact'): ExplainSummary {
  const steps = report.steps.map((step): ExplainSummaryStep => ({
    strategyName: step.strategyName,
    tokensBefore: step.tokensBefore,
    tokensAfter: step.tokensAfter,
    messagesConsidered: step.messagesConsidered,
    evictedCount: step.evicted.length,
    synthesizedCount: step.synthesized.length,
    ...(mode === 'verbose' ? { evicted: step.evicted.map((item) => ({ ...item })), synthesized: step.synthesized.map((item) => ({ ...item, sourceIds: [...item.sourceIds] })) } : {}),
  }));

  return {
    strategyApplied: report.strategyApplied,
    timestamp: report.timestamp,
    tokensBefore: report.tokensBefore,
    tokensAfter: report.tokensAfter,
    tokensRemaining: report.tokensRemaining,
    totals: {
      steps: steps.length,
      evicted: steps.reduce((sum, step) => sum + step.evictedCount, 0),
      synthesized: steps.reduce((sum, step) => sum + step.synthesizedCount, 0),
    },
    steps,
  };
}

/** Formats an ExplainReport for logs, terminals, and human-readable support reports. */
export function formatExplain(report: ExplainReport, mode: ExplainSummaryMode = 'compact'): string {
  const summary = summarizeExplain(report, mode);
  const lines = [
    `Strategy: ${summary.strategyApplied}`,
    `Tokens: ${summary.tokensBefore} → ${summary.tokensAfter} (${summary.tokensRemaining} remaining)`,
    `Steps: ${summary.totals.steps}; eviction decisions: ${summary.totals.evicted}; summaries: ${summary.totals.synthesized}`,
  ];

  for (const step of summary.steps) {
    lines.push(`- ${step.strategyName}: ${step.tokensBefore} → ${step.tokensAfter}; ${step.evictedCount} evicted; ${step.synthesizedCount} summarized`);
    if (mode === 'verbose') {
      for (const entry of step.evicted ?? []) lines.push(`  evicted ${entry.id}: ${entry.reason}`);
      for (const entry of step.synthesized ?? []) lines.push(`  summarized ${entry.sourceIds.length} message(s) into ${entry.id}: ${entry.reason}`);
    }
  }
  return lines.join('\n');
}
