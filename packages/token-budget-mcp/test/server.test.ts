import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer } from '../src/server.js';

/**
 * Exercises the server exactly as a real MCP client would — over an actual
 * MCP `Client`, connected via the SDK's in-memory transport pair (same
 * protocol framing as stdio, no process/subprocess needed for a fast unit
 * test). `test/e2e.test.ts` covers the real stdio subprocess path this
 * mirrors — see that file for why both exist.
 */
async function connectedClient() {
  const server = createServer();
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
});
