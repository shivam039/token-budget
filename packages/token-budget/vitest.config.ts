import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Soak specs live under test/soak/ and use a *.soak.ts suffix (not
    // *.test.ts), so this include glob naturally skips them — they're
    // long-running and run on their own schedule instead (FR2-8.3), via
    // the separate `test:soak` script.
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 80,
      },
    },
  },
});
