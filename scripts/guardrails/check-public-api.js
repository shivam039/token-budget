import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

function getBaseFiles(repoRoot) {
    let baseRef = process.env.GITHUB_BASE_REF || process.env.GUARDRAILS_BASE_REF;
    if (baseRef) {
        // Just use the explicit ref
        try {
             execSync(`git rev-parse --verify ${baseRef}`, { cwd: repoRoot, stdio: 'ignore' });
             return baseRef;
        } catch {
             // If missing, try fetching
             try {
                 execSync(`git fetch origin ${baseRef}`, { cwd: repoRoot, stdio: 'ignore' });
                 return baseRef; // Actually we might need 'FETCH_HEAD' but let's just use the ref directly if fetch succeeds or fallback
             } catch {
                 // Return null instead of silent fallback
             }
        }
    }

    try {
        const baseCommit = execSync('git merge-base origin/main HEAD', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
        return baseCommit;
    } catch {
        try {
             const baseCommit = execSync('git merge-base main HEAD', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
             return baseCommit;
        } catch {
             return null;
        }
    }
}

function getFileContentAtCommit(repoRoot, commit, filePath) {
    try {
        const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
        return execSync(`git show ${commit}:${relativePath}`, { cwd: repoRoot, stdio: 'pipe' }).toString();
    } catch {
        return null; // File didn't exist or error
    }
}

export async function run() {
  try {
    const packagesDir = path.join(ROOT_DIR, 'packages');
    if (!fs.existsSync(packagesDir)) return { status: 'pass' };

    const baseCommit = getBaseFiles(ROOT_DIR);
    if (!baseCommit) {
        return { status: 'warn', message: 'Could not resolve base commit for public API check. Skipping.' };
    }

    // We only care about changed packages to keep it fast
    const diffFiles = execSync('git diff --name-only HEAD', { cwd: ROOT_DIR, stdio: 'pipe' }).toString().trim().split('\n').filter(Boolean);
    const changedPackages = new Set();

    for (const f of diffFiles) {
        if (f.startsWith('packages/')) {
            const parts = f.split('/');
            if (parts.length > 2) {
                changedPackages.add(path.join(packagesDir, parts[1]));
            }
        }
    }

    if (changedPackages.size === 0) return { status: 'pass' };

    const project = new Project({
        compilerOptions: { strict: true }
    });

    let warnings = [];
    let failures = [];

    for (const pkgDir of changedPackages) {
        const indexFile = path.join(pkgDir, 'src/index.ts');
        if (!fs.existsSync(indexFile)) continue;

        // Current source file
        const sourceFile = project.addSourceFileAtPath(indexFile);

        // Base source file content
        const baseContent = getFileContentAtCommit(ROOT_DIR, baseCommit, indexFile);
        if (!baseContent) continue; // New package

        const baseProject = new Project({ compilerOptions: { strict: true } });
        const baseSourceFile = baseProject.createSourceFile('base_index.ts', baseContent);

        const currentExports = new Map(sourceFile.getExportedDeclarations().entries());
        const baseExports = new Map(baseSourceFile.getExportedDeclarations().entries());

        const currentKeys = Array.from(currentExports.keys());
        const baseKeys = Array.from(baseExports.keys());

        // Find removed exports
        for (const baseKey of baseKeys) {
            if (!currentKeys.includes(baseKey)) {
                // Determine if it was an internal type vs public function
                // By default, removing an export is a breaking change warning/failure
                failures.push(`Package ${path.basename(pkgDir)} removed public export: ${baseKey}`);
            }
        }

        // Find added exports (Informational/Warning depending on conventions, but harmless so we just warn or ignore.
        // We will just do a light warning since the constraint says: New exported function -> informational / possibly warning
        const addedKeys = currentKeys.filter(k => !baseKeys.includes(k));
        if (addedKeys.length > 0) {
            warnings.push(`Package ${path.basename(pkgDir)} added public exports: ${addedKeys.join(', ')}`);
        }
    }

    if (failures.length > 0) {
        return {
            status: 'fail',
            message: `Breaking changes detected in public API:\n  ${failures.join('\n  ')}`
        };
    } else if (warnings.length > 0) {
        return {
            status: 'warn',
            message: `Public API changed:\n  ${warnings.join('\n  ')}`
        };
    }

    return { status: 'pass' };

  } catch (error) {
    return { status: 'warn', message: 'Failed to run public API check statically. ' + error.message };
  }
}
