/**
 * Pure rendering helpers, factored out of main.js so they're unit-testable
 * without a DOM/Vite runtime. Every value interpolated into HTML here goes
 * through escapeHtml() — the JSON file a user drops in is untrusted input
 * (e.g. a dump shared by someone else for debugging help), so a crafted
 * role/name/id could otherwise inject markup into the viewer's page.
 */

export function escapeHtml(unsafe) {
  return (unsafe ?? '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Plain text, not HTML — set via `.textContent` in main.js, which never
 * interprets its input as markup, so this doesn't need escapeHtml().
 */
export function formatStats(state) {
  const totalTokens = (state.messages ?? []).reduce((acc, m) => acc + (m.tokens ?? 0), 0);
  return `Max Tokens: ${state.maxTokens} | Reserve: ${state.reserve} | Used: ${totalTokens}`;
}

function contentPreview(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return text.length > 200 ? text.substring(0, 200) + '...' : text;
}

export function renderMessageHtml(msg) {
  const roleClass = escapeHtml(msg.role);
  const nameSuffix = msg.name ? ` (${escapeHtml(msg.name)})` : '';
  const pin = msg.pinned ? ' \u{1F4CC}' : '';
  return (
    `<div class="message ${roleClass}">` +
    `<div class="meta">${roleClass}${nameSuffix} • ID: ${escapeHtml(msg.id)} • Tokens: ${escapeHtml(msg.tokens)}${pin}</div>` +
    `<div>${escapeHtml(contentPreview(msg.content))}</div>` +
    `</div>`
  );
}

export function renderMessagesHtml(state) {
  return (state.messages ?? []).map(renderMessageHtml).join('');
}
