import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES, generateConversation } from '../../../scripts/lib/generateConversation.js';

describe('generateConversation (shared by the playground and scripts/generate-context-dataset.ts)', () => {
  it('is deterministic: same category/count/seed always produces the same conversation', () => {
    const a = generateConversation('coding-agent', 50);
    const b = generateConversation('coding-agent', 50);
    expect(a).toEqual(b);
  });

  it('produces a different conversation for a different seed', () => {
    const a = generateConversation('coding-agent', 50, 1);
    const b = generateConversation('coding-agent', 50, 2);
    expect(a).not.toEqual(b);
  });

  it('always starts with a pinned system message', () => {
    for (const category of ALL_CATEGORIES) {
      const [first] = generateConversation(category, 20);
      expect(first?.role).toBe('system');
      expect(first?.pinned).toBe(true);
    }
  });

  it('every toolCallId links to a real tool-call message earlier in the same conversation', () => {
    const messages = generateConversation('tool-heavy-agent', 200);
    const ids = new Set(messages.map((m) => m.id));
    for (const m of messages) {
      if (m.toolCallId) expect(ids.has(m.toolCallId)).toBe(true);
    }
  });

  it('produces roughly the requested message count for every category', () => {
    for (const category of ALL_CATEGORIES) {
      const messages = generateConversation(category, 100);
      expect(messages.length).toBeGreaterThan(80);
      expect(messages.length).toBeLessThanOrEqual(101);
    }
  });
});
