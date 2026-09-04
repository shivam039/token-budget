/**
 * Pure rendering functions, factored out of main.ts so they're unit-testable
 * without a DOM/Vite runtime — same pattern token-budget-devtools uses.
 * Every value interpolated into HTML goes through escapeHtml(): conversation
 * content is user-editable input in this playground, so it must never be
 * able to inject markup into the page.
 */
import type { BudgetMessage, ContextResult, ExplainReport, Stats } from '@shivam.dixit/token-budget';
import type { EditableMessage } from './state.js';

export function escapeHtml(unsafe: unknown): string {
  return (unsafe ?? '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function roleLabel(role: string): string {
  return role === 'tool' ? 'TOOL' : role.toUpperCase();
}

/**
 * Cap on rendered DOM rows for both the editor and the result list — a
 * generated 5,000-message conversation should still keep the page
 * responsive (Phase 12's "do not render thousands of DOM nodes"
 * requirement) without pulling in a virtualization library for a demo
 * of this size; past the cap, a summary line stands in for the rest.
 * Full-size arrays are still passed to TokenBudget itself — only the
 * DOM rendering is capped, never the actual computation.
 */
const MAX_RENDERED_ROWS = 250;

/** The conversation editor — every message editable, with pin/priority/tool-link controls. Beyond MAX_RENDERED_ROWS, switches to a compact read-only preview (editing 5,000 textareas isn't a real workflow anyway). */
export function renderConversationEditor(messages: readonly EditableMessage[]): string {
  if (messages.length > MAX_RENDERED_ROWS) {
    const preview = messages
      .slice(0, MAX_RENDERED_ROWS)
      .map(
        (m) => `
      <li class="msg-row role-${escapeHtml(m.role)}">
        <div class="msg-meta">
          <span class="badge badge-tool">${roleLabel(m.role)}</span>
          ${m.pinned ? '<span class="badge badge-pinned">PINNED</span>' : ''}
        </div>
        <div class="msg-content">${escapeHtml(m.content)}</div>
      </li>`,
      )
      .join('');
    return (
      preview +
      `<li class="hint">…and ${messages.length - MAX_RENDERED_ROWS} more messages (editing is disabled above ${MAX_RENDERED_ROWS} messages — the full conversation is still used when applying a budget below).</li>`
    );
  }
  return messages
    .map(
      (m, i) => `
    <li class="msg-row role-${escapeHtml(m.role)}" data-index="${i}">
      <div class="msg-meta">
        <span class="badge badge-tool">${roleLabel(m.role)}</span>
        ${m.pinned ? '<span class="badge badge-pinned">PINNED</span>' : ''}
        ${m.toolCallId ? `<span class="badge badge-tool">↳ tool_call_id: ${escapeHtml(m.toolCallId)}</span>` : ''}
        <span>priority: ${m.priority ?? 0}</span>
        <span>id: ${escapeHtml(m.id)}</span>
      </div>
      <textarea data-action="edit-content" data-index="${i}" aria-label="Message ${i + 1} content">${escapeHtml(m.content)}</textarea>
      <div class="msg-controls">
        <label><input type="checkbox" data-action="toggle-pin" data-index="${i}" ${m.pinned ? 'checked' : ''} /> pinned</label>
        <button type="button" data-action="remove" data-index="${i}">Remove</button>
      </div>
    </li>`,
    )
    .join('');
}

/** The result list — every original message shown, tagged KEPT/EVICTED/PINNED/tool-group. */
export function renderResultList(original: readonly BudgetMessage[], ctx: ContextResult | undefined): string {
  if (!ctx) {
    return '<li class="hint">Click "Apply budget" to see what survives.</li>';
  }
  const keptIds = new Set(ctx.messages.map((m) => m.id));
  const shown = original.length > MAX_RENDERED_ROWS ? original.slice(0, MAX_RENDERED_ROWS) : original;
  const overflowNote =
    original.length > MAX_RENDERED_ROWS
      ? `<li class="hint">…and ${original.length - MAX_RENDERED_ROWS} more messages not shown here (still fully accounted for in the stats above).</li>`
      : '';
  return (
    shown
      .map((m) => {
      const kept = keptIds.has(m.id);
      const badges = [
        kept ? '<span class="badge badge-kept">KEPT</span>' : '<span class="badge badge-evicted">EVICTED</span>',
        m.pinned ? '<span class="badge badge-pinned">PINNED</span>' : '',
        m.toolCallId ? '<span class="badge badge-tool">TOOL-LINKED</span>' : '',
      ].join(' ');
      return `
      <li class="msg-row role-${escapeHtml(m.role)} ${kept ? '' : 'evicted'}">
        <div class="msg-meta">
          <span class="badge badge-tool">${roleLabel(m.role)}</span>
          ${badges}
        </div>
        <div class="msg-content">${escapeHtml(m.content)}</div>
      </li>`;
      })
      .join('') + overflowNote
  );
}

function meterHtml(used: number, budget: number): string {
  const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const over = used > budget;
  return `<div class="meter"><div class="meter-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>`;
}

export function renderStatsPanel(before: Stats, after: ContextResult | undefined, effectiveBudget: number): string {
  const beforePct = effectiveBudget > 0 ? Math.round((before.tokensUsed / effectiveBudget) * 100) : 0;
  let html = `
    <div class="stat-row"><strong>Before</strong></div>
    <div class="stat-row"><span>Messages</span><span>${before.messageCount}</span></div>
    <div class="stat-row"><span>Tokens (estimate)</span><span>${before.tokensUsed}</span></div>
    <div class="stat-row"><span>Budget</span><span>${effectiveBudget}</span></div>
    <div class="stat-row"><span>Used</span><span>${beforePct}%</span></div>
    ${meterHtml(before.tokensUsed, effectiveBudget)}
  `;
  if (after) {
    const evicted = before.messageCount - after.messages.length;
    const afterPct = effectiveBudget > 0 ? Math.round((after.tokensUsed / effectiveBudget) * 100) : 0;
    html += `
    <div class="stat-row" style="margin-top:8px"><strong>After</strong></div>
    <div class="stat-row"><span>Messages</span><span>${after.messages.length}</span></div>
    <div class="stat-row"><span>Tokens (estimate)</span><span>${after.tokensUsed}</span></div>
    <div class="stat-row"><span>Used</span><span>${afterPct}%</span></div>
    ${meterHtml(after.tokensUsed, effectiveBudget)}
    <div class="stat-row"><span>Evicted</span><span>${evicted}</span></div>
    <div class="stat-row"><span>Preserved</span><span>${after.messages.length}</span></div>
    `;
  }
  return html;
}

/** Renders the real ExplainReport structure — adapted to whatever the library actually returns, nothing invented. */
export function renderExplainPanel(report: ExplainReport | undefined): string {
  if (!report) return '<p class="hint">Apply a budget to see the decision trace.</p>';
  const steps = report.steps
    .map(
      (step) => `
    <div class="explain-step">
      <div><strong>${escapeHtml(step.strategyName)}</strong> — ${step.tokensBefore} → ${step.tokensAfter} tokens (${step.messagesConsidered} messages considered)</div>
      ${step.evicted
        .map((e) => `<div class="explain-reason">evicted <code>${escapeHtml(e.id)}</code> — ${escapeHtml(e.reason)}</div>`)
        .join('')}
      ${step.synthesized
        .map((s) => `<div class="explain-reason">synthesized <code>${escapeHtml(s.id)}</code> from [${s.sourceIds.map(escapeHtml).join(', ')}] — ${escapeHtml(s.reason)}</div>`)
        .join('')}
      ${step.evicted.length === 0 && step.synthesized.length === 0 ? '<div class="explain-reason">nothing evicted or synthesized this step</div>' : ''}
    </div>`,
    )
    .join('');
  return `
    <div class="explain-step">
      <div>strategy applied: <strong>${escapeHtml(report.strategyApplied)}</strong></div>
      <div>${report.tokensBefore} → ${report.tokensAfter} tokens, ${report.tokensRemaining} remaining</div>
    </div>
    ${steps}
  `;
}

export interface CompareRow {
  strategyName: string;
  description: string;
  messagesKept: number;
  tokens: number;
  messagesRemoved: number;
}

export function renderCompareTable(rows: readonly CompareRow[]): string {
  return `
    <table>
      <thead><tr><th>Strategy</th><th>Messages kept</th><th>Tokens</th><th>Messages removed</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr><td>${escapeHtml(r.strategyName)}<div class="hint">${escapeHtml(r.description)}</div></td><td>${r.messagesKept}</td><td>${r.tokens}</td><td>${r.messagesRemoved}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
}
