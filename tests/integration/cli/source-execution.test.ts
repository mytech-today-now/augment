import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { describe, expect, it } from 'vitest';

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const REPOSITORY_ROOT = resolve(__dirname, '../../..');
const SOURCE_CLI = join(REPOSITORY_ROOT, 'cli', 'src', 'cli.ts');
const COMPILED_CLI = join(REPOSITORY_ROOT, 'cli', 'dist', 'cli.js');
const NPM_EXECUTABLE = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runSourceCli(args: string[], cwd = REPOSITORY_ROOT): CommandResult {
  const result = spawnSync(NPM_EXECUTABLE, ['--no-install', 'tsx', SOURCE_CLI, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.error ? `${result.stderr ?? ''}${result.error.message}` : result.stderr ?? '',
    exitCode: result.status ?? 1
  };
}

function runCompiledCli(args: string[], cwd = REPOSITORY_ROOT): CommandResult {
  const result = spawnSync(process.execPath, [COMPILED_CLI, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.error ? `${result.stderr ?? ''}${result.error.message}` : result.stderr ?? '',
    exitCode: result.status ?? 1
  };
}

describe('CLI source and compiled execution', () => {
  it('reaches the dispatcher through the supported tsx source command', () => {
    const result = runSourceCli(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: augx');
    expect(result.stdout.trim().length).toBeGreaterThan(0);
    expect(result.stderr).toBe('');
    expect(result.stderr).not.toMatch(/Transform failed|Syntax error/);
  });

  it('keeps compiled help output and the executable shebang valid', () => {
    expect(existsSync(COMPILED_CLI)).toBe(true);
    expect(readFileSync(COMPILED_CLI, 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);

    const result = runCompiledCli(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: augx');
    expect(result.stdout.trim().length).toBeGreaterThan(0);
    expect(result.stderr).toBe('');
  });

  it('reports unknown commands with a stable nonzero exit and readable stderr', () => {
    const result = runSourceCli(['unknown-command']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("error: unknown command 'unknown-command'");
  });

  it('executes a representative command from an isolated working directory', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'augx-cli-smoke-'));

    try {
      const result = runSourceCli(['list', '--linked', '--json'], cwd);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([]);
      expect(result.stderr).toBe('');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
