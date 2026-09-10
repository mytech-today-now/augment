/**
 * Skill Commands
 * 
 * Commands for managing and using skills.
 */

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import {
  discoverSkills,
  findSkill,
  validateSkillMetadata,
  parseSkillCliCommand,
  loadSkillDynamic,
  loadSkillsBatch,
  getSkillContentForInjection,
  clearSkillCache,
  getSkillCacheStats,
  Skill
} from '../utils/skill-system';

class SkillExecExitError extends Error {
  constructor(
    public readonly exitCode: number,
    message: string
  ) {
    super(message);
    this.name = 'SkillExecExitError';
  }
}

function renderSkillExecArg(arg: string): string {
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(arg)) {
    return arg;
  }

  return JSON.stringify(arg);
}

function renderSkillExecCommand(cliCommand: string, args: string[]): string {
  if (args.length === 0) {
    return cliCommand;
  }

  return `${cliCommand} ${args.map(renderSkillExecArg).join(' ')}`;
}

function formatSkillCommandForMessage(cliCommand: string): string {
  return JSON.stringify(cliCommand);
}

function logSkillExecFailure(message: string): void {
  console.error(chalk.red(message));
  console.error(
    chalk.gray(
      'Skill commands are executed directly without a shell. If this looks like shell syntax, rewrite it as an executable followed by literal arguments.'
    )
  );
}

type SkillSpawnFunction = (
  command: string,
  args: string[],
  options: {
    stdio: 'inherit';
    shell: false;
  }
) => import('child_process').ChildProcess;

function defaultSkillSpawn(
  command: string,
  args: string[],
  options: {
    stdio: 'inherit';
    shell: false;
  }
): import('child_process').ChildProcess {
  const { spawn } = require('child_process') as typeof import('child_process');
  return spawn(command, args, options);
}

/**
 * List all available skills
 */
export async function skillListCommand(options: { category?: string; json?: boolean } = {}): Promise<void> {
  try {
    const skills = discoverSkills();
    
    if (skills.length === 0) {
      console.log(chalk.yellow('No skills found'));
      return;
    }
    
    // Filter by category if specified
    const filteredSkills = options.category
      ? skills.filter(s => s.metadata.category === options.category)
      : skills;
    
    if (options.json) {
      console.log(JSON.stringify(filteredSkills.map(s => s.metadata), null, 2));
      return;
    }
    
    // Group by category
    const byCategory = filteredSkills.reduce((acc, skill) => {
      const cat = skill.metadata.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(skill);
      return acc;
    }, {} as Record<string, Skill[]>);
    
    console.log(chalk.blue('\n📦 Available Skills\n'));
    
    for (const [category, categorySkills] of Object.entries(byCategory)) {
      console.log(chalk.cyan(`\n${category.toUpperCase()}`));
      console.log(chalk.gray('─'.repeat(50)));
      
      for (const skill of categorySkills) {
        const { id, name, version, tokenBudget, tags } = skill.metadata;
        console.log(`  ${chalk.green(id)} (v${version})`);
        console.log(`    ${name}`);
        console.log(`    Tokens: ${tokenBudget} | Tags: ${tags?.join(', ') || 'none'}`);
      }
    }
    
    console.log(chalk.gray('\n' + '─'.repeat(50)));
    console.log(chalk.blue(`Total: ${filteredSkills.length} skills\n`));
  } catch (error) {
    console.error(chalk.red(`Error listing skills: ${error}`));
    process.exit(1);
  }
}

/**
 * Show details of a specific skill
 */
export async function skillShowCommand(skillId: string, options: { json?: boolean } = {}): Promise<void> {
  try {
    const skill = findSkill(skillId);
    
    if (!skill) {
      console.error(chalk.red(`Skill not found: ${skillId}`));
      process.exit(1);
    }
    
    if (options.json) {
      console.log(JSON.stringify({ metadata: skill.metadata, content: skill.content }, null, 2));
      return;
    }
    
    const { metadata, content } = skill;
    
    console.log(chalk.blue(`\n📄 ${metadata.name} (${metadata.id})\n`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Version:      ${metadata.version}`);
    console.log(`Category:     ${metadata.category}`);
    console.log(`Token Budget: ${metadata.tokenBudget}`);
    console.log(`Priority:     ${metadata.priority || 'medium'}`);
    
    if (metadata.tags && metadata.tags.length > 0) {
      console.log(`Tags:         ${metadata.tags.join(', ')}`);
    }
    
    if (metadata.dependencies && metadata.dependencies.length > 0) {
      console.log(`Dependencies: ${metadata.dependencies.join(', ')}`);
    }
    
    if (metadata.cliCommand) {
      console.log(`CLI Command:  ${metadata.cliCommand}`);
    }
    
    if (metadata.mcpServer) {
      console.log(`MCP Server:   ${metadata.mcpServer}`);
    }
    
    console.log(chalk.gray('\n' + '─'.repeat(50)));
    console.log(chalk.cyan('\nContent:\n'));
    console.log(content);
  } catch (error) {
    console.error(chalk.red(`Error showing skill: ${error}`));
    process.exit(1);
  }
}

/**
 * Validate a skill file
 */
export async function skillValidateCommand(skillId: string): Promise<void> {
  try {
    const skill = findSkill(skillId);
    
    if (!skill) {
      console.error(chalk.red(`Skill not found: ${skillId}`));
      process.exit(1);
    }
    
    const validation = validateSkillMetadata(skill.metadata);
    
    if (validation.valid) {
      console.log(chalk.green(`✓ Skill ${skillId} is valid`));
    } else {
      console.log(chalk.red(`✗ Skill ${skillId} has validation errors:`));
      for (const error of validation.errors) {
        console.log(chalk.red(`  - ${error}`));
      }
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Error validating skill: ${error}`));
    process.exit(1);
  }
}

/**
 * Search for skills by tags or keywords
 */
export async function skillSearchCommand(query: string, options: { json?: boolean } = {}): Promise<void> {
  try {
    const skills = discoverSkills();
    const lowerQuery = query.toLowerCase();

    // Search in id, name, tags
    const results = skills.filter(skill => {
      const { id, name, tags } = skill.metadata;
      return (
        id.toLowerCase().includes(lowerQuery) ||
        name.toLowerCase().includes(lowerQuery) ||
        tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    });

    if (results.length === 0) {
      console.log(chalk.yellow(`No skills found matching: ${query}`));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(results.map(s => s.metadata), null, 2));
      return;
    }

    console.log(chalk.blue(`\n🔍 Search Results for "${query}"\n`));
    console.log(chalk.gray('─'.repeat(50)));

    for (const skill of results) {
      const { id, name, category, tokenBudget } = skill.metadata;
      console.log(`  ${chalk.green(id)} (${category})`);
      console.log(`    ${name}`);
      console.log(`    Tokens: ${tokenBudget}`);
      console.log('');
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.blue(`Found: ${results.length} skills\n`));
  } catch (error) {
    console.error(chalk.red(`Error searching skills: ${error}`));
    process.exit(1);
  }
}

/**
 * Execute a skill's CLI command
 */
export async function skillExecCommand(
  skillId: string,
  args: string[] = [],
  spawnImpl: SkillSpawnFunction = defaultSkillSpawn
): Promise<void> {
  return skillExecCommandWithSpawn(skillId, args, spawnImpl);
}

export async function skillExecCommandWithSpawn(
  skillId: string,
  args: string[],
  spawnImpl: SkillSpawnFunction
): Promise<void> {
  try {
    const skill = findSkill(skillId);

    if (!skill) {
      console.error(chalk.red(`Skill not found: ${skillId}`));
      process.exit(1);
    }

    if (!skill.metadata.cliCommand) {
      logSkillExecFailure(`Skill ${skillId} does not have a CLI command defined`);
      process.exit(1);
      return;
    }

    const cliCommand = skill.metadata.cliCommand;
    let parsedCommand: ReturnType<typeof parseSkillCliCommand>;

    try {
      parsedCommand = parseSkillCliCommand(cliCommand);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logSkillExecFailure(
        `Skill ${skillId} cannot execute command ${formatSkillCommandForMessage(cliCommand)}: ${reason}`
      );
      process.exit(1);
      return;
    }

    console.log(chalk.blue(`Executing skill: ${skill.metadata.name}`));
    console.log(chalk.gray(`Command: ${renderSkillExecCommand(cliCommand, args)}\n`));

    await new Promise<void>((resolve, reject) => {
      const child = spawnImpl(parsedCommand.command, [...parsedCommand.args, ...args], {
        stdio: 'inherit',
        shell: false
      });

      child.on('error', (error) => {
        const spawnError = error as NodeJS.ErrnoException;

        if (spawnError.code === 'ENOENT') {
          reject(
            new Error(
              `Skill ${skillId} cannot execute command ${formatSkillCommandForMessage(cliCommand)}: executable not found`
            )
          );
          return;
        }

        reject(
          new Error(
            `Skill ${skillId} failed to execute command ${formatSkillCommandForMessage(cliCommand)}: ${spawnError.message}`
          )
        );
      });

      child.on('exit', (code, signal) => {
        if (signal) {
          reject(
            new SkillExecExitError(
              1,
              `Skill ${skillId} command ${formatSkillCommandForMessage(cliCommand)} terminated by signal ${signal}`
            )
          );
          return;
        }

        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new SkillExecExitError(
            code || 1,
            `Skill ${skillId} command ${formatSkillCommandForMessage(cliCommand)} exited with code ${code || 1}`
          )
        );
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSkillExecFailure(message);

    if (error instanceof SkillExecExitError) {
      process.exit(error.exitCode);
      return;
    }

    process.exit(1);
  }
}

/**
 * Inject a skill's content into the AI context (with dynamic loading)
 */
export async function skillInjectCommand(
  skillId: string,
  options: {
    json?: boolean;
    noDeps?: boolean;
    maxTokens?: number;
  } = {}
): Promise<void> {
  try {
    const loadedSkill = loadSkillDynamic(skillId, {
      resolveDependencies: !options.noDeps,
      maxTokens: options.maxTokens || 50000,
      cache: true
    });

    if (!loadedSkill) {
      console.error(chalk.red(`Skill not found: ${skillId}`));
      process.exit(1);
    }

    const { skill, dependencies, totalTokens } = loadedSkill;

    if (options.json) {
      console.log(JSON.stringify({
        id: skill.metadata.id,
        name: skill.metadata.name,
        content: getSkillContentForInjection(loadedSkill),
        tokenBudget: skill.metadata.tokenBudget,
        totalTokens,
        dependencies: dependencies.map(d => d.skill.metadata.id)
      }, null, 2));
      return;
    }

    // Output skill content for AI context injection
    console.log(chalk.blue(`\n# Skill: ${skill.metadata.name}\n`));
    console.log(chalk.gray(`ID: ${skill.metadata.id}`));
    console.log(chalk.gray(`Category: ${skill.metadata.category}`));
    console.log(chalk.gray(`Token Budget: ${skill.metadata.tokenBudget}`));
    console.log(chalk.gray(`Total Tokens (with deps): ${totalTokens}`));

    if (dependencies.length > 0) {
      console.log(chalk.gray(`Dependencies: ${dependencies.map(d => d.skill.metadata.id).join(', ')}`));
    }

    console.log(chalk.gray('\n' + '─'.repeat(50)));
    console.log(getSkillContentForInjection(loadedSkill));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.green(`\n✓ Skill content ready for AI context injection (${totalTokens} tokens)`));
  } catch (error) {
    console.error(chalk.red(`Error injecting skill: ${error}`));
    process.exit(1);
  }
}

/**
 * Load multiple skills in batch
 */
export async function skillLoadBatchCommand(
  skillIds: string[],
  options: {
    json?: boolean;
    maxTokens?: number;
  } = {}
): Promise<void> {
  try {
    const loadedSkills = loadSkillsBatch(skillIds, {
      resolveDependencies: true,
      maxTokens: options.maxTokens || 50000,
      cache: true
    });

    if (loadedSkills.length === 0) {
      console.log(chalk.yellow('No skills loaded'));
      return;
    }

    const totalTokens = loadedSkills.reduce((sum, ls) => sum + ls.totalTokens, 0);

    if (options.json) {
      console.log(JSON.stringify({
        skills: loadedSkills.map(ls => ({
          id: ls.skill.metadata.id,
          name: ls.skill.metadata.name,
          tokenBudget: ls.skill.metadata.tokenBudget,
          totalTokens: ls.totalTokens,
          dependencies: ls.dependencies.map(d => d.skill.metadata.id)
        })),
        totalTokens
      }, null, 2));
      return;
    }

    console.log(chalk.blue(`\n📦 Loaded ${loadedSkills.length} skills\n`));
    console.log(chalk.gray('─'.repeat(50)));

    for (const loadedSkill of loadedSkills) {
      const { skill, dependencies, totalTokens: skillTokens } = loadedSkill;
      console.log(chalk.green(`  ${skill.metadata.id}`));
      console.log(chalk.gray(`    ${skill.metadata.name}`));
      console.log(chalk.gray(`    Tokens: ${skillTokens} (base: ${skill.metadata.tokenBudget})`));
      if (dependencies.length > 0) {
        console.log(chalk.gray(`    Dependencies: ${dependencies.map(d => d.skill.metadata.id).join(', ')}`));
      }
    }

    console.log(chalk.gray('\n' + '─'.repeat(50)));
    console.log(chalk.blue(`Total tokens: ${totalTokens}\n`));
  } catch (error) {
    console.error(chalk.red(`Error loading skills: ${error}`));
    process.exit(1);
  }
}

/**
 * Clear skill cache
 */
export async function skillCacheClearCommand(): Promise<void> {
  try {
    const stats = getSkillCacheStats();
    clearSkillCache();
    console.log(chalk.green(`✓ Cleared skill cache (${stats.size} skills)`));
  } catch (error) {
    console.error(chalk.red(`Error clearing cache: ${error}`));
    process.exit(1);
  }
}

/**
 * Show skill cache statistics
 */
export async function skillCacheStatsCommand(): Promise<void> {
  try {
    const stats = getSkillCacheStats();

    console.log(chalk.blue('\n📊 Skill Cache Statistics\n'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Cached skills: ${stats.size}`);

    if (stats.skills.length > 0) {
      console.log('\nCached skill IDs:');
      for (const skillId of stats.skills) {
        console.log(chalk.gray(`  - ${skillId}`));
      }
    }

    console.log(chalk.gray('\n' + '─'.repeat(50) + '\n'));
  } catch (error) {
    console.error(chalk.red(`Error getting cache stats: ${error}`));
    process.exit(1);
  }
}

/**
 * Create a new MCP skill
 */
export async function skillCreateMcpCommand(options: {
  name: string;
  description: string;
  category: string;
  package?: string;
  tokenBudget?: number;
  tags?: string[];
}): Promise<void> {
  try {
    const { name, description, category, tokenBudget = 2000, tags = [] } = options;

    // Validate category
    const validCategories = ['retrieval', 'transformation', 'analysis', 'generation', 'integration', 'utility'];
    if (!validCategories.includes(category)) {
      console.error(chalk.red(`Invalid category: ${category}`));
      console.log(chalk.yellow(`Valid categories: ${validCategories.join(', ')}`));
      process.exit(1);
    }

    // Generate skill ID from name
    const skillId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Determine skill file path
    const skillsDir = path.join(process.cwd(), 'skills', category);
    const skillPath = path.join(skillsDir, `${skillId}.md`);

    // Check if skill already exists
    if (fs.existsSync(skillPath)) {
      console.error(chalk.red(`Skill already exists: ${skillPath}`));
      process.exit(1);
    }

    // Ensure skills directory exists
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }

    // Generate skill content
    const mcpTags = ['mcp', ...tags];
    const cliCommand = `augx-${skillId}`;

    const skillContent = `---
id: ${skillId}
name: ${name}
version: 1.0.0
category: ${category}
tokenBudget: ${tokenBudget}
priority: medium
tags: [${mcpTags.join(', ')}]
dependencies: []
cliCommand: ${cliCommand}
${options.package ? `mcpServer: ${options.package}` : ''}
---

# ${name}

## Purpose

${description}

## Installation

\`\`\`bash
# Install MCP server
${options.package ? `npm install -g ${options.package}` : '# Add installation command here'}
\`\`\`

## Configuration

Add configuration steps here (authentication, API keys, etc.)

## Available Tools

List the tools provided by this MCP server:

1. **Tool 1** - Description
2. **Tool 2** - Description
3. **Tool 3** - Description

## CLI Command

\`\`\`bash
${cliCommand} [options]
\`\`\`

### Options

- \`--option1\` - Description
- \`--option2\` - Description

## Examples

### Example 1: Basic Usage

\`\`\`bash
${cliCommand} --option1 value
\`\`\`

### Example 2: Advanced Usage

\`\`\`bash
${cliCommand} --option1 value --option2 value
\`\`\`

## Performance

- **Query Time**: ~X seconds
- **Token Usage**: ~X tokens
- **Rate Limits**: X requests/minute

## Best Practices

1. Best practice 1
2. Best practice 2
3. Best practice 3

## Troubleshooting

### Issue 1

**Problem**: Description of problem

**Solution**: Description of solution

### Issue 2

**Problem**: Description of problem

**Solution**: Description of solution
`;

    // Write skill file
    fs.writeFileSync(skillPath, skillContent, 'utf-8');

    console.log(chalk.green(`✅ Skill created successfully!`));
    console.log(chalk.blue(`\n📄 Skill file: ${skillPath}`));
    console.log(chalk.gray(`\nNext steps:`));
    console.log(chalk.gray(`1. Edit ${skillPath} to add MCP-specific details`));
    console.log(chalk.gray(`2. Validate skill: augx skill validate ${skillId}`));
    console.log(chalk.gray(`3. Test skill: augx skill show ${skillId}`));
    console.log(chalk.gray(`4. Update documentation: skills/README.md`));

  } catch (error) {
    console.error(chalk.red(`Error creating MCP skill: ${error}`));
    process.exit(1);
  }
}
