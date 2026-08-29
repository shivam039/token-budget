import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startHttpServer, type HttpServerConfig } from '../src/http.js';

const baseConfig: HttpServerConfig = {
  port: 0, // 0 = let the OS assign a free port, so tests never collide
  apiKey: 'test-key-123',
  maxConnections: 20,
  maxSessionsPerConnection: 20,
  maxMessagesPerSession: 100,
  maxContentLength: 20_000,
};

/** `startHttpServer()`'s `.listen()` call is async; wait for it before reading the assigned port. */
function listening(server: Server): Promise<Server> {
  return new Promise((resolve) => server.on('listening', () => resolve(server)));
}

function urlFor(server: Server): URL {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('expected a network address, got a pipe/socket path');
  return new URL(`http://127.0.0.1:${address.port}/mcp`);
}

async function connectedClient(server: Server, apiKey: string) {
  const transport = new StreamableHTTPClientTransport(urlFor(server), { requestInit: { headers: { Authorization: `Bearer ${apiKey}` } } });
  const client = new Client({ name: 'http-test-client', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

describe('token-budget-mcp hosted HTTP server', () => {
  let server: Server | undefined;

  afterEach(async () => {
    server?.close();
    server = undefined;
    vi.unstubAllEnvs();
  });

  it('refuses to start without MCP_API_KEY set', () => {
    vi.stubEnv('MCP_API_KEY', '');
    expect(() => startHttpServer()).toThrow(/MCP_API_KEY environment variable is required/);
  });

  it('rejects a non-numeric limit env var with a clear error', () => {
    vi.stubEnv('MCP_API_KEY', 'x');
    vi.stubEnv('MAX_CONNECTIONS', 'not-a-number');
    expect(() => startHttpServer()).toThrow(/MAX_CONNECTIONS must be an integer >= 1/);
  });

  it('GET /healthz needs no auth', async () => {
    server = await listening(startHttpServer(baseConfig));
    const res = await fetch(new URL('/healthz', urlFor(server)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('POST /mcp without an Authorization header is rejected', async () => {
    server = await listening(startHttpServer(baseConfig));
    const res = await fetch(urlFor(server), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
  });

  it('POST /mcp with the wrong key is rejected', async () => {
    server = await listening(startHttpServer(baseConfig));
    const res = await fetch(urlFor(server), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-key' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('an unknown path returns 404', async () => {
    server = await listening(startHttpServer(baseConfig));
    const res = await fetch(new URL('/nope', urlFor(server)));
    expect(res.status).toBe(404);
  });

  it('a real authenticated client can list tools and drive a full session over HTTP', async () => {
    server = await listening(startHttpServer(baseConfig));
    const client = await connectedClient(server, baseConfig.apiKey);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('create_budget');

      const created = await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } });
      const { sessionId } = JSON.parse((created.content as Array<{ text: string }>)[0].text);

      await client.callTool({ name: 'add_message', arguments: { sessionId, role: 'user', content: 'hi' } });
      const context = await client.callTool({ name: 'get_context', arguments: { sessionId } });
      const parsed = JSON.parse((context.content as Array<{ text: string }>)[0].text);
      expect(parsed.messages).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it('enforces maxConnections across separate MCP clients', async () => {
    server = await listening(startHttpServer({ ...baseConfig, maxConnections: 1 }));
    const first = await connectedClient(server, baseConfig.apiKey);
    try {
      // A second client's very first request (its own initialize) has no
      // session id yet, so it takes the "create a new connection" path --
      // exactly what maxConnections gates.
      const second = new StreamableHTTPClientTransport(urlFor(server), {
        requestInit: { headers: { Authorization: `Bearer ${baseConfig.apiKey}` } },
      });
      const secondClient = new Client({ name: 'second', version: '0.0.0' });
      await expect(secondClient.connect(second)).rejects.toThrow();
    } finally {
      await first.close();
    }
  });

  it('reads port/limits from valid numeric env vars', async () => {
    vi.stubEnv('MCP_API_KEY', 'env-key');
    vi.stubEnv('PORT', '0');
    vi.stubEnv('MAX_CONNECTIONS', '5');
    server = await listening(startHttpServer());
    const client = await connectedClient(server, 'env-key');
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    await client.close();
  });

  it('an authenticated POST with an empty body is rejected as no valid session', async () => {
    server = await listening(startHttpServer(baseConfig));
    const res = await fetch(urlFor(server), {
      method: 'POST',
      headers: { authorization: `Bearer ${baseConfig.apiKey}` },
    });
    expect(res.status).toBe(400);
  });

  it('an authenticated POST with malformed JSON is rejected with a parse error', async () => {
    server = await listening(startHttpServer(baseConfig));
    const res = await fetch(urlFor(server), {
      method: 'POST',
      headers: { authorization: `Bearer ${baseConfig.apiKey}`, 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it('an authenticated POST that is valid JSON but not an initialize request is rejected', async () => {
    server = await listening(startHttpServer(baseConfig));
    const res = await fetch(urlFor(server), {
      method: 'POST',
      headers: { authorization: `Bearer ${baseConfig.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(400);
  });

  it('an authenticated GET with no session id is rejected (no session to stream from)', async () => {
    server = await listening(startHttpServer(baseConfig));
    const res = await fetch(urlFor(server), { method: 'GET', headers: { authorization: `Bearer ${baseConfig.apiKey}` } });
    expect(res.status).toBe(400);
  });

  it('DELETE /mcp frees the connection slot (onsessionclosed fires)', async () => {
    server = await listening(startHttpServer({ ...baseConfig, maxConnections: 1 }));
    const transport = new StreamableHTTPClientTransport(urlFor(server), {
      requestInit: { headers: { Authorization: `Bearer ${baseConfig.apiKey}` } },
    });
    const client = new Client({ name: 'to-be-closed', version: '0.0.0' });
    await client.connect(transport);
    const sessionId = transport.sessionId;
    expect(sessionId).toBeDefined();

    const deleteRes = await fetch(urlFor(server), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${baseConfig.apiKey}`, 'mcp-session-id': sessionId! },
    });
    expect(deleteRes.ok).toBe(true);

    // With the slot freed, a brand new connection should succeed rather than 503.
    const second = await connectedClient(server, baseConfig.apiKey);
    const { tools } = await second.listTools();
    expect(tools.length).toBeGreaterThan(0);
    await second.close();
  });

  it('isolates sessions between two different MCP connections', async () => {
    server = await listening(startHttpServer(baseConfig));
    const clientA = await connectedClient(server, baseConfig.apiKey);
    const clientB = await connectedClient(server, baseConfig.apiKey);
    try {
      const created = await clientA.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } });
      const { sessionId } = JSON.parse((created.content as Array<{ text: string }>)[0].text);

      const fromB = await clientB.callTool({ name: 'stats', arguments: { sessionId } });
      expect((fromB as any).isError).toBe(true);
      expect((fromB as any).content[0].text).toMatch(/No session/);
    } finally {
      await clientA.close();
      await clientB.close();
    }
  });
});
