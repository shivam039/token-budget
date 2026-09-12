import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // cli.ts is proven end-to-end by test/e2e.test.ts, which spawns the
      // *built* dist/cli.js as a real subprocess — that's stronger proof
      // than source-level unit coverage, but V8 coverage can't attribute a
      // subprocess's execution back to this file's instrumented source.
      // http-cli.ts is the same shape (a 3-line try/catch entry point around
      // startHttpServer(), which test/http.test.ts exercises directly).
      // Strategy Lab is exercised through the MCP integration tests. Keep
      // its diagnostic permutations out of the source-level threshold until
      // the standalone analysis API has its own focused test suite.
      exclude: ['src/cli.ts', 'src/http-cli.ts', 'src/analysis.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        // Hosted HTTP handlers include a few framework callbacks that are
        // covered by integration tests but not attributed by V8.
        functions: 89,
        branches: 80,
      },
    },
  },
});
