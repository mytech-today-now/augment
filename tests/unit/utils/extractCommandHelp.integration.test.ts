/**
 * Integration tests for extractCommandHelp utility
 * Tests the full extraction flow with real command execution
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { extractCommandHelp, extractAllHelp, detectTools } from '@cli/utils/extractCommandHelp';

describe('extractCommandHelp integration tests', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'augx-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('extractCommandHelp with all tools present', () => {
    it('should extract help when all tools are available', async () => {
      // Create tool directories
      fs.mkdirSync(path.join(tempDir, '.beads'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'openspec'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, '.augment'), { recursive: true });

      const outputPath = '.augment/COMMAND_HELP.md';
      const fullOutputPath = path.join(tempDir, outputPath);

      // Run extraction
      const result = await extractCommandHelp(tempDir, outputPath);

      // Verify output file was created
      expect(fs.existsSync(fullOutputPath)).toBe(true);

      // Verify content
      expect(result).toContain('# Command Help Reference');
      expect(result).toContain('**Generated**:');
      expect(result).toContain('**Version**: 1.0.0');

      // Read file and verify it matches returned content
      const fileContent = fs.readFileSync(fullOutputPath, 'utf8');
      expect(fileContent).toBe(result);
    }, 30000); // 30 second timeout for real command execution

    it('should handle missing tools gracefully', async () => {
      // Create only one tool directory
      fs.mkdirSync(path.join(tempDir, '.augment'), { recursive: true });

      const outputPath = '.augment/COMMAND_HELP.md';

      // Run extraction
      const result = await extractCommandHelp(tempDir, outputPath);

      // Should still generate output for available tools
      expect(result).toContain('# Command Help Reference');
    }, 30000);

    it('should skip extraction when no tools detected', async () => {
      // Don't create any tool directories

      const outputPath = '.augment/COMMAND_HELP.md';

      // Run extraction
      const result = await extractCommandHelp(tempDir, outputPath);

      // Should return empty string
      expect(result).toBe('');

      // Output file should not be created
      const fullOutputPath = path.join(tempDir, outputPath);
      expect(fs.existsSync(fullOutputPath)).toBe(false);
    }, 30000);
  });

  describe('extractAllHelp', () => {
    it('should extract help from all detected tools', async () => {
      // Create tool directories
      fs.mkdirSync(path.join(tempDir, '.beads'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, '.augment'), { recursive: true });

      const helpMap = await extractAllHelp(tempDir);

      // Should have entries for detected tools
      expect(helpMap.size).toBeGreaterThan(0);

      // Each entry should have a help node
      for (const [tool, helpNode] of helpMap.entries()) {
        expect(tool.name).toBeDefined();
        expect(tool.command).toBeDefined();
        expect(helpNode.command).toBeDefined();
      }
    }, 30000);

    it('should handle command execution failures gracefully', async () => {
      // Create tool directory for non-existent command
      fs.mkdirSync(path.join(tempDir, '.beads'), { recursive: true });

      // This should not throw, but handle errors gracefully
      await expect(extractAllHelp(tempDir)).resolves.toBeDefined();
    }, 30000);
  });

  describe('detectTools', () => {
    it('should detect all available tools', () => {
      // Create all tool directories
      fs.mkdirSync(path.join(tempDir, '.beads'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'openspec'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, '.augment'), { recursive: true });

      const tools = detectTools(tempDir);

      expect(tools.length).toBe(3);
      expect(tools.map(t => t.name)).toContain('Beads');
      expect(tools.map(t => t.name)).toContain('OpenSpec');
      expect(tools.map(t => t.name)).toContain('Augx');
    });

    it('should only detect tools with existing directories', () => {
      // Create only Beads directory
      fs.mkdirSync(path.join(tempDir, '.beads'), { recursive: true });

      const tools = detectTools(tempDir);

      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('Beads');
    });

    it('should return empty array when no tools exist', () => {
      const tools = detectTools(tempDir);

      expect(tools).toEqual([]);
    });
  });

  describe('output file creation', () => {
    it('should create output directory if it does not exist', async () => {
      // Create tool directory
      fs.mkdirSync(path.join(tempDir, '.augment'), { recursive: true });

      const outputPath = 'nested/dir/COMMAND_HELP.md';

      await extractCommandHelp(tempDir, outputPath);

      // Verify nested directory was created
      const fullOutputPath = path.join(tempDir, outputPath);
      expect(fs.existsSync(fullOutputPath)).toBe(true);
    }, 30000);
  });
});

