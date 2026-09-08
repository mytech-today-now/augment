import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestEnvironment } from '../../helpers/test-env';
import { unlinkCommand } from '@cli/commands/unlink';
import { selfRemoveCommand } from '@cli/commands/self-remove';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Unlink and Self-Remove Integration Tests', () => {
  let testEnv: TestEnvironment;
  let originalCwd: string;

  beforeEach(async () => {
    testEnv = new TestEnvironment();
    await testEnv.setup();
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await testEnv.cleanup();
  });

  describe('Module Unlinking', () => {
    it('should unlink a single module', async () => {
      const project = await testEnv.createProject();
      const module = await testEnv.createModule({
        name: 'test-module',
        type: 'coding-standards'
      });

      // Link module
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: module.metadata.version,
        type: module.metadata.type,
        description: module.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      // Verify module is linked
      expect(await testEnv.isModuleLinked(module.fullName)).toBe(true);

      // Change to project directory
      process.chdir(project.path);

      // Unlink module
      await unlinkCommand(module.fullName);

      // Verify module is unlinked
      expect(await testEnv.isModuleLinked(module.fullName)).toBe(false);
    });

    it('should unlink multiple modules independently', async () => {
      const project = await testEnv.createProject();
      const module1 = await testEnv.createModule({ name: 'module-1', type: 'coding-standards' });
      const module2 = await testEnv.createModule({ name: 'module-2', type: 'domain-rules' });
      const module3 = await testEnv.createModule({ name: 'module-3', type: 'workflows' });

      // Link all modules
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push(
        {
          name: module1.fullName,
          version: module1.metadata.version,
          type: module1.metadata.type,
          description: module1.metadata.description
        },
        {
          name: module2.fullName,
          version: module2.metadata.version,
          type: module2.metadata.type,
          description: module2.metadata.description
        },
        {
          name: module3.fullName,
          version: module3.metadata.version,
          type: module3.metadata.type,
          description: module3.metadata.description
        }
      );
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Unlink module2
      await unlinkCommand(module2.fullName);

      // Verify only module2 is unlinked
      expect(await testEnv.isModuleLinked(module1.fullName)).toBe(true);
      expect(await testEnv.isModuleLinked(module2.fullName)).toBe(false);
      expect(await testEnv.isModuleLinked(module3.fullName)).toBe(true);
    });

    it('should handle unlinking non-existent module gracefully', async () => {
      const project = await testEnv.createProject();
      process.chdir(project.path);

      // Should not throw error
      await expect(unlinkCommand('non-existent-module')).resolves.not.toThrow();
    });

    it('should warn about dependencies when unlinking', async () => {
      const project = await testEnv.createProject();
      const depModule = await testEnv.createModule({ name: 'dependency', type: 'coding-standards' });
      const mainModule = await testEnv.createModule({ name: 'main', type: 'coding-standards' });

      // Link both modules with dependency
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push(
        {
          name: depModule.fullName,
          version: depModule.metadata.version,
          type: depModule.metadata.type,
          description: depModule.metadata.description
        },
        {
          name: mainModule.fullName,
          version: mainModule.metadata.version,
          type: mainModule.metadata.type,
          description: mainModule.metadata.description,
          dependencies: [depModule.fullName]
        }
      );
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Try to unlink dependency without force (should fail)
      await expect(unlinkCommand(depModule.fullName)).rejects.toThrow();

      // Verify dependency is still linked
      expect(await testEnv.isModuleLinked(depModule.fullName)).toBe(true);
    });

    it('should force unlink module with dependencies', async () => {
      const project = await testEnv.createProject();
      const depModule = await testEnv.createModule({ name: 'dependency', type: 'coding-standards' });
      const mainModule = await testEnv.createModule({ name: 'main', type: 'coding-standards' });

      // Link both modules with dependency
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push(
        {
          name: depModule.fullName,
          version: depModule.metadata.version,
          type: depModule.metadata.type,
          description: depModule.metadata.description
        },
        {
          name: mainModule.fullName,
          version: mainModule.metadata.version,
          type: mainModule.metadata.type,
          description: mainModule.metadata.description,
          dependencies: [depModule.fullName]
        }
      );
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Force unlink dependency
      await unlinkCommand(depModule.fullName, { force: true });

      // Verify dependency is unlinked
      expect(await testEnv.isModuleLinked(depModule.fullName)).toBe(false);
      // Main module should still be linked
      expect(await testEnv.isModuleLinked(mainModule.fullName)).toBe(true);
    });
  });

  describe('Collection Unlinking', () => {
    it('should unlink all modules in a collection', async () => {
      const project = await testEnv.createProject();
      const module1 = await testEnv.createModule({ name: 'html', type: 'coding-standards' });
      const module2 = await testEnv.createModule({ name: 'css', type: 'coding-standards' });
      const module3 = await testEnv.createModule({ name: 'js', type: 'coding-standards' });

      // Create collection
      const collectionPath = join(testEnv.tempDir, 'collections', 'html-css-js');
      await mkdir(collectionPath, { recursive: true });

      const collectionMetadata = {
        name: 'html-css-js',
        version: '1.0.0',
        displayName: 'HTML/CSS/JS Collection',
        description: 'Web development standards',
        type: 'collection',
        modules: [
          { id: module1.fullName, version: module1.metadata.version, required: true },
          { id: module2.fullName, version: module2.metadata.version, required: true },
          { id: module3.fullName, version: module3.metadata.version, required: true }
        ]
      };

      await writeFile(
        join(collectionPath, 'collection.json'),
        JSON.stringify(collectionMetadata, null, 2)
      );

      // Link all modules
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push(
        {
          name: module1.fullName,
          version: module1.metadata.version,
          type: module1.metadata.type,
          description: module1.metadata.description
        },
        {
          name: module2.fullName,
          version: module2.metadata.version,
          type: module2.metadata.type,
          description: module2.metadata.description
        },
        {
          name: module3.fullName,
          version: module3.metadata.version,
          type: module3.metadata.type,
          description: module3.metadata.description
        }
      );
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Unlink collection
      await unlinkCommand('collections/html-css-js');

      // Verify all modules are unlinked
      expect(await testEnv.isModuleLinked(module1.fullName)).toBe(false);
      expect(await testEnv.isModuleLinked(module2.fullName)).toBe(false);
      expect(await testEnv.isModuleLinked(module3.fullName)).toBe(false);
    });

    it('should handle partial collection unlinking', async () => {
      const project = await testEnv.createProject();
      const module1 = await testEnv.createModule({ name: 'module-1', type: 'coding-standards' });
      const module2 = await testEnv.createModule({ name: 'module-2', type: 'coding-standards' });

      // Create collection in the global augment-extensions directory
      const collectionsDir = join(process.cwd(), 'augment-extensions', 'collections');
      const collectionPath = join(collectionsDir, 'test-collection');
      await mkdir(collectionPath, { recursive: true });

      const collectionMetadata = {
        name: 'test-collection',
        version: '1.0.0',
        displayName: 'Test Collection',
        description: 'Test collection',
        type: 'collection',
        modules: [
          { id: module1.fullName, version: module1.metadata.version, required: true },
          { id: module2.fullName, version: module2.metadata.version, required: true }
        ]
      };

      await writeFile(
        join(collectionPath, 'collection.json'),
        JSON.stringify(collectionMetadata, null, 2)
      );

      // Link only module1
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module1.fullName,
        version: module1.metadata.version,
        type: module1.metadata.type,
        description: module1.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      try {
        // Unlink collection (should only unlink module1)
        await unlinkCommand('collections/test-collection');

        // Verify only module1 is unlinked
        expect(await testEnv.isModuleLinked(module1.fullName)).toBe(false);
        expect(await testEnv.isModuleLinked(module2.fullName)).toBe(false);
      } finally {
        // Clean up the test collection
        await rm(collectionPath, { recursive: true, force: true });
      }
    });
  });

  describe('Self-Remove (Dry Run)', () => {
    it('should preview removal without making changes', async () => {
      const project = await testEnv.createProject();
      const module1 = await testEnv.createModule({ name: 'module-1', type: 'coding-standards' });
      const module2 = await testEnv.createModule({ name: 'module-2', type: 'domain-rules' });
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const vscodeDir = join(project.path, '.vscode');
      const vscodeExtensionsPath = join(vscodeDir, 'extensions.json');
      const userContentDir = join(project.path, 'screenplays');
      const userContentPath = join(userContentDir, 'draft.md');

      // Link modules
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push(
        {
          name: module1.fullName,
          version: module1.metadata.version,
          type: module1.metadata.type,
          description: module1.metadata.description
        },
        {
          name: module2.fullName,
          version: module2.metadata.version,
          type: module2.metadata.type,
          description: module2.metadata.description
        }
      );
      await writeFile(project.configPath, JSON.stringify(config, null, 2));
      await mkdir(vscodeDir, { recursive: true });
      await writeFile(
        vscodeExtensionsPath,
        JSON.stringify(
          {
            recommendations: ['augment-code', 'ms-vscode.vscode-typescript-next']
          },
          null,
          2
        )
      );
      await mkdir(userContentDir, { recursive: true });
      await writeFile(userContentPath, '# Draft screenplays file');

      try {
        process.chdir(project.path);

        // Run dry-run
        await selfRemoveCommand({ dryRun: true });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Dry-run mode'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('.augment/extensions.json'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('.vscode/extensions.json'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Preserved: .augment/'));

        // Verify modules are still linked
        expect(await testEnv.isModuleLinked(module1.fullName)).toBe(true);
        expect(await testEnv.isModuleLinked(module2.fullName)).toBe(true);

        // Verify config file still exists
        expect(existsSync(project.configPath)).toBe(true);
        expect(existsSync(join(project.path, '.augment-removal.log'))).toBe(false);
        expect(existsSync(userContentPath)).toBe(true);
        expect(JSON.parse(await readFile(vscodeExtensionsPath, 'utf-8')).recommendations).toEqual([
          'augment-code',
          'ms-vscode.vscode-typescript-next'
        ]);
      } finally {
        consoleLogSpy.mockRestore();
      }
    });

    it('should show correct count in dry-run', async () => {
      const project = await testEnv.createProject();
      const modules = await Promise.all([
        testEnv.createModule({ name: 'module-1', type: 'coding-standards' }),
        testEnv.createModule({ name: 'module-2', type: 'domain-rules' }),
        testEnv.createModule({ name: 'module-3', type: 'workflows' })
      ]);

      // Link all modules
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      for (const module of modules) {
        config.modules.push({
          name: module.fullName,
          version: module.metadata.version,
          type: module.metadata.type,
          description: module.metadata.description
        });
      }
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Run dry-run (should show 3 modules)
      await selfRemoveCommand({ dryRun: true });

      // Verify all modules still linked
      for (const module of modules) {
        expect(await testEnv.isModuleLinked(module.fullName)).toBe(true);
      }
    });
  });

  describe('Self-Remove (Actual Removal)', () => {
    it('should remove all linked modules', async () => {
      const project = await testEnv.createProject();
      const module1 = await testEnv.createModule({ name: 'module-1', type: 'coding-standards' });
      const module2 = await testEnv.createModule({ name: 'module-2', type: 'domain-rules' });

      // Link modules
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push(
        {
          name: module1.fullName,
          version: module1.metadata.version,
          type: module1.metadata.type,
          description: module1.metadata.description
        },
        {
          name: module2.fullName,
          version: module2.metadata.version,
          type: module2.metadata.type,
          description: module2.metadata.description
        }
      );
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Run self-remove with force (no prompts)
      await selfRemoveCommand({ force: true });

      // Verify all modules are unlinked
      expect(await testEnv.isModuleLinked(module1.fullName)).toBe(false);
      expect(await testEnv.isModuleLinked(module2.fullName)).toBe(false);

      // Verify config file still exists but modules array is empty
      expect(existsSync(project.configPath)).toBe(true);
      const updatedConfig = JSON.parse(await readFile(project.configPath, 'utf-8'));
      expect(updatedConfig.modules).toHaveLength(0);
    });

    it('should clean VS Code recommendations and preserve user content', async () => {
      const project = await testEnv.createProject();
      const module = await testEnv.createModule({ name: 'test-module', type: 'coding-standards' });
      const userContentDir = join(project.path, 'screenplays');
      const userContentPath = join(userContentDir, 'draft.md');
      const vscodeDir = join(project.path, '.vscode');
      const vscodeExtensionsPath = join(vscodeDir, 'extensions.json');

      // Link module
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: module.metadata.version,
        type: module.metadata.type,
        description: module.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      await mkdir(userContentDir, { recursive: true });
      await writeFile(userContentPath, '# Draft screenplays file');
      await mkdir(vscodeDir, { recursive: true });
      await writeFile(
        vscodeExtensionsPath,
        JSON.stringify(
          {
            recommendations: ['augment-code', 'ms-vscode.vscode-typescript-next']
          },
          null,
          2
        )
      );

      process.chdir(project.path);

      // Run self-remove
      await selfRemoveCommand({ force: true });

      // Verify user content still exists
      expect(existsSync(userContentPath)).toBe(true);

      // Verify VS Code recommendations were cleaned
      const updatedVscodeExtensions = JSON.parse(await readFile(vscodeExtensionsPath, 'utf-8'));
      expect(updatedVscodeExtensions.recommendations).toEqual(['ms-vscode.vscode-typescript-next']);

      // Verify cleanup log exists
      expect(existsSync(join(project.path, '.augment-removal.log'))).toBe(true);
    });

    it('should preserve .augment directory and extensions.json', async () => {
      const project = await testEnv.createProject();
      const module = await testEnv.createModule({ name: 'test-module', type: 'coding-standards' });

      // Link module
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: module.metadata.version,
        type: module.metadata.type,
        description: module.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Run self-remove
      await selfRemoveCommand({ force: true });

      // Verify .augment directory still exists
      expect(existsSync(project.augmentDir)).toBe(true);
      // Verify extensions.json still exists
      expect(existsSync(project.configPath)).toBe(true);
    });

    it('should create removal log', async () => {
      const project = await testEnv.createProject();
      const module = await testEnv.createModule({ name: 'test-module', type: 'coding-standards' });

      // Link module
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push({
        name: module.fullName,
        version: module.metadata.version,
        type: module.metadata.type,
        description: module.metadata.description
      });
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Run self-remove
      await selfRemoveCommand({ force: true });

      // Verify removal log exists
      const logPath = join(project.path, '.augment-removal.log');
      expect(existsSync(logPath)).toBe(true);

      // Verify log content
      const log = JSON.parse(await readFile(logPath, 'utf-8'));
      expect(log.modulesRemoved).toBe(1);
      expect(log.success).toBe(true);
      expect(log.modules).toHaveLength(1);
    });

    it('should handle empty project gracefully', async () => {
      const project = await testEnv.createProject();
      process.chdir(project.path);

      // Run self-remove on project with no modules
      await selfRemoveCommand({ force: true });

      // Should not throw error
      expect(existsSync(project.configPath)).toBe(true);
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      expect(config.modules).toHaveLength(0);
    });

    it('should handle project without extensions.json', async () => {
      const projectPath = join(testEnv.tempDir, 'no-extensions');
      await mkdir(projectPath, { recursive: true });
      process.chdir(projectPath);

      // Should not throw error
      await expect(selfRemoveCommand({ force: true })).resolves.not.toThrow();
    });
  });

  describe('Dependency Checking', () => {
    it('should check dependencies before unlinking', async () => {
      const project = await testEnv.createProject();
      const baseModule = await testEnv.createModule({ name: 'base', type: 'coding-standards' });
      const extModule = await testEnv.createModule({ name: 'extension', type: 'coding-standards' });

      // Link both modules with dependency
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push(
        {
          name: baseModule.fullName,
          version: baseModule.metadata.version,
          type: baseModule.metadata.type,
          description: baseModule.metadata.description
        },
        {
          name: extModule.fullName,
          version: extModule.metadata.version,
          type: extModule.metadata.type,
          description: extModule.metadata.description,
          dependencies: [baseModule.fullName]
        }
      );
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Try to unlink base module (should fail due to dependency)
      await expect(unlinkCommand(baseModule.fullName)).rejects.toThrow();

      // Verify base module is still linked
      expect(await testEnv.isModuleLinked(baseModule.fullName)).toBe(true);
    });

    it('should allow unlinking dependent module first', async () => {
      const project = await testEnv.createProject();
      const baseModule = await testEnv.createModule({ name: 'base', type: 'coding-standards' });
      const extModule = await testEnv.createModule({ name: 'extension', type: 'coding-standards' });

      // Link both modules with dependency
      const config = JSON.parse(await readFile(project.configPath, 'utf-8'));
      config.modules.push(
        {
          name: baseModule.fullName,
          version: baseModule.metadata.version,
          type: baseModule.metadata.type,
          description: baseModule.metadata.description
        },
        {
          name: extModule.fullName,
          version: extModule.metadata.version,
          type: extModule.metadata.type,
          description: extModule.metadata.description,
          dependencies: [baseModule.fullName]
        }
      );
      await writeFile(project.configPath, JSON.stringify(config, null, 2));

      process.chdir(project.path);

      // Unlink dependent module first
      await unlinkCommand(extModule.fullName);

      // Verify dependent module is unlinked
      expect(await testEnv.isModuleLinked(extModule.fullName)).toBe(false);
      // Base module should still be linked
      expect(await testEnv.isModuleLinked(baseModule.fullName)).toBe(true);

      // Now unlink base module (should succeed)
      await unlinkCommand(baseModule.fullName);

      // Verify base module is unlinked
      expect(await testEnv.isModuleLinked(baseModule.fullName)).toBe(false);
    });
  });
});
