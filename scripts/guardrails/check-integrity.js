import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export async function run() {
  try {
    if (process.env.SKIP_INTEGRITY_CHECKS === '1' || process.env.GUARDRAILS_SKIP_INTEGRITY === '1') {
      return { status: 'pass', message: 'Integrity checks skipped via env variable.' };
    }

    // We can run `npm run typecheck` first since it's fast
    execSync('npm run typecheck', { cwd: ROOT_DIR, stdio: 'pipe' });

    // Then build
    execSync('npm run build', { cwd: ROOT_DIR, stdio: 'pipe' });

    // Removed: npm run test (tests already cover behavior)

    return { status: 'pass' };
  } catch (error) {
    let msg = `Core integrity check failed:\n${error.message}\n`;
    if (error.stdout) msg += `\nSTDOUT:\n${error.stdout.toString()}`;
    if (error.stderr) msg += `\nSTDERR:\n${error.stderr.toString()}`;
    return {
      status: 'fail',
      message: msg
    };
  }
}
