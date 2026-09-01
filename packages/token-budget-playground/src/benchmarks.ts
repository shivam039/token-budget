/**
 * Benchmarks tab wiring. Two distinct things happen here, deliberately
 * kept separate (see docs/playground.md):
 *
 * 1. A REAL, live, in-browser context-management benchmark
 *    (token-budget vs. a naive DIY shift-and-recompute loop), using the
 *    same simple length-based token counter for both, exactly like
 *    bench/context-management-bench.mjs does in Node — this file does
 *    not reimplement that logic, it runs the actual TokenBudget engine.
 * 2. STATIC REFERENCE tables of the real numbers already published in
 *    docs/benchmarks.md (including the 50,000-message case and the raw
 *    tokenizer comparison), which this page does not attempt to
 *    reproduce live — LangChain's trimMessages is a heavy dependency
 *    not worth bundling into a demo page, and a 50k-message run isn't
 *    something that should ever auto-fire in a browser tab. The exact
 *    command to reproduce those numbers locally is shown instead.
 */
import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

const approxCount = (text: string): number => Math.ceil(text.length / 4);
const messageText = (i: number): string => `Message number ${i}: this is a representative chat message of moderate length used for benchmarking purposes.`;

function runTokenBudget(n: number): { survivors: number; ms: number } {
  const start = performance.now();
  const budget = new TokenBudget({
    maxTokens: 50_000,
    strategy: strategies.dropOldest(),
    tokenizer: { count: approxCount },
    messageOverhead: () => 0,
  });
  for (let i = 0; i < n; i++) {
    budget.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: messageText(i) });
  }
  const survivors = budget.getContextSync().messages.length;
  return { survivors, ms: performance.now() - start };
}

function runNaiveDIY(n: number): { survivors: number; ms: number } {
  const start = performance.now();
  const messages: Array<{ role: string; content: string }> = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: messageText(i) });
    let total = messages.reduce((sum, m) => sum + approxCount(m.content), 0);
    while (total > 50_000 && messages.length > 0) {
      messages.shift();
      total = messages.reduce((sum, m) => sum + approxCount(m.content), 0);
    }
  }
  return { survivors: messages.length, ms: performance.now() - start };
}

const RAW_TOKENIZER_REFERENCE = `
  <p class="hint">Raw tokenizer speed is not the primary goal of token-budget. Reference numbers from docs/benchmarks.md — bulk-encode a ~88,000-token corpus, same encoding family for both:</p>
  <table>
    <thead><tr><th>Tokenizer</th><th>Median</th><th>Throughput</th></tr></thead>
    <tbody>
      <tr><td>gpt-tokenizer</td><td>15.4 ms</td><td>5.7M tok/sec</td></tr>
      <tr><td>token-budget-tiktoken</td><td>168.8 ms</td><td>521k tok/sec</td></tr>
    </tbody>
  </table>
  <p class="hint">token-budget-tiktoken is honestly slower here — see docs/comparisons/token-budget-vs-gpt-tokenizer.md.</p>
`;

const REFERENCE_50K_TABLE = `
  <table>
    <thead><tr><th>System</th><th>Time (50,000 messages)</th></tr></thead>
    <tbody>
      <tr><td>token-budget</td><td>226.4 ms</td></tr>
      <tr><td>naive DIY (shift + recompute)</td><td>988.2 ms</td></tr>
      <tr><td>LangChain trimMessages</td><td>~19,500–40,900 ms (range across separate runs)</td></tr>
    </tbody>
  </table>
  <p class="hint">
    This is a large-buffer, single-budget stress test where most of the history is retained rather than
    aggressively trimmed — a workload-specific comparison, not a universal "token-budget is Nx faster" claim.
    Full methodology: <a href="https://github.com/shivam039/token-budget/blob/main/docs/benchmarks.md" target="_blank" rel="noopener">docs/benchmarks.md</a>.
  </p>
`;

export function initBenchmarksTab(): void {
  const rawEl = document.getElementById('raw-tokenizer-bench');
  if (rawEl) rawEl.innerHTML = RAW_TOKENIZER_REFERENCE;

  const refEl = document.getElementById('reference-bench-table');
  if (refEl) refEl.innerHTML = REFERENCE_50K_TABLE;

  const button = document.getElementById('btn-run-bench') as HTMLButtonElement | null;
  const sizeSelect = document.getElementById('bench-size') as HTMLSelectElement | null;
  const resultEl = document.getElementById('live-bench-result');
  if (!button || !sizeSelect || !resultEl) return;

  button.addEventListener('click', () => {
    const n = Number(sizeSelect.value);
    button.disabled = true;
    resultEl.textContent = `Running (${n.toLocaleString()} messages)…`;
    // A macrotask boundary so the "Running…" status actually paints before the synchronous work below.
    setTimeout(() => {
      const tb = runTokenBudget(n);
      const diy = runNaiveDIY(n);
      resultEl.innerHTML = `
        <table>
          <thead><tr><th>System</th><th>Time</th><th>Messages retained</th></tr></thead>
          <tbody>
            <tr><td>token-budget</td><td>${tb.ms.toFixed(1)} ms</td><td>${tb.survivors}</td></tr>
            <tr><td>naive DIY (shift + recompute)</td><td>${diy.ms.toFixed(1)} ms</td><td>${diy.survivors}</td></tr>
          </tbody>
        </table>
        <p class="hint">Measured live in this browser tab, this run only — re-run for a fresh sample. Both given the same simple length-based token counter, so this isolates buffer/eviction machinery cost, not tokenizer choice.</p>
      `;
      button.disabled = false;
    }, 0);
  });
}
