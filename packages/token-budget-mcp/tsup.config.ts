import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/http-cli.ts'],
  format: ['esm', 'cjs'],
  dts: {
    entry: ['src/index.ts'], // cli.ts/http-cli.ts are executables, not a public API surface of their own
  },
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  external: ['@shivam.dixit/token-budget', '@modelcontextprotocol/sdk', 'zod'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
