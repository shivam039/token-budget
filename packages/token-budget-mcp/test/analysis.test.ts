import { describe, expect, it } from "vitest";
import {
  analyzeConversation,
  compareStrategies,
  diagnoseBudget,
  findBreakpoint,
  recommendStrategy,
  simulatePressure,
} from "../src/analysis.js";

const chat = [
  { role: "system" as const, content: "Be concise", pinned: true },
  { role: "user" as const, content: "Hello" },
  { role: "assistant" as const, content: "Hi there" },
  { role: "tool" as const, content: "result", toolCallId: "call-1" },
];

function assertFinite(value: unknown): void {
  if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(assertFinite);
  else if (value && typeof value === "object") Object.values(value).forEach(assertFinite);
}

describe("Strategy Lab analytical engine", () => {
  it("reconciles core token accounting across roles and pinned context", () => {
    const result = analyzeConversation(chat, 200, 10);
    expect(Object.values(result.byRole).reduce((n, role) => n + role.messageCount, 0)).toBe(result.messageCount);
    expect(Object.values(result.byRole).reduce((n, role) => n + role.tokens, 0)).toBe(result.totalTokens);
    expect(result.pinned.tokens).toBeLessThanOrEqual(result.totalTokens);
    expect(result.remainingTokens).toBe(result.effectiveBudget - result.totalTokens);
  });

  it("handles empty and tiny contexts without non-finite JSON numbers", () => {
    const result = analyzeConversation([], 1, 0);
    expect(result.messageCount).toBe(0);
    expect(result.utilization).toBe(0);
    assertFinite(result);
  });

  it("reports bounded, truthful comparison metadata", async () => {
    const result = await compareStrategies(chat, 20, 0, undefined);
    expect(result.returnedDifferences).toBe(result.differences.length);
    expect(result.totalDifferences).toBeGreaterThanOrEqual(result.returnedDifferences);
    expect(result.resultsTruncated).toBe(result.totalDifferences > result.returnedDifferences);
    for (const entry of result.strategies) expect(entry.budgetUtilization === null || Number.isFinite(entry.budgetUtilization)).toBe(true);
  });

  it("keeps anonymous pressure in capacity mode and is monotonic", () => {
    const result = simulatePressure(chat, 200, 0, undefined, "dropOldest", [1, 100]);
    expect(result.pressure[0].tokensRemaining).toBeGreaterThanOrEqual(result.pressure[1].tokensRemaining);
    expect(result.pressure.every((step) => step.exactness.startsWith("estimated"))).toBe(true);
  });

  it("uses explicit breakpoint calculations", () => {
    const result = findBreakpoint(chat, 200, 0, undefined, 10);
    expect(result.tokensUntilWarning).toBeGreaterThanOrEqual(0);
    expect(result.estimatedMessagesUntilBudget).toBe(Math.floor(result.tokensUntilBudget / 10));
    assertFinite(result);
  });

  it("produces deterministic recommendations and evidence-backed findings", () => {
    const first = recommendStrategy(chat, 200, 0);
    expect(recommendStrategy(chat, 200, 0)).toEqual(first);
    expect(first.recommended).toBeTypeOf("string");
    const diagnosis = diagnoseBudget(chat, 20, 0);
    expect(diagnosis.findings.every((finding) => finding.evidence !== undefined)).toBe(true);
  });

  it("exposes bounded turn, tool, priority, and system metrics", () => {
    const result = analyzeConversation([
      { role: "system", content: "rules", pinned: true },
      { role: "user", content: "question", priority: 1 },
      { role: "assistant", content: "answer" },
      { role: "tool", content: "result", toolCallId: "call-1" },
      { role: "assistant", content: "follow-up" },
      { role: "user", content: "more", priority: 3 },
    ], 200, 10);
    expect(result.system.tokens).toBeGreaterThan(0);
    expect(result.pinned.messageCount).toBe(1);
    expect(result.turns.userTurns).toBe(2);
    expect(result.turns.assistantTurns).toBe(1);
    expect(result.tools.toolMessageCount).toBe(1);
    expect(result.tools.distinctToolCallIds).toBe(1);
    expect(result.priorities.meaningfulVariation).toBe(true);
    assertFinite(result);
  });

  it("does not make one incidental tool result a smartPriority mandate", () => {
    const result = recommendStrategy([
      { role: "user", content: "question" },
      { role: "assistant", content: "answer" },
      { role: "tool", content: "incidental result" },
    ], 200, 0);
    expect(result.scores.smartPriority).toBeLessThanOrEqual(result.scores.dropOldest);
  });

  it("keeps zero-size breakpoint estimates finite", () => {
    const result = findBreakpoint(chat, 200, 0, undefined, 0);
    expect(result.estimatedMessagesUntilWarning).toBe(0);
    expect(result.estimatedMessagesUntilBudget).toBe(0);
    assertFinite(result);
  });
});
