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
      exclude: ['src/cli.ts', 'src/http-cli.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 80,
      },
    },
  },
});
