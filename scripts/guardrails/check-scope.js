import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export async function run() {
  try {
    const stat = execSync('git diff --shortstat HEAD', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim();
    if (!stat) {
      return { status: 'pass' }; // no changes
    }

    const diffFiles = execSync('git diff --name-only HEAD', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim().split('\n');

    let unusualFiles = [];
    for (const f of diffFiles) {
        if (!f) continue;
        if (f.endsWith('.exe') || f.endsWith('.dll') || f.endsWith('.so') || f.endsWith('.dylib') || f.endsWith('.bin')) {
            unusualFiles.push(f);
        }
    }

    if (unusualFiles.length > 0) {
        return {
            status: 'warn',
            message: `Found unexpected binary files changed:\n${unusualFiles.join('\n')}`
        };
    }

    // Parse shortstat: e.g. " 3 files changed, 50 insertions(+), 10 deletions(-)"
    const match = stat.match(/(\d+) files? changed/);
    if (match) {
        const filesChanged = parseInt(match[1], 10);
        if (filesChanged > 50) {
             return {
                 status: 'warn',
                 message: `Unusually large change (${filesChanged} files). Make sure this is intended.`
             }
        }
    }

    return { status: 'pass' };
  } catch (error) {
    return { status: 'warn', message: 'Failed to run scope check.' };
  }
}
