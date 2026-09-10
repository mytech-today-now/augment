/**
 * Integration tests for skill command execution
 * Exercises the real spawn path against a temporary skill repository.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as skillCommands from '../skill';

jest.mock('chalk', () => ({
  default: {
    blue: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    gray: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    bold: (str: string) => str
  },
  blue: (str: string) => str,
  green: (str: string) => str,
  red: (str: string) => str,
  gray: (str: string) => str,
  yellow: (str: string) => str,
  cyan: (str: string) => str,
  bold: (str: string) => str
}));

function createTempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'augx-skill-exec-'));
}

function writeSkillFile(repoRoot: string, skillId: string, cliCommand: string, category = 'retrieval'): string {
  const skillPath = path.join(repoRoot, 'skills', category, `${skillId}.md`);
  fs.mkdirSync(path.dirname(skillPath), { recursive: true });

  fs.writeFileSync(
    skillPath,
    `---
id: ${skillId}
name: ${skillId}
version: 1.0.0
category: ${category}
tags: [test]
tokenBudget: 1000
priority: medium
dependencies: []
cliCommand: ${JSON.stringify(cliCommand)}
---

# ${skillId}
`,
    'utf-8'
  );

  return skillPath;
}

function writeScript(repoRoot: string, fileName: string, content: string): string {
  const scriptPath = path.join(repoRoot, fileName);
  fs.writeFileSync(scriptPath, content, 'utf-8');
  return scriptPath;
}

async function withRepoCwd<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const previousCwd = process.cwd();
  process.chdir(repoRoot);

  try {
    return await fn();
  } finally {
    process.chdir(previousCwd);
  }
}

describe('Skill execution integration', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  const tempRoots: string[] = [];

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation() as any;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();

    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop() as string, { recursive: true, force: true });
    }
  });

  it('passes shell metacharacters through as literal argv', async () => {
    const repoRoot = createTempRepo();
    tempRoots.push(repoRoot);

    const captureFile = path.join(repoRoot, 'captured.json');
    const scriptPath = writeScript(
      repoRoot,
      'dump-argv.js',
      [
        "const fs = require('fs');",
        'const outputFile = process.argv[2];',
        'fs.writeFileSync(outputFile, JSON.stringify(process.argv.slice(3)));'
      ].join('\n')
    );

    writeSkillFile(
      repoRoot,
      'literal-skill',
      `node ${JSON.stringify(scriptPath)} ${JSON.stringify(captureFile)} "alpha && beta" | "quoted arg"`
    );

    await withRepoCwd(repoRoot, () =>
      skillCommands.skillExecCommand('literal-skill', ['user arg', '&&', '|'])
    );

    const capturedArgs = JSON.parse(fs.readFileSync(captureFile, 'utf-8'));

    expect(capturedArgs).toEqual([
      'alpha && beta',
      '|',
      'quoted arg',
      'user arg',
      '&&',
      '|'
    ]);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Executing skill: literal-skill'));
  });

  it('fails cleanly when the executable is missing', async () => {
    const repoRoot = createTempRepo();
    tempRoots.push(repoRoot);

    writeSkillFile(
      repoRoot,
      'missing-exec-skill',
      'missing-tool --flag "quoted arg"'
    );

    await withRepoCwd(repoRoot, () => skillCommands.skillExecCommand('missing-exec-skill'));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skill missing-exec-skill cannot execute command "missing-tool --flag \\"quoted arg\\"": executable not found'
      )
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('executed directly without a shell')
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('keeps inherited stdio for a normal command', async () => {
    const repoRoot = createTempRepo();
    tempRoots.push(repoRoot);

    const markerFile = path.join(repoRoot, 'marker.txt');
    const scriptPath = writeScript(
      repoRoot,
      'streaming.js',
      [
        "const fs = require('fs');",
        `fs.writeFileSync(${JSON.stringify(markerFile)}, 'ran');`,
        "process.stdout.write('streamed output\\n');",
        "process.stderr.write('streamed error\\n');"
      ].join('\n')
    );

    writeSkillFile(repoRoot, 'streaming-skill', `node ${JSON.stringify(scriptPath)}`);

    await withRepoCwd(repoRoot, () => skillCommands.skillExecCommand('streaming-skill'));

    expect(fs.readFileSync(markerFile, 'utf-8')).toBe('ran');
    expect(processExitSpy).not.toHaveBeenCalled();
  });
});
