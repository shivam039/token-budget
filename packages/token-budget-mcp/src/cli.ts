import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // stdout is the JSON-RPC channel — errors must go to stderr, never stdout.
  console.error('[token-budget-mcp] fatal error:', error);
  process.exit(1);
});
