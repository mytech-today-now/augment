/**
 * Integration tests for unlink and self-remove commands
 * Tests module unlinking, collection unlinking, self-remove (dry-run and actual), and dependency checking
 */

import * as fs from 'fs';
import * as path from 'path';
import { unlinkCommand } from '../unlink';
import { selfRemoveCommand } from '../self-remove';
import * as moduleSystem from '../../utils/module-system';
import { getInteractivePrompt, type InteractivePrompt } from '../../utils/interactive-prompt';

// Mock dependencies
jest.mock('fs');
jest.mock('../../utils/module-system');
jest.mock('../../utils/interactive-prompt');
jest.mock('chalk', () => ({
  default: {
    blue: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    gray: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str
  },
  bold: {
    blue: (str: string) => str
  },
  blue: (str: string) => str,
  green: (str: string) => str,
  red: (str: string) => str,
  gray: (str: string) => str,
  yellow: (str: string) => str,
  cyan: (str: string) => str
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockModuleSystem = moduleSystem as jest.Mocked<typeof moduleSystem> & {
  discoverCollections: jest.Mock;
};
const mockGetInteractivePrompt = getInteractivePrompt as jest.MockedFunction<typeof getInteractivePrompt>;
const mockPrompt = jest.fn();
const interactivePrompt: InteractivePrompt = {
  prompt: mockPrompt as InteractivePrompt['prompt']
};

describe('Unlink and Self-Remove Integration Tests', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation() as any;
    jest.clearAllMocks();
    mockPrompt.mockReset();
    mockGetInteractivePrompt.mockReset();
    mockGetInteractivePrompt.mockResolvedValue(interactivePrompt);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Module Unlinking', () => {
    it('should unlink a single module successfully', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' },
          { name: 'coding-standards/css', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockFs.writeFileSync.mockImplementation(() => {});
      mockModuleSystem.discoverCollections.mockReturnValue([]);

      await unlinkCommand('coding-standards/html');

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writtenConfig = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(writtenConfig.modules).toHaveLength(1);
      expect(writtenConfig.modules[0].name).toBe('coding-standards/css');
    });

    it('should handle unlinking non-existent module', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockModuleSystem.discoverCollections.mockReturnValue([]);

      await unlinkCommand('coding-standards/nonexistent');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('not linked'));
    });

    it('should check dependencies before unlinking', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' },
          { name: 'workflows/web-dev', version: '1.0.0', type: 'workflow', dependencies: ['coding-standards/html'] }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockModuleSystem.discoverCollections.mockReturnValue([]);

      await unlinkCommand('coding-standards/html');

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('depend on it'));
    });

    it('should force unlink when --force flag is used', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' },
          { name: 'workflows/web-dev', version: '1.0.0', type: 'workflow', dependencies: ['coding-standards/html'] }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockFs.writeFileSync.mockImplementation(() => {});
      mockModuleSystem.discoverCollections.mockReturnValue([]);

      await unlinkCommand('coding-standards/html', { force: true });

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writtenConfig = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(writtenConfig.modules).toHaveLength(1);
      expect(writtenConfig.modules[0].name).toBe('workflows/web-dev');
    });
  });

  describe('Collection Unlinking', () => {
    it('should unlink all modules in a collection', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' },
          { name: 'coding-standards/css', version: '1.0.0', type: 'coding-standards' },
          { name: 'coding-standards/js', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      const collection = {
        fullName: 'collections/html-css-js',
        metadata: {
          name: 'html-css-js',
          displayName: 'HTML, CSS, and JavaScript',
          modules: [
            { id: 'coding-standards/html', version: '1.0.0' },
            { id: 'coding-standards/css', version: '1.0.0' },
            { id: 'coding-standards/js', version: '1.0.0' }
          ]
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockFs.writeFileSync.mockImplementation(() => {});
      mockModuleSystem.discoverCollections.mockReturnValue([collection]);

      await unlinkCommand('collections/html-css-js');

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writtenConfig = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(writtenConfig.modules).toHaveLength(0);
    });
  });

  describe('Self-Remove (Dry-Run)', () => {
    it('should show exact preserved and cleaned paths in dry-run mode', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' },
          { name: 'coding-standards/css', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      const augmentConfigPath = path.join(process.cwd(), '.augment', 'extensions.json');
      const vscodeExtensionsJsonPath = path.join(process.cwd(), '.vscode', 'extensions.json');

      mockFs.existsSync.mockImplementation((filePath: any) =>
        filePath === augmentConfigPath || filePath === vscodeExtensionsJsonPath
      );
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath === augmentConfigPath) {
          return JSON.stringify(config);
        }

        if (filePath === vscodeExtensionsJsonPath) {
          return JSON.stringify({ recommendations: ['augment-code', 'other-extension'] });
        }

        return '';
      });

      await selfRemoveCommand({ dryRun: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Dry-run mode'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('.augment/extensions.json'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('.vscode/extensions.json'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Preserved: .augment/'));
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should not remove anything in dry-run mode', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));

      await selfRemoveCommand({ dryRun: true });

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('Self-Remove (Prompting)', () => {
    it('should confirm before removing linked modules', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' },
          { name: 'coding-standards/css', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockPrompt.mockResolvedValueOnce({ confirm: false });

      await selfRemoveCommand({});

      expect(mockPrompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'confirm',
            name: 'confirm',
            message: expect.stringContaining('preserve .augment/ and user content')
          })
        ])
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cancelled.'));
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should fall back cleanly when prompt support is unavailable', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockGetInteractivePrompt.mockResolvedValueOnce(null);

      await selfRemoveCommand({});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('preserved .augment/ directory and user content')
      );
      expect(mockPrompt).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('Self-Remove (Actual)', () => {
    it('should remove all modules with force flag', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' },
          { name: 'coding-standards/css', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      const augmentConfigPath = path.join(process.cwd(), '.augment', 'extensions.json');
      const vscodeExtensionsJsonPath = path.join(process.cwd(), '.vscode', 'extensions.json');

      mockFs.existsSync.mockImplementation((filePath: any) =>
        filePath === augmentConfigPath || filePath === vscodeExtensionsJsonPath
      );
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (filePath === augmentConfigPath) {
          return JSON.stringify(config);
        }

        if (filePath === vscodeExtensionsJsonPath) {
          return JSON.stringify({
            recommendations: ['augment-code', 'ms-vscode.vscode-typescript-next']
          });
        }

        return '';
      });
      mockFs.writeFileSync.mockImplementation(() => {});

      await selfRemoveCommand({ force: true });

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const configWrite = mockFs.writeFileSync.mock.calls.find(call => call[0] === augmentConfigPath);
      expect(configWrite).toBeDefined();
      const writtenConfig = JSON.parse(configWrite![1] as string);
      expect(writtenConfig.modules).toHaveLength(0);

      const vscodeWrite = mockFs.writeFileSync.mock.calls.find(call => call[0] === vscodeExtensionsJsonPath);
      expect(vscodeWrite).toBeDefined();
      const writtenVscodeConfig = JSON.parse(vscodeWrite![1] as string);
      expect(writtenVscodeConfig.recommendations).toEqual(['ms-vscode.vscode-typescript-next']);
    });

    it('should create removal log file', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockFs.writeFileSync.mockImplementation(() => {});

      await selfRemoveCommand({ force: true });

      const logCalls = mockFs.writeFileSync.mock.calls.filter(call =>
        (call[0] as string).includes('.augment-removal.log')
      );
      expect(logCalls.length).toBeGreaterThan(0);
    });

    it('should handle non-existent extensions.json', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await selfRemoveCommand({ force: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('Dependency Checking', () => {
    it('should warn about broken dependencies when unlinking', async () => {
      const config = {
        modules: [
          { name: 'coding-standards/html', version: '1.0.0', type: 'coding-standards' },
          { name: 'workflows/web-dev', version: '1.0.0', type: 'workflow', dependencies: ['coding-standards/html'] }
        ]
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));
      mockModuleSystem.discoverCollections.mockReturnValue([]);

      await unlinkCommand('coding-standards/html');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('depend on it'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('workflows/web-dev'));
    });
  });
});
