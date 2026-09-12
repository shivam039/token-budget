import {
  TokenBudget,
  createEstimateTokenizer,
  strategies,
} from "@shivam.dixit/token-budget";
import type { BudgetMessage, Role } from "@shivam.dixit/token-budget";

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

const PREVIEW_LIMIT = 120;

function strategyFor(name: AnalysisStrategy, turns = 2) {
  if (name === "slidingWindow") return strategies.slidingWindow({ turns });
  if (name === "priority") return strategies.priority();
  if (name === "smartPriority") return strategies.smartPriority();
  return strategies.dropOldest();
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
  const byRole = Object.fromEntries(
    (["system", "user", "assistant", "tool"] as Role[]).map((role) => {
      const roleMessages = messages.filter((message) => message.role === role);
      const tokens = roleMessages.reduce(
        (total, message) =>
          total +
          (message.content
            ? createEstimateTokenizer().count(message.content) + 4
            : 4),
        0,
      );
      return [role, { messageCount: roleMessages.length, tokens }];
    }),
  );
  const pinnedMessages = messages.filter((message) => message.pinned);
  const pinnedTokens = pinnedMessages.reduce(
    (total, message) =>
      total + createEstimateTokenizer().count(message.content) + 4,
    0,
  );
  const warnings: Array<{ code: string; message: string }> = [];
  const utilization = stats.tokensUsed / effectiveBudget;
  if (utilization >= 0.8)
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
      fractionOfBudget: pinnedTokens / effectiveBudget,
    },
    largestMessages: messages
      .map((message, index) => ({
        index,
        role: message.role,
        tokens: createEstimateTokenizer().count(message.content) + 4,
        preview: message.content.slice(0, PREVIEW_LIMIT),
      }))
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
      pinnedKept: context.messages.filter((message) => message.pinned).length,
      toolMessagesKept: context.messages.filter(
        (message) => message.role === "tool",
      ).length,
      oldestSurvivingMessageIndex: keptIndexes.size
        ? Math.min(...keptIndexes)
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
  const differences = messages
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
    .slice(0, 50);
  return {
    input: analyzeConversation(messages, maxTokens, reserve, model),
    strategies: results,
    differences,
    resultsTruncated: differences.length < messages.length,
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
      severity: analysis.pinned.fractionOfBudget > 0.25 ? "warning" : "info",
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
  const hasPriority = messages.some(
    (message) => message.priority !== undefined && message.priority !== 0,
  );
  const hasTools = messages.some((message) => message.role === "tool");
  const hasPinned = messages.some((message) => message.pinned);
  const recommended: AnalysisStrategy =
    hasPriority || hasTools || hasPinned ? "smartPriority" : "dropOldest";
  const reasons = [];
  if (hasTools)
    reasons.push({
      code: "HAS_TOOL_RESULTS",
      message:
        "Tool-result history benefits from relationship-aware preservation.",
    });
  if (hasPinned)
    reasons.push({
      code: "HAS_PINNED_CONTEXT",
      message: "Pinned context should be preserved when possible.",
    });
  if (hasPriority)
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
    confidence: reasons.length > 1 ? "high" : "medium",
    reasons,
    alternatives: ANALYSIS_STRATEGIES.filter(
      (name) => name !== recommended,
    ).map((name) => ({
      strategy: name,
      tradeoff:
        name === "slidingWindow"
          ? "Preserves recent conversational turns."
          : name === "priority"
            ? "Uses explicit priority metadata."
            : "Simple oldest-first eviction.",
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
