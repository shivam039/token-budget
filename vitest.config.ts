import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/guardrails/**/*.test.ts', 'test/guardrails/**/*.spec.ts', 'test/guardrails/**/*.test.js', 'test/guardrails/**/*.spec.js'],
    exclude: ['packages/**', 'dist/**', 'node_modules/**'],
  },
});
