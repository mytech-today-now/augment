import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import {
  addMCPServer,
  discoverMCPTools,
  executeMCPCommand,
  loadMCPConfigs,
  UNSUPPORTED_MCP_TRANSPORT_MESSAGE,
} from '../mcp-integration';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execSync: jest.fn(),
}));

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    write: jest.Mock;
    end: jest.Mock;
  };
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
    write: jest.fn(),
    end: jest.fn(),
  };
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
    child.emit('exit', 0);

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
    child.emit('exit', 0);

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
    child.emit('exit', 1);

    await expect(toolsPromise).rejects.toThrow(/MCP server exited with code 1[\s\S]*boom/);
  });
});
