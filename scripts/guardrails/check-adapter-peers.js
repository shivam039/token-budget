import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');
const CORE_PACKAGE = '@shivam.dixit/token-budget';
const SUPPORTED_RANGES = new Set(['^0.2.0', '^0.1.0 || ^0.2.0']);

export function validateManifestText(text, fileName = 'package.json') {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return `${fileName}: invalid JSON`;
  }

  if (manifest.private || manifest.name === CORE_PACKAGE) return null;
  if (!manifest.name?.startsWith('@shivam.dixit/token-budget-')) return null;

  const peerRange = manifest.peerDependencies?.[CORE_PACKAGE];
  if (!peerRange) return `${fileName}: missing ${CORE_PACKAGE} peer dependency`;
  if (!SUPPORTED_RANGES.has(peerRange)) {
    return `${fileName}: unsupported ${CORE_PACKAGE} peer range ${JSON.stringify(peerRange)}; expected ^0.2.0 or ^0.1.0 || ^0.2.0`;
  }
  return null;
}

export async function run(rootDir = ROOT_DIR) {
  const packagesDir = path.join(rootDir, 'packages');
  const failures = [];
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(packagesDir, entry.name, 'package.json');
    if (!fs.existsSync(file)) continue;
    const failure = validateManifestText(fs.readFileSync(file, 'utf8'), path.relative(rootDir, file));
    if (failure) failures.push(failure);
  }
  return failures.length
    ? { status: 'fail', message: failures.join('\n') }
    : { status: 'pass' };
}
