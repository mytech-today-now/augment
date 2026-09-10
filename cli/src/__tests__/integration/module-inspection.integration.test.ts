/**
 * Integration tests for module inspection commands
 * Tests complete workflows, VS Code integration, and error handling
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const TEST_MODULE_PATH = path.join(__dirname, '../../../../augment-extensions/test-module');
const TEST_COMPLETED_PROJECT_PATH = path.join(__dirname, '__fixtures__', 'completed-test-project');
const TEST_OUTSIDE_FILE_PATH = path.join(__dirname, '../../../../outside.txt');
const CLI_PATH = path.join(__dirname, '../../../dist/cli.js');

function runCli(command: string, cwd: string = process.cwd()): { stdout: string; stderr: string; status: number } {
  try {
    return {
      stdout: execSync(command, { encoding: 'utf-8', cwd }),
      stderr: '',
      status: 0
    };
  } catch (error) {
    const execError = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };

    return {
      stdout: typeof execError.stdout === 'string' ? execError.stdout : execError.stdout?.toString() ?? '',
      stderr: typeof execError.stderr === 'string' ? execError.stderr : execError.stderr?.toString() ?? '',
      status: execError.status ?? 1
    };
  }
}

describe('Module Inspection Integration Tests', () => {
  beforeAll(() => {
    // Create test module fixture
    if (!fs.existsSync(TEST_MODULE_PATH)) {
      fs.mkdirSync(TEST_MODULE_PATH, { recursive: true });
      fs.mkdirSync(path.join(TEST_MODULE_PATH, 'rules'));
      fs.mkdirSync(path.join(TEST_MODULE_PATH, 'examples'));
      
      // Create module.json
      fs.writeFileSync(
        path.join(TEST_MODULE_PATH, 'module.json'),
        JSON.stringify({
          name: 'test-module',
          version: '1.0.0',
          displayName: 'Test Module',
          description: 'A test module for integration testing',
          type: 'testing'
        }, null, 2)
      );
      
      // Create test rule file
      fs.writeFileSync(
        path.join(TEST_MODULE_PATH, 'rules', 'test-rule.md'),
        '# Test Rule\n\nThis is a test rule file.\n\n## Example\n\n```javascript\nconsole.log("test");\n```'
      );
      
      // Create test example file
      fs.writeFileSync(
        path.join(TEST_MODULE_PATH, 'examples', 'test-example.md'),
        '# Test Example\n\nThis is a test example file.'
      );
    }

    fs.writeFileSync(TEST_OUTSIDE_FILE_PATH, 'TOP-SECRET-OUTSIDE-CONTENT\n', 'utf-8');

    fs.mkdirSync(path.join(TEST_COMPLETED_PROJECT_PATH, '.beads'), { recursive: true });
    fs.mkdirSync(path.join(TEST_COMPLETED_PROJECT_PATH, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(TEST_COMPLETED_PROJECT_PATH, 'scripts', 'completed.jsonl'),
      [
        JSON.stringify({
          id: 'bd-completed-search-1',
          title: 'Rename completed search flag',
          description: 'Keep task search working after the CLI flag rename',
          status: 'closed',
          closed_at: '2026-09-08T12:00:00Z',
          close_reason: 'Renamed completed-task search flag'
        }),
        JSON.stringify({
          id: 'bd-completed-search-2',
          title: 'Document the CLI help output',
          description: 'Add help coverage for the show command',
          status: 'closed',
          closed_at: '2026-09-07T12:00:00Z',
          close_reason: 'Documentation follow-up'
        })
      ].join('\n'),
      'utf-8'
    );
  });

  afterAll(() => {
    // Clean up test fixtures
    if (fs.existsSync(TEST_MODULE_PATH)) {
      fs.rmSync(TEST_MODULE_PATH, { recursive: true, force: true });
    }

    if (fs.existsSync(TEST_COMPLETED_PROJECT_PATH)) {
      fs.rmSync(TEST_COMPLETED_PROJECT_PATH, { recursive: true, force: true });
    }

    if (fs.existsSync(TEST_OUTSIDE_FILE_PATH)) {
      fs.rmSync(TEST_OUTSIDE_FILE_PATH, { force: true });
    }
  });

  describe('Routing and output', () => {
    it('should discover and display module overview', () => {
      const { stdout, stderr, status } = runCli(`node ${CLI_PATH} show module test-module`);

      expect(status).toBe(0);
      expect(stdout).toContain('Module: test-module');
      expect(stdout).toContain('Name:        Test Module');
      expect(stdout).toContain('Version:     1.0.0');
      expect(stdout).toContain('Type:        testing');
      expect(stdout).toContain('Description: A test module for integration testing');
      expect(stdout).not.toContain('Module not found');
      expect(stderr).toBe('');
    });

    it('should display an individual file from the module', () => {
      const { stdout, stderr, status } = runCli(`node ${CLI_PATH} show module test-module rules/test-rule.md`);

      expect(status).toBe(0);
      expect(stdout).toContain('File: rules');
      expect(stdout).toContain('Test Rule');
      expect(stdout).toContain('console.log("test");');
      expect(stdout).not.toContain('Module not found');
      expect(stdout).not.toContain('File not found');
      expect(stderr).toBe('');
    });

    it('should search module content with the module search flag', () => {
      fs.writeFileSync(
        path.join(TEST_MODULE_PATH, 'rules', 'test-rule.md'),
        '# Test Rule\n\nThis is a test rule file.\n\nmodule-search-hit\n',
        'utf-8'
      );

      const { stdout, stderr, status } = runCli(
        `node ${CLI_PATH} show module test-module --content --depth 2 --search module-search-hit`
      );

      expect(status).toBe(0);
      expect(stdout).toContain('Search Results: \"module-search-hit\"');
      expect(stdout).toContain('module-search-hit');
      expect(stdout).toContain('test-rule.md');
      expect(stderr).toBe('');
    });

    it('should search completed tasks with the task search flag', () => {
      const { stdout, stderr, status } = runCli(
        `node ${CLI_PATH} show completed --task-search renamed`,
        TEST_COMPLETED_PROJECT_PATH
      );

      expect(status).toBe(0);
      expect(stdout).toContain('Completed Tasks (1)');
      expect(stdout).toContain('bd-completed-search-1');
      expect(stdout).toContain('Renamed completed-task search flag');
      expect(stdout).not.toContain('bd-completed-search-2');
      expect(stderr).toBe('');
    });

    it('should document unique search flags in show help', () => {
      const { stdout, status } = runCli(`node ${CLI_PATH} show --help`);
      const normalizedHelp = stdout.replace(/\s+/g, ' ');

      expect(status).toBe(0);
      expect(stdout).toContain('--search <term>');
      expect(stdout).toContain('--task-search <term>');
      expect(normalizedHelp).toContain('Search within module content');
      expect(normalizedHelp).toContain('Search completed tasks by title, description, or close reason');
      expect((stdout.match(/--search <term>/g) || []).length).toBe(1);
      expect((stdout.match(/--task-search <term>/g) || []).length).toBe(1);
    });

    it('should route show linked to the linked-module handler', () => {
      const { stdout, status } = runCli(`node ${CLI_PATH} show linked --json`);

      expect(status).toBe(0);
      const linkedModules = JSON.parse(stdout);
      expect(Array.isArray(linkedModules)).toBe(true);
    });

    it('should route show all to the all-modules handler', () => {
      const { stdout, status } = runCli(`node ${CLI_PATH} show all --json`);

      expect(status).toBe(0);
      const allModules = JSON.parse(stdout);
      expect(Array.isArray(allModules)).toBe(true);
      expect(allModules.some((module: { name: string }) => module.name === 'test-module')).toBe(true);
    });
  });

  describe('Error Handling Tests', () => {
    it('should show usage when the module name is missing', () => {
      const { stdout, stderr, status } = runCli(`node ${CLI_PATH} show module`);

      expect(status).toBe(1);
      expect(`${stdout}${stderr}`).toContain('Usage: augx show module <module-name> [file-path] [options]');
    });

    it('should handle non-existent module gracefully', () => {
      const { stdout, stderr, status } = runCli(`node ${CLI_PATH} show module non-existent-module`);
      const output = `${stdout}${stderr}`;

      expect(status).toBe(1);
      expect(output).toContain('Module not found: non-existent-module');
      expect(output).toContain('Use "augx list" to see all available modules.');
    });

    it('should handle non-existent file gracefully', () => {
      const { stdout, stderr, status } = runCli(`node ${CLI_PATH} show module test-module non-existent-file.md`);
      const output = `${stdout}${stderr}`;

      expect(status).toBe(1);
      expect(output).toContain('File not found: non-existent-file.md');
      expect(output).toContain('Module path:');
    });

    it('should not read files outside the module root through traversal', () => {
      const { stdout, stderr, status } = runCli(`node ${CLI_PATH} show module test-module ../../outside.txt`);
      const output = `${stdout}${stderr}`;

      expect(status).toBe(1);
      expect(output).toContain('File not found: ../../outside.txt');
      expect(output).not.toContain('TOP-SECRET-OUTSIDE-CONTENT');
    });
  });
});

