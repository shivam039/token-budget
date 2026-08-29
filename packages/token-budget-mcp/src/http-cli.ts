import { startHttpServer } from './http.js';

try {
  startHttpServer();
} catch (error) {
  console.error('[token-budget-mcp] fatal error:', error);
  process.exit(1);
}
