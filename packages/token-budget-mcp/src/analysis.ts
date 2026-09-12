import {
  TokenBudget,
  strategies,
} from "@shivam.dixit/token-budget";
import type { BudgetMessage, Role } from "@shivam.dixit/token-budget";

export const STRATEGY_INFO = {
  dropOldest: { summary: "Evicts the oldest eligible context first.", strengths: ["simple", "predictable"], tradeoffs: ["can discard important early context"] },
  slidingWindow: { summary: "Keeps the most recent conversational turns.", strengths: ["strong recency", "turn continuity"], tradeoffs: ["may discard older context"] },
  priority: { summary: "Preserves messages using explicit priority metadata.", strengths: ["respects caller priorities"], tradeoffs: ["needs meaningful priorities"] },
  smartPriority: { summary: "Combines structural, priority, pinned, and tool-aware preservation.", strengths: ["handles agent context structure"], tradeoffs: ["more policy-driven than oldest-first"] },
} as const;

export const ANALYSIS_STRATEGIES = [
  "dropOldest",
  "slidingWindow",
  "priority",
  "smartPriority",
] as const;
export type AnalysisStrategy = (typeof ANALYSIS_STRATEGIES)[number];
export type InputMessage = {
  role: Role;
  content: string;
  pinned?: boolean;
  priority?: number;
  toolCallId?: string;
};

export type AnalyzedMessage = { index: number; role: Role; tokens: number; pinned: boolean; priority: number; toolCallId?: string; preview: string };

const PREVIEW_LIMIT = 120;

function strategyFor(name: AnalysisStrategy, turns = 2) {
  if (name === "slidingWindow") return strategies.slidingWindow({ turns });
  if (name === "priority") return strategies.priority();
  if (name === "smartPriority") return strategies.smartPriority();
  return strategies.dropOldest();
}

function normalizedMessages(budget: TokenBudget): AnalyzedMessage[] {
  return budget.getMessages().map((message, index) => ({ index, role: message.role, tokens: message.tokens ?? 0, pinned: message.pinned === true, priority: message.priority ?? 0, toolCallId: message.toolCallId, preview: typeof message.content === "string" ? message.content.slice(0, PREVIEW_LIMIT) : "[content blocks]" }));
}

export function makeBudget(
  messages: InputMessage[],
  maxTokens: number | undefined,
  reserve: number,
  model: string | undefined,
  strategy: AnalysisStrategy,
  turns?: number,
) {
  const budget = new TokenBudget({
    maxTokens,
    reserve,
    model,
    strategy: strategyFor(strategy, turns),
  });
  messages.forEach((message, index) =>
    budget.addMessage({ ...message, metadata: { analysisIndex: index } }),
  );
  return budget;
}

export function analyzeConversation(
  messages: InputMessage[],
  maxTokens: number | undefined,
  reserve: number,
  model?: string,
) {
  const budget = makeBudget(messages, maxTokens, reserve, model, "dropOldest");
  const stats = budget.stats();
  const effectiveBudget = budget.effectiveBudget;
  const normalized = normalizedMessages(budget);
  const byRole = Object.fromEntries(
    (["system", "user", "assistant", "tool"] as Role[]).map((role) => {
      const roleMessages = normalized.filter((message) => message.role === role);
      return [role, { messageCount: roleMessages.length, tokens: roleMessages.reduce((total, message) => total + message.tokens, 0) }];
    }),
  );
  const pinnedMessages = normalized.filter((message) => message.pinned);
  const pinnedTokens = pinnedMessages.reduce((total, message) => total + message.tokens, 0);
  const warnings: Array<{ code: string; message: string }> = [];
  const utilization = effectiveBudget > 0 ? stats.tokensUsed / effectiveBudget : null;
  if (utilization !== null && utilization >= 0.8)
    warnings.push({
      code: "HIGH_UTILIZATION",
      message: "Conversation uses at least 80% of the effective budget.",
    });
  if (pinnedTokens > effectiveBudget * 0.25)
    warnings.push({
      code: "PINNED_CONTEXT_LARGE",
      message: "Pinned content uses more than 25% of the effective budget.",
    });
  if (byRole.tool!.tokens > stats.tokensUsed * 0.4)
    warnings.push({
      code: "TOOL_OUTPUT_DOMINANT",
      message: "Tool messages account for more than 40% of current context.",
    });
  if (stats.tokensUsed > effectiveBudget)
    warnings.push({
      code: "OVER_BUDGET",
      message: "Current messages exceed the effective budget.",
    });
  if (pinnedTokens > effectiveBudget)
    warnings.push({
      code: "PINNED_CONTENT_EXCEEDS_BUDGET",
      message: "Pinned content alone exceeds the effective budget.",
    });
  return {
    messageCount: messages.length,
    totalTokens: stats.tokensUsed,
    maxTokens: stats.maxTokens,
    reserve: stats.reserve,
    effectiveBudget,
    remainingTokens: stats.tokensRemaining,
    utilization,
    fits: stats.tokensUsed <= effectiveBudget,
    byRole,
    pinned: {
      messageCount: pinnedMessages.length,
      tokens: pinnedTokens,
      fractionOfBudget: effectiveBudget > 0 ? pinnedTokens / effectiveBudget : null,
    },
    largestMessages: normalized
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5),
    warnings,
  };
}

export async function compareStrategies(
  messages: InputMessage[],
  maxTokens: number | undefined,
  reserve: number,
  model: string | undefined,
  requested: AnalysisStrategy[] = [...ANALYSIS_STRATEGIES],
  turns = 2,
  includeMessages = false,
) {
  const results: Array<Record<string, unknown>> = [];
  const keptByStrategy = new Map<string, Set<number>>();
  for (const name of requested) {
    const budget = makeBudget(messages, maxTokens, reserve, model, name, turns);
    const context = await budget.getContext();
    const keptIndexes = new Set(
      context.messages.map(
        (message) => message.metadata?.analysisIndex as number,
      ),
    );
    keptByStrategy.set(name, keptIndexes);
    results.push({
      strategy: name,
      messagesKept: context.messages.length,
      messagesEvicted: context.evicted.length,
      tokensKept: context.tokensUsed,
      tokensRemaining: context.tokensRemaining,
      budgetUtilization: budget.effectiveBudget > 0 ? context.tokensUsed / budget.effectiveBudget : null,
      pinnedKept: context.messages.filter((message) => message.pinned).length,
      pinnedEvicted: context.evicted.filter((message) => message.pinned).length,
      toolMessagesKept: context.messages.filter(
        (message) => message.role === "tool",
      ).length,
      toolMessagesEvicted: context.evicted.filter((message) => message.role === "tool").length,
      oldestSurvivingMessageIndex: keptIndexes.size
        ? Math.min(...keptIndexes)
        : null,
      newestEvictedMessageIndex: context.evicted.length
        ? Math.max(...context.evicted.map((message) => message.metadata?.analysisIndex as number))
        : null,
      ...(includeMessages
        ? {
            messages: context.messages.map((message) => ({
              role: message.role,
              tokens: message.tokens,
              preview:
                typeof message.content === "string"
                  ? message.content.slice(0, PREVIEW_LIMIT)
                  : "[content blocks]",
            })),
          }
        : {}),
    });
  }
  const allDifferences = messages
    .map((_, index) => ({
      messageIndex: index,
      keptBy: [...keptByStrategy.entries()]
        .filter(([, kept]) => kept.has(index))
        .map(([name]) => name),
      evictedBy: [...keptByStrategy.entries()]
        .filter(([, kept]) => !kept.has(index))
        .map(([name]) => name),
    }))
    .filter(
      (difference) =>
        difference.keptBy.length > 0 && difference.evictedBy.length > 0,
    )
  const differences = allDifferences.slice(0, 50);
  return {
    input: analyzeConversation(messages, maxTokens, reserve, model),
    strategies: results,
    differences,
    totalDifferences: allDifferences.length,
    returnedDifferences: differences.length,
    resultsTruncated: allDifferences.length > differences.length,
  };
}

export function diagnoseBudget(
  messages: InputMessage[],
  maxTokens: number | undefined,
  reserve: number,
  model?: string,
) {
  const analysis = analyzeConversation(messages, maxTokens, reserve, model);
  const findings: Array<{
    code: string;
    severity: "info" | "warning" | "critical";
    message: string;
    evidence?: unknown;
  }> = [];
  const toolTokens = analysis.byRole.tool!.tokens;
  if (toolTokens > analysis.totalTokens * 0.4)
    findings.push({
      code: "TOOL_OUTPUT_DOMINANT",
      severity: "warning",
      message: "Tool messages account for more than 40% of current context.",
      evidence: {
        toolTokens,
        totalTokens: analysis.totalTokens,
        fraction: toolTokens / analysis.totalTokens,
      },
    });
  if (analysis.pinned.messageCount)
    findings.push({
      code: "PINNED_CONTEXT_PRESENT",
      severity: analysis.pinned.fractionOfBudget !== null && analysis.pinned.fractionOfBudget > 0.25 ? "warning" : "info",
      message: "Pinned context is present and consumes budget.",
      evidence: analysis.pinned,
    });
  if (messages.some((message) => message.priority !== undefined))
    findings.push({
      code: "PRIORITY_METADATA_PRESENT",
      severity: "info",
      message: "Priority metadata is available for priority-aware strategies.",
    });
  if (messages.length > 40)
    findings.push({
      code: "LONG_HISTORY",
      severity: "info",
      message: "Conversation contains more than 40 messages.",
      evidence: { messageCount: messages.length },
    });
  if (!analysis.fits)
    findings.push({
      code: "OVER_BUDGET",
      severity: "critical",
      message: "Conversation exceeds the effective budget.",
      evidence: {
        totalTokens: analysis.totalTokens,
        effectiveBudget: analysis.effectiveBudget,
      },
    });
  return { analysis, findings };
}

export function recommendStrategy(
  messages: InputMessage[],
  maxTokens: number | undefined,
  reserve: number,
  model?: string,
) {
  const explicitPriorities = messages.filter((message) => message.priority !== undefined);
  const priorityValues = [...new Set(explicitPriorities.map((message) => message.priority))];
  const priorityMeaningful = priorityValues.length > 1;
  const toolCount = messages.filter((message) => message.role === "tool").length;
  const userTurns = messages.filter((message) => message.role === "user").length;
  const pinnedCount = messages.filter((message) => message.pinned).length;
  const scores: Record<AnalysisStrategy, number> = {
    dropOldest: messages.length > 0 ? 2 : 0,
    slidingWindow: userTurns >= 3 ? 3 : 0,
    priority: explicitPriorities.length / Math.max(1, messages.length) >= 0.5 && priorityMeaningful ? 5 : 0,
    smartPriority: 0,
  };
  if (!explicitPriorities.length) scores.dropOldest += 1;
  if (userTurns >= 3 && !priorityMeaningful) scores.slidingWindow += 1;
  if (toolCount >= 3) scores.smartPriority += 4;
  if (pinnedCount >= 2) scores.smartPriority += 2;
  if (pinnedCount >= 1 && toolCount >= 1) scores.smartPriority += 4;
  if (priorityMeaningful) scores.smartPriority += 2;
  const ranked = [...ANALYSIS_STRATEGIES].sort((a, b) => scores[b] - scores[a]);
  const recommended = ranked[0] ?? "dropOldest";
  const scoreMargin = scores[ranked[0] ?? "dropOldest"] - scores[ranked[1] ?? "dropOldest"];
  const confidence = scoreMargin >= 4 ? "high" : scoreMargin >= 2 ? "medium" : "low";
  const reasons = [];
  if (toolCount >= 3)
    reasons.push({
      code: "HAS_TOOL_RESULTS",
      message:
        "Tool-result history benefits from relationship-aware preservation.",
    });
  if (pinnedCount)
    reasons.push({
      code: "HAS_PINNED_CONTEXT",
      message: "Pinned context should be preserved when possible.",
    });
  if (priorityMeaningful)
    reasons.push({
      code: "HAS_PRIORITY_METADATA",
      message: "Meaningful priorities are present.",
    });
  if (!reasons.length)
    reasons.push({
      code: "SIMPLE_RECENCY",
      message:
        "No special metadata is present, so straightforward recency preservation is a clear default.",
    });
  return {
    recommended,
    confidence,
    scores,
    scoreMargin,
    reasons,
    alternatives: ANALYSIS_STRATEGIES.filter(
      (name) => name !== recommended,
    ).map((name) => ({
      strategy: name,
      summary: STRATEGY_INFO[name].summary,
      tradeoffs: STRATEGY_INFO[name].tradeoffs,
    })),
  };
}

export function simulatePressure(
  messages: InputMessage[],
  maxTokens: number | undefined,
  reserve: number,
  model: string | undefined,
  strategy: AnalysisStrategy,
  increments: number[],
  turns = 2,
) {
  const current = analyzeConversation(messages, maxTokens, reserve, model);
  return {
    current,
    pressure: increments.map((additionalTokens) => ({
      additionalTokens,
      wouldOverflow:
        current.totalTokens + additionalTokens > current.effectiveBudget,
      tokensRemaining: Math.max(
        0,
        current.effectiveBudget - current.totalTokens - additionalTokens,
      ),
      estimatedTokensToEvict: Math.max(
        0,
        current.totalTokens + additionalTokens - current.effectiveBudget,
      ),
      exactness:
        "estimated: future tokens are not assigned to message boundaries",
      strategy,
      turns,
    })),
  };
}

export function findBreakpoint(
  messages: InputMessage[],
  maxTokens: number | undefined,
  reserve: number,
  model: string | undefined,
  averageFutureMessageTokens: number,
) {
  const current = analyzeConversation(messages, maxTokens, reserve, model);
  const untilBudget = Math.max(
    0,
    current.effectiveBudget - current.totalTokens,
  );
  const untilWarning = Math.max(
    0,
    current.effectiveBudget * 0.8 - current.totalTokens,
  );
  return {
    tokensUntilWarning: untilWarning,
    tokensUntilBudget: untilBudget,
    estimatedMessagesUntilWarning: Math.floor(
      untilWarning / averageFutureMessageTokens,
    ),
    estimatedMessagesUntilBudget: Math.floor(
      untilBudget / averageFutureMessageTokens,
    ),
    alreadyOverBudget: !current.fits,
    impossiblePinnedContent: current.pinned.tokens > current.effectiveBudget,
  };
}
