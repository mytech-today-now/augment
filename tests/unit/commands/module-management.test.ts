import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { TestEnvironment } from '../../helpers/test-env';
import { ModuleLoader } from '@cli/core/module-loader';
import { CompatibilityChecker } from '@cli/core/compatibility-checker';
import {
  createCommand,
  pinCommand,
  checkUpdatesCommand,
  diffCommand
} from '@cli/commands/module-management';
import { useCommand } from '@cli/commands/use';
import { upgradeCommand } from '@cli/commands/upgrade';
import { versionInfoCommand } from '@cli/commands/version-info';
import { validateModuleStructure, getModulesDir, discoverModules, findModule } from '@cli/utils/module-system';

vi.mock('chalk', () => {
  const identity = (value: string) => value;
  const bold = Object.assign((value: string) => value, {
    blue: identity,
    cyan: identity,
    green: identity,
    red: identity,
    gray: identity,
    yellow: identity,
    magenta: identity
  });

  return {
    default: {
      blue: identity,
      cyan: identity,
      green: identity,
      red: identity,
      gray: identity,
      yellow: identity,
      magenta: identity,
      bold
    },
    blue: identity,
    cyan: identity,
    green: identity,
    red: identity,
    gray: identity,
    yellow: identity,
    magenta: identity,
    bold
  };
});

vi.mock('@cli/utils/module-system', async () => {
  const actual = await vi.importActual<typeof import('@cli/utils/module-system')>('@cli/utils/module-system');
  return {
    ...actual,
    discoverModules: vi.fn(),
    findModule: vi.fn(),
    getModulesDir: vi.fn()
  };
});

describe('module management commands', () => {
  let testEnv: TestEnvironment;
  let originalCwd: string;
  let modulesRoot: string;
  let moduleRegistry: Array<{ fullName: string; path: string; metadata: { name: string; version: string; type: string; description: string } }>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testEnv = new TestEnvironment();
    await testEnv.setup();
    modulesRoot = join(testEnv.tempDir, 'modules');
    moduleRegistry = [];

    vi.mocked(getModulesDir).mockReturnValue(modulesRoot);
    vi.mocked(findModule).mockImplementation((moduleName: string) => {
      return (
        moduleRegistry.find((module) =>
          module.fullName === moduleName ||
          module.metadata.name === moduleName ||
          module.fullName.endsWith(`/${moduleName}`)
        ) || null
      );
    });
    vi.mocked(discoverModules).mockImplementation(() => [...moduleRegistry] as any);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await testEnv.cleanup();
  });

  function readOutput(): string {
    return [...consoleLogSpy.mock.calls, ...consoleErrorSpy.mock.calls]
      .flat()
      .map((value) => String(value))
      .join('\n');
  }

  async function seedVersionedModule(name: string, version: string, description = `Test module: ${name}`) {
    const module = await testEnv.createModule({ name, version, description, withRules: true, withExamples: true });
    await writeFile(join(module.path, 'VERSION'), `${version}\n`);
    await writeFile(
      join(module.path, 'CHANGELOG.md'),
      [
        '# Changelog',
        '',
        `## [${version}] - 2026-09-07`,
        '',
        '### Added',
        '- Initial release.',
        ''
      ].join('\n')
    );
    moduleRegistry.push(module as any);
    return module;
  }

  async function seedVersionedModuleWithCompatibility(
    name: string,
    version: string,
    compatibility: Record<string, unknown>,
    description = `Test module: ${name}`
  ) {
    const module = await seedVersionedModule(name, version, description);
    await writeFile(
      join(module.path, 'metadata.json'),
      JSON.stringify({
        compatibility
      }, null, 2)
    );
    return module;
  }

  function mockLatestModuleVersion(module: Awaited<ReturnType<typeof seedVersionedModule>>, latestVersion: string) {
    return vi.spyOn(ModuleLoader.prototype, 'load').mockImplementation((modulePath, options) => {
      if (options?.version === 'latest') {
        return {
          module: {
            ...module,
            metadata: {
              ...module.metadata,
              version: latestVersion
            }
          } as any,
          version: latestVersion,
          metadata: {
            version: latestVersion,
            deprecated: false,
            breaking: false
          } as any,
          resolution: {
            version: latestVersion,
            path: modulePath,
            strategy: 'latest',
            available: [latestVersion]
          }
        } as any;
      }

      return null;
    });
  }

  describe('createCommand', () => {
    it('creates a valid scaffold in the modules root', async () => {
      await createCommand('starter-module', { type: 'coding-standards' });

      const modulePath = join(modulesRoot, 'coding-standards', 'starter-module');
      expect(existsSync(modulePath)).toBe(true);
      expect(existsSync(join(modulePath, 'module.json'))).toBe(true);
      expect(existsSync(join(modulePath, 'metadata.json'))).toBe(true);
      expect(existsSync(join(modulePath, 'VERSION'))).toBe(true);
      expect(existsSync(join(modulePath, 'README.md'))).toBe(true);
      expect(existsSync(join(modulePath, 'CHANGELOG.md'))).toBe(true);
      expect(existsSync(join(modulePath, 'rules', 'starter-rule.md'))).toBe(true);
      expect(validateModuleStructure(modulePath).valid).toBe(true);

      expect(readOutput()).toContain('Creating new module: starter-module');
      expect(readOutput()).toContain('✓ Created module scaffold at coding-standards/starter-module');
    });
  });

  describe('pinCommand', () => {
    it('pins the requested version in the project config', async () => {
      const project = await testEnv.createProject();
      const module = await seedVersionedModule('pin-target', '2.0.0');
      process.chdir(project.path);

      await pinCommand(module.fullName, '1.2.3');

      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      expect(config.modules).toEqual([
        expect.objectContaining({
          name: module.fullName,
          version: '1.2.3',
          pinnedAt: expect.any(String)
        })
      ]);
      expect(readOutput()).toContain(`Pinning ${module.fullName} to version 1.2.3`);
      expect(readOutput()).toContain(`✓ Pinned ${module.fullName} to v1.2.3`);
    });
  });

  describe('checkUpdatesCommand', () => {
    it('reports available updates and exits non-zero', async () => {
      const project = await testEnv.createProject();
      const module = await seedVersionedModule('updates-target', '2.0.0');
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: '1.0.0',
        type: module.metadata.type,
        description: module.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));
      process.chdir(project.path);

      await expect(checkUpdatesCommand()).rejects.toThrow('process.exit(1)');
      expect(readOutput()).toContain('Checking for updates...');
      expect(readOutput()).toContain(`Update available 1.0.0 → 2.0.0`);
      expect(readOutput()).toContain('Updates available: 1');
    });
  });

  describe('diffCommand', () => {
    it('shows current vs latest details for a linked module', async () => {
      const project = await testEnv.createProject();
      const module = await seedVersionedModule('diff-target', '2.0.0', 'Updated module description');
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: '1.0.0',
        type: module.metadata.type,
        description: 'Original module description'
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));
      process.chdir(project.path);

      await diffCommand(module.fullName);

      expect(readOutput()).toContain(`Showing diff for: ${module.fullName}`);
      expect(readOutput()).toContain('Current vs Latest');
      expect(readOutput()).toContain('Current: 1.0.0');
      expect(readOutput()).toContain('Latest:  2.0.0');
      expect(readOutput()).toContain('Description');
      expect(readOutput()).toContain('Latest Changes');
      expect(readOutput()).toContain('Initial release.');
    });
  });

  describe('Nearby command smoke tests', () => {
    it('keeps useCommand pinning behavior intact', async () => {
      const project = await testEnv.createProject();
      const module = await seedVersionedModule('use-target', '2.0.0');
      process.chdir(project.path);

      await useCommand(module.fullName, { version: 'latest', pin: true });

      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      expect(config.modules[0]).toEqual(
        expect.objectContaining({
          name: module.fullName,
          version: '2.0.0',
          pinnedAt: expect.any(String)
        })
      );
    });

    it('keeps upgradeCommand dry-run behavior intact', async () => {
      const project = await testEnv.createProject();
      const module = await seedVersionedModule('upgrade-target', '1.0.0');
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: '1.0.0',
        type: module.metadata.type,
        description: module.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));
      process.chdir(project.path);

      const latestVersion = '2.0.0';
      const loadSpy = mockLatestModuleVersion(module, latestVersion);

      await upgradeCommand(module.fullName, { dryRun: true });
      loadSpy.mockRestore();

      const configAfter = JSON.parse(await readFile(project.configPath, 'utf-8'));
      expect(configAfter.modules[0].version).toBe('1.0.0');
      expect(readOutput()).toContain('[DRY RUN] No changes made');
    });

    it('blocks JSON upgrade output when the Augment runtime cannot be determined', async () => {
      const project = await testEnv.createProject();
      const module = await seedVersionedModuleWithCompatibility('upgrade-unknown-augment', '1.0.0', {
        augmentMinVersion: '1.0.0'
      });
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: '1.0.0',
        type: module.metadata.type,
        description: module.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));
      process.chdir(project.path);

      const loadSpy = mockLatestModuleVersion(module, '2.0.0');

      await expect(upgradeCommand(module.fullName, { json: true, dryRun: true })).rejects.toThrow('process.exit(1)');
      loadSpy.mockRestore();

      expect(readOutput()).toContain('Compatibility checks failed');
      expect(readOutput()).toContain('Unable to determine current Augment version; compatibility cannot be verified');
    });

    it('keeps upgradeCommand warning style for other incompatibilities', async () => {
      const project = await testEnv.createProject();
      const module = await seedVersionedModuleWithCompatibility('upgrade-ts-warning', '1.0.0', {
        augmentMinVersion: '1.0.0',
        typescriptMinVersion: '999.0.0'
      });
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: '1.0.0',
        type: module.metadata.type,
        description: module.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));
      process.chdir(project.path);

      const loadSpy = mockLatestModuleVersion(module, '2.0.0');

      await upgradeCommand(module.fullName, {
        dryRun: true,
        compatibilityChecker: new CompatibilityChecker({ augmentVersion: '1.0.0' })
      });
      loadSpy.mockRestore();

      expect(readOutput()).toContain('Compatibility Warnings:');
      expect(readOutput()).toContain('TypeScript');
      expect(readOutput()).not.toContain('Compatibility Errors:');
    });

    it('keeps versionInfoCommand option flags intact', async () => {
      const project = await testEnv.createProject();
      const module = await seedVersionedModule('version-info-target', '2.0.0');
      process.chdir(project.path);

      await versionInfoCommand(module.fullName, {
        json: true,
        changelog: false,
        compatibility: false
      });

      const json = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0] ?? '{}'));
      expect(json.module).toBe(module.fullName);
      expect(json.version).toBe('2.0.0');
      expect(json.compatibility).toBeNull();
      expect(json.changelog).toBeNull();
    });
  });
});
