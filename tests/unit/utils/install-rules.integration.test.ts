/**
 * Integration tests for install-rules utilities
 * These tests use real file system operations in temporary directories
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { installCharacterCountRule } from '@cli/utils/install-rules';

// Mock chalk to avoid ESM issues
vi.mock('chalk', () => ({
  default: {
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    gray: (str: string) => str,
    blue: (str: string) => str,
    bold: {
      green: (str: string) => str,
      blue: (str: string) => str
    }
  },
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
  gray: (str: string) => str,
  blue: (str: string) => str,
  bold: {
    green: (str: string) => str,
    blue: (str: string) => str
  }
}));

describe('Install Rules Integration Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'augment-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir && fsSync.existsSync(tempDir)) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('New Repository Installation', () => {
    it('should install rule in new repository', async () => {
      const result = await installCharacterCountRule({
        targetDir: tempDir,
        verbose: false
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.skipped).toBe(false);

      // Verify directory structure
      const augmentDir = path.join(tempDir, '.augment');
      const rulesDir = path.join(augmentDir, 'rules');
      const rulePath = path.join(rulesDir, 'character-count-management.md');

      expect(fsSync.existsSync(augmentDir)).toBe(true);
      expect(fsSync.existsSync(rulesDir)).toBe(true);
      expect(fsSync.existsSync(rulePath)).toBe(true);

      // Verify file content
      const content = await fs.readFile(rulePath, 'utf-8');
      expect(content).toContain('Character Count Management');
      expect(content).toContain('48,599 - 49,299 characters');
    });
  });

  describe('Existing Repository Installation', () => {
    it('should install rule in existing repository with .augment/ folder', async () => {
      // Create .augment directory first
      const augmentDir = path.join(tempDir, '.augment');
      await fs.mkdir(augmentDir, { recursive: true });

      const result = await installCharacterCountRule({
        targetDir: tempDir,
        verbose: false
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);

      // Verify rule was installed
      const rulePath = path.join(augmentDir, 'rules', 'character-count-management.md');
      expect(fsSync.existsSync(rulePath)).toBe(true);
    });
  });

  describe('Idempotency', () => {
    it('should handle multiple installations correctly', async () => {
      // First installation
      const result1 = await installCharacterCountRule({
        targetDir: tempDir,
        skipIfExists: true,
        verbose: false
      });

      expect(result1.success).toBe(true);
      expect(result1.created).toBe(true);

      // Second installation (should skip because content is identical)
      const result2 = await installCharacterCountRule({
        targetDir: tempDir,
        skipIfExists: true,
        verbose: false
      });

      expect(result2.success).toBe(true);
      expect(result2.created).toBe(false);
      expect(result2.skipped).toBe(true);

      // Modify the file to have different content
      const rulePath = path.join(tempDir, '.augment', 'rules', 'character-count-management.md');
      await fs.writeFile(rulePath, 'Modified content', 'utf-8');

      // Third installation with force (should replace)
      const result3 = await installCharacterCountRule({
        targetDir: tempDir,
        force: true,
        skipIfExists: false,
        verbose: false
      });

      expect(result3.success).toBe(true);
      expect(result3.created).toBe(false);
      expect(result3.updated).toBe(true);
      expect(result3.skipped).toBe(false);

      // Verify content was replaced
      const finalContent = await fs.readFile(rulePath, 'utf-8');
      expect(finalContent).toContain('Character Count Management');
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should use platform-appropriate path separators', async () => {
      const result = await installCharacterCountRule({
        targetDir: tempDir,
        verbose: false
      });

      expect(result.success).toBe(true);

      // Verify path uses correct separator
      const rulePath = path.join(tempDir, '.augment', 'rules', 'character-count-management.md');
      expect(fsSync.existsSync(rulePath)).toBe(true);

      // Path should be normalized for current platform
      expect(result.path).toBe(rulePath);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent parent directory', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist', 'nested', 'path');

      const result = await installCharacterCountRule({
        targetDir: nonExistentDir,
        verbose: false
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);

      // Verify directory was created recursively
      const rulePath = path.join(nonExistentDir, '.augment', 'rules', 'character-count-management.md');
      expect(fsSync.existsSync(rulePath)).toBe(true);
    });
  });
});

