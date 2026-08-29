import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer, type CreateServerOptions } from '../src/server.js';

/**
 * Exercises the server exactly as a real MCP client would — over an actual
 * MCP `Client`, connected via the SDK's in-memory transport pair (same
 * protocol framing as stdio, no process/subprocess needed for a fast unit
 * test). `test/e2e.test.ts` covers the real stdio subprocess path this
 * mirrors — see that file for why both exist.
 */
async function connectedClient(options?: CreateServerOptions) {
  const server = createServer(options);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function parseResult(result: { content: Array<{ type: string; text?: string }> }): any {
  const text = result.content[0]?.text;
  return text ? JSON.parse(text) : undefined;
}

describe('token-budget-mcp server', () => {
  let client: Awaited<ReturnType<typeof connectedClient>>;

  beforeEach(async () => {
    client = await connectedClient();
  });

  it('lists all 8 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ['add_message', 'create_budget', 'explain', 'get_context', 'list_sessions', 'remove_session', 'stats', 'truncate_tool_output'].sort(),
    );
  });

  it('create_budget with an explicit maxTokens returns a usable sessionId', async () => {
    const result = await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000, reserve: 100 } });
    const parsed = parseResult(result as any);
    expect(parsed.sessionId).toBeTypeOf('string');
    expect(parsed.maxTokens).toBe(1000);
    expect(parsed.effectiveBudget).toBe(900);
  });

  it('create_budget derives maxTokens from a recognized model', async () => {
    const result = await client.callTool({ name: 'create_budget', arguments: { model: 'gpt-4o' } });
    const parsed = parseResult(result as any);
    expect(parsed.maxTokens).toBe(128_000);
  });

  it('create_budget returns an error result (not a thrown exception) for an unrecognized model', async () => {
    const result = await client.callTool({ name: 'create_budget', arguments: { model: 'not-a-real-model' } });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/not-a-real-model/);
  });

  it('add_message + get_context round-trips through a real session', async () => {
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } })) as any);
    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'system', content: 'You are helpful.', pinned: true } });
    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'Hello' } });

    const context = parseResult((await client.callTool({ name: 'get_context', arguments: { sessionId: created.sessionId } })) as any);
    expect(context.messages).toHaveLength(2);
    expect(context.tokensUsed).toBeGreaterThan(0);
  });

  it('get_context on an unknown session returns a clear error result', async () => {
    const result = await client.callTool({ name: 'get_context', arguments: { sessionId: 'nonexistent' } });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/No session "nonexistent"/);
  });

  it('explain reflects the most recent get_context call', async () => {
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } })) as any);
    const before = parseResult((await client.callTool({ name: 'explain', arguments: { sessionId: created.sessionId } })) as any);
    expect(before.explanation).toBeNull();

    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'Hi' } });
    await client.callTool({ name: 'get_context', arguments: { sessionId: created.sessionId } });
    const after = parseResult((await client.callTool({ name: 'explain', arguments: { sessionId: created.sessionId } })) as any);
    expect(after.strategyApplied).toBe('drop-oldest');
  });

  it('an eviction is actually visible end-to-end through the protocol', async () => {
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 30, reserve: 0 } })) as any);
    for (let i = 0; i < 10; i++) {
      await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: `message number ${i} with enough text to cost real tokens` } });
    }
    const context = parseResult((await client.callTool({ name: 'get_context', arguments: { sessionId: created.sessionId } })) as any);
    expect(context.tokensUsed).toBeLessThanOrEqual(30);
    expect(context.evicted.length).toBeGreaterThan(0);
  });

  it('truncate_tool_output is stateless and needs no session', async () => {
    const longText = 'x'.repeat(2000);
    const result = parseResult((await client.callTool({ name: 'truncate_tool_output', arguments: { text: longText, maxTokens: 10 } })) as any);
    expect(result.tokensAfter).toBeLessThanOrEqual(10);
    expect(result.truncated.length).toBeLessThan(longText.length);
  });

  it('list_sessions and remove_session manage the session lifecycle', async () => {
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 500 } })) as any);
    const listed = parseResult((await client.callTool({ name: 'list_sessions', arguments: {} })) as any);
    expect(listed.some((s: any) => s.sessionId === created.sessionId)).toBe(true);

    const removed = parseResult((await client.callTool({ name: 'remove_session', arguments: { sessionId: created.sessionId } })) as any);
    expect(removed.removed).toBe(true);

    const afterRemoval = await client.callTool({ name: 'get_context', arguments: { sessionId: created.sessionId } });
    expect((afterRemoval as any).isError).toBe(true);
  });

  it('slidingWindow strategy requires slidingWindowTurns', async () => {
    const result = await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000, strategy: 'slidingWindow' } });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/slidingWindowTurns/);
  });

  it('priority strategy actually applies through the protocol', async () => {
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 30, strategy: 'priority' } })) as any);
    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'low priority filler text here', priority: 0 } });
    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'high priority filler text here', priority: 10 } });
    const context = parseResult((await client.callTool({ name: 'get_context', arguments: { sessionId: created.sessionId } })) as any);
    expect(context.strategyApplied).toBe('priority');
  });

  it('slidingWindow strategy actually applies through the protocol once slidingWindowTurns is set', async () => {
    const created = parseResult(
      (await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000, strategy: 'slidingWindow', slidingWindowTurns: 1 } })) as any,
    );
    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'first' } });
    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'second' } });
    const context = parseResult((await client.callTool({ name: 'get_context', arguments: { sessionId: created.sessionId } })) as any);
    expect(context.strategyApplied).toBe('sliding-window');
    expect(context.messages).toHaveLength(1);
  });

  it('add_message on an unknown session returns a clear error result, not a thrown exception', async () => {
    const result = await client.callTool({ name: 'add_message', arguments: { sessionId: 'nonexistent', role: 'user', content: 'hi' } });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/No session "nonexistent"/);
  });

  it('explain on an unknown session returns a clear error result', async () => {
    const result = await client.callTool({ name: 'explain', arguments: { sessionId: 'nonexistent' } });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/No session "nonexistent"/);
  });

  it('stats reports usage without applying the strategy', async () => {
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } })) as any);
    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'hello' } });
    const stats = parseResult((await client.callTool({ name: 'stats', arguments: { sessionId: created.sessionId } })) as any);
    expect(stats.messageCount).toBe(1);
    expect(stats.tokensUsed).toBeGreaterThan(0);
  });
});

/**
 * The limits `src/http.ts` passes into `createServer()` so an untrusted
 * remote caller can't exhaust this process's memory. The stdio CLI never
 * sets these (see the describe block above, which uses the no-options
 * default throughout) — this block is specifically about the opt-in path.
 */
describe('token-budget-mcp server resource limits', () => {
  it('maxSessions is enforced through create_budget, not just at the SessionStore level', async () => {
    const client = await connectedClient({ maxSessions: 1 });
    await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } });
    const second = await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } });
    expect((second as any).isError).toBe(true);
    expect((second as any).content[0].text).toMatch(/Session limit reached/);
  });

  it('maxContentLength rejects an oversized add_message before it touches the session', async () => {
    const client = await connectedClient({ maxContentLength: 10 });
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } })) as any);
    const result = await client.callTool({
      name: 'add_message',
      arguments: { sessionId: created.sessionId, role: 'user', content: 'this is way more than ten characters' },
    });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toMatch(/over this server's 10-character limit/);
    const stats = parseResult((await client.callTool({ name: 'stats', arguments: { sessionId: created.sessionId } })) as any);
    expect(stats.messageCount).toBe(0);
  });

  it('maxMessagesPerSession rejects add_message once a session is full', async () => {
    const client = await connectedClient({ maxMessagesPerSession: 1 });
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 1000 } })) as any);
    await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'first' } });
    const second = await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'second' } });
    expect((second as any).isError).toBe(true);
    expect((second as any).content[0].text).toMatch(/Session already has 1 messages/);
  });

  it('with no options set, every limit stays unlimited (unchanged stdio behavior)', async () => {
    const client = await connectedClient();
    const created = parseResult((await client.callTool({ name: 'create_budget', arguments: { maxTokens: 100_000 } })) as any);
    for (let i = 0; i < 5; i++) {
      const result = await client.callTool({ name: 'add_message', arguments: { sessionId: created.sessionId, role: 'user', content: 'x'.repeat(50) } });
      expect((result as any).isError).toBeUndefined();
    }
  });
});
