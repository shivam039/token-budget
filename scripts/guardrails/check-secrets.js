import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

// Very basic heuristics for common secrets that shouldn't be committed
const SECRET_PATTERNS = [
  /(?:api[_\-]key|secret|token|password)[\s]*[:=][\s]*["'][A-Za-z0-9\-_]{16,}["']/i, // generic key
  /sk-(?:ant-api|proj)-[A-Za-z0-9\-_]{20,}/, // Anthropic/OpenAI
  /AKIA[0-9A-Z]{16}/, // AWS
  /gh[pousr]_[A-Za-z0-9_]{36}/, // GitHub tokens
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/ // Private keys
];

export async function run() {
  try {
    // Check files changed compared to git state
    // We check untracked and modified files
    const gitDiff = execSync('git diff --staged --name-only', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim();
    const gitUntracked = execSync('git ls-files --others --exclude-standard', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim();
    const gitModified = execSync('git ls-files -m', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim();

    const filesToCheck = new Set([...gitDiff.split('\n'), ...gitUntracked.split('\n'), ...gitModified.split('\n')].filter(Boolean));

    // Check .env files directly
    for (const file of filesToCheck) {
      if (file.endsWith('.env') || file.endsWith('.env.local')) {
         return {
            status: 'fail',
            message: `Found .env file which should not be committed: ${file}`
         };
      }
    }

    // Since a regex scan can be expensive on binary or large files, we only check diffs.
    // To check diff, we can do git diff and check for adding lines that match secrets
    const diffText = execSync('git diff -U0 HEAD', { cwd: ROOT_DIR, stdio: 'pipe' }).toString();
    const addedLines = diffText.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));

    for (const line of addedLines) {
      // Check if we introduced a secret
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          return {
             status: 'fail',
             message: `Found potential secret in added lines.\nLine: ${line}\nIf this is a false positive, use GUARDRAILS_BYPASS=1.`
          };
        }
      }
    }

    return { status: 'pass' };
  } catch (error) {
    // If it fails to run git diff, perhaps not a git repo or something
    return { status: 'warn', message: 'Failed to run secret check. Are you in a git repository?' };
  }
}
