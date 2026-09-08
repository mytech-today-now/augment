/**
 * Custom Inspection Handlers
 * Provides extensible handlers for different module types
 */

import * as fs from 'fs';
import * as path from 'path';
import { InspectionHandler } from './plugin-system';
import { Module } from './module-system';

const MAX_EXTRACTED_ITEMS = 15;
const FALLBACK_MESSAGE = 'Specialized extraction failed; using default inspection output.';

/**
 * Handler options interface
 */
export interface HandlerOptions {
  format?: 'text' | 'json' | 'markdown';
  depth?: number;
  filter?: string;
  search?: string;
  [key: string]: any;
}

/**
 * Handler result interface
 */
export interface HandlerResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    handlerId: string;
    moduleType: string;
    processingTime?: number;
  };
}

/**
 * Base inspection handler
 */
export abstract class BaseInspectionHandler implements InspectionHandler {
  abstract id: string;
  abstract supportedTypes: string[];
  priority: number = 0;

  /**
   * Handle module inspection
   */
  abstract handle(module: Module, options: HandlerOptions): Promise<HandlerResult> | HandlerResult;

  /**
   * Check if this handler supports the module type
   */
  supports(moduleType: string): boolean {
    return this.supportedTypes.includes('*') || this.supportedTypes.includes(moduleType);
  }
}

function buildDefaultInspectionData(module: Module) {
  return {
    module: module.fullName,
    type: module.metadata.type,
    version: module.metadata.version,
    description: module.metadata.description,
    rules: module.rules,
    examples: module.examples
  };
}

function getModuleType(module: Module | null | undefined): string {
  return module?.metadata?.type ?? 'unknown';
}

function toRelativePath(modulePath: string, filePath: string): string {
  return path.relative(modulePath, filePath).replace(/\\/g, '/');
}

function readTextFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function collectMarkdownFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function normalizeMarkdownText(text: string): string {
  return text
    .replace(/^\s*>\s?/, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWorkflowHeading(title: string): boolean {
  return /\b(workflow|workflows|step|steps|phase|process)\b/i.test(title);
}

function extractFirstHeading(content: string): string | null {
  let inCodeBlock = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (/^```/.test(line) || /^~~~/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      continue;
    }

    const match = line.match(/^#{1,6}\s+(.*)$/);
    if (!match) {
      continue;
    }

    const heading = normalizeMarkdownText(match[1]);
    if (!heading || /^table of contents$/i.test(heading)) {
      continue;
    }

    return heading;
  }

  return null;
}

function pushUnique(entries: string[], seen: Set<string>, value: string): void {
  if (seen.has(value)) {
    return;
  }

  entries.push(value);
  seen.add(value);
}

function createFallbackResult(
  handlerId: string,
  module: Module | null | undefined,
  startTime: number
): HandlerResult {
  return {
    success: false,
    data: module ? buildDefaultInspectionData(module) : undefined,
    error: FALLBACK_MESSAGE,
    metadata: {
      handlerId,
      moduleType: getModuleType(module),
      processingTime: Date.now() - startTime
    }
  };
}

/**
 * Default handler for all module types
 */
export class DefaultInspectionHandler extends BaseInspectionHandler {
  id = 'default-handler';
  supportedTypes = ['*'];
  priority = -1; // Lowest priority

  async handle(module: Module, options: HandlerOptions): Promise<HandlerResult> {
    const startTime = Date.now();

    try {
      return {
        success: true,
        data: buildDefaultInspectionData(module),
        metadata: {
          handlerId: this.id,
          moduleType: getModuleType(module),
          processingTime: Date.now() - startTime
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          handlerId: this.id,
          moduleType: getModuleType(module),
          processingTime: Date.now() - startTime
        }
      };
    }
  }
}

/**
 * Workflow module handler
 */
export class WorkflowInspectionHandler extends BaseInspectionHandler {
  id = 'workflow-handler';
  supportedTypes = ['workflow', 'workflows'];
  priority = 10;

  async handle(module: Module, options: HandlerOptions): Promise<HandlerResult> {
    const startTime = Date.now();

    try {
      const workflowSteps = this.extractWorkflowSteps(module);

      if (workflowSteps.length === 0) {
        return createFallbackResult(this.id, module, startTime);
      }

      const result = {
        ...buildDefaultInspectionData(module),
        type: 'workflow',
        workflowSteps
      };

      return {
        success: true,
        data: result,
        metadata: {
          handlerId: this.id,
          moduleType: getModuleType(module),
          processingTime: Date.now() - startTime
        }
      };
    } catch (error) {
      return createFallbackResult(this.id, module, startTime);
    }
  }

  private extractWorkflowSteps(module: Module): string[] {
    const extractedSteps: string[] = [];
    const seen = new Set<string>();

    const candidateFiles: string[] = [];
    const readmePath = path.join(module.path, 'README.md');
    if (fs.existsSync(readmePath)) {
      candidateFiles.push(readmePath);
    }

    candidateFiles.push(...collectMarkdownFiles(path.join(module.path, 'rules')));

    for (const filePath of candidateFiles) {
      const content = readTextFile(filePath);
      if (!content) {
        continue;
      }

      const relativePath = toRelativePath(module.path, filePath);
      let inCodeBlock = false;

      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (!line) {
          continue;
        }

        if (/^```/.test(line) || /^~~~/.test(line)) {
          inCodeBlock = !inCodeBlock;
          continue;
        }

        if (inCodeBlock) {
          continue;
        }

        const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
        if (headingMatch) {
          const heading = normalizeMarkdownText(headingMatch[1]);
          if (heading && isWorkflowHeading(heading)) {
            pushUnique(extractedSteps, seen, `${relativePath}: ${heading}`);
          }
          if (extractedSteps.length >= MAX_EXTRACTED_ITEMS) {
            return extractedSteps;
          }
          continue;
        }

        const orderedListMatch = line.match(/^(\d+\.)\s+(.*)$/);
        if (orderedListMatch) {
          const step = normalizeMarkdownText(orderedListMatch[2]);
          if (step) {
            pushUnique(extractedSteps, seen, `${relativePath}: ${orderedListMatch[1]} ${step}`);
          }
        }

        if (extractedSteps.length >= MAX_EXTRACTED_ITEMS) {
          return extractedSteps;
        }
      }
    }

    return extractedSteps;
  }
}

/**
 * Coding standards handler
 */
export class CodingStandardsHandler extends BaseInspectionHandler {
  id = 'coding-standards-handler';
  supportedTypes = ['coding-standards'];
  priority = 10;

  async handle(module: Module, options: HandlerOptions): Promise<HandlerResult> {
    const startTime = Date.now();

    try {
      const standards = this.extractStandards(module);

      if (standards.length === 0) {
        return createFallbackResult(this.id, module, startTime);
      }

      const result = {
        ...buildDefaultInspectionData(module),
        type: 'coding-standards',
        standards
      };

      return {
        success: true,
        data: result,
        metadata: {
          handlerId: this.id,
          moduleType: getModuleType(module),
          processingTime: Date.now() - startTime
        }
      };
    } catch (error) {
      return createFallbackResult(this.id, module, startTime);
    }
  }

  private extractStandards(module: Module): string[] {
    const extractedStandards: string[] = [];
    const seen = new Set<string>();
    const rulesDir = path.join(module.path, 'rules');
    const ruleFiles = collectMarkdownFiles(rulesDir);

    for (const filePath of ruleFiles) {
      const content = readTextFile(filePath);
      if (!content) {
        continue;
      }

      const heading = extractFirstHeading(content);
      if (!heading) {
        continue;
      }

      pushUnique(extractedStandards, seen, `${toRelativePath(module.path, filePath)}: ${heading}`);

      if (extractedStandards.length >= MAX_EXTRACTED_ITEMS) {
        break;
      }
    }

    return extractedStandards;
  }
}

