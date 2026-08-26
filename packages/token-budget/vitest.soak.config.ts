import { defineConfig } from 'vitest/config';

/**
 * Separate config for long-running soak tests (FR2-8.3): run via
 * `npm run test:soak`, on a schedule in CI rather than every commit —
 * see the root repo's CI workflow.
 */
export default defineConfig({
  test: {
    include: ['test/soak/**/*.soak.ts'],
    testTimeout: 60_000,
  },
});
