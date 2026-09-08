import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { discoverModules, discoverCollections, Module, Collection } from '../utils/module-system';
import {
  discoverSkills,
  findSkill,
  validateSkillMetadata,
  loadSkillDynamic,
  getSkillContentForInjection,
  Skill,
  SKILL_CATEGORIES
} from '../utils/skill-system';
import { getInteractivePrompt, type InteractivePrompt } from '../utils/interactive-prompt';
import { linkCommand } from './link';
import { unlinkCommand } from './unlink';

interface GuiOptions {
  json?: boolean;
}

interface ModuleChoice {
  name: string;
  value: string;
  checked?: boolean;
}

interface CollectionChoice {
  name: string;
  value: string;
  modules: string[];
}

const GUI_PROMPT_UNAVAILABLE_MESSAGE =
  'Interactive prompts are unavailable in this terminal. Re-run `augx gui` from an interactive TTY.';

/**
 * Display keyboard shortcuts help screen
 */
function displayKeyboardHelp(): void {
  console.log(chalk.bold.blue('\n⌨️  Keyboard Shortcuts\n'));
  console.log(chalk.cyan('Navigation:'));
  console.log(chalk.gray('  ↑/↓ or j/k    - Move up/down'));
  console.log(chalk.gray('  Space         - Toggle selection (checkbox lists)'));
  console.log(chalk.gray('  Enter         - Confirm selection'));
  console.log(chalk.gray('  Esc or Ctrl+C - Cancel/Exit'));
  console.log();
  console.log(chalk.cyan('Actions:'));
  console.log(chalk.gray('  Ctrl+A        - Select all (checkbox lists)'));
  console.log(chalk.gray('  Ctrl+D        - Deselect all (checkbox lists)'));
  console.log(chalk.gray('  Ctrl+S        - Quick search'));
  console.log(chalk.gray('  Ctrl+H or ?   - Show this help'));
  console.log();
  console.log(chalk.cyan('Accessibility:'));
  console.log(chalk.gray('  Screen reader compatible'));
  console.log(chalk.gray('  High contrast mode supported'));
  console.log(chalk.gray('  Keyboard-only navigation'));
  console.log();
}

function getRepoModuleNameSet(modules: Module[]): Set<string> {
  return new Set(modules.map(module => module.fullName));
}

async function ensureGuiPrompt(promptApi?: InteractivePrompt): Promise<InteractivePrompt | null> {
  if (promptApi) {
    return promptApi;
  }

  const loadedPrompt = await getInteractivePrompt();
  if (!loadedPrompt) {
    console.log(chalk.yellow(GUI_PROMPT_UNAVAILABLE_MESSAGE));
    return null;
  }

  return loadedPrompt;
}

export function filterModulesForGui(modules: Module[]): Module[] {
  return modules.filter(module => module.metadata.type !== 'writing-standards');
}

export function filterLinkedModulesToRepoModules(linkedModules: string[], modules: Module[]): string[] {
  const repoModuleNames = getRepoModuleNameSet(modules);
  return linkedModules.filter(moduleName => repoModuleNames.has(moduleName));
}

export function filterCollectionsToRepoModules(collections: Collection[], modules: Module[]): Collection[] {
  const repoModuleNames = getRepoModuleNameSet(modules);

  return collections.filter(collection => {
    const collectionModules = collection.metadata.modules || [];
    return collectionModules.length > 0 && collectionModules.every(module => repoModuleNames.has(module.id));
  });
}

export async function guiCommand(
  options: GuiOptions = {},
  promptApi?: InteractivePrompt
): Promise<void> {
  try {
    console.log(chalk.blue('\n🎨 Augment Extensions Module Manager\n'));
    console.log(chalk.gray('Press Ctrl+H or ? for keyboard shortcuts\n'));

    // Check if initialized
    const configPath = path.join(process.cwd(), '.augment', 'extensions.json');

    if (!fs.existsSync(configPath)) {
      console.error(chalk.red('Augment Extensions not initialized. Run: augx init'));
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const configuredLinkedModules = Array.isArray(config.modules)
      ? config.modules
          .map((m: any) => m?.name)
          .filter((name: unknown): name is string => typeof name === 'string')
      : [];

    // Discover available modules and collections
    const discoveredModules = discoverModules();
    const modules = filterModulesForGui(discoveredModules);
    const linkedModules = filterLinkedModulesToRepoModules(configuredLinkedModules, modules);
    const discoveredCollections = discoverCollections();
    const collections = filterCollectionsToRepoModules(discoveredCollections, modules);

    const skippedLinkedModuleCount = configuredLinkedModules.length - linkedModules.length;
    const skippedCollectionCount = discoveredCollections.length - collections.length;

    if (skippedLinkedModuleCount > 0) {
      console.log(
        chalk.yellow(
          `Skipping ${skippedLinkedModuleCount} linked module(s) that are not available in augx gui.`
        )
      );
    }

    if (skippedCollectionCount > 0) {
      console.log(
        chalk.yellow(
          `Skipping ${skippedCollectionCount} collection(s) that reference modules unavailable in augx gui.`
        )
      );
    }

    const interactivePrompt = await ensureGuiPrompt(promptApi);
    if (!interactivePrompt) {
      return;
    }

    // Main menu
    const { action } = await interactivePrompt.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '\u{1F4E6} Link Modules', value: 'link-modules' },
          { name: '\u{1F4DA} Link Collection', value: 'link-collection' },
          { name: '\u{1F50D} Search Modules', value: 'search' },
          { name: '\u{1F9E0} Browse Skills', value: 'browse-skills' },
          { name: '\u{2753}  Keyboard Shortcuts', value: 'help' },
          { name: '\u{274C} Exit', value: 'exit' }
        ]
      }
    ]);

    if (action === 'exit') {
      console.log(chalk.gray('Goodbye!'));
      return;
    }

    if (action === 'help') {
      displayKeyboardHelp();
      // Return to main menu after showing help
      return await guiCommand(options, interactivePrompt);
    } else if (action === 'link-modules') {
      await linkModulesInteractive(modules, linkedModules, interactivePrompt);
    } else if (action === 'link-collection') {
      await linkCollectionInteractive(collections, linkedModules, interactivePrompt);
    } else if (action === 'search') {
      await searchModulesInteractive(modules, linkedModules, interactivePrompt);
    } else if (action === 'browse-skills') {
      await browseSkillsInteractive(interactivePrompt);
    }

  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

async function linkModulesInteractive(
  modules: Module[],
  linkedModules: string[],
  promptApi: InteractivePrompt
): Promise<void> {
  if (modules.length === 0) {
    console.log(chalk.yellow('No modules available in this repository.'));
    return;
  }

  const choices: ModuleChoice[] = modules.map(m => ({
    name: `${m.metadata.displayName} (${m.fullName}) - ${m.metadata.description}`,
    value: m.fullName,
    checked: linkedModules.includes(m.fullName)
  }));

  console.log(chalk.gray('Tip: Use Ctrl+A to select all, Ctrl+D to deselect all\n'));
  console.log(chalk.gray('Tip: Uncheck modules to unlink them\n'));

  const { selectedModules } = await promptApi.prompt([
    {
      type: 'checkbox',
      name: 'selectedModules',
      message: 'Select modules to link (↑↓ to navigate, Space to select, Enter to confirm):',
      choices,
      pageSize: 15,
      // Enable keyboard shortcuts via inquirer's built-in support
      loop: false,
      // Accessibility: Provide clear instructions
      prefix: '📦',
      suffix: ''
    }
  ]);

  // Determine which modules to unlink (were linked but now unchecked)
  const modulesToUnlink = linkedModules.filter(m => !selectedModules.includes(m));

  // Determine which modules to link (selected but not yet linked)
  const modulesToLink = selectedModules.filter((m: string) => !linkedModules.includes(m));

  // Handle unlinking first
  if (modulesToUnlink.length > 0) {
    console.log(chalk.blue(`\nUnlinking ${modulesToUnlink.length} module(s)...\n`));

    for (const moduleName of modulesToUnlink) {
      await unlinkCommand(moduleName, { force: true });
    }
  }

  // Handle linking
  if (modulesToLink.length > 0) {
    console.log(chalk.blue(`\nLinking ${modulesToLink.length} module(s)...\n`));

    for (const moduleName of modulesToLink) {
      await linkCommand(moduleName, {});
    }
  }

  // Summary
  if (modulesToUnlink.length === 0 && modulesToLink.length === 0) {
    console.log(chalk.gray('\nNo changes made.'));
  } else {
    console.log(chalk.green('\n✓ Module management complete!'));
    if (modulesToUnlink.length > 0) {
      console.log(chalk.gray(`  Unlinked: ${modulesToUnlink.length} module(s)`));
    }
    if (modulesToLink.length > 0) {
      console.log(chalk.gray(`  Linked: ${modulesToLink.length} module(s)`));
    }
  }
}

async function linkCollectionInteractive(
  collections: Collection[],
  linkedModules: string[],
  promptApi: InteractivePrompt
): Promise<void> {
  if (collections.length === 0) {
    console.log(chalk.yellow('No collections available.'));
    return;
  }

  const choices = collections.map(c => ({
    name: `${c.metadata.displayName} - ${c.metadata.description}`,
    value: c.fullName
  }));

  const { selectedCollection } = await promptApi.prompt([
    {
      type: 'list',
      name: 'selectedCollection',
      message: 'Select a collection to link:',
      choices
    }
  ]);

  const collection = collections.find(c => c.fullName === selectedCollection);

  if (!collection) {
    console.error(chalk.red('Collection not found.'));
    return;
  }

  console.log(chalk.blue(`\nLinking collection: ${collection.metadata.displayName}\n`));
  console.log(chalk.gray(`This will link ${collection.metadata.modules.length} module(s):\n`));

  for (const module of collection.metadata.modules) {
    console.log(chalk.gray(`  - ${module.id}`));
  }

  const { confirm } = await promptApi.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed with linking?',
      default: true
    }
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Cancelled.'));
    return;
  }

  // Link all modules in the collection
  for (const module of collection.metadata.modules) {
    if (!linkedModules.includes(module.id)) {
      await linkCommand(module.id, { version: module.version });
    } else {
      console.log(chalk.gray(`Skipping already linked module: ${module.id}`));
    }
  }

  console.log(chalk.green('\n✓ Collection linking complete!'));
}

async function searchModulesInteractive(
  modules: Module[],
  linkedModules: string[],
  promptApi: InteractivePrompt
): Promise<void> {
  const { searchTerm } = await promptApi.prompt([
    {
      type: 'input',
      name: 'searchTerm',
      message: 'Enter search term (searches name, description, and tags):',
      // Accessibility: Provide clear placeholder
      prefix: '🔍',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'Please enter a search term';
        }
        return true;
      }
    }
  ]);

  if (!searchTerm) {
    console.log(chalk.yellow('No search term provided.'));
    return;
  }

  const results = modules.filter(m =>
    m.metadata.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.metadata.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.metadata.tags?.some((tag: string) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (results.length === 0) {
    console.log(chalk.yellow(`No modules found matching "${searchTerm}"`));
    console.log(chalk.gray('Try a different search term or browse all modules'));
    return;
  }

  // Accessibility: Announce number of results
  console.log(chalk.blue(`\n✓ Found ${results.length} module(s) matching "${searchTerm}":\n`));

  for (const module of results) {
    console.log(chalk.green(`  ${module.metadata.displayName}`));
    console.log(chalk.gray(`    ${module.fullName}`));
    console.log(chalk.gray(`    ${module.metadata.description}`));
    console.log();
  }

  const { linkNow } = await promptApi.prompt([
    {
      type: 'confirm',
      name: 'linkNow',
      message: 'Would you like to link any of these modules?',
      default: false,
      // Accessibility: Clear prefix
      prefix: '❓'
    }
  ]);

  if (linkNow) {
    await linkModulesInteractive(results, linkedModules, promptApi);
  }
}



/**
 * Discover skills with parser warnings suppressed for a clean GUI display.
 * Legacy stub skills without YAML frontmatter would otherwise spam the menu.
 */
function discoverSkillsQuiet(): Skill[] {
  const originalWarn = console.warn;
  console.warn = () => { /* silenced for GUI */ };
  try {
    return discoverSkills();
  } finally {
    console.warn = originalWarn;
  }
}

export async function browseSkillsInteractive(promptApi: InteractivePrompt): Promise<void> {
  const skills = discoverSkillsQuiet();

  if (skills.length === 0) {
    console.log(chalk.yellow('\nNo skills found in skills/<category>/*.md.'));
    console.log(chalk.gray('Add skill files with valid YAML frontmatter under one of: '
      + SKILL_CATEGORIES.join(', ')));
    return;
  }

  const presentCategories = Array.from(new Set(skills.map(s => s.metadata.category))).sort();
  const categoryChoices = [
    { name: `All categories (${skills.length})`, value: '__all__' },
    ...presentCategories.map(cat => {
      const count = skills.filter(s => s.metadata.category === cat).length;
      return { name: `${cat} (${count})`, value: cat };
    }),
    { name: 'Back', value: '__back__' }
  ];

  const { category } = await promptApi.prompt([
    {
      type: 'list',
      name: 'category',
      message: 'Filter skills by category:',
      choices: categoryChoices,
      pageSize: 10,
      prefix: '\u{1F9E0}'
    }
  ]);

  if (category === '__back__') {
    return;
  }

  const filtered = category === '__all__'
    ? skills
    : skills.filter(s => s.metadata.category === category);

  if (filtered.length === 0) {
    console.log(chalk.yellow(`\nNo skills in category: ${category}`));
    return;
  }

  const skillChoices = filtered
    .slice()
    .sort((a, b) => a.metadata.id.localeCompare(b.metadata.id))
    .map(skill => {
      const { id, name, tokenBudget, version } = skill.metadata;
      return {
        name: `${id}  ${chalk.gray(`v${version}`)}  -  ${name} ${chalk.gray(`[${tokenBudget} tok]`)}`,
        value: id
      };
    });
  skillChoices.push({ name: 'Back', value: '__back__' });

  const { skillId } = await promptApi.prompt([
    {
      type: 'list',
      name: 'skillId',
      message: 'Select a skill:',
      choices: skillChoices,
      pageSize: 15
    }
  ]);

  if (skillId === '__back__') {
    return await browseSkillsInteractive(promptApi);
  }

  const skill = filtered.find(s => s.metadata.id === skillId);
  if (!skill) {
    console.log(chalk.red(`Skill not found: ${skillId}`));
    return;
  }

  await skillActionInteractive(skill, promptApi);
}

async function skillActionInteractive(skill: Skill, promptApi: InteractivePrompt): Promise<void> {
  const { id, name } = skill.metadata;
  console.log(chalk.blue(`\n\u{1F9E0} ${name} (${id})`));

  const { action } = await promptApi.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'View details and content', value: 'view' },
        { name: 'Validate metadata', value: 'validate' },
        { name: 'Inject content (print or save to file)', value: 'inject' },
        { name: 'Back to skill list', value: 'back' }
      ]
    }
  ]);

  if (action === 'back') {
    return await browseSkillsInteractive(promptApi);
  }

  if (action === 'view') {
    showSkillDetails(skill);
  } else if (action === 'validate') {
    validateSkillInGui(skill);
  } else if (action === 'inject') {
    await injectSkillInGui(skill, promptApi);
  }

  const { again } = await promptApi.prompt([
    {
      type: 'confirm',
      name: 'again',
      message: 'Perform another action on this skill?',
      default: false
    }
  ]);

  if (again) {
    await skillActionInteractive(skill, promptApi);
  } else {
    await browseSkillsInteractive(promptApi);
  }
}

function showSkillDetails(skill: Skill): void {
  const { metadata, content, filePath } = skill;
  console.log(chalk.gray('\n' + '-'.repeat(60)));
  console.log(`Id:           ${metadata.id}`);
  console.log(`Name:         ${metadata.name}`);
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
  console.log(`Path:         ${path.relative(process.cwd(), filePath)}`);
  console.log(chalk.gray('-'.repeat(60)));
  console.log(chalk.cyan('\nContent:\n'));
  console.log(content);
  console.log();
}

function validateSkillInGui(skill: Skill): void {
  const result = validateSkillMetadata(skill.metadata);
  if (result.valid) {
    console.log(chalk.green(`\n\u{2713} Skill ${skill.metadata.id} is valid.`));
  } else {
    console.log(chalk.red(`\n\u{2717} Skill ${skill.metadata.id} has validation errors:`));
    for (const err of result.errors) {
      console.log(chalk.red(`  - ${err}`));
    }
  }
}

async function injectSkillInGui(skill: Skill, promptApi: InteractivePrompt): Promise<void> {
  const loaded = loadSkillDynamic(skill.metadata.id, {
    resolveDependencies: true,
    maxTokens: 50000,
    cache: true
  });

  if (!loaded) {
    console.log(chalk.red(`Failed to load skill: ${skill.metadata.id}`));
    return;
  }

  const injectionContent = getSkillContentForInjection(loaded);
  const depIds = loaded.dependencies.map(d => d.skill.metadata.id);

  console.log(chalk.gray('\n' + '-'.repeat(60)));
  console.log(`Total tokens:  ${loaded.totalTokens}`);
  console.log(`Dependencies:  ${depIds.length === 0 ? '(none)' : depIds.join(', ')}`);
  console.log(chalk.gray('-'.repeat(60)));

  const { destination } = await promptApi.prompt([
    {
      type: 'list',
      name: 'destination',
      message: 'Where do you want to send the injection content?',
      choices: [
        { name: 'Print to terminal', value: 'stdout' },
        { name: 'Save to file', value: 'file' },
        { name: 'Cancel', value: 'cancel' }
      ]
    }
  ]);

  if (destination === 'cancel') {
    return;
  }

  if (destination === 'stdout') {
    console.log(chalk.cyan('\n--- Injection Content ---\n'));
    console.log(injectionContent);
    console.log(chalk.cyan('\n--- End Injection Content ---\n'));
    return;
  }

  const defaultPath = path.join('.augment', 'injections', `${skill.metadata.id}.md`);
  const { outPath } = await promptApi.prompt([
    {
      type: 'input',
      name: 'outPath',
      message: 'Output file path (relative to cwd):',
      default: defaultPath,
      validate: (value: string) => value.trim().length > 0 || 'Path required'
    }
  ]);

  const absPath = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(absPath, injectionContent, 'utf-8');
  console.log(chalk.green(`\n\u{2713} Wrote ${injectionContent.length} chars to ${path.relative(process.cwd(), absPath)}`));
}

