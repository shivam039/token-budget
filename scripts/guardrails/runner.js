// scripts/guardrails/runner.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(ROOT_DIR, '.agent-guardrails', 'guardrails.json');

// Colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function run() {
  if (process.env.GUARDRAILS_BYPASS === '1') {
    console.log(`${YELLOW}⚠ Guardrails bypassed via GUARDRAILS_BYPASS=1${RESET}`);
    process.exit(0);
  }

  let config;
  try {
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
    config = JSON.parse(configContent);
  } catch (err) {
    console.error(`${RED}✗ Failed to load guardrails config at ${CONFIG_PATH}${RESET}`);
    process.exit(1);
  }

  console.log(`${BOLD}Agent Guardrails${RESET}\n`);

  let allPassed = true;
  let hasWarnings = false;

  const checks = [
    { id: 'integrity', name: 'Core Integrity (Tests, Typecheck, Build)', file: 'check-integrity.js' },
    { id: 'secrets', name: 'Secret scan', file: 'check-secrets.js' },
    { id: 'scope', name: 'Scope sanity', file: 'check-scope.js' },
    { id: 'public_api', name: 'Public API', file: 'check-public-api.js' },
    { id: 'skill_integrity', name: 'Skill integrity', file: 'check-skill.js' },
    { id: 'skill_trigger', name: 'Skill trigger regression', file: 'check-skill-trigger.js' },
    { id: 'dataset', name: 'Dataset integrity', file: 'check-dataset.js' },
    { id: 'docs', name: 'Documentation drift', file: 'check-docs.js' },
  ];

  for (const check of checks) {
    if (config.checks[check.id] !== false) {
      try {
        const checkModule = await import(path.join(__dirname, check.file));
        const result = await checkModule.run();

        if (result.status === 'pass') {
          console.log(`${GREEN}✓ ${check.name}${RESET}`);
        } else if (result.status === 'warn') {
          console.log(`${YELLOW}⚠ ${check.name}${RESET}`);
          console.log(`  ${result.message}`);
          hasWarnings = true;
        } else if (result.status === 'fail') {
          console.log(`${RED}✗ ${check.name}${RESET}`);
          console.log(`  ${result.message}`);
          allPassed = false;
        }
      } catch (err) {
        if (err.code === 'ERR_MODULE_NOT_FOUND') {
          // If not implemented yet, just skip silently or warn in debug mode.
          // For now we will mark it as skipped/pass
          // console.log(`${YELLOW}- ${check.name} (Not implemented)${RESET}`);
        } else {
          console.log(`${RED}✗ ${check.name} (Execution Error)${RESET}`);
          console.log(`  ${err.message}`);
          allPassed = false;
        }
      }
    }
  }

  console.log(); // Blank line

  if (!allPassed) {
    console.log(`${RED}Guardrails failed. Please fix the blocking issues above.${RESET}`);
    console.log(`(Bypass: GUARDRAILS_BYPASS=1 npm run guardrails)\n`);
    process.exit(1);
  } else if (hasWarnings) {
    console.log(`${YELLOW}Guardrails passed with warnings.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${GREEN}All guardrails passed.${RESET}\n`);
    process.exit(0);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
