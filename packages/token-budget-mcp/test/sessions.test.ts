import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { SessionStore } from '../src/sessions.js';

describe('SessionStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('create/require/remove/listIds round-trip', () => {
    const store = new SessionStore();
    const id = store.create(new TokenBudget({ maxTokens: 1000 }));
    expect(store.listIds()).toEqual([id]);
    expect(store.require(id)).toBeInstanceOf(TokenBudget);
    expect(store.remove(id)).toBe(true);
    expect(store.remove(id)).toBe(false);
    expect(store.listIds()).toEqual([]);
  });

  it('require() throws a clear, listable error for an unknown id', () => {
    const store = new SessionStore();
    store.create(new TokenBudget({ maxTokens: 1000 }));
    expect(() => store.require('nonexistent')).toThrow(/No session "nonexistent"/);
    expect(() => store.require('nonexistent')).toThrow(/Known sessions:/);
  });

  it('require() on an empty store says so, without a stray "Known sessions:" list', () => {
    const store = new SessionStore();
    expect(() => store.require('anything')).toThrow(/No sessions exist yet/);
  });

  it('falls back to a non-crypto id when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const store = new SessionStore();
    const id = store.create(new TokenBudget({ maxTokens: 1000 }));
    expect(id).toMatch(/^session_/);
  });
});
