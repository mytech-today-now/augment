import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { TestEnvironment } from '../../helpers/test-env';
import { linkCommand } from '@cli/commands/link';
import { findModule } from '@cli/utils/module-system';
import { resolveSingleModule } from '@cli/lib/module-resolver';
import { mirrorModule } from '@cli/lib/mirror-runner';
import {
  persistMirrorEntries,
  readMirrorManifest,
  recordedEntriesByTarget,
} from '@cli/lib/mirror-coordination';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

vi.mock('chalk', () => ({
  default: {
    blue: (value: string) => value,
    green: (value: string) => value,
    red: (value: string) => value,
    gray: (value: string) => value,
    yellow: (value: string) => value,
  },
  blue: (value: string) => value,
  green: (value: string) => value,
  red: (value: string) => value,
  gray: (value: string) => value,
  yellow: (value: string) => value,
}));

vi.mock('@cli/utils/module-system', () => ({
  findModule: vi.fn(),
}));

vi.mock('@cli/lib/module-resolver', () => ({
  resolveSingleModule: vi.fn(),
}));

vi.mock('@cli/lib/mirror-runner', () => ({
  ensureClaudeIncludeStub: vi.fn(),
  mirrorModule: vi.fn(),
}));

vi.mock('@cli/lib/mirror-coordination', () => ({
  persistMirrorEntries: vi.fn(),
  readMirrorManifest: vi.fn(),
  recordedEntriesByTarget: vi.fn(),
}));

const fakeModule = {
  fullName: 'visual-design',
  metadata: {
    version: '1.0.0',
    type: 'domain-rules',
    description: 'Visual design module',
  },
} as const;

const fakeResolvedModule = {
  id: fakeModule.fullName,
  version: fakeModule.metadata.version,
  rootPath: '/virtual/visual-design',
  rulesFiles: [],
  examplesFiles: [],
  readmePath: undefined,
} as const;

describe('linkCommand version pinning', () => {
  let testEnv: TestEnvironment;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testEnv = new TestEnvironment();
    await testEnv.setup();
    vi.clearAllMocks();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);

    vi.mocked(findModule).mockReturnValue(fakeModule as any);
    vi.mocked(resolveSingleModule).mockReturnValue(fakeResolvedModule as any);
    vi.mocked(readMirrorManifest).mockReturnValue({ manifest: {}, existed: false } as any);
    vi.mocked(recordedEntriesByTarget).mockReturnValue(new Map());
    vi.mocked(mirrorModule).mockReturnValue({
      entries: [
        {
          tool: 'cursor',
          sourcePath: 'visual-design/README.md',
          targetPath: '.cursor/rules/visual-design.mdc',
          mode: 'copy',
        },
      ],
      claudeStubsAdded: false,
    } as any);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await testEnv.cleanup();
  });

  it('writes the expected config entry on first-time link', async () => {
    const project = await testEnv.createProject({ name: 'first-link-project' });
    process.chdir(project.path);

    await linkCommand('visual-design', {});

    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(config.modules).toEqual([
      {
        name: fakeModule.fullName,
        version: fakeModule.metadata.version,
        type: fakeModule.metadata.type,
        description: fakeModule.metadata.description,
      },
    ]);
    expect(vi.mocked(mirrorModule)).not.toHaveBeenCalled();
    expect(
      consoleLogSpy.mock.calls.some((call) =>
        call.some((part) => String(part).includes('✓ Linked visual-design (v1.0.0)'))
      )
    ).toBe(true);
  });

  it('keeps the existing record unchanged when relinked without --version', async () => {
    const project = await testEnv.createProject({ name: 'same-version-project' });
    const existingEntry = {
      name: fakeModule.fullName,
      version: '1.0.0',
      type: fakeModule.metadata.type,
      description: fakeModule.metadata.description,
      notes: 'keep-me',
    };
    await writeFile(
      project.configPath,
      JSON.stringify({ version: '1.0.0', modules: [existingEntry] }, null, 2)
    );
    process.chdir(project.path);

    const writeMock = vi.mocked(fs.writeFileSync);

    await linkCommand('visual-design', {});

    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(config.modules).toEqual([existingEntry]);
    expect(writeMock).not.toHaveBeenCalled();
    expect(vi.mocked(mirrorModule)).not.toHaveBeenCalled();
    expect(
      consoleLogSpy.mock.calls.some((call) =>
        call.some((part) => String(part).includes('Module already linked: visual-design'))
      )
    ).toBe(true);
  });

  it('updates only the version field when relinked with a new --version', async () => {
    const project = await testEnv.createProject({ name: 'version-update-project' });
    const existingEntry = {
      name: fakeModule.fullName,
      version: '1.0.0',
      type: fakeModule.metadata.type,
      description: fakeModule.metadata.description,
      notes: 'keep-me',
    };
    await writeFile(
      project.configPath,
      JSON.stringify({ version: '1.0.0', modules: [existingEntry] }, null, 2)
    );
    process.chdir(project.path);

    const writeMock = vi.mocked(fs.writeFileSync);

    await linkCommand('visual-design', { version: '2.0.0', mirror: 'cursor' });

    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(config.modules).toEqual([
      {
        ...existingEntry,
        version: '2.0.0',
      },
    ]);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mirrorModule)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(persistMirrorEntries)).toHaveBeenCalledWith(
      project.path,
      fakeModule.fullName,
      expect.any(Array)
    );
    expect(
      consoleLogSpy.mock.calls.some((call) =>
        call.some((part) => String(part).includes('✓ Updated visual-design (v1.0.0 → v2.0.0)'))
      )
    ).toBe(true);
    expect(
      consoleLogSpy.mock.calls.some((call) =>
        call.some((part) => String(part).includes('✓ Mirrored visual-design -> cursor (1 entries)'))
      )
    ).toBe(true);
  });

  it('forwards --force to the mirror runner when mirroring', async () => {
    const project = await testEnv.createProject({ name: 'force-mirror-project' });
    process.chdir(project.path);

    await linkCommand('visual-design', { mirror: 'cursor', force: true });

    expect(vi.mocked(mirrorModule)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mirrorModule).mock.calls[0]?.[2]).toMatchObject({ force: true });
  });

  it('leaves the previous record untouched when an update write fails', async () => {
    const project = await testEnv.createProject({ name: 'update-failure-project' });
    const existingEntry = {
      name: fakeModule.fullName,
      version: '1.0.0',
      type: fakeModule.metadata.type,
      description: fakeModule.metadata.description,
      notes: 'keep-me',
    };
    await writeFile(
      project.configPath,
      JSON.stringify({ version: '1.0.0', modules: [existingEntry] }, null, 2)
    );
    process.chdir(project.path);

    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    await expect(linkCommand('visual-design', { version: '2.0.0' })).rejects.toThrow(
      'process.exit(1)'
    );

    const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
    expect(config.modules).toEqual([existingEntry]);
    expect(vi.mocked(mirrorModule)).not.toHaveBeenCalled();
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        call.some((part) =>
          String(part).includes('Unable to update module visual-design: disk full')
        )
      )
    ).toBe(true);
  });
});
