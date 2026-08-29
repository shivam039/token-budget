import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer as createNodeHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createServer as createMcpServer } from './server.js';

/**
 * Hosted (Streamable HTTP) entry point — a multi-tenant alternative to
 * `cli.ts`'s stdio transport, for running this as a shared, publicly
 * reachable service (e.g. on Render) instead of a local per-user process.
 *
 * Two session concepts exist here and must not be confused:
 * - an MCP *connection* (this file's `connections` map, keyed by the
 *   Streamable HTTP transport's own session id) — one per connected MCP
 *   client, each with its own `McpServer` + `SessionStore` for isolation;
 * - a *budget* session (`create_budget`'s `sessionId`, tracked inside that
 *   connection's `SessionStore`) — one per `TokenBudget` a client creates.
 *
 * A stdio server trusts its one local caller implicitly; this one can't —
 * every request needs a valid API key, and every limit below exists to
 * bound one misbehaving or forgetful client's memory footprint.
 */

export interface HttpServerConfig {
  port: number;
  apiKey: string;
  maxConnections: number;
  maxSessionsPerConnection: number;
  maxMessagesPerSession: number;
  maxContentLength: number;
}

function readConfig(env: NodeJS.ProcessEnv): HttpServerConfig {
  const apiKey = env.MCP_API_KEY;
  if (!apiKey) {
    throw new Error(
      'MCP_API_KEY environment variable is required to start the hosted HTTP server — ' +
        'refusing to start with no authentication rather than silently serving the internet.',
    );
  }
  const intEnv = (name: string, fallback: number, min = 1): number => {
    const raw = env[name];
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be an integer >= ${min}, got "${raw}".`);
    return n;
  };
  return {
    // PORT may be 0 ("let the OS assign a free port" — what listen(0) does), unlike every other limit here.
    port: intEnv('PORT', 3000, 0),
    apiKey,
    maxConnections: intEnv('MAX_CONNECTIONS', 20),
    maxSessionsPerConnection: intEnv('MAX_SESSIONS_PER_CONNECTION', 20),
    maxMessagesPerSession: intEnv('MAX_MESSAGES_PER_SESSION', 100),
    maxContentLength: intEnv('MAX_CONTENT_LENGTH', 20_000),
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

/** Constant-time comparison so response timing can't leak how much of a guessed key was correct. */
function isValidApiKey(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

function checkAuth(req: IncomingMessage, res: ServerResponse, apiKey: string): boolean {
  const header = req.headers.authorization;
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!provided || !isValidApiKey(provided, apiKey)) {
    sendJson(res, 401, { error: 'Unauthorized — send "Authorization: Bearer <MCP_API_KEY>".' });
    return false;
  }
  return true;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export function startHttpServer(config: HttpServerConfig = readConfig(process.env)): ReturnType<typeof createNodeHttpServer> {
  const connections = new Map<string, StreamableHTTPServerTransport>();

  async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkAuth(req, res, config.apiKey)) return;

    const headerSessionId = req.headers['mcp-session-id'];
    const sessionId = typeof headerSessionId === 'string' ? headerSessionId : undefined;
    const existing = sessionId ? connections.get(sessionId) : undefined;

    if (existing) {
      await existing.handleRequest(req, res);
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'No valid session ID provided' } });
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }

    if (!isInitializeRequest(body)) {
      sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'No valid session ID provided' } });
      return;
    }

    if (connections.size >= config.maxConnections) {
      sendJson(res, 503, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Server at capacity; try again shortly.' } });
      return;
    }

    let transport: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        connections.set(sid, transport);
      },
      onsessionclosed: (sid) => {
        connections.delete(sid);
      },
    });

    const mcpServer = createMcpServer({
      maxSessions: config.maxSessionsPerConnection,
      maxMessagesPerSession: config.maxMessagesPerSession,
      maxContentLength: config.maxContentLength,
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  const httpServer = createNodeHttpServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }
    if (url.pathname === '/mcp') {
      /* c8 ignore start -- last-resort net for an exception handleMcpRequest's own try/catches don't
         already cover (e.g. the SDK's transport internals); no test input in this suite reaches it. */
      void handleMcpRequest(req, res).catch((error: unknown) => {
        console.error('[token-budget-mcp] request error:', error);
        if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
      });
      /* c8 ignore stop */
      return;
    }
    sendJson(res, 404, { error: 'Not found. POST/GET/DELETE /mcp, GET /healthz.' });
  });

  httpServer.listen(config.port, () => {
    console.error(`[token-budget-mcp] hosted HTTP server listening on :${config.port} (max ${config.maxConnections} connections)`);
  });

  return httpServer;
}
