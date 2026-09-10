import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestEnvironment } from '../../helpers/test-env';
import { linkCommand } from '@cli/commands/link';
import { readFile } from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';

describe('Link boundary integration tests', () => {
  let testEnv: TestEnvironment;
  let originalCwd: string;
  let outsideFixtureRoot: string;

  beforeEach(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
    originalCwd = process.cwd();
    outsideFixtureRoot = path.join(process.cwd(), 'outside-link-fixture');

    const outsideModulePath = path.join(outsideFixtureRoot, 'module');
    fs.mkdirSync(path.join(outsideModulePath, 'rules'), { recursive: true });
    fs.writeFileSync(
      path.join(outsideModulePath, 'module.json'),
      JSON.stringify(
        {
          name: 'module',
          version: '1.0.0',
          displayName: 'Outside Module',
          description: 'Fixture module outside the catalog root',
          type: 'coding-standards',
        },
        null,
        2
      ),
      'utf-8'
    );
    fs.writeFileSync(path.join(outsideModulePath, 'README.md'), '# Outside Module\n', 'utf-8');
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();

    if (fs.existsSync(outsideFixtureRoot)) {
      fs.rmSync(outsideFixtureRoot, { recursive: true, force: true });
    }

    await testEnv.cleanup();
  });

  it('leaves the project config unchanged when a traversal module name is rejected', async () => {
    const project = await testEnv.createProject({ name: 'link-boundary-project' });
    process.chdir(project.path);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const initialConfig = JSON.parse(await readFile(project.configPath, 'utf-8'));

    await expect(linkCommand('../outside-link-fixture/module', {})).rejects.toThrow(
      'process.exit(1)'
    );

    const finalConfig = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(finalConfig.modules).toEqual(initialConfig.modules);
    expect(errorSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Linking module:'));
    expect(exitSpy).toHaveBeenCalled();
  });
});
