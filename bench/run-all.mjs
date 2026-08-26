// Runs every bench/*.mjs script in sequence. `npm run bench` from the
// repo root (or `npm run bench` inside bench/) invokes this.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const scripts = ['incremental-accounting-bench.mjs', 'context-management-bench.mjs', 'context-management-realistic-bench.mjs', 'tokenizer-bench.mjs'];

for (const script of scripts) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${script}`);
  console.log('='.repeat(70));
  const result = spawnSync(process.execPath, [join(here, script)], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n${script} exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log('  Done. See docs/benchmarks.md for methodology and how to read these numbers.');
console.log('='.repeat(70));
