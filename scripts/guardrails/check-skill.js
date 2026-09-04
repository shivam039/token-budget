import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

export async function run() {
  const skillDir = path.join(ROOT_DIR, 'skills/token-budget-context-management');
  const skillFile = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillFile)) {
    return {
      status: 'fail',
      message: `Skill file not found at ${skillFile}`
    };
  }

  const content = fs.readFileSync(skillFile, 'utf8');

  // Validate frontmatter
  // We expect something like:
  // ---
  // name: token-budget-context-management
  // description: ...
  // ---

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {
       status: 'fail',
       message: `SKILL.md is missing required frontmatter block at the top.`
    };
  }

  const frontmatter = frontmatterMatch[1];
  const hasName = frontmatter.match(/^name:\s*(.+)$/m);
  const hasDescription = frontmatter.match(/^description:\s*(.+)$/m);

  if (!hasName) {
    return { status: 'fail', message: `SKILL.md frontmatter is missing 'name' field.` };
  }
  if (!hasDescription) {
    return { status: 'fail', message: `SKILL.md frontmatter is missing 'description' field.` };
  }

  const name = hasName[1].trim();
  if (name !== 'token-budget-context-management') {
     return { status: 'fail', message: `SKILL.md 'name' (${name}) does not match directory name (token-budget-context-management).` };
  }

  // Validate local links
  // Try to find relative links like [name](relative/path)
  // Or check if specific examples mentioned still exist
  const mdLinks = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  for (const match of mdLinks) {
    const link = match[1].trim();
    if (link.startsWith('http')) continue;
    if (link.startsWith('#')) continue;

    // Resolve relative to skill directory
    const resolvedPath = path.resolve(skillDir, link.split('#')[0]);
    if (!fs.existsSync(resolvedPath)) {
      return {
        status: 'fail',
        message: `SKILL.md contains a broken local reference: ${link}`
      };
    }
  }

  return { status: 'pass' };
}
