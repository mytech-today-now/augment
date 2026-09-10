/**
 * Unit tests for extractCommandHelp utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectTools,
  executeHelp,
  detectSubcommands,
  extractHelpRecursive,
  generateMarkdown,
  Tool,
  HelpNode
} from '@cli/utils/extractCommandHelp';

// Mock fs module
vi.mock('fs');
const mockFs = vi.mocked(fs);

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

describe('extractCommandHelp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectTools', () => {
    it('should detect tools when directories exist', () => {
      const repoRoot = '/test/repo';
      const tools: Tool[] = [
        { name: 'Beads', command: 'bd', directory: '.beads' },
        { name: 'OpenSpec', command: 'openspec', directory: 'openspec' }
      ];

      mockFs.existsSync.mockImplementation((p: any) => {
        const pathStr = p.toString();
        return pathStr.includes('.beads') || pathStr.includes('openspec');
      });

      const result = detectTools(repoRoot, tools);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Beads');
      expect(result[1].name).toBe('OpenSpec');
    });

    it('should return empty array when no tools detected', () => {
      const repoRoot = '/test/repo';
      const tools: Tool[] = [
        { name: 'Beads', command: 'bd', directory: '.beads' }
      ];

      mockFs.existsSync.mockReturnValue(false);

      const result = detectTools(repoRoot, tools);

      expect(result).toHaveLength(0);
    });

    it('should only detect tools with existing directories', () => {
      const repoRoot = '/test/repo';
      const tools: Tool[] = [
        { name: 'Beads', command: 'bd', directory: '.beads' },
        { name: 'OpenSpec', command: 'openspec', directory: 'openspec' },
        { name: 'Augx', command: 'augx', directory: '.augment' }
      ];

      mockFs.existsSync.mockImplementation((p: any) => {
        return p.toString().includes('.beads');
      });

      const result = detectTools(repoRoot, tools);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Beads');
    });
  });

  describe('detectSubcommands', () => {
    it('should detect subcommands from "Commands:" section', () => {
      const helpText = `
Usage: bd [command]

Commands:
  create    Create a new issue
  list      List all issues
  update    Update an issue
  close     Close an issue

Options:
  --help    Show help
`;

      const result = detectSubcommands(helpText);

      expect(result).toEqual(['close', 'create', 'list', 'update']);
    });

    it('should detect subcommands from "Available commands:" section', () => {
      const helpText = `
Available commands:
  init      Initialize project
  sync      Sync changes
  status    Show status
`;

      const result = detectSubcommands(helpText);

      expect(result).toEqual(['init', 'status', 'sync']);
    });

    it('should detect subcommands from Usage pattern', () => {
      const helpText = `Usage: tool {create|list|update|delete}`;

      const result = detectSubcommands(helpText);

      expect(result).toContain('create');
      expect(result).toContain('list');
      expect(result).toContain('update');
      expect(result).toContain('delete');
    });

    it('should return empty array when no subcommands found', () => {
      const helpText = `
This is a simple tool with no subcommands.

Options:
  --help    Show help
  --version Show version
`;

      const result = detectSubcommands(helpText);

      expect(result).toEqual([]);
    });

    it('should handle multiple patterns and deduplicate', () => {
      const helpText = `
Usage: bd {create|list}

Commands:
  create    Create a new issue
  list      List all issues
  update    Update an issue
`;

      const result = detectSubcommands(helpText);

      expect(result).toEqual(['create', 'list', 'update']);
    });
  });

  describe('generateMarkdown', () => {
    it('should generate valid Markdown from help map', () => {
      const helpMap = new Map<Tool, HelpNode>();
      const tool: Tool = { name: 'Beads', command: 'bd', directory: '.beads' };
      const helpNode: HelpNode = {
        command: 'bd',
        help: 'Beads task management tool',
        children: [
          {
            command: 'bd create',
            help: 'Create a new issue',
            children: []
          }
        ]
      };

      helpMap.set(tool, helpNode);

      const result = generateMarkdown(helpMap);

      expect(result).toContain('# Command Help Reference');
      expect(result).toContain('## Beads Commands (bd)');
      expect(result).toContain('### bd --help');
      expect(result).toContain('Beads task management tool');
      expect(result).toContain('#### bd create --help');
      expect(result).toContain('Create a new issue');
    });

    it('should handle multiple tools', () => {
      const helpMap = new Map<Tool, HelpNode>();

      const tool1: Tool = { name: 'Beads', command: 'bd', directory: '.beads' };
      const helpNode1: HelpNode = {
        command: 'bd',
        help: 'Beads tool',
        children: []
      };

      const tool2: Tool = { name: 'Augx', command: 'augx', directory: '.augment' };
      const helpNode2: HelpNode = {
        command: 'augx',
        help: 'Augx tool',
        children: []
      };

      helpMap.set(tool1, helpNode1);
      helpMap.set(tool2, helpNode2);

      const result = generateMarkdown(helpMap);

      expect(result).toContain('## Augx Commands (augx)');
      expect(result).toContain('## Beads Commands (bd)');
      expect(result).toContain('**Tools**: Augx, Beads');
    });

    it('should handle empty help map', () => {
      const helpMap = new Map<Tool, HelpNode>();

      const result = generateMarkdown(helpMap);

      expect(result).toContain('# Command Help Reference');
      expect(result).toContain('**Tools**: ');
    });

    it('should include timestamp and version', () => {
      const helpMap = new Map<Tool, HelpNode>();
      const tool: Tool = { name: 'Test', command: 'test', directory: '.test' };
      const helpNode: HelpNode = { command: 'test', help: 'Test tool', children: [] };
      helpMap.set(tool, helpNode);

      const result = generateMarkdown(helpMap);

      expect(result).toContain('**Generated**:');
      expect(result).toContain('**Version**: 1.0.0');
    });

    it('should format nested subcommands correctly', () => {
      const helpMap = new Map<Tool, HelpNode>();
      const tool: Tool = { name: 'Test', command: 'test', directory: '.test' };
      const helpNode: HelpNode = {
        command: 'test',
        help: 'Root help',
        children: [
          {
            command: 'test sub1',
            help: 'Sub1 help',
            children: [
              {
                command: 'test sub1 subsub1',
                help: 'SubSub1 help',
                children: []
              }
            ]
          }
        ]
      };

      helpMap.set(tool, helpNode);

      const result = generateMarkdown(helpMap);

      expect(result).toContain('### test --help');
      expect(result).toContain('#### test sub1 --help');
      expect(result).toContain('##### test sub1 subsub1 --help');
    });
  });

  describe('edge cases', () => {
    it('should handle tools with custom help flags', () => {
      const tools: Tool[] = [
        { name: 'Custom', command: 'custom', directory: '.custom', helpFlag: '-h' }
      ];

      mockFs.existsSync.mockReturnValue(true);

      const result = detectTools('/test', tools);

      expect(result[0].helpFlag).toBe('-h');
    });

    it('should handle empty help text', () => {
      const result = detectSubcommands('');

      expect(result).toEqual([]);
    });

    it('should handle malformed help text', () => {
      const helpText = 'This is not valid help text with no structure';

      const result = detectSubcommands(helpText);

      expect(result).toEqual([]);
    });
  });
});
