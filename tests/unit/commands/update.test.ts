import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { join, resolve } from 'path';
import { updateCommand } from '@cli/commands/update';
import { TestEnvironment, type TestProject } from '../../helpers/test-env';

const testState = vi.hoisted(() => ({
  packageJsonVersion: '1.0.0'
}));

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

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');

  return {
    ...actual,
    readFileSync: ((filePath: any, ...args: any[]) => {
      const normalizedPath = String(filePath).replace(/\\/g, '/');

      if (normalizedPath.endsWith('/package.json')) {
        return JSON.stringify({ version: testState.packageJsonVersion });
      }

      return actual.readFileSync(filePath as any, ...(args as [any]));
    }) as typeof actual.readFileSync
  };
});

describe('updateCommand', () => {
  const repoRoot = resolve(__dirname, '../../../');
  const modulesRoot = join(repoRoot, 'augment-extensions', 'coding-standards');
  const createdModulePaths: string[] = [];

  let testEnv: TestEnvironment;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testEnv = new TestEnvironment();
    await testEnv.setup();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);

    testState.packageJsonVersion = '1.0.0';
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();

    while (createdModulePaths.length > 0) {
      const modulePath = createdModulePaths.pop();
      if (modulePath) {
        await rm(modulePath, { recursive: true, force: true });
      }
    }

    await testEnv.cleanup();
  });

  function readOutput(): string {
    return [...consoleLogSpy.mock.calls, ...consoleErrorSpy.mock.calls]
      .flat()
      .map((value) => String(value))
      .join('\n');
  }

  async function createModuleFixture(
    moduleSlug: string,
    latestVersion: string,
    description: string
  ): Promise<string> {
    const modulePath = join(modulesRoot, moduleSlug);
    createdModulePaths.push(modulePath);

    await mkdir(modulePath, { recursive: true });
    await writeFile(
      join(modulePath, 'module.json'),
      JSON.stringify({
        name: moduleSlug,
        version: latestVersion,
        displayName: moduleSlug.replace(/-/g, ' '),
        description,
        type: 'coding-standards'
      }, null, 2)
    );

    return modulePath;
  }

  async function createProjectFixture(
    moduleSlug: string,
    currentVersion: string,
    currentDescription: string
  ): Promise<TestProject> {
    const project = await testEnv.createProject();
    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    config.modules.push({
      name: `coding-standards/${moduleSlug}`,
      version: currentVersion,
      type: 'coding-standards',
      description: currentDescription
    });
    await writeFile(project.configPath, JSON.stringify(config, null, 2));
    process.chdir(project.path);
    return project;
  }

  it('updates an ordinary three-part version without changing the current flow', async () => {
    const moduleSlug = 'plain-update';
    const currentVersion = '1.2.3';
    const latestVersion = '1.2.4';
    const currentDescription = 'Current plain module description';
    const latestDescription = 'Latest plain module description';

    await createModuleFixture(moduleSlug, latestVersion, latestDescription);
    const project = await createProjectFixture(moduleSlug, currentVersion, currentDescription);

    await updateCommand({});

    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(config.modules[0].version).toBe(latestVersion);
    expect(config.modules[0].description).toBe(latestDescription);
    expect(readOutput()).toContain(
      `✓ coding-standards/${moduleSlug}: Updated ${currentVersion} → ${latestVersion}`
    );
    expect(readOutput()).toContain('Updated: 1');
    expect(readOutput()).toContain('Up to date: 0');
  });

  it('orders prerelease versions below their release version', async () => {
    const moduleSlug = 'prerelease-release';
    const currentVersion = '1.0.0-alpha.1';
    const latestVersion = '1.0.0';
    const currentDescription = 'Current prerelease description';
    const latestDescription = 'Release description';

    await createModuleFixture(moduleSlug, latestVersion, latestDescription);
    const project = await createProjectFixture(moduleSlug, currentVersion, currentDescription);

    await updateCommand({});

    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(config.modules[0].version).toBe(latestVersion);
    expect(config.modules[0].description).toBe(latestDescription);
    expect(readOutput()).toContain(
      `✓ coding-standards/${moduleSlug}: Updated ${currentVersion} → ${latestVersion}`
    );
    expect(readOutput()).toContain('Updated: 1');
    expect(readOutput()).toContain('Up to date: 0');
  });

  it('treats build metadata as semver-equivalent', async () => {
    const moduleSlug = 'build-metadata';
    const currentVersion = '1.0.0+build.1';
    const latestVersion = '1.0.0+build.2';
    const currentDescription = 'Current build metadata description';
    const latestDescription = 'Latest build metadata description';

    await createModuleFixture(moduleSlug, latestVersion, latestDescription);
    const project = await createProjectFixture(moduleSlug, currentVersion, currentDescription);

    await updateCommand({});

    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(config.modules[0].version).toBe(currentVersion);
    expect(config.modules[0].description).toBe(currentDescription);
    expect(readOutput()).toContain(
      `○ coding-standards/${moduleSlug}: Already up to date (v${currentVersion})`
    );
    expect(readOutput()).toContain('Updated: 0');
    expect(readOutput()).toContain('Up to date: 1');
  });

  it('orders mixed-digit prerelease identifiers numerically', async () => {
    const moduleSlug = 'mixed-digit-prerelease';
    const currentVersion = '1.0.0-rc.2';
    const latestVersion = '1.0.0-rc.10';
    const currentDescription = 'Current mixed-digit description';
    const latestDescription = 'Latest mixed-digit description';

    await createModuleFixture(moduleSlug, latestVersion, latestDescription);
    const project = await createProjectFixture(moduleSlug, currentVersion, currentDescription);

    await updateCommand({});

    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(config.modules[0].version).toBe(latestVersion);
    expect(config.modules[0].description).toBe(latestDescription);
    expect(readOutput()).toContain(
      `✓ coding-standards/${moduleSlug}: Updated ${currentVersion} → ${latestVersion}`
    );
    expect(readOutput()).toContain('Updated: 1');
    expect(readOutput()).toContain('Up to date: 0');
  });

  it('keeps the CLI update path on the existing semver branch', async () => {
    testState.packageJsonVersion = '1.0.0+build.1';
    vi.mocked(execSync).mockReturnValue('1.0.0+build.2' as any);

    await updateCommand({ cli: true });

    expect(vi.mocked(execSync)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(execSync).mock.calls[0][0])).toContain(
      'npm view @mytechtoday/augment-extensions version'
    );
    expect(readOutput()).toContain('CLI is already up to date (v1.0.0+build.1)');
  });
});
