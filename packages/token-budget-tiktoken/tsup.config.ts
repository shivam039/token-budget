import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/native.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  external: ['token-budget', 'js-tiktoken', 'js-tiktoken/*', 'tiktoken', 'tiktoken/*'],
});
