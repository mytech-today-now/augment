/**
 * MCP Commands
 * 
 * Commands for managing and using MCP server integrations.
 */

import chalk from 'chalk';
import * as fs from 'fs';
import {
  loadMCPConfigs,
  addMCPServer,
  removeMCPServer,
  executeMCPCommand,
  generateMCPSkillWrapper,
  discoverMCPTools,
  isMCPorterAvailable,
  generateCLIWithMCPorter,
  resolveMCPWrapperTarget,
  MCPServerConfig
} from '../utils/mcp-integration';

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * List all configured MCP servers
 */
export async function mcpListCommand(options: { json?: boolean } = {}): Promise<void> {
  try {
    const configs = loadMCPConfigs();

    if (configs.length === 0) {
      console.log(chalk.yellow('No MCP servers configured'));
      console.log(chalk.gray('\nAdd a server with: augx mcp add <name> <command>'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(configs, null, 2));
      return;
    }

    console.log(chalk.blue('\n🔌 Configured MCP Servers\n'));
    console.log(chalk.gray('─'.repeat(50)));

    for (const config of configs) {
      console.log(chalk.green(`  ${config.name}`));
      console.log(chalk.gray(`    Command: ${config.command}`));
      console.log(chalk.gray(`    Transport: ${config.transport}`));
      if (config.url) {
        console.log(chalk.gray(`    URL: ${config.url}`));
      }
      if (config.args && config.args.length > 0) {
        console.log(chalk.gray(`    Args: ${config.args.join(' ')}`));
      }
    }

    console.log(chalk.gray('\n' + '─'.repeat(50)));
    console.log(chalk.blue(`Total: ${configs.length} servers\n`));
  } catch (error) {
    console.error(chalk.red(`Error listing MCP servers: ${formatError(error)}`));
    process.exit(1);
  }
}

/**
 * Add MCP server configuration
 */
export async function mcpAddCommand(
  name: string,
  command: string,
  options: {
    args?: string;
    transport?: 'stdio';
    env?: string;
  } = {}
): Promise<void> {
  try {
    const config: MCPServerConfig = {
      name,
      command,
      transport: options.transport || 'stdio',
      args: options.args ? options.args.split(' ') : undefined,
      env: options.env ? JSON.parse(options.env) : undefined
    };

    addMCPServer(config);

    console.log(chalk.green(`✓ Added MCP server: ${name}`));
    console.log(chalk.gray(`  Command: ${command}`));
    console.log(chalk.gray(`  Transport: ${config.transport}`));
  } catch (error) {
    console.error(chalk.red(`Error adding MCP server: ${formatError(error)}`));
    process.exit(1);
  }
}

/**
 * Remove MCP server configuration
 */
export async function mcpRemoveCommand(name: string): Promise<void> {
  try {
    const removed = removeMCPServer(name);

    if (!removed) {
      console.error(chalk.red(`MCP server not found: ${name}`));
      process.exit(1);
    }

    console.log(chalk.green(`✓ Removed MCP server: ${name}`));
  } catch (error) {
    console.error(chalk.red(`Error removing MCP server: ${formatError(error)}`));
    process.exit(1);
  }
}

/**
 * Execute MCP tool
 */
export async function mcpExecCommand(
  serverName: string,
  toolName: string,
  options: {
    args?: string;
    json?: boolean;
  } = {}
): Promise<void> {
  try {
    const args = options.args ? JSON.parse(options.args) : {};

    console.log(chalk.blue(`Executing MCP tool: ${serverName}/${toolName}`));
    console.log(chalk.gray(`Args: ${JSON.stringify(args)}\n`));

    const result = await executeMCPCommand(serverName, toolName, args);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green('\n✓ Result:'));
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(chalk.red(`Error executing MCP tool: ${formatError(error)}`));
    process.exit(1);
  }
}

/**
 * Generate skill wrapper for MCP tool
 */
export async function mcpWrapCommand(
  serverName: string,
  toolName: string,
  skillId: string,
  options: {
    category?: string;
  } = {}
): Promise<void> {
  try {
    const category = options.category ?? 'integration';
    const wrapperTarget = resolveMCPWrapperTarget(category, skillId, process.cwd());
    const skillContent = generateMCPSkillWrapper(
      serverName,
      toolName,
      wrapperTarget.skillId,
      wrapperTarget.category
    );

    // Ensure the wrapper directory exists before writing the file.
    if (!fs.existsSync(wrapperTarget.skillsDir)) {
      fs.mkdirSync(wrapperTarget.skillsDir, { recursive: true });
    }

    fs.writeFileSync(wrapperTarget.outputPath, skillContent, 'utf-8');

    console.log(chalk.green(`✓ Generated skill wrapper: ${wrapperTarget.skillId}`));
    console.log(chalk.gray(`  Server: ${serverName}`));
    console.log(chalk.gray(`  Tool: ${toolName}`));
    console.log(chalk.gray(`  Category: ${wrapperTarget.category}`));
    console.log(chalk.gray(`  Output: ${wrapperTarget.outputPath}`));
  } catch (error) {
    console.error(chalk.red(`Error generating skill wrapper: ${formatError(error)}`));
    process.exit(1);
  }
}

/**
 * Discover tools from MCP server
 */
export async function mcpDiscoverCommand(
  serverName: string,
  options: { json?: boolean } = {}
): Promise<void> {
  try {
    console.log(chalk.blue(`Discovering tools from MCP server: ${serverName}...`));

    const tools = await discoverMCPTools(serverName);

    if (tools.length === 0) {
      console.log(chalk.yellow('\nNo tools discovered (or discovery not yet implemented)'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(tools, null, 2));
      return;
    }

    console.log(chalk.blue(`\n🔍 Discovered Tools from ${serverName}\n`));
    console.log(chalk.gray('─'.repeat(50)));

    for (const tool of tools) {
      console.log(chalk.green(`  ${tool.name}`));
      console.log(chalk.gray(`    ${tool.description}`));
    }

    console.log(chalk.gray('\n' + '─'.repeat(50)));
    console.log(chalk.blue(`Total: ${tools.length} tools\n`));
  } catch (error) {
    console.error(chalk.red(`Error discovering tools: ${formatError(error)}`));
    process.exit(1);
  }
}

/**
 * Generate CLI using mcporter
 */
export async function mcpGenerateCLICommand(
  serverCommand: string,
  outputPath: string
): Promise<void> {
  try {
    if (!isMCPorterAvailable()) {
      console.error(chalk.red('mcporter is not available'));
      console.log(chalk.yellow('\nInstall mcporter with: npm install -g mcporter'));
      process.exit(1);
    }

    console.log(chalk.blue(`Generating CLI with mcporter...`));
    console.log(chalk.gray(`  Server: ${serverCommand}`));
    console.log(chalk.gray(`  Output: ${outputPath}\n`));

    await generateCLIWithMCPorter(serverCommand, outputPath);

    console.log(chalk.green(`\n✓ CLI generated successfully`));
    console.log(chalk.gray(`  Output: ${outputPath}`));
  } catch (error) {
    console.error(chalk.red(`Error generating CLI: ${formatError(error)}`));
    process.exit(1);
  }
}

