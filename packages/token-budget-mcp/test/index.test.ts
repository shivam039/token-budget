import { describe, expect, it } from 'vitest';
import { createServer } from '../src/index.js';

describe('package entry point', () => {
  it('re-exports a working createServer', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe('function');
  });
});
