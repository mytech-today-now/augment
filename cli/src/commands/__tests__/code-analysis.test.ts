import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { codeAnalysisCommand } from '../code-analysis';

function writeFixture(root: string, relativePath: string, contents: string): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf-8');
  return filePath;
}

function getLoggedOutput(spy: jest.SpyInstance): string {
  return spy.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
}

function getJsonOutput(spy: jest.SpyInstance): Record<string, unknown> {
  const jsonLine = spy.mock.calls
    .map((call) => String(call[0]))
    .find((line) => line.trimStart().startsWith('{'));

  if (!jsonLine) {
    throw new Error('Expected JSON output from code-analysis command');
  }

  return JSON.parse(jsonLine) as Record<string, unknown>;
}

describe('code-analysis command', () => {
  let fixtureRoot: string;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'augx-code-analysis-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('emits a real pattern issue for duplicated function bodies', async () => {
    const filePath = writeFixture(
      fixtureRoot,
      'patterns/repeated.ts',
      [
        'export function firstHelper(input: string) {',
        '  const trimmed = input.trim();',
        '  return trimmed.toUpperCase();',
        '}',
        '',
        'export function secondHelper(input: string) {',
        '  const trimmed = input.trim();',
        '  return trimmed.toUpperCase();',
        '}',
        ''
      ].join('\n')
    );

    await codeAnalysisCommand({
      file: filePath,
      type: 'patterns',
      severity: 'low',
      format: 'json'
    });

    expect(processExitSpy).not.toHaveBeenCalled();

    const output = getJsonOutput(consoleLogSpy);
    const result = output as {
      summary: { filesAnalyzed: number; issuesFound: number };
      issues: unknown[];
      patterns?: unknown[];
    };

    expect(result.summary.filesAnalyzed).toBe(1);
    expect(result.summary.issuesFound).toBeGreaterThan(0);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(Array.isArray(result.patterns)).toBe(true);
    expect((result.patterns ?? []).length).toBeGreaterThan(0);
  });

  it('keeps a safe file clean in patterns mode', async () => {
    const filePath = writeFixture(
      fixtureRoot,
      'patterns/safe.ts',
      [
        'export function firstHelper(input: string) {',
        '  return input.trim().toUpperCase();',
        '}',
        '',
        'export function secondHelper(input: string) {',
        '  return input.trim().toLowerCase();',
        '}',
        ''
      ].join('\n')
    );

    await codeAnalysisCommand({
      file: filePath,
      type: 'patterns',
      severity: 'low',
      format: 'json'
    });

    expect(processExitSpy).not.toHaveBeenCalled();

    const output = getJsonOutput(consoleLogSpy);
    const result = output as {
      summary: { filesAnalyzed: number; issuesFound: number };
      issues: unknown[];
      patterns?: unknown[];
    };

    expect(result.summary.filesAnalyzed).toBe(1);
    expect(result.summary.issuesFound).toBe(0);
    expect(result.issues).toHaveLength(0);
    expect(result.patterns).toEqual([]);
  });

  it('keeps complexity analysis behavior intact', async () => {
    const filePath = writeFixture(
      fixtureRoot,
      'complexity/complex.ts',
      [
        'export function complex(value: number) {',
        '  if (value > 0) {}',
        '  if (value > 1) {}',
        '  if (value > 2) {}',
        '  if (value > 3) {}',
        '  if (value > 4) {}',
        '  if (value > 5) {}',
        '  if (value > 6) {}',
        '  if (value > 7) {}',
        '  if (value > 8) {}',
        '  if (value > 9) {}',
        '  if (value > 10) {}',
        '}',
        ''
      ].join('\n')
    );

    await codeAnalysisCommand({
      file: filePath,
      type: 'complexity',
      severity: 'low',
      format: 'text'
    });

    expect(processExitSpy).not.toHaveBeenCalled();

    const output = getLoggedOutput(consoleLogSpy);
    expect(output).toContain('Files Analyzed:    1');
    expect(output).toContain('Issues Found:      1');
    expect(output).toContain("Function 'complex' has high complexity");
  });

  it('keeps security analysis behavior intact', async () => {
    const filePath = writeFixture(
      fixtureRoot,
      'security/insecure-random.ts',
      [
        'export function sample() {',
        '  return Math.random();',
        '}',
        ''
      ].join('\n')
    );

    await codeAnalysisCommand({
      file: filePath,
      type: 'security',
      severity: 'low',
      format: 'text'
    });

    expect(processExitSpy).not.toHaveBeenCalled();

    const output = getLoggedOutput(consoleLogSpy);
    expect(output).toContain('Files Analyzed:    1');
    expect(output).toContain('Issues Found:      1');
    expect(output).toContain('Math.random() is not cryptographically secure');
    expect(output).toContain('Medium:          1');
  });

  it('keeps dependency analysis behavior intact', async () => {
    writeFixture(
      fixtureRoot,
      'dependencies/a.ts',
      [
        "import './b';",
        '',
        'export const a = 1;',
        ''
      ].join('\n')
    );

    writeFixture(
      fixtureRoot,
      'dependencies/b.ts',
      [
        "import './a';",
        '',
        'export const b = 2;',
        ''
      ].join('\n')
    );

    await codeAnalysisCommand({
      dir: path.join(fixtureRoot, 'dependencies'),
      type: 'dependencies',
      severity: 'low',
      format: 'text'
    });

    expect(processExitSpy).not.toHaveBeenCalled();

    const output = getLoggedOutput(consoleLogSpy);
    expect(output).toContain('Files Analyzed:    2');
    expect(output).toContain('Issues Found:      1');
    expect(output).toContain('Circular dependency detected');
    expect(output).toContain('Medium:          1');
  });
});
