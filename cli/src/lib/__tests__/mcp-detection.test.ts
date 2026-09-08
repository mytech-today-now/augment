import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { hasBeadsMcpServer } from '../mcp-detection';

function createTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'augx-mcp-detect-'));
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

describe('MCP detection', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop() as string, { recursive: true, force: true });
    }
  });

  function newTempRoot(): string {
    const repoRoot = createTempProject();
    tempRoots.push(repoRoot);
    return repoRoot;
  }

  it('reads Beads MCP configuration from .vscode/mcp.json', () => {
    const repoRoot = newTempRoot();

    writeJson(path.join(repoRoot, '.vscode', 'mcp.json'), {
      mcpServers: {
        beads: {
          command: 'python',
          args: ['-m', 'beads_mcp'],
        },
      },
    });

    expect(hasBeadsMcpServer(repoRoot)).toBe(true);
  });

  it('reads Beads MCP configuration from .augment/mcp/servers.json', () => {
    const repoRoot = newTempRoot();

    writeJson(path.join(repoRoot, '.augment', 'mcp', 'servers.json'), {
      servers: [
        {
          id: 'beads',
          command: 'python',
          args: ['-m', 'beads_mcp'],
        },
      ],
    });

    expect(hasBeadsMcpServer(repoRoot)).toBe(true);
  });
});
