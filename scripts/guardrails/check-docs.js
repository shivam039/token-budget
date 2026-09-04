import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export async function run() {
  // Let's just do a lightweight check on README.md for local file drift
  const readmePath = path.join(ROOT_DIR, 'README.md');
  if (!fs.existsSync(readmePath)) return { status: 'pass' };

  const content = fs.readFileSync(readmePath, 'utf8');

  // Find relative links like [text](./path) or [text](path)
  const links = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];

  let warnings = [];
  for (const match of links) {
    const link = match[1].trim();
    if (link.startsWith('http') || link.startsWith('#')) continue;

    const resolvedPath = path.resolve(ROOT_DIR, link.split('#')[0]);
    if (!fs.existsSync(resolvedPath)) {
        warnings.push(link);
    }
  }

  if (warnings.length > 0) {
      return {
          status: 'warn',
          message: `README.md contains potentially broken local references:\n  ${warnings.join('\n  ')}`
      };
  }

  return { status: 'pass' };
}
