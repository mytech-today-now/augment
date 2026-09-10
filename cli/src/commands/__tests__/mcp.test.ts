/**
 * Unit tests for MCP commands
 * Tests MCP command execution layer
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as mcpCommands from '../mcp';
import * as mcpIntegration from '../../utils/mcp-integration';

// Mock dependencies
jest.mock('../../utils/mcp-integration');
jest.mock('chalk', () => ({
  default: {
    blue: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    gray: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    bold: (str: string) => str
  },
  blue: (str: string) => str,
  green: (str: string) => str,
  red: (str: string) => str,
  gray: (str: string) => str,
  yellow: (str: string) => str,
  cyan: (str: string) => str,
  bold: (str: string) => str
}));

describe('MCP Commands', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation() as any;
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('mcpListCommand', () => {
    it('should list all MCP servers', async () => {
      const mockConfigs = [
        {
          name: 'test-server-1',
          command: 'node',
          transport: 'stdio' as const,
          args: ['server1.js']
        },
        {
          name: 'test-server-2',
          command: 'python',
          transport: 'stdio' as const,
          args: ['server2.py']
        }
      ];

      (mcpIntegration.loadMCPConfigs as jest.Mock).mockReturnValue(mockConfigs);

      await mcpCommands.mcpListCommand();

      expect(mcpIntegration.loadMCPConfigs).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test-server-1'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test-server-2'));
    });

    it('should handle no MCP servers configured', async () => {
      (mcpIntegration.loadMCPConfigs as jest.Mock).mockReturnValue([]);

      await mcpCommands.mcpListCommand();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No MCP servers'));
    });

    it('should output JSON when --json flag is used', async () => {
      const mockConfigs = [
        {
          name: 'test-server',
          command: 'node',
          transport: 'stdio' as const,
          args: ['server.js']
        }
      ];

      (mcpIntegration.loadMCPConfigs as jest.Mock).mockReturnValue(mockConfigs);

      await mcpCommands.mcpListCommand({ json: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"name": "test-server"'));
    });
  });

  describe('mcpAddCommand', () => {
    it('should add MCP server configuration', async () => {
      (mcpIntegration.addMCPServer as jest.Mock).mockImplementation();

      await mcpCommands.mcpAddCommand('new-server', 'node server.js');

      expect(mcpIntegration.addMCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'new-server',
          command: 'node server.js',
          transport: 'stdio'
        })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Added MCP server'));
    });

    it('should reject HTTP transport with a clear message', async () => {
      (mcpIntegration.addMCPServer as jest.Mock).mockImplementation(() => {
        throw new Error('HTTP transport is not yet supported, use stdio');
      });

      await mcpCommands.mcpAddCommand('new-server', 'node server.js', {
        transport: 'http' as any
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error adding MCP server: HTTP transport is not yet supported, use stdio')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle add errors', async () => {
      (mcpIntegration.addMCPServer as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to add server');
      });

      await mcpCommands.mcpAddCommand('new-server', 'node server.js');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error adding MCP server'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('mcpRemoveCommand', () => {
    it('should remove MCP server configuration', async () => {
      (mcpIntegration.removeMCPServer as jest.Mock).mockImplementation();

      await mcpCommands.mcpRemoveCommand('test-server');

      expect(mcpIntegration.removeMCPServer).toHaveBeenCalledWith('test-server');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Removed MCP server'));
    });

    it('should handle remove errors', async () => {
      (mcpIntegration.removeMCPServer as jest.Mock).mockImplementation(() => {
        throw new Error('Server not found');
      });

      await mcpCommands.mcpRemoveCommand('non-existent');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error removing MCP server'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('mcpExecCommand', () => {
    it('should execute MCP tool', async () => {
      const mockResult = { success: true, data: 'result' };
      (mcpIntegration.executeMCPCommand as jest.Mock).mockResolvedValue(mockResult);

      await mcpCommands.mcpExecCommand('test-server', 'test-tool', { args: '{"param": "value"}' });

      expect(mcpIntegration.executeMCPCommand).toHaveBeenCalledWith(
        'test-server',
        'test-tool',
        { param: 'value' }
      );
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('mcpDiscoverCommand', () => {
    it('should surface discovery errors clearly', async () => {
      (mcpIntegration.discoverMCPTools as jest.Mock).mockRejectedValue(
        new Error('HTTP transport is not yet supported, use stdio')
      );

      await mcpCommands.mcpDiscoverCommand('legacy-server');

      expect(mcpIntegration.discoverMCPTools).toHaveBeenCalledWith('legacy-server');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error discovering tools: HTTP transport is not yet supported, use stdio')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('mcpWrapCommand', () => {
    it('writes the wrapper under skills/<category>/<skillId>.md', async () => {
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'augx-mcp-wrap-'));
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(repoRoot);
      const skillsDir = path.join(repoRoot, 'skills', 'retrieval');
      const outputPath = path.join(skillsDir, 'github-search.md');

      (mcpIntegration.resolveMCPWrapperTarget as jest.Mock).mockReturnValue({
        category: 'retrieval',
        skillId: 'github-search',
        skillsDir,
        outputPath
      });
      (mcpIntegration.generateMCPSkillWrapper as jest.Mock).mockReturnValue('generated wrapper');

      try {
        await mcpCommands.mcpWrapCommand('github-mcp', 'search-repos', 'github-search', {
          category: 'retrieval'
        });

        expect(mcpIntegration.resolveMCPWrapperTarget).toHaveBeenCalledWith(
          'retrieval',
          'github-search',
          repoRoot
        );
        expect(mcpIntegration.generateMCPSkillWrapper).toHaveBeenCalledWith(
          'github-mcp',
          'search-repos',
          'github-search',
          'retrieval'
        );
        expect(fs.existsSync(outputPath)).toBe(true);
        expect(fs.readFileSync(outputPath, 'utf-8')).toBe('generated wrapper');
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it('rejects unsafe wrapper names before writing anything', async () => {
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'augx-mcp-wrap-'));
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(repoRoot);
      const skillsDir = path.join(repoRoot, 'skills', 'integration');
      const escapedFile = path.join(repoRoot, 'skills', 'escape.md');

      (mcpIntegration.resolveMCPWrapperTarget as jest.Mock).mockImplementation(() => {
        throw new Error(
          'Invalid MCP wrapper skill id: "../../escape" must be a simple slug without path separators or whitespace'
        );
      });

      try {
        await mcpCommands.mcpWrapCommand('github-mcp', 'search-repos', '../../escape', {
          category: 'integration'
        });

        expect(mcpIntegration.generateMCPSkillWrapper).not.toHaveBeenCalled();
        expect(fs.existsSync(skillsDir)).toBe(false);
        expect(fs.existsSync(escapedFile)).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error generating skill wrapper:')
        );
        expect(processExitSpy).toHaveBeenCalledWith(1);
      } finally {
        cwdSpy.mockRestore();
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });
  });
});

