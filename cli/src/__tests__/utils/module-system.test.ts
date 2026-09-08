import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateProjectAgnostic } from '../../utils/module-system';

const MODULE_METADATA = {
  name: 'test-module',
  version: '1.0.0',
  displayName: 'Test Module',
  description: 'Temporary module for project-agnostic validation tests',
  type: 'coding-standards'
};

function createModuleFixture(files: Record<string, string | Buffer>): string {
  const modulePath = fs.mkdtempSync(path.join(os.tmpdir(), 'augx-project-agnostic-'));

  fs.writeFileSync(path.join(modulePath, 'module.json'), JSON.stringify(MODULE_METADATA, null, 2));

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(modulePath, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return modulePath;
}

function withModuleFixture<T>(
  files: Record<string, string | Buffer>,
  fn: (modulePath: string) => T
): T {
  const modulePath = createModuleFixture(files);

  try {
    return fn(modulePath);
  } finally {
    fs.rmSync(modulePath, { recursive: true, force: true });
  }
}

describe('validateProjectAgnostic', () => {
  it.each([
    [
      'markdown',
      'docs/paths.md',
      '# Paths\n\nC:\\Users\\alice\\project\n',
      'Potential hardcoded path in paths.md: C:\\'
    ],
    [
      'JSON',
      'config/settings.json',
      '{\n  "root": "C:\\\\Users\\\\alice\\\\project"\n}\n',
      'Potential hardcoded path in settings.json: C:\\'
    ],
    [
      'TypeScript',
      'src/config.ts',
      'const root = "C:\\Users\\alice\\project";\n',
      'Potential hardcoded path in config.ts: C:\\'
    ],
    [
      'JavaScript',
      'src/config.js',
      'const root = "C:\\Users\\alice\\project";\n',
      'Potential hardcoded path in config.js: C:\\'
    ],
    [
      'Makefile',
      'examples/kernel/Makefile',
      'ROOT_DIR := C:\\Users\\alice\\project\n',
      'Potential hardcoded path in Makefile: C:\\'
    ]
  ])('detects hardcoded paths in %s files', (_label, relativePath, content, expectedWarning) => {
    withModuleFixture({ [relativePath]: content }, modulePath => {
      const result = validateProjectAgnostic(modulePath);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([expectedWarning]);
    });
  });

  it('keeps markdown files clean when they do not contain project-specific content', () => {
    withModuleFixture(
      {
        'docs/safe.md': '# Safe markdown\n\nThis file has no paths or URLs.\n'
      },
      modulePath => {
        const result = validateProjectAgnostic(modulePath);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
      }
    );
  });

  it('does not scan generated or binary files', () => {
    withModuleFixture(
      {
        'dist/generated.js': 'const output = "C:\\Users\\alice\\generated";\n',
        'build/generated.ts': 'const output = "C:\\Users\\alice\\generated";\n',
        'assets/logo.png': 'C:\\Users\\alice\\binary'
      },
      modulePath => {
        const result = validateProjectAgnostic(modulePath);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
      }
    );
  });
});
