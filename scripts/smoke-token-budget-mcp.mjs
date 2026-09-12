import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.MCP_URL;
if (!endpoint) { console.error('MCP_URL is required'); process.exit(2); }
const headers = process.env.MCP_API_KEY ? { Authorization: `Bearer ${process.env.MCP_API_KEY}` } : {};
const transport = new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers } });
const client = new Client({ name: 'token-budget-mcp-smoke', version: '1.0.0' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = new Set(tools.map((tool) => tool.name));
  for (const name of ['create_budget', 'truncate_tool_output']) if (!names.has(name)) throw new Error(`missing expected tool: ${name}`);
  const result = await client.callTool({ name: 'truncate_tool_output', arguments: { content: 'smoke-test', maxLength: 100 } });
  if (!Array.isArray(result.content)) throw new Error('tool response has no content');
  console.log(`MCP smoke test passed: ${tools.length} tools, truncate_tool_output succeeded`);
} catch (error) { console.error(`MCP smoke test failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
finally { await client.close().catch(() => {}); }
