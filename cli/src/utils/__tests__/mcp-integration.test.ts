import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { vi } from 'vitest';
import {
  addMCPServer,
  discoverMCPTools,
  executeMCPCommand,
  generateMCPSkillWrapper,
  loadMCPConfigs,
  resolveMCPWrapperTarget,
  UNSUPPORTED_MCP_TRANSPORT_MESSAGE,
} from '../mcp-integration';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  kill: ReturnType<typeof vi.fn>;
};

function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'augx-mcp-'));
}

function writeServersConfig(repoRoot: string, servers: unknown[]): void {
  const configDir = path.join(repoRoot, '.augment', 'mcp');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'servers.json'),
    JSON.stringify({ servers }, null, 2),
    'utf-8'
  );
}

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.kill = vi.fn(() => true);
  return child;
}

describe('MCP integration transport handling', () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    mockSpawn.mockReset();
  });

  afterEach(() => {
    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop() as string, { recursive: true, force: true });
    }

    vi.useRealTimers();
  });

  function newTempRoot(): string {
    const repoRoot = createTempRoot();
    tempRoots.push(repoRoot);
    return repoRoot;
  }

  it('saves stdio server configs unchanged', () => {
    const repoRoot = newTempRoot();

    addMCPServer(
      {
        name: 'beads',
        command: 'python',
        args: ['-m', 'beads_mcp'],
        transport: 'stdio',
        env: {
          BEADS_DIR: '${workspaceFolder}/.beads',
        },
      },
      repoRoot
    );

    const configs = loadMCPConfigs(repoRoot);
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      name: 'beads',
      command: 'python',
      transport: 'stdio',
      args: ['-m', 'beads_mcp'],
    });
  });

  it('rejects HTTP configs before saving them', () => {
    const repoRoot = newTempRoot();

    expect(() =>
      addMCPServer(
        {
          name: 'remote-beads',
          command: 'python',
          transport: 'http' as any,
          url: 'https://example.invalid/mcp',
        },
        repoRoot
      )
    ).toThrow(UNSUPPORTED_MCP_TRANSPORT_MESSAGE);

    expect(fs.existsSync(path.join(repoRoot, '.augment', 'mcp', 'servers.json'))).toBe(false);
  });

  it('executes stdio servers without changing the transport path', async () => {
    const repoRoot = newTempRoot();
    writeServersConfig(repoRoot, [
      {
        name: 'beads',
        command: 'node',
        args: ['server.js'],
        transport: 'stdio',
        env: {
          BEADS_DIR: '.beads',
        },
      },
    ]);

    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child as any);

    const resultPromise = executeMCPCommand('beads', 'tasks/list', { input: true }, repoRoot);

    child.stdout.emit(
      'data',
      Buffer.from('startup noise\n')
    );
    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { ok: true },
        }) + '\n'
      )
    );
    child.emit('close', 0, null);

    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(mockSpawn).toHaveBeenCalledWith(
      'node',
      ['server.js'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        env: expect.objectContaining({
          BEADS_DIR: '.beads',
        }),
      })
    );
    expect(child.stdin.write).toHaveBeenCalledWith(
      expect.stringContaining('"method":"tools/tasks/list"')
    );
  });

  it('times out slow MCP execution and truncates noisy output', async () => {
    const repoRoot = newTempRoot();
    writeServersConfig(repoRoot, [
      {
        name: 'beads',
        command: 'node',
        transport: 'stdio',
      },
    ]);

    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child as any);

    vi.useFakeTimers();

    const resultPromise = executeMCPCommand(
      'beads',
      'tasks/list',
      {},
      repoRoot,
      {
        timeoutMs: 50,
        outputLimitChars: 32,
        killGraceMs: 25,
      }
    );

    child.stderr.emit(
      'data',
      Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef\n')
    );

    await vi.advanceTimersByTimeAsync(50);

    await expect(resultPromise).rejects.toThrow(
      /MCP beads\/tasks\/list timed out after 50ms[\s\S]*truncated to last/
    );
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    await vi.advanceTimersByTimeAsync(25);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('rejects HTTP execution configs before spawning a process', async () => {
    const repoRoot = newTempRoot();
    writeServersConfig(repoRoot, [
      {
        name: 'remote-beads',
        command: 'node',
        transport: 'http' as any,
        url: 'https://example.invalid/mcp',
      },
    ]);

    await expect(
      executeMCPCommand('remote-beads', 'tasks/list', {}, repoRoot)
    ).rejects.toThrow(UNSUPPORTED_MCP_TRANSPORT_MESSAGE);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('discovers tools from stdio servers without changing the transport path', async () => {
    const repoRoot = newTempRoot();
    writeServersConfig(repoRoot, [
      {
        name: 'beads',
        command: 'node',
        args: ['server.js'],
        transport: 'stdio',
      },
    ]);

    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child as any);

    const toolsPromise = discoverMCPTools('beads', repoRoot);

    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              {
                name: 'tasks/list',
                description: 'List tasks',
                inputSchema: { type: 'object' },
              },
            ],
          },
        }) + '\n'
      )
    );
    child.emit('close', 0, null);

    await expect(toolsPromise).resolves.toEqual([
      {
        name: 'tasks/list',
        description: 'List tasks',
        inputSchema: { type: 'object' },
      },
    ]);
    expect(mockSpawn).toHaveBeenCalledWith(
      'node',
      ['server.js'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );
  });

  it('rejects HTTP discovery configs before spawning a process', async () => {
    const repoRoot = newTempRoot();
    writeServersConfig(repoRoot, [
      {
        name: 'remote-beads',
        command: 'node',
        transport: 'http' as any,
        url: 'https://example.invalid/mcp',
      },
    ]);

    await expect(discoverMCPTools('remote-beads', repoRoot)).rejects.toThrow(
      UNSUPPORTED_MCP_TRANSPORT_MESSAGE
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('returns an empty tool list when discovery closes cleanly without a response', async () => {
    const repoRoot = newTempRoot();
    writeServersConfig(repoRoot, [
      {
        name: 'beads',
        command: 'node',
        transport: 'stdio',
      },
    ]);

    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child as any);

    const toolsPromise = discoverMCPTools('beads', repoRoot);

    child.emit('close', 0, null);

    await expect(toolsPromise).resolves.toEqual([]);
  });

  it('reports discovery process failures clearly', async () => {
    const repoRoot = newTempRoot();
    writeServersConfig(repoRoot, [
      {
        name: 'beads',
        command: 'node',
        transport: 'stdio',
      },
    ]);

    const child = createMockChildProcess();
    mockSpawn.mockReturnValue(child as any);

    const toolsPromise = discoverMCPTools('beads', repoRoot);

    child.stderr.emit('data', Buffer.from('boom'));
    child.emit('close', 1, null);

    await expect(toolsPromise).rejects.toThrow(
      /MCP beads\/tools\/list exited with code 1[\s\S]*boom/
    );
  });

  it('renders the same wrapper markdown for valid inputs', () => {
    const repoRoot = newTempRoot();
    writeServersConfig(repoRoot, [
      {
        name: 'github-mcp',
        command: 'node',
        transport: 'stdio',
      },
    ]);

    const content = generateMCPSkillWrapper(
      'github-mcp',
      'search-repos',
      'github-search',
      'integration',
      repoRoot
    );

    expect(content).toContain('id: github-search');
    expect(content).toContain('name: search-repos (MCP)');
    expect(content).toContain('category: integration');
    expect(content).toContain('cliCommand: augx mcp exec github-mcp search-repos');
    expect(content).toContain('augx skill inject github-search');
  });

  it('keeps valid wrapper paths inside the selected skills category', () => {
    const repoRoot = newTempRoot();
    const wrapperTarget = resolveMCPWrapperTarget('integration', 'github-search', repoRoot);

    expect(wrapperTarget).toEqual({
      category: 'integration',
      skillId: 'github-search',
      skillsDir: path.join(repoRoot, 'skills', 'integration'),
      outputPath: path.join(repoRoot, 'skills', 'integration', 'github-search.md'),
    });
  });

  it('normalizes surrounding whitespace without leaving the skills tree', () => {
    const repoRoot = newTempRoot();
    const wrapperTarget = resolveMCPWrapperTarget(' integration ', ' github-search ', repoRoot);

    expect(wrapperTarget.category).toBe('integration');
    expect(wrapperTarget.skillId).toBe('github-search');
    expect(wrapperTarget.outputPath).toBe(
      path.join(repoRoot, 'skills', 'integration', 'github-search.md')
    );
  });

  it.each([
    ['skill traversal', 'integration', '../../escape'],
    ['category traversal', '../integration', 'github-search'],
    ['empty skill id', 'integration', ''],
    ['whitespace skill id', 'integration', '   '],
    ['empty category', '   ', 'github-search'],
  ])('rejects %s', (_label, category, skillId) => {
    const repoRoot = newTempRoot();

    expect(() => resolveMCPWrapperTarget(category, skillId, repoRoot)).toThrow(
      /Invalid MCP wrapper/
    );
  });
});
