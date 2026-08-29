import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TokenBudget, strategies, truncateToolOutput, createEstimateTokenizer } from '@shivam.dixit/token-budget';
import type { BudgetMessage, Role } from '@shivam.dixit/token-budget';
import { SessionStore } from './sessions.js';

const STRATEGY_NAMES = ['dropOldest', 'slidingWindow', 'priority'] as const;
type StrategyName = (typeof STRATEGY_NAMES)[number];

/**
 * Builds the `Strategy` a `create_budget` call asked for. `summarizeOldest`
 * isn't offered here — it takes an async summarizer callback that would
 * have to live in-process, and there's no way for an MCP tool call itself
 * to *be* that callback (a synchronous decision, made once, from plain
 * JSON arguments) — see the package README's "What isn't exposed" section.
 */
function buildStrategy(name: StrategyName | undefined, slidingWindowTurns: number | undefined) {
  switch (name ?? 'dropOldest') {
    case 'dropOldest':
      return strategies.dropOldest();
    case 'priority':
      return strategies.priority();
    case 'slidingWindow':
      if (slidingWindowTurns === undefined) {
        throw new Error('strategy "slidingWindow" requires slidingWindowTurns to be set.');
      }
      return strategies.slidingWindow({ turns: slidingWindowTurns });
  }
}

function messageSummary(message: BudgetMessage) {
  return {
    id: message.id,
    role: message.role,
    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
    tokens: message.tokens ?? 0,
    pinned: message.pinned ?? false,
    priority: message.priority ?? 0,
    toolCallId: message.toolCallId,
  };
}

function textResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/**
 * Builds an MCP server exposing `token-budget` as callable tools: create a
 * budget session, add messages to it, get the strategy-applied context,
 * see why a decision was made, and truncate an oversized tool result — the
 * same operations a real agent's message loop performs in-process, made
 * callable one at a time so the library can be driven interactively from
 * Claude Code, Claude Desktop, or any other MCP client, for testing and
 * demonstration. See the package README for what this is (and isn't) for.
 */
export function createServer(): McpServer {
  const sessions = new SessionStore();

  const server = new McpServer({ name: 'token-budget-mcp', version: '0.1.0' });

  server.registerTool(
    'create_budget',
    {
      title: 'Create a token budget session',
      description:
        'Creates a new TokenBudget session and returns its sessionId — pass that to every other tool ' +
        'to act on the same growing buffer. maxTokens is required unless model names a recognized model ' +
        '(e.g. "gpt-4o", "claude-3-5-sonnet-20240620"), in which case its known context window is used.',
      inputSchema: {
        maxTokens: z.number().int().positive().optional().describe('Total context window size, in tokens.'),
        reserve: z.number().int().nonnegative().optional().describe('Tokens reserved for the model\'s output. Default 0.'),
        model: z.string().optional().describe('A model name — derives maxTokens if omitted, recognized name list in MODEL_CONTEXT_WINDOWS.'),
        strategy: z.enum(STRATEGY_NAMES).optional().describe('Eviction strategy. Default dropOldest.'),
        slidingWindowTurns: z.number().int().nonnegative().optional().describe('Required if strategy is "slidingWindow": how many recent turns to keep.'),
        warningThreshold: z.number().min(0).max(1).optional().describe('Fraction of budget that fires a warning. Default 0.8.'),
      },
    },
    async ({ maxTokens, reserve, model, strategy, slidingWindowTurns, warningThreshold }) => {
      try {
        const budget = new TokenBudget({
          maxTokens,
          reserve,
          model,
          warningThreshold,
          strategy: buildStrategy(strategy, slidingWindowTurns),
        });
        const sessionId = sessions.create(budget);
        return textResult({ sessionId, maxTokens: budget.maxTokens, reserve: budget.reserve, effectiveBudget: budget.effectiveBudget });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'add_message',
    {
      title: 'Add a message to a budget session',
      description: 'Appends a message to the session\'s buffer and returns its id, token cost, and timestamp.',
      inputSchema: {
        sessionId: z.string(),
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string(),
        pinned: z.boolean().optional().describe('Never evicted or summarized by any built-in strategy, regardless of age.'),
        priority: z.number().optional().describe('Higher = kept longer by the priority strategy. Default 0.'),
        toolCallId: z.string().optional().describe('Set to the id of the assistant message this tool result answers, for atomic pairing.'),
      },
    },
    async ({ sessionId, role, content, pinned, priority, toolCallId }) => {
      try {
        const budget = sessions.require(sessionId);
        const message = budget.addMessage({ role: role as Role, content, pinned, priority, toolCallId });
        return textResult(messageSummary(message));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'get_context',
    {
      title: 'Get the strategy-applied context',
      description:
        'Applies the session\'s configured strategy and returns what would actually be sent to a model: ' +
        'the surviving messages, tokens used/remaining, and which messages were evicted.',
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      try {
        const budget = sessions.require(sessionId);
        const result = await budget.getContext();
        return textResult({
          messages: result.messages.map(messageSummary),
          tokensUsed: result.tokensUsed,
          tokensRemaining: result.tokensRemaining,
          strategyApplied: result.strategyApplied,
          evicted: result.evicted.map(messageSummary),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'explain',
    {
      title: 'Explain the last get_context decision',
      description: 'Returns the structured trace of the most recent get_context call for this session: what was evicted/synthesized, and why.',
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      try {
        const budget = sessions.require(sessionId);
        const report = budget.explain();
        if (!report) return textResult({ explanation: null, note: 'get_context has not been called yet for this session.' });
        return textResult(report);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'stats',
    {
      title: 'Get current session stats',
      description: 'Current token usage, message count, and pinned count for a session, without applying the strategy.',
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      try {
        const budget = sessions.require(sessionId);
        return textResult(budget.stats());
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'truncate_tool_output',
    {
      title: 'Truncate an oversized tool result',
      description:
        'Shrinks text to fit maxTokens using truncateToolOutput() — for a single tool result too big for the ' +
        'whole strategy machinery to help with (eviction operates on whole messages). Stateless: no sessionId needed.',
      inputSchema: {
        text: z.string(),
        maxTokens: z.number().int().positive(),
        keep: z.enum(['start', 'end', 'both']).optional().describe('Which part to keep. Default "end".'),
      },
    },
    async ({ text, maxTokens, keep }) => {
      try {
        const tokenizer = createEstimateTokenizer();
        const tokensBefore = tokenizer.count(text);
        const truncated = truncateToolOutput(text, maxTokens, tokenizer, keep ? { keep } : undefined);
        return textResult({ truncated, tokensBefore, tokensAfter: tokenizer.count(truncated) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'list_sessions',
    {
      title: 'List active budget sessions',
      description: 'Lists every session id created so far in this server process, with a stats summary for each.',
      inputSchema: {},
    },
    async () => {
      const ids = sessions.listIds();
      return textResult(ids.map((id) => ({ sessionId: id, ...sessions.require(id).stats() })));
    },
  );

  server.registerTool(
    'remove_session',
    {
      title: 'Remove a budget session',
      description: 'Discards a session and its buffer. Returns false if the id was already unknown.',
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => textResult({ removed: sessions.remove(sessionId) }),
  );

  return server;
}
