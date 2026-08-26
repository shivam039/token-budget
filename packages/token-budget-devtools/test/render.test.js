import { describe, it, expect } from 'vitest';
import { escapeHtml, formatStats, renderMessageHtml, renderMessagesHtml } from '../src/render.js';

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`"quoted" & 'single'`)).toBe('&quot;quoted&quot; &amp; &#039;single&#039;');
  });

  it('handles null/undefined/number input without throwing', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('formatStats', () => {
  it('summarizes token usage from a SerializedState-shaped object', () => {
    const state = { maxTokens: 1000, reserve: 100, messages: [{ tokens: 10 }, { tokens: 20 }] };
    expect(formatStats(state)).toBe('Max Tokens: 1000 | Reserve: 100 | Used: 30');
  });

  it('treats a missing messages array as zero usage', () => {
    expect(formatStats({ maxTokens: 100, reserve: 0 })).toBe('Max Tokens: 100 | Reserve: 0 | Used: 0');
  });
});

describe('renderMessageHtml', () => {
  it('escapes a crafted role/id/content so an uploaded dump cannot inject markup', () => {
    const html = renderMessageHtml({
      role: '<img src=x onerror=alert(1)>',
      id: '"><script>alert(2)</script>',
      tokens: 5,
      content: '<b>not bold</b>',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;not bold&lt;/b&gt;');
  });

  it('includes a pin marker for pinned messages and a name suffix when present', () => {
    const html = renderMessageHtml({ role: 'system', id: '1', tokens: 3, content: 'hi', pinned: true, name: 'bot' });
    expect(html).toContain('(bot)');
    expect(html).toContain('\u{1F4CC}');
  });

  it('truncates long content previews to 200 characters plus an ellipsis', () => {
    const html = renderMessageHtml({ role: 'user', id: '1', tokens: 1, content: 'a'.repeat(250) });
    expect(html).toContain('a'.repeat(200) + '...');
    expect(html).not.toContain('a'.repeat(201));
  });
});

describe('renderMessagesHtml', () => {
  it('renders one block per message, in order', () => {
    const state = {
      messages: [
        { role: 'user', id: '1', tokens: 1, content: 'first' },
        { role: 'assistant', id: '2', tokens: 2, content: 'second' },
      ],
    };
    const html = renderMessagesHtml(state);
    expect(html.indexOf('first')).toBeLessThan(html.indexOf('second'));
  });

  it('renders nothing for an empty/missing messages array', () => {
    expect(renderMessagesHtml({})).toBe('');
  });
});
