import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';

const fsMocks = vi.hoisted(() => ({
  readFileSync: null as null | ReturnType<typeof vi.fn>,
  realpathSync: null as null | ReturnType<typeof vi.fn>,
  readFileSyncActual: null as null | ((pathLike: any, options?: any) => string | Buffer),
  realpathActual: null as null | ((pathLike: any) => string),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const readFileSync = vi.fn(actual.readFileSync);
  const realpathSync = vi.fn(actual.realpathSync);
  fsMocks.readFileSync = readFileSync;
  fsMocks.realpathSync = realpathSync;
  fsMocks.readFileSyncActual = actual.readFileSync;
  fsMocks.realpathActual = actual.realpathSync;
  return { ...actual, default: actual, readFileSync, realpathSync };
});

import * as fs from 'fs';
import { findModule, resolveContainedPath } from '@cli/utils/module-system';

const CATALOG_ROOT = path.join(process.cwd(), 'augment-extensions');
const MODULE_FIXTURES: string[] = [];

function writeModuleFixture(modulePath: string, name: string): void {
  fs.mkdirSync(path.join(modulePath, 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(modulePath, 'module.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        displayName: name.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        description: `Fixture module for ${name}`,
        type: 'coding-standards',
      },
      null,
      2
    ),
    'utf-8'
  );
  fs.writeFileSync(path.join(modulePath, 'README.md'), `# ${name}\n`, 'utf-8');
  MODULE_FIXTURES.push(modulePath);
}

function cleanupFixtures(): void {
  while (MODULE_FIXTURES.length > 0) {
    const modulePath = MODULE_FIXTURES.pop()!;
    fs.rmSync(modulePath, { recursive: true, force: true });
  }
}

function resetFsMocks(): void {
  if (fsMocks.readFileSyncActual) {
    vi.mocked(fs.readFileSync).mockImplementation(fsMocks.readFileSyncActual);
  }
  if (fsMocks.realpathActual) {
    vi.mocked(fs.realpathSync).mockImplementation(fsMocks.realpathActual);
  }
}

describe('Module boundary containment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFsMocks();
    cleanupFixtures();
  });

  afterEach(() => {
    resetFsMocks();
    vi.restoreAllMocks();
    cleanupFixtures();
  });

  it('resolves a valid nested catalog module inside the root', () => {
    const modulePath = path.join(CATALOG_ROOT, 'coding-standards', 'security-fixture', 'safe-module');
    writeModuleFixture(modulePath, 'safe-module');

    const module = findModule('coding-standards/security-fixture/safe-module');

    expect(module).not.toBeNull();
    expect(module?.fullName).toBe('coding-standards/security-fixture/safe-module');
    expect(path.relative(CATALOG_ROOT, module!.path)).not.toMatch(/^\.\./);
    expect(fs.realpathSync(module!.path)).toBe(module!.path);
  });

  it('rejects traversal segments and absolute paths before any module file is read', () => {
    const traversalPath = path.join(CATALOG_ROOT, '..', 'outside-boundary', 'traversal-module');
    const absolutePath = path.join(process.cwd(), 'outside-boundary', 'absolute-module');

    writeModuleFixture(traversalPath, 'traversal-module');
    writeModuleFixture(absolutePath, 'absolute-module');

    const readSpy = vi.mocked(fs.readFileSync);

    expect(findModule('../outside-boundary/traversal-module')).toBeNull();
    expect(findModule(absolutePath)).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('rejects symlink escapes when the canonical path leaves the catalog root', () => {
    const modulePath = path.join(CATALOG_ROOT, 'coding-standards', 'symlink-fixture', 'escape');
    const escapedRealPath = path.join(process.cwd(), 'outside-boundary', 'escaped-module');
    writeModuleFixture(modulePath, 'escape');

    const originalRealpathSync = fsMocks.realpathActual!;
    vi.mocked(fs.realpathSync).mockImplementation((target: fs.PathLike) => {
      const normalized = path.resolve(String(target));
      if (normalized === modulePath) {
        return escapedRealPath;
      }
      return originalRealpathSync(target);
    });
    const readSpy = vi.mocked(fs.readFileSync);

    expect(findModule('coding-standards/symlink-fixture/escape')).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('returns null when canonicalization hits a permission error', () => {
    const modulePath = path.join(CATALOG_ROOT, 'coding-standards', 'permission-fixture', 'locked');
    writeModuleFixture(modulePath, 'locked');

    const eacces = new Error('EACCES: permission denied, realpath') as NodeJS.ErrnoException;
    eacces.code = 'EACCES';
    const originalRealpathSync = fsMocks.realpathActual!;
    vi.mocked(fs.realpathSync).mockImplementation((target: fs.PathLike) => {
      const normalized = path.resolve(String(target));
      if (normalized === modulePath) {
        throw eacces;
      }
      return originalRealpathSync(target);
    });
    const readSpy = vi.mocked(fs.readFileSync);

    expect(findModule('coding-standards/permission-fixture/locked')).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
  });
});

describe('resolveContainedPath', () => {
  function withTempRoot<T>(fn: (rootDir: string) => T): T {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'augx-resolve-contained-'));
    try {
      return fn(rootDir);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }

  it('returns a canonical path for an in-root module file', () => {
    withTempRoot((rootDir) => {
      const nestedFile = path.join(rootDir, 'rules', 'nested', 'guide.md');
      fs.mkdirSync(path.dirname(nestedFile), { recursive: true });
      fs.writeFileSync(nestedFile, '# Guide\n', 'utf-8');

      expect(resolveContainedPath(rootDir, 'rules/nested/guide.md')).toBe(fs.realpathSync(nestedFile));
    });
  });

  it('returns null for absolute paths outside the root', () => {
    withTempRoot((rootDir) => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'augx-outside-'));
      const outsideFile = path.join(outsideDir, 'secrets.md');
      fs.writeFileSync(outsideFile, 'TOP-SECRET-OUTSIDE-CONTENT\n', 'utf-8');

      try {
        expect(resolveContainedPath(rootDir, outsideFile)).toBeNull();
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });

  it('returns null for parent-relative escapes', () => {
    withTempRoot((rootDir) => {
      const parentDir = path.dirname(rootDir);
      const outsideDir = fs.mkdtempSync(path.join(parentDir, 'augx-parent-escape-'));
      const outsideFile = path.join(outsideDir, 'outside.md');
      fs.writeFileSync(outsideFile, 'TOP-SECRET-OUTSIDE-CONTENT\n', 'utf-8');

      try {
        const escapePath = path.relative(rootDir, outsideFile);
        expect(escapePath).toMatch(/^\.\.(?:[\\/].+)?/);
        expect(resolveContainedPath(rootDir, escapePath)).toBeNull();
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });

  it('returns null for symlink escapes that resolve outside the root', () => {
    withTempRoot((rootDir) => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'augx-symlink-outside-'));
      const outsideFile = path.join(outsideDir, 'secret.md');
      const linkDir = path.join(rootDir, 'rules', 'escape');

      fs.mkdirSync(path.dirname(linkDir), { recursive: true });
      fs.writeFileSync(outsideFile, 'TOP-SECRET-OUTSIDE-CONTENT\n', 'utf-8');
      fs.symlinkSync(outsideDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');

      try {
        expect(resolveContainedPath(rootDir, 'rules/escape/secret.md')).toBeNull();
      } finally {
        fs.rmSync(linkDir, { force: true });
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });

  it('returns null when canonicalization hits a permission error', () => {
    withTempRoot((rootDir) => {
      const candidate = path.join(rootDir, 'rules', 'locked.md');
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      fs.writeFileSync(candidate, 'locked\n', 'utf-8');

      const eacces = new Error('EACCES: permission denied, realpath') as NodeJS.ErrnoException;
      eacces.code = 'EACCES';
      const originalRealpathSync = fsMocks.realpathActual!;
      vi.mocked(fs.realpathSync).mockImplementation((target: fs.PathLike) => {
        const normalized = path.resolve(String(target));
        if (normalized === candidate) {
          throw eacces;
        }
        return originalRealpathSync(target);
      });

      try {
        expect(resolveContainedPath(rootDir, 'rules/locked.md')).toBeNull();
      } finally {
        resetFsMocks();
      }
    });
  });
});
