import { TokenBudget, strategies, type ContextResult, type ExplainReport, type Stats } from '@shivam.dixit/token-budget';
import { ALL_CATEGORIES, generateConversation, type ConversationCategory } from '../../../scripts/lib/generateConversation.js';
import { demoSummarize, DEMO_SUMMARIZER_LABEL } from './demoSummarizer.js';
import { codingAgentExample, contextPresets, pinnedMessageDemo, toolAtomicityDemo } from './presets.js';
import { renderCompareTable, renderConversationEditor, renderExplainPanel, renderResultList, renderStatsPanel, type CompareRow } from './render.js';
import type { AppState, EditableMessage, StrategyName } from './state.js';
import './style.css';

// ---- element lookups ------------------------------------------------------

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`playground: missing #${id} in index.html`);
  return found as T;
};

const conversationEditorEl = el<HTMLUListElement>('conversation-editor');
const resultListEl = el<HTMLUListElement>('result-list');
const statsPanelEl = el<HTMLDivElement>('stats-panel');
const explainPanelEl = el<HTMLDivElement>('explain-panel');
const comparePanelEl = el<HTMLDivElement>('compare-panel');
const strategyNoteEl = el<HTMLParagraphElement>('strategy-note');
const maxTokensInput = el<HTMLInputElement>('max-tokens');
const strategySelect = el<HTMLSelectElement>('strategy-select');
const contextPresetSelect = el<HTMLSelectElement>('context-preset');
const presetSelect = el<HTMLSelectElement>('preset-select');
const compareToggle = el<HTMLInputElement>('toggle-compare');
const generatePanel = el<HTMLDivElement>('generate-panel');
const generateCategorySelect = el<HTMLSelectElement>('generate-category');
const generateCountSelect = el<HTMLSelectElement>('generate-count');

// ---- state ------------------------------------------------------------

const state: AppState = {
  messages: codingAgentExample(),
  maxTokens: 600,
  strategy: 'dropOldest',
};

let lastContext: ContextResult | undefined;
let lastExplain: ExplainReport | undefined;
let lastBeforeStats: Stats | undefined;

// ---- populate static selects -------------------------------------------

function populateSelects(): void {
  presetSelect.innerHTML = `
    <option value="coding-agent">Coding agent (JWT auth discussion)</option>
    <option value="pinned">Pinned system prompt survives eviction</option>
    <option value="tool-atomicity">Tool-call/result atomicity</option>
  `;

  contextPresetSelect.innerHTML = contextPresets()
    .map((p) => `<option value="${p.maxTokens}" title="${p.source.replace(/"/g, '&quot;')}">${p.label}</option>`)
    .join('');
  contextPresetSelect.value = String(state.maxTokens);

  strategySelect.innerHTML = `
    <option value="dropOldest">dropOldest — simple chronological eviction</option>
    <option value="slidingWindow">slidingWindow — keep only the last N turns</option>
    <option value="priority">priority — importance-based eviction</option>
    <option value="summarizeOldest">summarizeOldest — fold old messages into a summary (demo summarizer)</option>
    <option value="smartPriority">smartPriority — zero-config: protect essentials, drop tool noise first</option>
  `;

  generateCategorySelect.innerHTML = ALL_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
}

function updateStrategyNote(): void {
  strategyNoteEl.textContent = strategySelect.value === 'summarizeOldest' ? DEMO_SUMMARIZER_LABEL : '';
}

// ---- building a real TokenBudget from current state -----------------------

function buildStrategy(name: StrategyName) {
  switch (name) {
    case 'dropOldest':
      return strategies.dropOldest();
    case 'slidingWindow':
      return strategies.slidingWindow({ turns: 6, enforceBudget: true });
    case 'priority':
      return strategies.priority();
    case 'summarizeOldest':
      return strategies.summarizeOldest({ summarize: demoSummarize });
    case 'smartPriority':
      return strategies.smartPriority();
  }
}

function toAddMessageInput(m: EditableMessage) {
  return { id: m.id, role: m.role, content: m.content, pinned: m.pinned, priority: m.priority, toolCallId: m.toolCallId };
}

async function applyBudget(): Promise<void> {
  const budget = new TokenBudget({ maxTokens: state.maxTokens, strategy: buildStrategy(state.strategy) });
  for (const m of state.messages) budget.addMessage(toAddMessageInput(m));

  lastBeforeStats = budget.stats();
  lastContext = await budget.getContext();
  lastExplain = budget.explain();

  renderResults();
}

function renderResults(): void {
  resultListEl.innerHTML = renderResultList(
    state.messages.map((m) => ({ ...m, tokens: 0 })),
    lastContext,
  );
  if (lastBeforeStats) {
    statsPanelEl.innerHTML = renderStatsPanel(lastBeforeStats, lastContext, state.maxTokens);
  }
  explainPanelEl.innerHTML = renderExplainPanel(lastExplain);
}

async function runComparison(): Promise<void> {
  const descriptions: Record<'dropOldest' | 'slidingWindow' | 'priority' | 'smartPriority', string> = {
    dropOldest: 'Simple chronological eviction — oldest non-pinned messages go first.',
    slidingWindow: 'Keeps only the last N turns (here: 6), plus pinned messages, regardless of token size.',
    priority: 'Evicts the lowest-priority non-pinned messages first, not purely by age.',
    smartPriority: 'Zero-config: auto-pins system + current query, drops untagged tool-call units first.',
  };
  const rows: CompareRow[] = [];
  for (const name of ['dropOldest', 'slidingWindow', 'priority', 'smartPriority'] as const) {
    const budget = new TokenBudget({ maxTokens: state.maxTokens, strategy: buildStrategy(name) });
    for (const m of state.messages) budget.addMessage(toAddMessageInput(m));
    const ctx = budget.getContextSync();
    rows.push({
      strategyName: name,
      description: descriptions[name],
      messagesKept: ctx.messages.length,
      tokens: ctx.tokensUsed,
      messagesRemoved: state.messages.length - ctx.messages.length,
    });
  }
  comparePanelEl.innerHTML = renderCompareTable(rows);
}

// ---- conversation editor wiring -------------------------------------------

function renderEditor(): void {
  conversationEditorEl.innerHTML = renderConversationEditor(state.messages);
}

conversationEditorEl.addEventListener('input', (e) => {
  const target = e.target as HTMLElement;
  if (target.dataset.action === 'edit-content') {
    const index = Number(target.dataset.index);
    const message = state.messages[index];
    if (message) message.content = (target as HTMLTextAreaElement).value;
  }
});

conversationEditorEl.addEventListener('change', (e) => {
  const target = e.target as HTMLElement;
  if (target.dataset.action === 'toggle-pin') {
    const index = Number(target.dataset.index);
    const message = state.messages[index];
    if (message) message.pinned = (target as HTMLInputElement).checked;
  }
});

conversationEditorEl.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.dataset.action === 'remove') {
    const index = Number(target.dataset.index);
    state.messages.splice(index, 1);
    renderEditor();
  }
});

el<HTMLButtonElement>('btn-add-message').addEventListener('click', () => {
  state.messages.push({ id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, role: 'user', content: 'New message' });
  renderEditor();
});

// ---- preset loading ---------------------------------------------------

function loadPreset(name: string): void {
  if (name === 'pinned') state.messages = pinnedMessageDemo();
  else if (name === 'tool-atomicity') state.messages = toolAtomicityDemo();
  else state.messages = codingAgentExample();
  renderEditor();
}

presetSelect.addEventListener('change', () => loadPreset(presetSelect.value));

// ---- generator ---------------------------------------------------------

el<HTMLButtonElement>('btn-generate').addEventListener('click', () => {
  generatePanel.hidden = !generatePanel.hidden;
});

el<HTMLButtonElement>('btn-generate-confirm').addEventListener('click', () => {
  const category = generateCategorySelect.value as ConversationCategory;
  const count = Number(generateCountSelect.value);
  const generated = generateConversation(category, count);
  state.messages = generated.map((m) => ({ id: m.id, role: m.role, content: m.content, pinned: m.pinned, priority: m.priority, toolCallId: m.toolCallId }));
  renderEditor();
  generatePanel.hidden = true;
});

// ---- budget controls ----------------------------------------------------

contextPresetSelect.addEventListener('change', () => {
  state.maxTokens = Number(contextPresetSelect.value);
  maxTokensInput.value = String(state.maxTokens);
});

maxTokensInput.addEventListener('input', () => {
  state.maxTokens = Number(maxTokensInput.value) || 1;
});

strategySelect.addEventListener('change', () => {
  state.strategy = strategySelect.value as StrategyName;
  updateStrategyNote();
});

el<HTMLButtonElement>('btn-run').addEventListener('click', () => {
  void applyBudget();
  if (compareToggle.checked) void runComparison();
});

compareToggle.addEventListener('change', () => {
  comparePanelEl.hidden = !compareToggle.checked;
  if (compareToggle.checked) void runComparison();
});

// ---- tabs ---------------------------------------------------------------

const tabPlayground = el<HTMLButtonElement>('tab-playground');
const tabBenchmarks = el<HTMLButtonElement>('tab-benchmarks');
const panelPlayground = el<HTMLElement>('panel-playground');
const panelBenchmarks = el<HTMLElement>('panel-benchmarks');

function selectTab(tab: 'playground' | 'benchmarks'): void {
  const playgroundActive = tab === 'playground';
  panelPlayground.hidden = !playgroundActive;
  panelBenchmarks.hidden = playgroundActive;
  tabPlayground.setAttribute('aria-pressed', String(playgroundActive));
  tabBenchmarks.setAttribute('aria-pressed', String(!playgroundActive));
}

tabPlayground.addEventListener('click', () => selectTab('playground'));
tabBenchmarks.addEventListener('click', () => selectTab('benchmarks'));

// ---- init -----------------------------------------------------------------

populateSelects();
updateStrategyNote();
renderEditor();
void applyBudget();
void import('./benchmarks.js').then((m) => m.initBenchmarksTab());
