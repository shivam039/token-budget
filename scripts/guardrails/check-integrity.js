import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export async function run() {
  try {
    // Run tests (fast mode if possible, but standard is fine since CI uses it)
    // Build and Typecheck
    // Note: To keep things fast locally, we just run standard `npm run test` and `npm run typecheck`
    // However, since it takes a few seconds, let's execute them and capture output.

    // We can run `npm run typecheck` first since it's fast
    execSync('npm run typecheck', { cwd: ROOT_DIR, stdio: 'pipe' });

    // Then build
    execSync('npm run build', { cwd: ROOT_DIR, stdio: 'pipe' });

    // Then test
    execSync('npm run test', { cwd: ROOT_DIR, stdio: 'pipe' });

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
