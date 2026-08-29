import { TokenBudget } from '@shivam.dixit/token-budget';

function generateSessionId(): string {
  const cryptoObj: { randomUUID?: () => string } | undefined = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export interface SessionStoreOptions {
  /**
   * Caps concurrent sessions this store will hold; `create()` throws once
   * full. Unset (default) is unlimited — correct for the stdio CLI, where
   * one process serves one local user who can already see and manage
   * their own sessions. The hosted HTTP server sets this per MCP
   * connection, since it can't trust a remote caller not to leak sessions
   * by simply forgetting to call `remove_session`.
   */
  maxSessions?: number;
}

/**
 * In-memory session store, keyed by a generated session id. Each MCP tool
 * call is stateless on its own (that's how MCP tools work); sessions are
 * what let `add_message`/`get_context`/`explain` calls made across several
 * separate tool calls act on the *same* growing `TokenBudget` buffer,
 * mirroring how a real agent loop uses one long-lived instance turn after
 * turn. One store belongs to one running server process — nothing is
 * persisted (the library's own `serialize()`/`deserialize()` cover that,
 * out of scope here) — and a fresh store per `createServer()` call keeps
 * tests isolated from each other instead of sharing module-level state.
 */
export class SessionStore {
  private sessions = new Map<string, TokenBudget>();
  private readonly maxSessions: number | undefined;

  constructor(options: SessionStoreOptions = {}) {
    this.maxSessions = options.maxSessions;
  }

  create(budget: TokenBudget): string {
    if (this.maxSessions !== undefined && this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Session limit reached (${this.maxSessions}). Call remove_session to free one up before creating another.`,
      );
    }
    const id = generateSessionId();
    this.sessions.set(id, budget);
    return id;
  }

  /** Throws a clear, listable error rather than a bare "undefined" if the id is unknown or was removed. */
  require(sessionId: string): TokenBudget {
    const budget = this.sessions.get(sessionId);
    if (!budget) {
      const known = [...this.sessions.keys()];
      throw new Error(
        `No session "${sessionId}". ` +
          (known.length > 0 ? `Known sessions: ${known.join(', ')}.` : 'No sessions exist yet — call create_budget first.'),
      );
    }
    return budget;
  }

  remove(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  listIds(): string[] {
    return [...this.sessions.keys()];
  }
}
