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

  it('maxSessions caps concurrent sessions and throws a clear error once full', () => {
    const store = new SessionStore({ maxSessions: 2 });
    store.create(new TokenBudget({ maxTokens: 1000 }));
    store.create(new TokenBudget({ maxTokens: 1000 }));
    expect(() => store.create(new TokenBudget({ maxTokens: 1000 }))).toThrow(/Session limit reached \(2\)/);
  });

  it('removing a session frees a slot under maxSessions', () => {
    const store = new SessionStore({ maxSessions: 1 });
    const id = store.create(new TokenBudget({ maxTokens: 1000 }));
    expect(() => store.create(new TokenBudget({ maxTokens: 1000 }))).toThrow();
    store.remove(id);
    expect(() => store.create(new TokenBudget({ maxTokens: 1000 }))).not.toThrow();
  });
});
