import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { catalogCommand } from '@cli/commands/catalog';
import { createCatalogGitHook, removeCatalogGitHook } from '@cli/utils/catalog-sync';

function makeTempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function initGitRepo(repoRoot: string): void {
  fs.mkdirSync(repoRoot, { recursive: true });
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot, stdio: 'ignore' });
}

function makeExecutable(filePath: string): void {
  fs.chmodSync(filePath, 0o755);

  if (process.platform === 'win32') {
    try {
      execFileSync('icacls', [filePath, '/grant', 'Everyone:RX'], { stdio: 'ignore' });
    } catch {
      // Best-effort on Windows. The Git hook still has the extensionless
      // shim as a fallback when PATH resolution is available.
    }
  }
}

function writeFakeAugxShim(binDir: string, logPath: string): string {
  fs.mkdirSync(binDir, { recursive: true });

  const shimPath = path.join(binDir, 'augx');
  fs.writeFileSync(
    shimPath,
    [
      '#!/bin/sh',
      'printf "%s\\n" "$*" >> "$AUGX_LOG"',
    ].join('\n'),
    'utf-8'
  );
  makeExecutable(shimPath);

  fs.writeFileSync(logPath, '', 'utf-8');
  return shimPath;
}

function runGitCommit(repoRoot: string, env: NodeJS.ProcessEnv) {
  return spawnSync('git', ['commit', '--allow-empty', '-m', 'test'], {
    cwd: repoRoot,
    env,
    encoding: 'utf-8',
  });
}

describe('Catalog hook layout and catalog command behavior', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = makeTempRoot('augx-catalog-hook-');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('runs augx catalog when the repo layout includes augment-extensions', () => {
    const repoRoot = path.join(tempRoot, 'repo-with-layout');
    const gitDir = path.join(repoRoot, '.git');
    const binDir = path.join(tempRoot, 'bin-with-layout');
    const logPath = path.join(tempRoot, 'augx-with-layout.log');

    initGitRepo(repoRoot);
    fs.mkdirSync(path.join(repoRoot, 'augment-extensions'), { recursive: true });
    writeFakeAugxShim(binDir, logPath);

    createCatalogGitHook('pre-commit', gitDir);

    const result = runGitCommit(repoRoot, {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      AUGX_LOG: logPath,
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain('Updating MODULES.md catalog...');
    expect(fs.readFileSync(logPath, 'utf-8').trim()).toBe('catalog');
  });

  it('skips catalog sync with an explicit message when the repo layout is missing augment-extensions', () => {
    const repoRoot = path.join(tempRoot, 'repo-without-layout');
    const gitDir = path.join(repoRoot, '.git');
    const binDir = path.join(tempRoot, 'bin-without-layout');
    const logPath = path.join(tempRoot, 'augx-without-layout.log');

    initGitRepo(repoRoot);
    writeFakeAugxShim(binDir, logPath);

    createCatalogGitHook('pre-commit', gitDir);

    const result = runGitCommit(repoRoot, {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      AUGX_LOG: logPath,
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toContain(
      'Skipping MODULES.md catalog sync: this hook only runs in the Augment Extensions repository layout'
    );
    expect(fs.readFileSync(logPath, 'utf-8')).toBe('');
  });

  it('strips only the catalog block when removing the hook', () => {
    const repoRoot = path.join(tempRoot, 'repo-remove');
    const gitDir = path.join(repoRoot, '.git');
    const hooksDir = path.join(gitDir, 'hooks');
    const hookPath = path.join(hooksDir, 'pre-commit');

    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      hookPath,
      [
        '#!/bin/sh',
        'echo "before"',
        '# Auto-update MODULES.md catalog',
        'if [ -d augment-extensions ]; then',
        '  echo "Updating MODULES.md catalog..."',
        '  augx catalog',
        '',
        '  # Add catalog to commit if changed',
        '  [ -f MODULES.md ] && git add MODULES.md',
        'else',
        '  echo "Skipping MODULES.md catalog sync: this hook only runs in the Augment Extensions repository layout (missing augment-extensions/)."',
        'fi',
        'echo "after"',
      ].join('\n'),
      'utf-8'
    );

    removeCatalogGitHook('pre-commit', gitDir);

    const updatedContent = fs.readFileSync(hookPath, 'utf-8').trimEnd();
    expect(updatedContent).toBe(['#!/bin/sh', 'echo "before"', 'echo "after"'].join('\n'));
    expect(updatedContent).not.toContain('MODULES.md catalog');
    expect(updatedContent).not.toContain('augx catalog');
  });

  it('still updates the catalog directly when invoked without hook indirection', async () => {
    const outputPath = path.join(tempRoot, 'MODULES.md');

    await catalogCommand({ output: outputPath });

    const content = fs.readFileSync(outputPath, 'utf-8');
    expect(content).toContain('# Augment Extensions Module Catalog');
    expect(content).toContain('This catalog lists all available extension modules for Augment Code AI.');
  });
});
