import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;

/**
 * The real thing this package promises: spawning the *built* `dist/cli.js`
 * as a genuine child process and talking to it over stdio via the same
 * `Client`/transport pattern Claude Code and Claude Desktop use — not a
 * mock, not the in-process `InMemoryTransport` `server.test.ts` uses for
 * fast unit coverage. Requires `npm run build` to have already produced
 * `dist/cli.js`; skips (not fails) if it hasn't, so `vitest --watch`
 * during development doesn't require a rebuild before every save.
 */
describe.skipIf(!existsSync(new URL('../dist/cli.js', import.meta.url)))('token-budget-mcp stdio end-to-end', () => {
  it('a real spawned subprocess speaks MCP over stdio, start to finish', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [cliPath] });
    const client = new Client({ name: 'e2e-test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('create_budget');

      const created = await client.callTool({ name: 'create_budget', arguments: { model: 'gpt-4o', reserve: 1000 } });
      const createdText = (created.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
      const { sessionId, maxTokens } = JSON.parse(createdText);
      expect(maxTokens).toBe(128_000);

      await client.callTool({ name: 'add_message', arguments: { sessionId, role: 'system', content: 'You are a helpful assistant.', pinned: true } });
      await client.callTool({ name: 'add_message', arguments: { sessionId, role: 'user', content: 'What is the capital of France?' } });

      const context = await client.callTool({ name: 'get_context', arguments: { sessionId } });
      const contextText = (context.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
      const parsed = JSON.parse(contextText);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.tokensUsed).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  }, 20_000);
});
