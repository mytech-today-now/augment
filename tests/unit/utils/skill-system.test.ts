/**
 * Unit tests for skill-system utilities
 * Tests skill loading, validation, discovery, and injection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseSkill,
  validateSkillMetadata,
  parseSkillCliCommand,
  discoverSkills,
  findSkill,
  loadSkillDynamic,
  loadSkillsBatch,
  getSkillContentForInjection,
  clearSkillCache,
  getSkillCacheStats,
  getSkillsDir,
  getSkillPath,
  SKILL_CATEGORIES
} from '@cli/utils/skill-system';

// Mock fs module
vi.mock('fs');
const mockFs = vi.mocked(fs);

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

describe('Skill System', () => {
  const mockRepoRoot = '/test/repo';
  const mockSkillsDir = path.join(mockRepoRoot, 'skills');

  beforeEach(() => {
    vi.clearAllMocks();
    clearSkillCache();
  });

  describe('getSkillsDir', () => {
    it('should return skills directory path', () => {
      const result = getSkillsDir(mockRepoRoot);
      expect(result).toBe(mockSkillsDir);
    });

    it('should use process.cwd() when no repoRoot provided', () => {
      const originalCwd = process.cwd();
      const result = getSkillsDir();
      expect(result).toBe(path.join(originalCwd, 'skills'));
    });
  });

  describe('getSkillPath', () => {
    it('should return correct skill file path', () => {
      const result = getSkillPath('sdk-query', 'retrieval', mockRepoRoot);
      expect(result).toBe(path.join(mockSkillsDir, 'retrieval', 'sdk-query.md'));
    });
  });

  describe('parseSkill', () => {
    it('should parse valid skill file with frontmatter', () => {
      const mockContent = `---
id: test-skill
name: Test Skill
version: 1.0.0
category: retrieval
tags: [test, example]
tokenBudget: 1000
priority: medium
---

# Test Skill Content

This is the skill body.`;

      mockFs.readFileSync.mockReturnValue(mockContent);

      const result = parseSkill('/test/skill.md');

      expect(result.metadata.id).toBe('test-skill');
      expect(result.metadata.name).toBe('Test Skill');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.category).toBe('retrieval');
      expect(result.metadata.tokenBudget).toBe(1000);
      expect(result.content).toContain('# Test Skill Content');
    });

    it('should throw error for invalid skill file without frontmatter', () => {
      const mockContent = `# Invalid Skill

No frontmatter here.`;

      mockFs.readFileSync.mockReturnValue(mockContent);

      expect(() => parseSkill('/test/invalid.md')).toThrow('Missing frontmatter');
    });
  });

  describe('validateSkillMetadata', () => {
    it('should validate correct skill metadata', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        version: '1.0.0',
        category: 'retrieval' as const,
        tags: ['test'],
        tokenBudget: 1000,
        priority: 'medium' as const
      };

      const result = validateSkillMetadata(metadata);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const metadata = {
        id: 'test-skill',
        // missing name, version, category
        tags: ['test'],
        tokenBudget: 1000,
        priority: 'medium' as const
      } as any;

      const result = validateSkillMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid category', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        version: '1.0.0',
        category: 'invalid-category' as any,
        tags: ['test'],
        tokenBudget: 1000,
        priority: 'medium' as const
      };

      const result = validateSkillMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('category'))).toBe(true);
    });

    it('should detect invalid token budget', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        version: '1.0.0',
        category: 'retrieval' as const,
        tags: ['test'],
        tokenBudget: -100, // Invalid negative budget
        priority: 'medium' as const
      };

      const result = validateSkillMetadata(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tokenBudget'))).toBe(true);
    });

    it('should validate parseable cli commands and preserve literal metacharacters', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        version: '1.0.0',
        category: 'retrieval' as const,
        tags: ['test'],
        tokenBudget: 1000,
        priority: 'medium' as const,
        cliCommand: 'node -e "process.stdout.write(\\"&& | quoted\\")" && | "two words"'
      };

      const result = validateSkillMetadata(metadata);
      const parsed = parseSkillCliCommand(metadata.cliCommand);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(parsed).toEqual({
        command: 'node',
        args: [
          '-e',
          'process.stdout.write("&& | quoted")',
          '&&',
          '|',
          'two words'
        ]
      });
    });

    it('should reject malformed cli commands', () => {
      const metadata = {
        id: 'test-skill',
        name: 'Test Skill',
        version: '1.0.0',
        category: 'retrieval' as const,
        tags: ['test'],
        tokenBudget: 1000,
        priority: 'medium' as const,
        cliCommand: 'node -e "unterminated'
      };

      const result = validateSkillMetadata(metadata);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid cliCommand'))).toBe(true);
    });
  });

  describe('discoverSkills', () => {
    it('should discover skills in all categories', () => {
      const mockFiles = {
        retrieval: ['sdk-query.md', 'context-retrieval.md'],
        analysis: ['code-analysis.md'],
        generation: ['add-mcp-skill.md']
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dirPath: string) => {
        const category = path.basename(dirPath);
        return mockFiles[category as keyof typeof mockFiles] || [];
      });

      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      const mockSkillContent = `---
id: test-skill
name: Test Skill
version: 1.0.0
category: retrieval
tags: [test]
tokenBudget: 1000
priority: medium
---

# Test Content`;

      mockFs.readFileSync.mockReturnValue(mockSkillContent);

      const result = discoverSkills(mockRepoRoot);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array when skills directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = discoverSkills(mockRepoRoot);

      expect(result).toEqual([]);
    });
  });

  describe('findSkill', () => {
    it('should find skill by ID', () => {
      const mockSkillContent = `---
id: sdk-query
name: SDK Query
version: 1.0.0
category: retrieval
tags: [sdk]
tokenBudget: 1800
priority: high
---

# SDK Query Skill`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['sdk-query.md']);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readFileSync.mockReturnValue(mockSkillContent);

      const result = findSkill('sdk-query', mockRepoRoot);

      expect(result).not.toBeNull();
      expect(result?.metadata.id).toBe('sdk-query');
      expect(result?.metadata.name).toBe('SDK Query');
    });

    it('should return null for non-existent skill', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      const result = findSkill('non-existent-skill', mockRepoRoot);

      expect(result).toBeNull();
    });
  });

  describe('loadSkillDynamic', () => {
    beforeEach(() => {
      clearSkillCache();
    });

    it('should load skill without dependencies', () => {
      const mockSkillContent = `---
id: simple-skill
name: Simple Skill
version: 1.0.0
category: utility
tags: [simple]
tokenBudget: 500
priority: low
---

# Simple Skill`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['simple-skill.md']);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readFileSync.mockReturnValue(mockSkillContent);

      const result = loadSkillDynamic('simple-skill', { cache: false });

      expect(result).not.toBeNull();
      expect(result?.skill.metadata.id).toBe('simple-skill');
      expect(result?.totalTokens).toBe(500);
      expect(result?.dependencies).toHaveLength(0);
    });

    it('should cache loaded skills', () => {
      const mockSkillContent = `---
id: cached-skill
name: Cached Skill
version: 1.0.0
category: utility
tags: [cache]
tokenBudget: 500
priority: low
---

# Cached Skill`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['cached-skill.md']);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readFileSync.mockReturnValue(mockSkillContent);

      // First load
      const result1 = loadSkillDynamic('cached-skill', { cache: true });
      expect(result1).not.toBeNull();

      // Clear mocks to verify cache is used
      vi.clearAllMocks();

      // Second load should use cache
      const result2 = loadSkillDynamic('cached-skill', { cache: true });
      expect(result2).not.toBeNull();
      expect(result2?.skill.metadata.id).toBe('cached-skill');

      // Verify fs.readFileSync was not called again
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return null for non-existent skill', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      const result = loadSkillDynamic('non-existent', { cache: false });

      expect(result).toBeNull();
    });
  });

  describe('loadSkillsBatch', () => {
    it('should load multiple skills', () => {
      const mockSkills = {
        'skill1': `---
id: skill1
name: Skill 1
version: 1.0.0
category: utility
tags: [test]
tokenBudget: 500
priority: low
---
# Skill 1`,
        'skill2': `---
id: skill2
name: Skill 2
version: 1.0.0
category: utility
tags: [test]
tokenBudget: 600
priority: low
---
# Skill 2`
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation(() => ['skill1.md', 'skill2.md']);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('skill1')) return mockSkills.skill1;
        if (filePath.includes('skill2')) return mockSkills.skill2;
        return '';
      });

      const result = loadSkillsBatch(['skill1', 'skill2'], { cache: false });

      expect(result).toHaveLength(2);
      expect(result[0].skill.metadata.id).toBe('skill1');
      expect(result[1].skill.metadata.id).toBe('skill2');
    });

    it('should skip duplicate skills', () => {
      const mockSkillContent = `---
id: duplicate-skill
name: Duplicate Skill
version: 1.0.0
category: utility
tags: [test]
tokenBudget: 500
priority: low
---
# Duplicate Skill`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['duplicate-skill.md']);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readFileSync.mockReturnValue(mockSkillContent);

      const result = loadSkillsBatch(['duplicate-skill', 'duplicate-skill'], { cache: false });

      expect(result).toHaveLength(1);
      expect(result[0].skill.metadata.id).toBe('duplicate-skill');
    });
  });

  describe('getSkillContentForInjection', () => {
    it('should format skill content for injection', () => {
      const mockSkill = {
        metadata: {
          id: 'test-skill',
          name: 'Test Skill',
          version: '1.0.0',
          category: 'utility' as const,
          tags: ['test'],
          tokenBudget: 500,
          priority: 'low' as const
        },
        content: '# Test Skill Content',
        filePath: '/test/skill.md'
      };

      const loadedSkill = {
        skill: mockSkill,
        dependencies: [],
        totalTokens: 500
      };

      const result = getSkillContentForInjection(loadedSkill);

      expect(result).toContain('Test Skill');
      expect(result).toContain('# Test Skill Content');
    });
  });

  describe('clearSkillCache', () => {
    it('should clear the skill cache', () => {
      const mockSkillContent = `---
id: cached-skill
name: Cached Skill
version: 1.0.0
category: utility
tags: [cache]
tokenBudget: 500
priority: low
---
# Cached Skill`;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['cached-skill.md']);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readFileSync.mockReturnValue(mockSkillContent);

      // Load skill to populate cache
      loadSkillDynamic('cached-skill', { cache: true });

      // Clear cache
      clearSkillCache();

      // Get cache stats
      const stats = getSkillCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('getSkillCacheStats', () => {
    it('should return cache statistics', () => {
      clearSkillCache();

      const stats = getSkillCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('skills');
      expect(stats.size).toBe(0);
      expect(stats.skills).toEqual([]);
    });
  });
});

