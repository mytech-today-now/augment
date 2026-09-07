import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import hljs from 'highlight.js';
import {
  findModule,
  findModuleEnhanced,
  getModuleSuggestions,
  discoverModules,
  extractModuleMetadata,
  Module
} from '../utils/module-system';
import { moduleInspectionCache } from '../utils/inspection-cache';
import { readFileStreaming, readFileLineByLine } from '../utils/stream-reader';
import { Spinner, ProgressBar } from '../utils/progress';
import { formatClickablePath, getWorkspaceRoot } from '../utils/vscode-links';
import { openInEditor, openInPreview, isVSCodeAvailable } from '../utils/vscode-editor';
import {
  generateCodeReviewPrompt,
  generateModuleSummaryPrompt,
  generateOptimizationPrompt,
  generateRefactoringPrompt,
  getPromptTemplates
} from '../utils/ai-prompts';
import {
  generateModuleSummary,
  generateDetailedSummary,
  generateJSONSummary,
  generateCompactSummary,
  generateAIContext
} from '../utils/ai-summary';
import { configLoader } from '../utils/config-loader';

interface ShowOptions {
  json?: boolean;
}

interface ShowListOptions {
  json?: boolean;
}

interface ModuleListItem {
  name: string;
  version: string;
  description: string;
  type: string;
  linked?: boolean;
}

interface ShowModuleOptions {
  json?: boolean;
  content?: boolean;
  format?: 'json' | 'markdown' | 'text';
  depth?: number;
  filter?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  secure?: boolean;
  noCache?: boolean;
  open?: boolean;
  preview?: boolean;
  aiPrompt?: string;
  aiSummary?: boolean;
  aiContext?: boolean;
  compact?: boolean;
}

/**
 * Legacy show command - displays basic module information
 * @deprecated Use showModuleCommand for enhanced inspection
 */
export async function showCommand(moduleName: string, options: ShowOptions): Promise<void> {
  try {
    const module = findModuleEnhanced(moduleName);

    if (!module) {
      console.error(chalk.red(`Module not found: ${moduleName}`));

      // Suggest similar modules
      const suggestions = await getSimilarModules(moduleName);
      if (suggestions.length > 0) {
        console.log(chalk.yellow('\nDid you mean one of these?'));
        suggestions.forEach(suggestion => {
          console.log(chalk.cyan(`  • ${suggestion}`));
        });
      }

      console.log(chalk.gray('\nUse "augx list" to see all available modules.'));
      process.exit(1);
    }

    if (options.json) {
      const moduleInfo = {
        name: module.fullName,
        version: module.metadata.version,
        type: module.metadata.type,
        description: module.metadata.description,
        rules: module.rules,
        examples: module.examples,
        characterCount: module.metadata.augment?.characterCount
      };
      console.log(JSON.stringify(moduleInfo, null, 2));
      return;
    }

    console.log(chalk.bold.blue(`\n📦 ${module.fullName}\n`));
    console.log(chalk.gray(`Version: ${module.metadata.version}`));
    console.log(chalk.gray(`Type: ${module.metadata.type}`));
    console.log(chalk.gray(`Description: ${module.metadata.description}\n`));

    if (module.rules && module.rules.length > 0) {
      console.log(chalk.bold('Rules:'));
      module.rules.forEach((rule: string) => {
        console.log(chalk.cyan(`  • ${rule}`));
      });
      console.log();
    }

    if (module.examples && module.examples.length > 0) {
      console.log(chalk.bold('Examples:'));
      module.examples.forEach((example: string) => {
        console.log(chalk.green(`  • ${example}`));
      });
      console.log();
    }

    const charCount = module.metadata.augment?.characterCount;
    console.log(chalk.gray(`Character count: ~${charCount ? charCount.toLocaleString() : 'unknown'}`));
    console.log();

  } catch (error) {
    console.error(chalk.red('Error showing module:'), error);
    process.exit(1);
  }
}

/**
 * Enhanced module inspection command with advanced features
 * Supports module overview, content viewing, and file inspection
 */
export async function showModuleCommand(
  moduleName: string | undefined,
  filePath: string | undefined,
  options: ShowModuleOptions
): Promise<void> {
  try {
    // Load configuration and apply defaults
    const config = configLoader.getConfig();
    const inspectionConfig = config.inspection || {};

    // Apply configuration defaults if options not explicitly set
    if (!options.format && inspectionConfig.defaultFormat) {
      options.format = inspectionConfig.defaultFormat;
    }
    if (options.pageSize === undefined && inspectionConfig.pageSize) {
      options.pageSize = inspectionConfig.pageSize;
    }
    if (options.secure === undefined && inspectionConfig.secureMode !== undefined) {
      options.secure = inspectionConfig.secureMode;
    }

    // Validate module name
    if (!moduleName || moduleName.trim() === '') {
      console.error(chalk.red('Error: Module name is required'));
      console.log(chalk.gray('\nUsage: augx show module <module-name> [file-path] [options]'));
      console.log(chalk.gray('Example: augx show module php-standards'));
      console.log(chalk.gray('         augx show module php-standards rules/psr-standards.md'));
      process.exit(1);
    }

    // Disable cache if --no-cache flag is set or if cache is disabled in config
    if (options.noCache || !inspectionConfig.cache) {
      moduleInspectionCache.setEnabled(false);
    }

    // Discover and validate module using enhanced discovery
    const module = findModuleEnhanced(moduleName);

    if (!module) {
      console.error(chalk.red(`Module not found: ${moduleName}`));

      // Suggest similar modules using enhanced suggestions
      const suggestions = getModuleSuggestions(moduleName, 5);
      if (suggestions.length > 0) {
        console.log(chalk.yellow('\nDid you mean one of these?'));
        suggestions.forEach(suggestion => {
          console.log(chalk.cyan(`  • ${suggestion.fullName}`));
        });
      }

      console.log(chalk.gray('\nUse "augx list" to see all available modules.'));
      process.exit(1);
    }

    // Handle AI integration options
    if (options.aiPrompt) {
      await handleAIPrompt(module, options.aiPrompt);
      return;
    }

    if (options.aiSummary) {
      await handleAISummary(module, options);
      return;
    }

    if (options.aiContext) {
      await handleAIContext(module);
      return;
    }

    // Route to appropriate handler based on options and arguments
    if (filePath) {
      // Individual file inspection
      await showModuleFile(module, filePath, options);
    } else if (options.content) {
      // Aggregated content view
      await showModuleContent(module, options);
    } else {
      // Module overview (default)
      await showModuleOverview(module, options);
    }

    // Re-enable cache after command completes
    if (options.noCache) {
      moduleInspectionCache.setEnabled(true);
    }

  } catch (error) {
    console.error(chalk.red('Error inspecting module:'), error);
    if (error instanceof Error) {
      console.error(chalk.gray(error.message));
    }
    // Re-enable cache on error
    if (options.noCache) {
      moduleInspectionCache.setEnabled(true);
    }
    process.exit(1);
  }
}

/**
 * Display module overview with metadata and file listing
 */
async function showModuleOverview(module: Module, options: ShowModuleOptions): Promise<void> {
  // Try to get from cache first
  const cacheKey = `overview:${module.fullName}`;
  let extendedMetadata = moduleInspectionCache.get(cacheKey, module.path);

  if (!extendedMetadata) {
    // Extract comprehensive metadata
    extendedMetadata = extractModuleMetadata(module.path);

    if (!extendedMetadata) {
      console.error(chalk.red('Failed to extract module metadata'));
      return;
    }

    // Cache the result
    moduleInspectionCache.set(cacheKey, extendedMetadata, module.path);
  }

  // Handle JSON output format
  if (options.json || options.format === 'json') {
    const jsonOutput = {
      name: module.fullName,
      version: extendedMetadata.version,
      type: extendedMetadata.type,
      description: extendedMetadata.description,
      displayName: extendedMetadata.displayName,
      tags: extendedMetadata.tags,
      path: module.path,
      files: {
        total: extendedMetadata.files?.total || 0,
        rules: extendedMetadata.files?.rules || 0,
        examples: extendedMetadata.files?.examples || 0,
        other: extendedMetadata.files?.other || 0
      },
      size: {
        totalBytes: extendedMetadata.size?.totalBytes || 0,
        totalCharacters: extendedMetadata.size?.totalCharacters || 0
      },
      lastModified: extendedMetadata.lastModified,
      augment: extendedMetadata.augment
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Handle Markdown output format
  if (options.format === 'markdown') {
    console.log(`# ${module.fullName}\n`);
    console.log(`**Version:** ${extendedMetadata.version}\n`);
    console.log(`**Type:** ${extendedMetadata.type}\n`);
    console.log(`**Description:** ${extendedMetadata.description}\n`);

    if (extendedMetadata.tags && extendedMetadata.tags.length > 0) {
      console.log(`**Tags:** ${extendedMetadata.tags.join(', ')}\n`);
    }

    console.log(`## Files\n`);
    console.log(`- Total: ${extendedMetadata.files?.total || 0}`);
    console.log(`- Rules: ${extendedMetadata.files?.rules || 0}`);
    console.log(`- Examples: ${extendedMetadata.files?.examples || 0}`);
    console.log(`- Other: ${extendedMetadata.files?.other || 0}\n`);

    console.log(`## Size\n`);
    const totalBytes = extendedMetadata.size?.totalBytes || 0;
    const totalChars = extendedMetadata.size?.totalCharacters || 0;
    console.log(`- Total: ${formatBytes(totalBytes)} (${totalBytes.toLocaleString()} bytes)`);
    console.log(`- Characters: ${totalChars.toLocaleString()}\n`);

    if (extendedMetadata.lastModified) {
      console.log(`**Last Modified:** ${formatDate(extendedMetadata.lastModified)}\n`);
    }

    console.log(`**Location:** \`${module.path}\`\n`);
    return;
  }

  // Handle plain text output format (ASCII-only, no colors)
  if (options.format === 'text') {
    console.log();
    console.log(`Module: ${module.fullName}`);
    console.log('='.repeat(60));
    console.log();

    console.log('Metadata:');
    console.log(`  Name:        ${extendedMetadata.displayName}`);
    console.log(`  Version:     ${extendedMetadata.version}`);
    console.log(`  Type:        ${extendedMetadata.type}`);
    console.log(`  Description: ${extendedMetadata.description}`);

    if (extendedMetadata.tags && extendedMetadata.tags.length > 0) {
      console.log(`  Tags:        ${extendedMetadata.tags.join(', ')}`);
    }
    console.log();

    console.log('Files:');
    console.log(`  Total:       ${extendedMetadata.files?.total || 0}`);
    console.log(`  Rules:       ${extendedMetadata.files?.rules || 0}`);
    console.log(`  Examples:    ${extendedMetadata.files?.examples || 0}`);
    console.log(`  Other:       ${extendedMetadata.files?.other || 0}`);
    console.log();

    console.log('Size:');
    const totalBytes = extendedMetadata.size?.totalBytes || 0;
    const totalChars = extendedMetadata.size?.totalCharacters || 0;
    console.log(`  Total:       ${formatBytes(totalBytes)} (${totalBytes.toLocaleString()} bytes)`);
    console.log(`  Characters:  ${totalChars.toLocaleString()}`);
    console.log();

    if (extendedMetadata.lastModified) {
      console.log('Last Modified:');
      console.log(`  ${formatDate(extendedMetadata.lastModified)}`);
      console.log();
    }

    console.log('Location:');
    console.log(`  ${module.path}`);
    console.log();
    return;
  }

  // Colored text output format (default)
  console.log();
  console.log(chalk.bold.blue(`📦 ${module.fullName}`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  // Basic metadata
  console.log(chalk.bold('Metadata:'));
  console.log(chalk.gray(`  Name:        ${extendedMetadata.displayName}`));
  console.log(chalk.gray(`  Version:     ${extendedMetadata.version}`));
  console.log(chalk.gray(`  Type:        ${extendedMetadata.type}`));
  console.log(chalk.gray(`  Description: ${extendedMetadata.description}`));

  if (extendedMetadata.tags && extendedMetadata.tags.length > 0) {
    console.log(chalk.gray(`  Tags:        ${extendedMetadata.tags.join(', ')}`));
  }
  console.log();

  // File statistics
  console.log(chalk.bold('Files:'));
  console.log(chalk.gray(`  Total:       ${extendedMetadata.files?.total || 0}`));
  console.log(chalk.cyan(`  Rules:       ${extendedMetadata.files?.rules || 0}`));
  console.log(chalk.green(`  Examples:    ${extendedMetadata.files?.examples || 0}`));
  console.log(chalk.gray(`  Other:       ${extendedMetadata.files?.other || 0}`));
  console.log();

  // Size statistics
  console.log(chalk.bold('Size:'));
  const totalBytes = extendedMetadata.size?.totalBytes || 0;
  const totalChars = extendedMetadata.size?.totalCharacters || 0;
  console.log(chalk.gray(`  Total:       ${formatBytes(totalBytes)} (${totalBytes.toLocaleString()} bytes)`));
  console.log(chalk.gray(`  Characters:  ${totalChars.toLocaleString()}`));
  console.log();

  // Last modified
  if (extendedMetadata.lastModified) {
    console.log(chalk.bold('Last Modified:'));
    console.log(chalk.gray(`  ${formatDate(extendedMetadata.lastModified)}`));
    console.log();
  }

  // Augment configuration
  if (extendedMetadata.augment) {
    console.log(chalk.bold('Augment Configuration:'));
    if (extendedMetadata.augment.priority) {
      console.log(chalk.gray(`  Priority:    ${extendedMetadata.augment.priority}`));
    }
    if (extendedMetadata.augment.category) {
      console.log(chalk.gray(`  Category:    ${extendedMetadata.augment.category}`));
    }
    if (extendedMetadata.augment.characterCount !== undefined) {
      console.log(chalk.gray(`  Char Count:  ${extendedMetadata.augment.characterCount.toLocaleString()}`));
    }
    console.log();
  }

  // Path information
  console.log(chalk.bold('Location:'));
  console.log(chalk.gray(`  ${module.path}`));
  console.log();

  // Helpful commands
  console.log(chalk.bold('Commands:'));
  console.log(chalk.gray(`  View content:     augx show module ${module.fullName} --content`));
  console.log(chalk.gray(`  List files:       augx show module ${module.fullName} --filter "*.md"`));
  console.log(chalk.gray(`  Search content:   augx show module ${module.fullName} --search "keyword"`));
  console.log();
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format date to human-readable format
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today at ${date.toLocaleTimeString()}`;
  } else if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString()}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Display aggregated content from all module files
 */
async function showModuleContent(module: Module, options: ShowModuleOptions): Promise<void> {
  const { listModuleFiles } = await import('../utils/module-system');

  // Get all markdown files from the module
  const files = listModuleFiles(module.path, {
    recursive: true,
    filter: options.filter || '*.md',
    groupByDirectory: true,
    depth: options.depth
  });

  if (files.length === 0) {
    console.log(chalk.yellow('No markdown files found in module'));
    return;
  }

  // Apply search filter if provided
  let searchResults: Array<{file: any, matches: Array<{line: number, text: string, context: string[]}>}> = [];

  if (options.search) {
    searchResults = performSearch(files, options.search);

    if (searchResults.length === 0) {
      console.log(chalk.yellow(`No matches found for: "${options.search}"`));
      return;
    }
  }

  // Handle search results display
  if (options.search && searchResults.length > 0) {
    displaySearchResults(module, searchResults, options);
    return;
  }

  // Handle JSON output format
  if (options.json || options.format === 'json') {
    const jsonOutput = {
      module: module.fullName,
      fileCount: files.length,
      files: files.map(f => ({
        path: f.relativePath,
        size: f.size,
        modified: f.modified,
        type: f.type
      })),
      content: files.map(f => {
        let content = fs.readFileSync(f.path, 'utf-8');
        if (options.secure) {
          content = redactSensitiveData(content, false);
        }
        return {
          file: f.relativePath,
          content: content
        };
      })
    };
    console.log(JSON.stringify(jsonOutput, null, 2));

    // Log redactions summary if secure mode is enabled
    if (options.secure) {
      console.error(chalk.yellow('\n⚠️  Sensitive data has been redacted from output'));
    }

    return;
  }

  // Handle Markdown output format
  if (options.format === 'markdown') {
    console.log(`# ${module.fullName}\n`);
    console.log(`**Module Type:** ${module.metadata.type}\n`);
    console.log(`**Version:** ${module.metadata.version}\n`);

    if (options.secure) {
      console.log(`**Security:** Sensitive data redacted\n`);
    }

    console.log(`---\n`);

    for (const file of files) {
      console.log(`## ${file.relativePath}\n`);
      let content = fs.readFileSync(file.path, 'utf-8');
      if (options.secure) {
        content = redactSensitiveData(content, false);
      }
      console.log(content);
      console.log('\n---\n');
    }

    if (options.secure) {
      console.log(`\n> ⚠️ Sensitive data has been redacted from this output\n`);
    }

    return;
  }

  // Handle plain text output format (ASCII-only, no colors)
  if (options.format === 'text') {
    console.log();
    console.log(`Aggregated Content: ${module.fullName}`);
    console.log('='.repeat(60));
    console.log();
    console.log(`Files: ${files.length}`);

    if (options.secure) {
      console.log('Security: Sensitive data redacted');
    }

    console.log();

    for (const file of files) {
      console.log(`File: ${file.relativePath}`);
      console.log(`Size: ${formatBytes(file.size)} | Modified: ${formatDate(file.modified)}`);
      console.log('-'.repeat(60));
      console.log();

      let content = fs.readFileSync(file.path, 'utf-8');
      if (options.secure) {
        content = redactSensitiveData(content, false);
      }
      console.log(content);
      console.log();
      console.log('='.repeat(60));
      console.log();
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    console.log('Summary:');
    console.log(`  Total files:  ${files.length}`);
    console.log(`  Total size:   ${formatBytes(totalSize)}`);

    if (options.secure) {
      console.log();
      console.log('WARNING: Sensitive data has been redacted from this output');
    }

    console.log();
    return;
  }

  // Colored text output format (default)
  console.log();
  console.log(chalk.bold.blue(`📄 Aggregated Content: ${module.fullName}`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  // Apply pagination if requested
  const pageSize = options.pageSize || 10;
  const currentPage = options.page || 1;
  const totalPages = Math.ceil(files.length / pageSize);

  let filesToDisplay = files;
  let paginationInfo = '';

  if (options.page) {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, files.length);
    filesToDisplay = files.slice(startIndex, endIndex);
    paginationInfo = ` (Page ${currentPage} of ${totalPages})`;
  }

  console.log(chalk.bold(`Files: ${files.length}${paginationInfo}`));

  if (options.secure) {
    console.log(chalk.yellow('🔒 Security: Sensitive data redacted'));
  }

  console.log();

  // Display each file with section headers
  for (const file of filesToDisplay) {
    console.log(chalk.bold.cyan(`┌─ ${file.relativePath}`));
    console.log(chalk.gray(`│  Size: ${formatBytes(file.size)} | Modified: ${formatDate(file.modified)}`));
    console.log(chalk.bold.cyan('└' + '─'.repeat(58)));
    console.log();

    let content = fs.readFileSync(file.path, 'utf-8');

    if (options.secure) {
      content = redactSensitiveData(content, false);
    }

    // Preserve markdown formatting
    console.log(content);
    console.log();
    console.log(chalk.gray('─'.repeat(60)));
    console.log();
  }

  // Summary
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  console.log(chalk.bold('Summary:'));
  console.log(chalk.gray(`  Total files:  ${files.length}`));
  console.log(chalk.gray(`  Displayed:    ${filesToDisplay.length}`));
  console.log(chalk.gray(`  Total size:   ${formatBytes(totalSize)}`));

  if (options.page && totalPages > 1) {
    console.log();
    console.log(chalk.bold('Pagination:'));
    console.log(chalk.gray(`  Current page: ${currentPage} of ${totalPages}`));

    if (currentPage < totalPages) {
      console.log(chalk.cyan(`  Next page:    augx show module ${module.fullName} --content --page ${currentPage + 1}`));
    }
    if (currentPage > 1) {
      console.log(chalk.cyan(`  Prev page:    augx show module ${module.fullName} --content --page ${currentPage - 1}`));
    }
  }

  if (options.secure) {
    console.log();
    console.log(chalk.yellow('⚠️  Sensitive data has been redacted from this output'));
  }

  console.log();
}

/**
 * Display individual file content with line numbers and optional syntax highlighting
 */
async function showModuleFile(module: Module, filePath: string, options: ShowModuleOptions): Promise<void> {
  // Resolve file path (support both absolute and relative paths)
  let fullPath: string;

  if (path.isAbsolute(filePath)) {
    fullPath = filePath;
  } else {
    // Try relative to module path
    fullPath = path.join(module.path, filePath);
  }

  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    console.error(chalk.red(`File not found: ${filePath}`));
    console.log(chalk.gray(`\nSearched in: ${fullPath}`));
    console.log(chalk.gray(`Module path: ${module.path}`));
    process.exit(1);
  }

  // Handle --open flag: Open file in VS Code editor
  if (options.open) {
    try {
      if (!isVSCodeAvailable()) {
        console.error(chalk.red('VS Code CLI is not available. Please install VS Code and ensure "code" is in your PATH.'));
        process.exit(1);
      }
      await openInEditor(fullPath);
      console.log(chalk.green(`✓ Opened ${path.basename(fullPath)} in VS Code editor`));
      return;
    } catch (error) {
      console.error(chalk.red(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  }

  // Handle --preview flag: Open file in VS Code preview pane
  if (options.preview) {
    try {
      if (!isVSCodeAvailable()) {
        console.error(chalk.red('VS Code CLI is not available. Please install VS Code and ensure "code" is in your PATH.'));
        process.exit(1);
      }
      await openInPreview(fullPath);
      console.log(chalk.green(`✓ Opened ${path.basename(fullPath)} in VS Code preview pane`));
      return;
    } catch (error) {
      console.error(chalk.red(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  }

  const stats = fs.statSync(fullPath);
  const fileSizeThreshold = 1024 * 1024; // 1MB threshold for streaming

  // Use streaming for large files
  let content: string;
  if (stats.size > fileSizeThreshold) {
    // Show progress for large files
    const spinner = new Spinner(`Reading large file (${formatBytes(stats.size)})...`);
    spinner.start();

    try {
      // Stream large files
      const chunks: string[] = [];
      await readFileStreaming(
        fullPath,
        async (chunk, streamStats) => {
          chunks.push(chunk);
          const progress = (streamStats.bytesRead / stats.size) * 100;
          spinner.setText(`Reading large file: ${progress.toFixed(1)}% (${formatBytes(streamStats.bytesRead)}/${formatBytes(stats.size)})`);
        },
        { highWaterMark: 64 * 1024 }
      );
      content = chunks.join('');
      spinner.stop(chalk.green('✓ File loaded successfully'));
    } catch (error) {
      spinner.stop(chalk.red('✗ Failed to read file'));
      throw error;
    }
  } else {
    // Read small files normally
    content = fs.readFileSync(fullPath, 'utf-8');
  }

  // Apply redaction if secure flag is set
  if (options.secure) {
    content = redactSensitiveData(content, true);
  }

  const lines = content.split('\n');

  // Get relative path for display
  const relativePath = path.relative(module.path, fullPath);

  // Handle JSON output format
  if (options.json || options.format === 'json') {
    const jsonOutput = {
      module: module.fullName,
      file: relativePath,
      path: fullPath,
      size: stats.size,
      modified: stats.mtime,
      lines: lines.length,
      content: content
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Handle Markdown output format
  if (options.format === 'markdown') {
    console.log(`# ${relativePath}\n`);
    console.log(`**Module:** ${module.fullName}\n`);
    console.log(`**Size:** ${formatBytes(stats.size)} | **Lines:** ${lines.length}\n`);
    console.log('```');
    console.log(content);
    console.log('```');
    return;
  }

  // Handle plain text output format (ASCII-only, no colors, no line numbers)
  if (options.format === 'text') {
    console.log();
    console.log(`File: ${relativePath}`);
    console.log('='.repeat(60));
    console.log();
    console.log('File Information:');
    console.log(`  Module:   ${module.fullName}`);
    console.log(`  Path:     ${relativePath}`);
    console.log(`  Size:     ${formatBytes(stats.size)}`);
    console.log(`  Lines:    ${lines.length}`);
    console.log(`  Modified: ${formatDate(stats.mtime)}`);

    const detectedLang = detectLanguage(fullPath);
    if (detectedLang) {
      console.log(`  Language: ${detectedLang}`);
    }
    console.log();

    console.log('Content:');
    console.log('-'.repeat(60));
    console.log();
    console.log(content);
    console.log();
    console.log('='.repeat(60));
    console.log();
    return;
  }

  // Colored text output format (default) with line numbers
  const workspaceRoot = getWorkspaceRoot();
  const clickablePath = formatClickablePath(fullPath, { workspaceRoot });

  console.log();
  console.log(chalk.bold.blue(`📄 ${relativePath}`));
  console.log(chalk.gray(`   ${clickablePath}`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  console.log(chalk.bold('File Information:'));
  console.log(chalk.gray(`  Module:   ${module.fullName}`));
  console.log(chalk.gray(`  Path:     ${relativePath}`));
  console.log(chalk.gray(`  Full:     ${clickablePath}`));
  console.log(chalk.gray(`  Size:     ${formatBytes(stats.size)}`));
  console.log(chalk.gray(`  Lines:    ${lines.length}`));
  console.log(chalk.gray(`  Modified: ${formatDate(stats.mtime)}`));

  // Display detected language
  const detectedLang = detectLanguage(fullPath);
  if (detectedLang) {
    console.log(chalk.gray(`  Language: ${detectedLang}`));
  }
  console.log();

  console.log(chalk.bold('Content:'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  // Apply syntax highlighting if enabled (default: enabled)
  const enableHighlighting = options.format !== 'text' && process.stdout.isTTY;

  if (enableHighlighting && detectedLang) {
    // Try to apply syntax highlighting
    try {
      const highlighted = applySyntaxHighlighting(content, fullPath, true);
      const highlightedLines = highlighted.split('\n');

      // Display with line numbers
      const lineNumberWidth = highlightedLines.length.toString().length;
      highlightedLines.forEach((line, index) => {
        const lineNumber = (index + 1).toString().padStart(lineNumberWidth, ' ');
        console.log(chalk.gray(`${lineNumber} │ `) + line);
      });
    } catch (error) {
      // Fallback to plain display if highlighting fails
      const lineNumberWidth = lines.length.toString().length;
      lines.forEach((line, index) => {
        const lineNumber = (index + 1).toString().padStart(lineNumberWidth, ' ');
        console.log(chalk.gray(`${lineNumber} │ `) + line);
      });
    }
  } else {
    // Display content with line numbers (no highlighting)
    const lineNumberWidth = lines.length.toString().length;
    lines.forEach((line, index) => {
      const lineNumber = (index + 1).toString().padStart(lineNumberWidth, ' ');
      console.log(chalk.gray(`${lineNumber} │ `) + line);
    });
  }

  console.log();
  console.log(chalk.gray('─'.repeat(60)));
  console.log();
}

/**
 * Display search results with highlighting and context
 */
function displaySearchResults(
  module: Module,
  searchResults: Array<{file: any, matches: Array<{line: number, text: string, context: string[]}>}>,
  options: ShowModuleOptions
): void {
  const searchTerm = options.search || '';

  // JSON output
  if (options.json || options.format === 'json') {
    const jsonOutput = {
      module: module.fullName,
      searchTerm: searchTerm,
      totalMatches: searchResults.reduce((sum, r) => sum + r.matches.length, 0),
      results: searchResults.map(r => ({
        file: r.file.relativePath,
        matchCount: r.matches.length,
        matches: r.matches.map(m => ({
          line: m.line,
          text: m.text
        }))
      }))
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  // Text output
  console.log();
  console.log(chalk.bold.blue(`🔍 Search Results: "${searchTerm}"`));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  const totalMatches = searchResults.reduce((sum, r) => sum + r.matches.length, 0);
  console.log(chalk.bold(`Found ${totalMatches} matches in ${searchResults.length} files`));
  console.log();

  for (const result of searchResults) {
    console.log(chalk.bold.cyan(`📄 ${result.file.relativePath}`));
    console.log(chalk.gray(`   ${result.matches.length} matches`));
    console.log();

    for (const match of result.matches) {
      console.log(chalk.gray(`   Line ${match.line}:`));
      console.log('   ' + highlightSearchTerm(match.text, searchTerm));
      console.log();
    }

    console.log(chalk.gray('─'.repeat(60)));
    console.log();
  }

  console.log(chalk.bold('Summary:'));
  console.log(chalk.gray(`  Total matches: ${totalMatches}`));
  console.log(chalk.gray(`  Files with matches: ${searchResults.length}`));
  console.log();
}

/**
 * Perform search within module files
 */
function performSearch(
  files: any[],
  searchTerm: string
): Array<{file: any, matches: Array<{line: number, text: string, context: string[]}>}> {
  const results: Array<{file: any, matches: Array<{line: number, text: string, context: string[]}>}> = [];
  const searchLower = searchTerm.toLowerCase();

  for (const file of files) {
    const content = fs.readFileSync(file.path, 'utf-8');
    const lines = content.split('\n');
    const matches: Array<{line: number, text: string, context: string[]}> = [];

    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(searchLower)) {
        // Get context lines (2 before, 2 after)
        const contextBefore = lines.slice(Math.max(0, index - 2), index);
        const contextAfter = lines.slice(index + 1, Math.min(lines.length, index + 3));

        matches.push({
          line: index + 1,
          text: line,
          context: [...contextBefore, line, ...contextAfter]
        });
      }
    });

    if (matches.length > 0) {
      results.push({ file, matches });
    }
  }

  return results;
}

/**
 * Highlight search term in text
 */
function highlightSearchTerm(text: string, searchTerm: string): string {
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, chalk.yellow.bold('$1'));
}

/**
 * Apply syntax highlighting to code content
 * Detects language from file extension and applies appropriate highlighting
 */
function applySyntaxHighlighting(content: string, filePath: string, enableColors: boolean = true): string {
  if (!enableColors) {
    return content;
  }

  try {
    // Detect language from file extension
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.sh': 'bash',
      '.ps1': 'powershell',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sql': 'sql'
    };

    const language = languageMap[ext];

    if (language) {
      const highlighted = hljs.highlight(content, { language, ignoreIllegals: true });
      return highlighted.value;
    }

    // Auto-detect if no extension match
    const autoDetected = hljs.highlightAuto(content);
    return autoDetected.value;

  } catch (error) {
    // If highlighting fails, return original content
    return content;
  }
}

/**
 * Convert ANSI color codes from highlight.js to chalk colors
 * This is a simplified version - highlight.js uses HTML-like tags
 */
function convertHighlightToChalk(highlightedCode: string): string {
  // highlight.js returns HTML-like output, we need to convert to terminal colors
  // For now, return as-is since we're using it in terminal context
  // A more sophisticated implementation would parse the HTML and apply chalk colors
  return highlightedCode;
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript (JSX)',
    '.tsx': 'TypeScript (TSX)',
    '.py': 'Python',
    '.php': 'PHP',
    '.rb': 'Ruby',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.c': 'C',
    '.cpp': 'C++',
    '.cs': 'C#',
    '.sh': 'Bash',
    '.ps1': 'PowerShell',
    '.md': 'Markdown',
    '.json': 'JSON',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.xml': 'XML',
    '.html': 'HTML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.sql': 'SQL'
  };

  return languageMap[ext] || null;
}

/**
 * Get similar modules for legacy showCommand
 * @deprecated Use getModuleSuggestions from module-system instead
 */
async function getSimilarModules(searchTerm: string): Promise<string[]> {
  const suggestions = getModuleSuggestions(searchTerm, 5);
  return suggestions.map(m => m.fullName);
}

/**
 * Redaction patterns for sensitive data
 */
const REDACTION_PATTERNS = [
  // API Keys
  { pattern: /\b([A-Za-z0-9_-]*API[_-]?KEY[_-]?[A-Za-z0-9_-]*)\s*[:=]\s*['"]?([A-Za-z0-9_\-\/+=]{16,})['"]?/gi, name: 'API_KEY' },
  { pattern: /\b(api[_-]?key)\s*[:=]\s*['"]?([A-Za-z0-9_\-\/+=]{16,})['"]?/gi, name: 'API_KEY' },

  // Secrets
  { pattern: /\b([A-Za-z0-9_-]*SECRET[_-]?[A-Za-z0-9_-]*)\s*[:=]\s*['"]?([A-Za-z0-9_\-\/+=]{16,})['"]?/gi, name: 'SECRET' },
  { pattern: /\b(secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-\/+=]{16,})['"]?/gi, name: 'SECRET' },

  // Tokens
  { pattern: /\b([A-Za-z0-9_-]*TOKEN[_-]?[A-Za-z0-9_-]*)\s*[:=]\s*['"]?([A-Za-z0-9_\-\/+=]{16,})['"]?/gi, name: 'TOKEN' },
  { pattern: /\b(token)\s*[:=]\s*['"]?([A-Za-z0-9_\-\/+=]{16,})['"]?/gi, name: 'TOKEN' },
  { pattern: /\b(bearer)\s+([A-Za-z0-9_\-\/+=]{16,})/gi, name: 'BEARER_TOKEN' },

  // Passwords
  { pattern: /\b([A-Za-z0-9_-]*PASSWORD[_-]?[A-Za-z0-9_-]*)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi, name: 'PASSWORD' },
  { pattern: /\b(password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi, name: 'PASSWORD' },

  // Private Keys
  { pattern: /(-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/gi, name: 'PRIVATE_KEY' },

  // AWS Keys
  { pattern: /\b(AKIA[0-9A-Z]{16})\b/g, name: 'AWS_ACCESS_KEY' },
  { pattern: /\b([A-Za-z0-9/+=]{40})\b/g, name: 'AWS_SECRET_KEY' },

  // GitHub Tokens
  { pattern: /\b(ghp_[A-Za-z0-9]{36})\b/g, name: 'GITHUB_TOKEN' },
  { pattern: /\b(gho_[A-Za-z0-9]{36})\b/g, name: 'GITHUB_OAUTH' },
  { pattern: /\b(ghu_[A-Za-z0-9]{36})\b/g, name: 'GITHUB_USER_TOKEN' },
  { pattern: /\b(ghs_[A-Za-z0-9]{36})\b/g, name: 'GITHUB_SERVER_TOKEN' },
  { pattern: /\b(ghr_[A-Za-z0-9]{36})\b/g, name: 'GITHUB_REFRESH_TOKEN' },

  // Generic credentials
  { pattern: /\b(credentials?)\s*[:=]\s*['"]?([^\s'"]{16,})['"]?/gi, name: 'CREDENTIALS' },
  { pattern: /\b(auth)\s*[:=]\s*['"]?([A-Za-z0-9_\-\/+=]{16,})['"]?/gi, name: 'AUTH' }
];

/**
 * Redact sensitive data from content
 */
function redactSensitiveData(content: string, logRedactions: boolean = false): string {
  let redactedContent = content;
  const redactions: Array<{pattern: string, count: number}> = [];

  for (const { pattern, name } of REDACTION_PATTERNS) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      redactedContent = redactedContent.replace(pattern, (match, ...args) => {
        // For patterns with capture groups, preserve the key name but redact the value
        if (args.length >= 2) {
          const keyName = args[0];
          return `${keyName}=[REDACTED_${name}]`;
        }
        // For patterns without capture groups, redact the entire match
        return `[REDACTED_${name}]`;
      });

      if (logRedactions) {
        redactions.push({ pattern: name, count: matches.length });
      }
    }
  }

  // Log redactions if requested
  if (logRedactions && redactions.length > 0) {
    console.log(chalk.yellow('\n⚠️  Sensitive data redacted:'));
    for (const { pattern, count } of redactions) {
      console.log(chalk.gray(`   ${pattern}: ${count} occurrence(s)`));
    }
    console.log();
  }

  return redactedContent;
}

/**
 * Show all linked modules
 */
export async function showLinkedCommand(options: ShowListOptions): Promise<void> {
  try {
    const linkedModules = getLinkedModules();

    if (options.json) {
      console.log(JSON.stringify(linkedModules, null, 2));
      return;
    }

    if (linkedModules.length === 0) {
      console.log(chalk.yellow('No linked modules found.'));
      console.log(chalk.gray('\nUse "augx link <module>" to link modules.'));
      console.log(chalk.gray('Use "augx list" to see all available modules.'));
      return;
    }

    console.log(chalk.bold.blue('\n📦 Linked Modules:\n'));

    linkedModules.forEach((module) => {
      console.log(chalk.green('✓') + ' ' + chalk.bold(module.name) + ' ' + chalk.gray(`(v${module.version})`));
      console.log(`  ${chalk.gray(module.description)}`);
      console.log(`  ${chalk.cyan(`Type: ${module.type}`)}\n`);
    });

    console.log(chalk.gray(`Total: ${linkedModules.length} linked module(s)\n`));
  } catch (error) {
    console.error(chalk.red('Error showing linked modules:'), error);
    process.exit(1);
  }
}

/**
 * Show all available modules
 */
export async function showAllCommand(options: ShowListOptions): Promise<void> {
  try {
    const allModules = await getAllModules();

    if (options.json) {
      console.log(JSON.stringify(allModules, null, 2));
      return;
    }

    if (allModules.length === 0) {
      console.log(chalk.yellow('No modules available.'));
      return;
    }

    console.log(chalk.bold.blue('\n📦 All Available Modules:\n'));

    allModules.forEach((module) => {
      const status = module.linked ? chalk.green('✓') : chalk.gray('○');
      console.log(`${status} ${chalk.bold(module.name)} ${chalk.gray(`(v${module.version})`)}`);
      console.log(`  ${chalk.gray(module.description)}`);
      console.log(`  ${chalk.cyan(`Type: ${module.type}`)}\n`);
    });

    const linkedCount = allModules.filter(m => m.linked).length;
    console.log(chalk.gray(`Total: ${allModules.length} module(s) (${linkedCount} linked)\n`));
  } catch (error) {
    console.error(chalk.red('Error showing modules:'), error);
    process.exit(1);
  }
}

/**
 * Get linked modules from extensions.json
 */
function getLinkedModules(): ModuleListItem[] {
  const configPath = path.join(process.cwd(), '.augment', 'extensions.json');

  if (!fs.existsSync(configPath)) {
    return [];
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return (config.modules || []).map((m: any) => ({
      name: m.name,
      version: m.version,
      description: m.description,
      type: m.type,
      linked: true
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Get all available modules with linked status
 */
async function getAllModules(): Promise<ModuleListItem[]> {
  // Check for linked modules in current project
  const linkedModules = getLinkedModules();

  return discoverModules().map(module => ({
    name: module.fullName,
    version: module.metadata.version,
    description: module.metadata.description,
    type: module.metadata.type,
    linked: linkedModules.some(m => m.name === module.fullName)
  }));
}

/**
 * Handle AI prompt generation
 */
async function handleAIPrompt(module: Module, promptType: string): Promise<void> {
  const templates = getPromptTemplates();
  const template = templates.find(t => t.name === promptType);

  if (!template) {
    console.error(chalk.red(`Unknown prompt template: ${promptType}`));
    console.log(chalk.yellow('\nAvailable templates:'));
    templates.forEach(t => {
      console.log(chalk.cyan(`  • ${t.name}: ${t.description}`));
    });
    process.exit(1);
  }

  const prompt = template.generate(module);
  console.log(prompt);
}

/**
 * Handle AI summary generation
 */
async function handleAISummary(module: Module, options: ShowModuleOptions): Promise<void> {
  if (options.json) {
    const summary = generateJSONSummary(module);
    console.log(summary);
  } else if (options.compact) {
    const summary = generateCompactSummary(module);
    console.log(summary);
  } else {
    const summary = generateDetailedSummary(module, options.content);
    console.log(summary);
  }
}

/**
 * Handle AI context generation
 */
async function handleAIContext(module: Module): Promise<void> {
  const context = generateAIContext(module);
  console.log(context);
}
