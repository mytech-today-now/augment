/**
 * Unit Tests for Inspection Handlers
 * Tests the extensible handler system for module inspection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BaseInspectionHandler,
  CodingStandardsHandler,
  DefaultInspectionHandler,
  HandlerOptions,
  HandlerResult,
  WorkflowInspectionHandler
} from '@cli/utils/inspection-handlers';
import { loadModule, Module } from '@cli/utils/module-system';
import { PluginLoader } from '@cli/utils/plugin-system';

const FALLBACK_MESSAGE = 'Specialized extraction failed; using default inspection output.';
const WORKFLOW_FIXTURE_PATH = path.join(process.cwd(), 'augment-extensions', 'workflows', 'database');
const TYPESCRIPT_FIXTURE_PATH = path.join(process.cwd(), 'augment-extensions', 'coding-standards', 'typescript');

function loadFixtureModule(modulePath: string): Module {
  const module = loadModule(modulePath);

  expect(module).not.toBeNull();
  return module!;
}

describe('Inspection Handlers', () => {
  describe('BaseInspectionHandler', () => {
    class TestHandler extends BaseInspectionHandler {
      id = 'test-handler';
      supportedTypes = ['test-type', 'another-type'];
      priority = 5;

      async handle(module: Module, options: HandlerOptions): Promise<HandlerResult> {
        return {
          success: true,
          data: { test: 'data' },
          metadata: {
            handlerId: this.id,
            moduleType: module.metadata.type
          }
        };
      }
    }

    it('should support specified module types', () => {
      const handler = new TestHandler();
      
      expect(handler.supports('test-type')).toBe(true);
      expect(handler.supports('another-type')).toBe(true);
      expect(handler.supports('unsupported-type')).toBe(false);
    });

    it('should have correct priority', () => {
      const handler = new TestHandler();
      expect(handler.priority).toBe(5);
    });

    it('should have unique handler ID', () => {
      const handler = new TestHandler();
      expect(handler.id).toBe('test-handler');
    });
  });

  describe('DefaultInspectionHandler', () => {
    let handler: DefaultInspectionHandler;
    let mockModule: Module;

    beforeEach(() => {
      handler = new DefaultInspectionHandler();
      mockModule = {
        fullName: 'test/module',
        metadata: {
          name: 'module',
          version: '1.0.0',
          type: 'coding-standards',
          description: 'Test module'
        },
        rules: ['rule1.md', 'rule2.md'],
        examples: ['example1.ts', 'example2.ts'],
        path: '/test/path'
      } as Module;
    });

    it('should support all module types', () => {
      expect(handler.supports('coding-standards')).toBe(true);
      expect(handler.supports('domain-rules')).toBe(true);
      expect(handler.supports('workflows')).toBe(true);
      expect(handler.supports('any-type')).toBe(true);
    });

    it('should have lowest priority', () => {
      expect(handler.priority).toBe(-1);
    });

    it('should handle module successfully', async () => {
      const result = await handler.handle(mockModule, {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.module).toBe('test/module');
      expect(result.data.type).toBe('coding-standards');
      expect(result.data.version).toBe('1.0.0');
      expect(result.data.description).toBe('Test module');
    });

    it('should include rules and examples in result', async () => {
      const result = await handler.handle(mockModule, {});

      expect(result.data.rules).toEqual(['rule1.md', 'rule2.md']);
      expect(result.data.examples).toEqual(['example1.ts', 'example2.ts']);
    });

    it('should include metadata in result', async () => {
      const result = await handler.handle(mockModule, {});

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.handlerId).toBe('default-handler');
      expect(result.metadata?.moduleType).toBe('coding-standards');
      expect(result.metadata?.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors gracefully', async () => {
      const invalidModule = null as any;
      
      const result = await handler.handle(invalidModule, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.metadata?.handlerId).toBe('default-handler');
    });

    it('should respect handler options', async () => {
      const options: HandlerOptions = {
        format: 'json',
        depth: 3,
        filter: '*.md'
      };

      const result = await handler.handle(mockModule, options);

      expect(result.success).toBe(true);
      // Options are passed but not used by default handler
      // Custom handlers would use these options
    });

    it('should measure processing time', async () => {
      const result = await handler.handle(mockModule, {});

      expect(result.metadata?.processingTime).toBeDefined();
      expect(result.metadata?.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.processingTime).toBeLessThan(1000); // Should be fast
    });
  });

  describe('PluginLoader integration', () => {
    it('should prefer specialized handlers and keep the wildcard default handler available', () => {
      const loader = new PluginLoader();
      const defaultHandler = new DefaultInspectionHandler();
      const workflowHandler = new WorkflowInspectionHandler();
      const standardsHandler = new CodingStandardsHandler();

      loader.registerHandler(defaultHandler);
      loader.registerHandler(workflowHandler);
      loader.registerHandler(standardsHandler);

      expect(loader.getHandlerForType('workflow')).toBe(workflowHandler);
      expect(loader.getHandlerForType('coding-standards')).toBe(standardsHandler);
      expect(loader.getHandlerForType('domain-rules')).toBe(defaultHandler);
    });
  });

  describe('WorkflowInspectionHandler', () => {
    it('should extract workflow steps from the real workflow fixture', async () => {
      const module = loadFixtureModule(WORKFLOW_FIXTURE_PATH);
      const handler = new WorkflowInspectionHandler();

      const result = await handler.handle(module, {});

      expect(result.success).toBe(true);
      expect(result.metadata?.handlerId).toBe('workflow-handler');
      expect(result.metadata?.moduleType).toBe(module.metadata.type);
      expect(result.data.workflowSteps).toBeDefined();
      expect(result.data.workflowSteps.length).toBeGreaterThan(0);
      expect(result.data.workflowSteps.some((step: string) => step.includes('Database Selection Workflow'))).toBe(true);
      expect(result.data.rules).toEqual(module.rules);
      expect(result.data.examples).toEqual(module.examples);
    });

    it('should fall back to the default module summary when the layout is missing', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inspection-handler-fallback-'));
      const metadata = {
        name: 'missing-layout',
        version: '1.0.0',
        displayName: 'Missing Layout',
        description: 'Empty workflow module',
        type: 'workflow'
      } as any;

      try {
        fs.writeFileSync(path.join(tempDir, 'module.json'), JSON.stringify(metadata, null, 2));

        const module = {
          fullName: 'workflow/missing-layout',
          path: tempDir,
          metadata,
          rules: [],
          examples: []
        } as Module;

        const result = await new WorkflowInspectionHandler().handle(module, {});

        expect(result.success).toBe(false);
        expect(result.data).toEqual({
          module: module.fullName,
          type: 'workflow',
          version: '1.0.0',
          description: 'Empty workflow module',
          rules: [],
          examples: []
        });
        expect(result.error).toBe(FALLBACK_MESSAGE);
        expect(result.metadata?.handlerId).toBe('workflow-handler');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('CodingStandardsHandler', () => {
    it('should extract standards from the real coding-standards fixture', async () => {
      const module = loadFixtureModule(TYPESCRIPT_FIXTURE_PATH);
      const handler = new CodingStandardsHandler();

      const result = await handler.handle(module, {});

      expect(result.success).toBe(true);
      expect(result.metadata?.handlerId).toBe('coding-standards-handler');
      expect(result.metadata?.moduleType).toBe(module.metadata.type);
      expect(result.data.standards).toBeDefined();
      expect(result.data.standards.length).toBeGreaterThan(0);
      expect(result.data.standards.some((standard: string) => standard.includes('TypeScript Naming Conventions'))).toBe(true);
      expect(result.data.rules).toEqual(module.rules);
      expect(result.data.examples).toEqual(module.examples);
    });
  });
});

