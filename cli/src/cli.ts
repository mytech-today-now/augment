#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { showCommand, showModuleCommand, showLinkedCommand, showAllCommand } from './commands/show';
import { showCompletedCommand } from './commands/showCompleted';
import { linkCommand } from './commands/link';
import { updateCommand } from './commands/update';
import { searchCommand } from './commands/search';
import { useCommand } from './commands/use';
import { upgradeCommand } from './commands/upgrade';
import { versionInfoCommand } from './commands/version-info';
import {
  createCommand,
  pinCommand,
  checkUpdatesCommand,
  diffCommand
} from './commands/module-management';
import { coordSpecsCommand, coordTasksCommand, coordRulesCommand, coordFileCommand } from './commands/coord';
import { syncBeadsCommand, syncOpenSpecCommand, syncAllCommand, syncWatchCommand } from './commands/sync';
import { migrateExistingData } from './utils/migrate';
import { validateCommand } from './commands/validate';
import { catalogCommand, catalogHookCommand } from './commands/catalog';
import { installRulesCommand } from './commands/install-rules';
import { guiCommand } from './commands/gui';
import { unlinkCommand } from './commands/unlink';
import { selfRemoveCommand } from './commands/self-remove';
import {
  skillListCommand,
  skillShowCommand,
  skillValidateCommand,
  skillSearchCommand,
  skillExecCommand,
  skillInjectCommand,
  skillLoadBatchCommand,
  skillCacheClearCommand,
  skillCacheStatsCommand,
  skillCreateMcpCommand
} from './commands/skill';
import {
  mcpListCommand,
  mcpAddCommand,
  mcpRemoveCommand,
  mcpExecCommand,
  mcpWrapCommand,
  mcpDiscoverCommand,
  mcpGenerateCLICommand
} from './commands/mcp';
import { codeAnalysisCommand } from './commands/code-analysis';
import { exportCommand } from './commands/export';

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8').replace(/^\uFEFF/, '')
);

const program = new Command();

program
  .name('augx')
  .description('CLI tool for managing Augment Code AI extension modules')
  .version(packageJson.version);

// Init command with subcommands
const initCmd = program
  .command('init')
  .description('Initialize Augment Extensions in current project (includes Beads integration if .beads/ exists)')
  .option('--from-submodule', 'Initialize from existing submodule')
  .option('-y, --yes', 'Accept defaults for all optional-rule prompts (non-interactive)')
  .option('--no-optional-rules', 'Skip the optional-rule prompts entirely (install nothing optional)')
  .action(initCommand);

// Init beads subcommand
initCmd
  .command('beads')
  .description('Initialize Beads task tracking in current project')
  .action(() => {
    const fs = require('fs');
    const path = require('path');
    const chalk = require('chalk');

    console.log(chalk.blue('\nðŸ“‹ Initializing Beads task tracking...\n'));

    const beadsDir = path.join(process.cwd(), '.beads');
    const beadsIssuesPath = path.join(beadsDir, 'issues.jsonl');
    const beadsConfigPath = path.join(beadsDir, 'config.json');
    const scriptsDir = path.join(process.cwd(), 'scripts');
    const completedPath = path.join(scriptsDir, 'completed.jsonl');

    // Create .beads directory
    if (!fs.existsSync(beadsDir)) {
      fs.mkdirSync(beadsDir, { recursive: true });
      console.log(chalk.green('âœ“ Created .beads directory'));
    } else {
      console.log(chalk.gray('â€¢ .beads directory already exists'));
    }

    // Create issues.jsonl
    if (!fs.existsSync(beadsIssuesPath)) {
      fs.writeFileSync(beadsIssuesPath, '', 'utf-8');
      console.log(chalk.green('âœ“ Created .beads/issues.jsonl'));
    } else {
      console.log(chalk.gray('â€¢ .beads/issues.jsonl already exists'));
    }

    // Create config.json
    if (!fs.existsSync(beadsConfigPath)) {
      const beadsConfig = {
        version: '1.0.0',
        project: path.basename(process.cwd()),
        created: new Date().toISOString()
      };
      fs.writeFileSync(beadsConfigPath, JSON.stringify(beadsConfig, null, 2), 'utf-8');
      console.log(chalk.green('âœ“ Created .beads/config.json'));
    } else {
      console.log(chalk.gray('â€¢ .beads/config.json already exists'));
    }

    // Create scripts directory
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
      console.log(chalk.green('âœ“ Created scripts directory'));
    } else {
      console.log(chalk.gray('â€¢ scripts directory already exists'));
    }

    // Create completed.jsonl
    if (!fs.existsSync(completedPath)) {
      fs.writeFileSync(completedPath, '', 'utf-8');
      console.log(chalk.green('âœ“ Created scripts/completed.jsonl'));
    } else {
      console.log(chalk.gray('â€¢ scripts/completed.jsonl already exists'));
    }

    console.log(chalk.green('\nâœ“ Beads initialization complete!\n'));
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.cyan('  â€¢ Create tasks: bd create "Task title" -p 1'));
    console.log(chalk.cyan('  â€¢ List tasks: bd list'));
    console.log(chalk.cyan('  â€¢ Close tasks: bd close <task-id>'));
    console.log(chalk.cyan('  â€¢ View completed: augx show completed\n'));
  });

program
  .command('gui')
  .description('Launch interactive GUI for module management')
  .action(guiCommand);

program
  .command('list')
  .description('List available or linked extension modules')
  .option('--linked', 'Show only linked modules')
  .option('--json', 'Output as JSON')
  .option('--versions', 'Show available versions for each module')
  .action(listCommand);

// Show dispatcher for module inspection and legacy shortcuts
program
  .command('show <command> [module-name] [file-path]')
  .description('Display module information with "show module <module-name> [file-path]" or the "completed", "linked", and "all" shortcuts')
  .option('--json', 'Output as JSON')
  .option('--content', 'Display aggregated content from all module files')
  .option('--format <format>', 'Output format: json, markdown, text', 'text')
  .option('--depth <number>', 'Recursion depth for submodules (max 5)', '1')
  .option('--filter <pattern>', 'Filter files by glob pattern (e.g., "*.md")')
  .option('--search <term>', 'Search within module content')
  .option('--page <number>', 'Page number for paginated output', parseInt)
  .option('--page-size <number>', 'Number of items per page (default: 10)', parseInt)
  .option('--secure', 'Redact sensitive data (API keys, secrets, tokens, passwords)')
  .option('--no-cache', 'Disable caching for this inspection')
  .option('--open', 'Open file in VS Code editor')
  .option('--preview', 'Open file in VS Code preview pane')
  .option('--since <date>', 'Filter completed tasks since date (ISO 8601 format, e.g., 2026-01-01)')
  .option('--until <date>', 'Filter completed tasks until date (ISO 8601 format, e.g., 2026-12-31)')
  .option('--limit <number>', 'Limit number of completed tasks shown', parseInt)
  .option('--search <term>', 'Search completed tasks by title, description, or close reason')
  .option('--labels <labels>', 'Filter completed tasks by labels (comma-separated)')
  .option('--type <type>', 'Filter completed tasks by issue type (e.g., task, epic, bug)')
  .option('--priority <number>', 'Filter completed tasks by priority (0-3)', parseInt)
  .option('--assignee <email>', 'Filter completed tasks by assignee/owner')
  .option('--sort <field>', 'Sort completed tasks by: date, title, priority (default: date)')
  .option('--order <order>', 'Sort order: asc, desc (default: desc)')
  .option('--verbose', 'Show detailed information for completed tasks')
  .option('--quiet', 'Only output task IDs (one per line)')
  .action((command: string, moduleName: string | undefined, filePath: string | undefined, options: any) => {
    // Handle special subcommands
    if (command === 'completed') {
      showCompletedCommand(options);
      return;
    }
    if (command === 'linked') {
      showLinkedCommand(options);
      return;
    }
    if (command === 'all') {
      showAllCommand(options);
      return;
    }

    if (command === 'module') {
      showModuleCommand(moduleName, filePath, options);
      return;
    }

    // Preserve the legacy `augx show <module>` fallback for existing workflows.
    if (moduleName) {
      showModuleCommand(command, moduleName, options);
      return;
    }

    // Otherwise use the basic showCommand.
    showCommand(command, options);
  });

program
  .command('use <module>')
  .description('Select and load a specific module version')
  .option('--version <version>', 'Specific version to use (default: latest)')
  .option('--pin', 'Pin the version to project config')
  .option('--json', 'Output as JSON')
  .action(useCommand);

program
  .command('upgrade <module>')
  .description('Upgrade module to latest version')
  .option('--force', 'Force upgrade even with compatibility errors')
  .option('--dry-run', 'Show what would be upgraded without making changes')
  .option('--json', 'Output as JSON')
  .action(upgradeCommand);

program
  .command('version-info <module>')
  .description('Show detailed version information')
  .option('--json', 'Output as JSON')
  .option('--no-changelog', 'Skip changelog display')
  .option('--no-compatibility', 'Skip compatibility check')
  .action(versionInfoCommand);

program
  .command('link <module>')
  .description('Link an extension module to current project')
  .option('--version <version>', 'Specific version to link')
  .option(
    '--mirror <tools>',
    'Mirror the module into native tool locations (claude-code, cursor, windsurf, copilot, all - comma-separated)'
  )
  .option('--verbose', 'Log materialization mode (symlink vs copy) for each file')
  .action(linkCommand);

program
  .command('unlink <module>')
  .description('Unlink an extension module or collection from current project')
  .option('--force', 'Force unlink even if other modules depend on it')
  .action(unlinkCommand);

program
  .command('update')
  .description('Update CLI and/or linked modules to latest versions')
  .option('--module <name>', 'Update specific module only')
  .option('--cli', 'Update the CLI itself to the latest version')
  .option('--all', 'Update both CLI and all linked modules')
  .action(updateCommand);

program
  .command('search <keyword>')
  .description('Search for extension modules')
  .option('--type <type>', 'Filter by module type')
  .action(searchCommand);

program
  .command('create <name>')
  .description('Create a new extension module')
  .option('--type <type>', 'Module type (coding-standards, domain-rules, workflows, examples, marketing-standards, writing-standards, themes)')
  .action(createCommand);

program
  .command('validate <module>')
  .description('Validate module structure and metadata')
  .option('--verbose', 'Show detailed validation information')
  .action(validateCommand);

program
  .command('pin <module> <version>')
  .description('Pin module to specific version')
  .action(pinCommand);

program
  .command('check-updates')
  .description('Check for available module updates')
  .action(checkUpdatesCommand);

program
  .command('self-remove')
  .description('Completely remove all Augment Extensions from the project')
  .option('--dry-run', 'Preview what would be removed without actually removing')
  .option('--force', 'Skip confirmation prompts')
  .action(selfRemoveCommand);

program
  .command('diff <module>')
  .description('Show differences between current and latest version')
  .action(diffCommand);

program
  .command('catalog')
  .description('Update MODULES.md catalog with all available modules')
  .option('--output <path>', 'Output path for catalog file')
  .option('--check', 'Check if catalog is out of date (exit 1 if outdated)')
  .option('--auto', 'Auto-update only if out of date')
  .action(catalogCommand);

program
  .command('catalog-hook')
  .description('Setup git hook for automatic catalog updates')
  .option('--remove', 'Remove catalog auto-update from git hook')
  .option('--type <type>', 'Hook type: pre-commit or post-commit (default: pre-commit)')
  .action(catalogHookCommand);

program
  .command('install-rules')
  .description('Install character count management rule to .augment/rules')
  .option('--quiet', 'Suppress output messages')
  .option('--setup-hooks', 'Setup automatic rule installation hooks')
  .option('--remove-hooks', 'Remove automatic rule installation hooks')
  .option('--git-hook-type <type>', 'Git hook type: post-checkout or post-merge (default: post-checkout)')
  .option('--force', 'Force replace existing rule even if content differs')
  .option('--interactive', 'Prompt for conflict resolution when rule exists with different content')
  .action(installRulesCommand);

// Coordination commands
const coordCommand = program
  .command('coord')
  .description('Query coordination manifest data');

coordCommand
  .command('specs')
  .description('List all active specs')
  .option('--json', 'Output as JSON')
  .action(coordSpecsCommand);

coordCommand
  .command('tasks <spec-id>')
  .description('List tasks for a specific spec')
  .option('--json', 'Output as JSON')
  .action(coordTasksCommand);

coordCommand
  .command('rules <task-id>')
  .description('List rules for a specific task')
  .option('--json', 'Output as JSON')
  .action(coordRulesCommand);

coordCommand
  .command('file <path>')
  .description('Show coordination info for a specific file')
  .option('--json', 'Output as JSON')
  .action(coordFileCommand);

// Sync commands
const syncCommand = program
  .command('sync')
  .description('Sync Beads and OpenSpec with coordination manifest');

syncCommand
  .command('beads')
  .description('Sync Beads tasks to coordination manifest')
  .action(syncBeadsCommand);

syncCommand
  .command('openspec')
  .description('Sync OpenSpec specs to coordination manifest')
  .action(syncOpenSpecCommand);

syncCommand
  .command('all')
  .description('Sync both Beads and OpenSpec')
  .action(syncAllCommand);

syncCommand
  .command('watch')
  .description('Watch for changes and auto-sync')
  .action(syncWatchCommand);

program
  .command('migrate')
  .description('Migrate existing Beads and OpenSpec data to coordination system')
  .action(() => {
    try {
      console.log(chalk.blue('Migrating existing data to coordination system...\n'));
      const result = migrateExistingData();

      console.log(chalk.green.bold('\nâœ“ Migration complete!'));
      console.log(chalk.gray(`Backup created at: ${result.backup}`));
      console.log(chalk.gray(`\nBeads: ${result.beads.added} added, ${result.beads.updated} updated, ${result.beads.removed} removed`));
      console.log(chalk.gray(`OpenSpec: ${result.openspec.added} added, ${result.openspec.updated} updated, ${result.openspec.removed} removed`));
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Skill commands
const skillCommand = program.command('skill').description('Manage skills');

skillCommand
  .command('list')
  .description('List all available skills')
  .option('--category <category>', 'Filter by category')
  .option('--json', 'Output as JSON')
  .action(skillListCommand);

skillCommand
  .command('show <skillId>')
  .description('Show skill details')
  .option('--json', 'Output as JSON')
  .action(skillShowCommand);

skillCommand
  .command('validate <skillId>')
  .description('Validate skill file')
  .action(skillValidateCommand);

skillCommand
  .command('search <query>')
  .description('Search skills by tags or keywords')
  .option('--json', 'Output as JSON')
  .action(skillSearchCommand);

skillCommand
  .command('exec <skillId> [args...]')
  .description('Execute a skill\'s CLI command')
  .action(skillExecCommand);

skillCommand
  .command('inject <skillId>')
  .description('Inject skill content into AI context (with dynamic loading)')
  .option('--json', 'Output as JSON')
  .option('--no-deps', 'Do not resolve dependencies')
  .option('--max-tokens <number>', 'Maximum token budget', parseInt)
  .action(skillInjectCommand);

skillCommand
  .command('load <skillIds...>')
  .description('Load multiple skills in batch')
  .option('--json', 'Output as JSON')
  .option('--max-tokens <number>', 'Maximum token budget', parseInt)
  .action(skillLoadBatchCommand);

skillCommand
  .command('cache-clear')
  .description('Clear skill cache')
  .action(skillCacheClearCommand);

skillCommand
  .command('cache-stats')
  .description('Show skill cache statistics')
  .action(skillCacheStatsCommand);

skillCommand
  .command('create-mcp')
  .description('Create a new MCP skill')
  .requiredOption('--name <name>', 'MCP server name')
  .requiredOption('--description <description>', 'Brief description')
  .requiredOption('--category <category>', 'Skill category (retrieval, transformation, analysis, generation, integration, utility)')
  .option('--package <package>', 'npm package or URL')
  .option('--token-budget <number>', 'Token budget estimate', parseInt, 2000)
  .option('--tags <tags>', 'Comma-separated tags', (val) => val.split(',').map(t => t.trim()))
  .action(skillCreateMcpCommand);

// MCP commands
const mcpCommand = program.command('mcp').description('Manage MCP server integrations');

mcpCommand
  .command('list')
  .description('List all configured MCP servers')
  .option('--json', 'Output as JSON')
  .action(mcpListCommand);

mcpCommand
  .command('add <name> <command>')
  .description('Add MCP server configuration')
  .option('--args <args>', 'Command arguments (space-separated)')
  .option('--transport <type>', 'Transport type (stdio or http)', 'stdio')
  .option('--url <url>', 'Server URL (for HTTP transport)')
  .option('--env <json>', 'Environment variables (JSON)')
  .action(mcpAddCommand);

mcpCommand
  .command('remove <name>')
  .description('Remove MCP server configuration')
  .action(mcpRemoveCommand);

mcpCommand
  .command('exec <serverName> <toolName>')
  .description('Execute MCP tool')
  .option('--args <json>', 'Tool arguments (JSON)')
  .option('--json', 'Output as JSON')
  .action(mcpExecCommand);

mcpCommand
  .command('wrap <serverName> <toolName> <skillId>')
  .description('Generate skill wrapper for MCP tool')
  .option('--category <category>', 'Skill category', 'integration')
  .action(mcpWrapCommand);

mcpCommand
  .command('discover <serverName>')
  .description('Discover tools from MCP server')
  .option('--json', 'Output as JSON')
  .action(mcpDiscoverCommand);

mcpCommand
  .command('generate-cli <serverCommand> <outputPath>')
  .description('Generate CLI using mcporter')
  .action(mcpGenerateCLICommand);

// Cross-platform export command
program
  .command('export')
  .description(
    'Aggregate linked Augx modules into native rule files for Claude Code, Cursor, Windsurf, or Copilot'
  )
  .option(
    '--target <tools>',
    'Target tool(s): claude-code, cursor, windsurf, copilot, all (comma-separated)'
  )
  .option(
    '--output <path>',
    'Override output path (only valid with a single --target)'
  )
  .option('--dry-run', 'Report projected output without writing')
  .option('--force', 'Overwrite even when drift is detected')
  .option('--verbose', 'Print per-target write decisions')
  .action((options) => {
    exportCommand({
      target: options.target,
      output: options.output,
      dryRun: options.dryRun,
      force: options.force,
      verbose: options.verbose,
    });
  });

// Code Analysis command
program
  .command('code-analysis')
  .alias('analyze')
  .description('Analyze code for quality, complexity, security, and dependencies')
  .option('--file <path>', 'Single file to analyze')
  .option('--dir <path>', 'Directory to analyze (recursive)')
  .option('--pattern <glob>', 'File pattern (e.g., "src/**/*.ts")')
  .option('--type <type>', 'Analysis type: complexity, patterns, security, quality, dependencies', 'quality')
  .option('--severity <level>', 'Minimum severity: low, medium, high, critical', 'low')
  .option('--format <format>', 'Output format: text, json, markdown', 'text')
  .option('--fix', 'Auto-fix issues where possible')
  .action((options) => {
    codeAnalysisCommand({
      file: options.file,
      dir: options.dir,
      pattern: options.pattern,
      type: options.type,
      severity: options.severity,
      format: options.format,
      fix: options.fix
    });
  });


program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

