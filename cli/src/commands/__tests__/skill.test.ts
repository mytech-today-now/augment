/**
 * Unit tests for skill commands
 * Tests skill command execution layer
 */

import * as skillCommands from '../skill';
import * as skillSystem from '../../utils/skill-system';

// Mock dependencies
jest.mock('../../utils/skill-system');
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

describe('Skill Commands', () => {
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

  describe('skillListCommand', () => {
    it('should list all skills', async () => {
      const mockSkills = [
        {
          metadata: {
            id: 'test-skill-1',
            name: 'Test Skill 1',
            version: '1.0.0',
            category: 'retrieval' as const,
            tokenBudget: 1000,
            priority: 'high' as const
          },
          content: 'Test content',
          filePath: '/path/to/skill1.md'
        },
        {
          metadata: {
            id: 'test-skill-2',
            name: 'Test Skill 2',
            version: '1.0.0',
            category: 'utility' as const,
            tokenBudget: 500,
            priority: 'low' as const
          },
          content: 'Test content',
          filePath: '/path/to/skill2.md'
        }
      ];

      (skillSystem.discoverSkills as jest.Mock).mockReturnValue(mockSkills);

      await skillCommands.skillListCommand();

      expect(skillSystem.discoverSkills).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle no skills found', async () => {
      (skillSystem.discoverSkills as jest.Mock).mockReturnValue([]);

      await skillCommands.skillListCommand();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No skills found'));
    });

    it('should output JSON when --json flag is used', async () => {
      const mockSkills = [
        {
          metadata: {
            id: 'test-skill',
            name: 'Test Skill',
            version: '1.0.0',
            category: 'retrieval' as const,
            tokenBudget: 1000
          },
          content: 'Test content',
          filePath: '/path/to/skill.md'
        }
      ];

      (skillSystem.discoverSkills as jest.Mock).mockReturnValue(mockSkills);

      await skillCommands.skillListCommand({ json: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"id": "test-skill"'));
    });
  });

  describe('skillShowCommand', () => {
    it('should show skill details', async () => {
      const mockSkill = {
        metadata: {
          id: 'test-skill',
          name: 'Test Skill',
          version: '1.0.0',
          category: 'retrieval' as const,
          tokenBudget: 1000,
          tags: ['test', 'example']
        },
        content: '# Test Skill Content',
        filePath: '/path/to/skill.md'
      };

      (skillSystem.findSkill as jest.Mock).mockReturnValue(mockSkill);

      await skillCommands.skillShowCommand('test-skill');

      expect(skillSystem.findSkill).toHaveBeenCalledWith('test-skill');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle skill not found', async () => {
      (skillSystem.findSkill as jest.Mock).mockReturnValue(null);

      await skillCommands.skillShowCommand('non-existent');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Skill not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('skillValidateCommand', () => {
    it('should validate a skill successfully', async () => {
      const mockSkill = {
        metadata: {
          id: 'valid-skill',
          name: 'Valid Skill',
          version: '1.0.0',
          category: 'retrieval' as const,
          tokenBudget: 1000
        },
        content: 'Content',
        filePath: '/path/to/skill.md'
      };

      (skillSystem.findSkill as jest.Mock).mockReturnValue(mockSkill);
      (skillSystem.validateSkillMetadata as jest.Mock).mockReturnValue({ valid: true, errors: [] });

      await skillCommands.skillValidateCommand('valid-skill');

      expect(skillSystem.findSkill).toHaveBeenCalledWith('valid-skill');
      expect(skillSystem.validateSkillMetadata).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('is valid'));
    });

    it('should report validation errors', async () => {
      const mockSkill = {
        metadata: {
          id: 'invalid-skill',
          name: 'Invalid Skill',
          version: 'invalid',
          category: 'retrieval' as const,
          tokenBudget: 1000
        },
        content: 'Content',
        filePath: '/path/to/skill.md'
      };

      (skillSystem.findSkill as jest.Mock).mockReturnValue(mockSkill);
      (skillSystem.validateSkillMetadata as jest.Mock).mockReturnValue({
        valid: false,
        errors: ['Invalid version format']
      });

      await skillCommands.skillValidateCommand('invalid-skill');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('validation errors'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle skill not found', async () => {
      (skillSystem.findSkill as jest.Mock).mockReturnValue(null);

      await skillCommands.skillValidateCommand('non-existent');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Skill not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('skillSearchCommand', () => {
    it('should search skills by query', async () => {
      const mockSkills = [
        {
          metadata: {
            id: 'retrieval-skill',
            name: 'Retrieval Skill',
            version: '1.0.0',
            category: 'retrieval' as const,
            tokenBudget: 1000,
            tags: ['search', 'query']
          },
          content: 'Content',
          filePath: '/path/to/skill.md'
        }
      ];

      (skillSystem.discoverSkills as jest.Mock).mockReturnValue(mockSkills);

      await skillCommands.skillSearchCommand('retrieval');

      expect(skillSystem.discoverSkills).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle no results found', async () => {
      (skillSystem.discoverSkills as jest.Mock).mockReturnValue([]);

      await skillCommands.skillSearchCommand('nonexistent');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No skills found'));
    });
  });

  describe('skillInjectCommand', () => {
    it('should inject skill content', async () => {
      const mockLoadedSkill = {
        skill: {
          metadata: {
            id: 'test-skill',
            name: 'Test Skill',
            version: '1.0.0',
            category: 'retrieval' as const,
            tokenBudget: 1000
          },
          content: '# Test Content',
          filePath: '/path/to/skill.md'
        },
        dependencies: [],
        totalTokens: 1000
      };

      (skillSystem.loadSkillDynamic as jest.Mock).mockReturnValue(mockLoadedSkill);
      (skillSystem.getSkillContentForInjection as jest.Mock).mockReturnValue('Injected content');

      await skillCommands.skillInjectCommand('test-skill');

      expect(skillSystem.loadSkillDynamic).toHaveBeenCalled();
      expect(skillSystem.getSkillContentForInjection).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle skill not found during injection', async () => {
      (skillSystem.loadSkillDynamic as jest.Mock).mockReturnValue(null);

      await skillCommands.skillInjectCommand('non-existent');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Skill not found'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('skillCacheClearCommand', () => {
    it('should clear skill cache', async () => {
      const mockStats = { size: 5, totalTokens: 5000 };
      (skillSystem.getSkillCacheStats as jest.Mock).mockReturnValue(mockStats);
      (skillSystem.clearSkillCache as jest.Mock).mockImplementation();

      await skillCommands.skillCacheClearCommand();

      expect(skillSystem.clearSkillCache).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cleared'));
    });
  });

  describe('skillCacheStatsCommand', () => {
    it('should display cache statistics', async () => {
      const mockStats = {
        size: 5,
        hits: 10,
        misses: 2
      };

      (skillSystem.getSkillCacheStats as jest.Mock).mockReturnValue(mockStats);

      await skillCommands.skillCacheStatsCommand();

      expect(skillSystem.getSkillCacheStats).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });
});

