import { test, expect, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock child_process for our tests so we can simulate git diffs and states
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { run as runSecrets } from '../../scripts/guardrails/check-secrets.js';
import { run as runScope } from '../../scripts/guardrails/check-scope.js';
import { run as runDataset } from '../../scripts/guardrails/check-dataset.js';
import { validateManifestText } from '../../scripts/guardrails/check-adapter-peers.js';

test('check-secrets passes when no secrets exist', async () => {
  execSync.mockImplementation(() => '');
  const result = await runSecrets();
  expect(result.status).toBe('pass');
});

test('check-scope warns on binary files', async () => {
  execSync.mockImplementation((cmd) => {
    if (cmd.includes('shortstat')) return ' 1 file changed, 0 insertions(+), 0 deletions(-)';
    if (cmd.includes('name-only')) return 'bad_binary.exe\n';
    return '';
  });

  const result = await runScope();
  expect(result.status).toBe('warn');
  expect(result.message).toContain('binary files');
});

test('check-scope warns on massive changes', async () => {
  execSync.mockImplementation((cmd) => {
    if (cmd.includes('shortstat')) return ' 100 files changed, 5000 insertions(+), 10 deletions(-)';
    if (cmd.includes('name-only')) return 'file1.ts\nfile2.ts\n';
    return '';
  });

  const result = await runScope();
  expect(result.status).toBe('warn');
  expect(result.message).toContain('Unusually large change');
});

test('check-dataset passes on valid dataset', async () => {
  // Since check-dataset reads actual files, we can just run it against the existing repo state.
  // The repo state is valid right now.
  const result = await runDataset();
  expect(result.status).toBe('pass');
});

test('adapter peer guard accepts the documented 0.1.x and 0.2.x range', () => {
  const manifest = JSON.stringify({
    name: '@shivam.dixit/token-budget-openai',
    peerDependencies: { '@shivam.dixit/token-budget': '^0.1.0 || ^0.2.0' },
  });
  expect(validateManifestText(manifest)).toBeNull();
});

test.each([
  ['missing peer', { name: '@shivam.dixit/token-budget-openai' }],
  ['too-narrow range', { name: '@shivam.dixit/token-budget-openai', peerDependencies: { '@shivam.dixit/token-budget': '^0.1.0' } }],
])('adapter peer guard rejects %s', (_label, manifest) => {
  expect(validateManifestText(JSON.stringify(manifest))).toMatch(/peer dependency|peer range/);
});

test('adapter peer guard rejects malformed manifests', () => {
  expect(validateManifestText('{')).toContain('invalid JSON');
});
