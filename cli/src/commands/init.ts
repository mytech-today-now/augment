import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import {
  installCharacterCountRule,
  installEmDashRule,
  installAsciiOnlyCodeRule,
  installUtf8NonCodeRule,
  installNoEmojiRule,
  InstallRulesResult
} from '../utils/install-rules';
import { extractCommandHelp } from '../utils/extractCommandHelp';
import { getInteractivePrompt, type InteractivePrompt } from '../utils/interactive-prompt';

interface InitOptions {
  fromSubmodule?: boolean;
  yes?: boolean;
  // Commander maps `--no-optional-rules` to `optionalRules: false`;
  // when the flag is omitted the value is `true` (default).
  optionalRules?: boolean;
}

interface OptionalRuleSpec {
  key: string;
  promptMessage: string;
  defaultAnswer: boolean;
  install: (opts: { targetDir: string; skipIfExists: boolean; verbose: boolean }) => Promise<InstallRulesResult>;
  successLabel: string;
  ruleFilename: string;
}

const INIT_PROMPT_UNAVAILABLE_MESSAGE =
  'Interactive prompts are unavailable in this terminal. Re-run `augx init` from an interactive TTY.';

const OPTIONAL_RULES: OptionalRuleSpec[] = [
  {
    key: 'asciiOnlyCode',
    promptMessage: 'Add a rule that forces the AI to use ASCII (not UTF-8) when generating code?',
    defaultAnswer: true,
    install: installAsciiOnlyCodeRule,
    successLabel: 'ASCII-only-in-code',
    ruleFilename: 'ascii-only-code.md'
  },
  {
    key: 'utf8NonCode',
    promptMessage: 'Add a rule that explicitly allows UTF-8 in non-code content (prose, docs, etc.)?',
    defaultAnswer: true,
    install: installUtf8NonCodeRule,
    successLabel: 'UTF-8-in-non-code-allowed',
    ruleFilename: 'utf8-non-code-allowed.md'
  },
  {
    key: 'noEmoji',
    promptMessage: 'Add a rule that tells the AI to avoid emoji in generated content?',
    defaultAnswer: true,
    install: installNoEmojiRule,
    successLabel: 'no-emoji',
    ruleFilename: 'no-emoji.md'
  }
];

async function maybeInstallOptionalRules(
  options: InitOptions,
  promptApi: InteractivePrompt | null
): Promise<void> {
  if (options.optionalRules === false) {
    console.log(chalk.gray('\nSkipping optional rule prompts (--no-optional-rules).'));
    return;
  }

  // Build answers either from --yes (accept all defaults) or interactive prompts.
  let answers: Record<string, boolean>;
  if (options.yes) {
    answers = OPTIONAL_RULES.reduce<Record<string, boolean>>((acc, rule) => {
      acc[rule.key] = true;
      return acc;
    }, {});
    console.log(chalk.gray('\nAccepting all optional rule prompts (--yes).'));
  } else {
    if (!promptApi) {
      console.log(chalk.yellow(INIT_PROMPT_UNAVAILABLE_MESSAGE));
      return;
    }

    console.log(chalk.bold.blue('\nOptional rules\n'));
    answers = await promptApi.prompt(
      OPTIONAL_RULES.map(rule => ({
        type: 'confirm',
        name: rule.key,
        message: rule.promptMessage,
        default: rule.defaultAnswer
      }))
    );
  }

  for (const rule of OPTIONAL_RULES) {
    if (!answers[rule.key]) {
      console.log(chalk.gray(`- Skipped ${rule.successLabel} rule.`));
      continue;
    }
    console.log(chalk.blue(`\nInstalling ${rule.successLabel} rule...`));
    const result = await rule.install({
      targetDir: process.cwd(),
      skipIfExists: true,
      verbose: true
    });
    if (!result.success) {
      console.log(chalk.yellow(`Warning: Could not install ${rule.successLabel} rule: ${result.error}`));
      console.log(chalk.gray(`You can manually copy the rule from .augment/rules/${rule.ruleFilename}`));
    }
  }
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.bold.blue('\n🚀 Initializing Augment Extensions\n'));

  try {
    // Check if already initialized
    const augmentDir = path.join(process.cwd(), '.augment');
    const extensionsConfig = path.join(augmentDir, 'extensions.json');
    const hasExistingConfig = fs.existsSync(extensionsConfig);
    const needsPromptSupport = hasExistingConfig || (!options.yes && options.optionalRules !== false);
    const promptApi = needsPromptSupport ? await getInteractivePrompt() : null;

    if (needsPromptSupport && !promptApi) {
      console.log(chalk.yellow(INIT_PROMPT_UNAVAILABLE_MESSAGE));
      return;
    }

    if (hasExistingConfig) {
      const { overwrite } = await promptApi!.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Augment Extensions already initialized. Overwrite?',
          default: false
        }
      ]);

      if (!overwrite) {
        console.log(chalk.yellow('Initialization cancelled.'));
        return;
      }
    }

    // Create .augment directory if it doesn't exist
    if (!fs.existsSync(augmentDir)) {
      fs.mkdirSync(augmentDir, { recursive: true });
      console.log(chalk.green('✓ Created .augment directory'));
    }

    // Create extensions.json
    const config = {
      version: '0.1.0',
      modules: [],
      settings: {
        autoUpdate: false,
        checkUpdatesOnInit: true
      }
    };

    fs.writeFileSync(extensionsConfig, JSON.stringify(config, null, 2));
    console.log(chalk.green('✓ Created extensions.json'));

    // Update or create AGENTS.md
    const agentsPath = path.join(process.cwd(), 'AGENTS.md');
    const agentsContent = `
# Augment Extensions Integration

This project uses Augment Extensions for additional AI coding guidelines.

## For AI Agents

Use the \`augx\` CLI to discover and apply extension modules:

\`\`\`bash
# List linked modules
augx list --linked

# Show module details
augx show <module-name>

# Search for modules
augx search <keyword>
\`\`\`

## Linked Modules

Check \`.augment/extensions.json\` for currently linked modules.
`;

    if (fs.existsSync(agentsPath)) {
      const existing = fs.readFileSync(agentsPath, 'utf-8');
      if (!existing.includes('Augment Extensions')) {
        fs.appendFileSync(agentsPath, '\n' + agentsContent);
        console.log(chalk.green('✓ Updated AGENTS.md'));
      }
    } else {
      fs.writeFileSync(agentsPath, agentsContent.trim());
      console.log(chalk.green('✓ Created AGENTS.md'));
    }

    // Create .gitignore entry if needed
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      if (!gitignore.includes('.augment/extensions.json')) {
        fs.appendFileSync(gitignorePath, '\n# Augment Extensions\n.augment/extensions.json\n');
        console.log(chalk.green('✓ Updated .gitignore'));
      }
    }

    // Install character count management rule
    console.log(chalk.blue('\n📏 Installing character count management rule...\n'));
    const ruleResult = await installCharacterCountRule({
      targetDir: process.cwd(),
      skipIfExists: true,
      verbose: true
    });

    if (!ruleResult.success) {
      console.log(chalk.yellow(`⚠ Warning: Could not install character count rule: ${ruleResult.error}`));
      console.log(chalk.gray('You can manually copy the rule from .augment/rules/character-count-management.md'));
    }

    // Install no-em-dash rule
    console.log(chalk.blue('\n🚫 Installing no-em-dash rule...\n'));
    const emDashResult = await installEmDashRule({
      targetDir: process.cwd(),
      skipIfExists: true,
      verbose: true
    });

    if (!emDashResult.success) {
      console.log(chalk.yellow(`⚠ Warning: Could not install no-em-dash rule: ${emDashResult.error}`));
      console.log(chalk.gray('You can manually copy the rule from .augment/rules/no-em-dash.md'));
    }

    // Prompt for and conditionally install the optional rules
    // (ASCII-only-code, UTF-8 in non-code, no-emoji)
    await maybeInstallOptionalRules(options, promptApi);

    // Extract command help for workflow tools
    console.log(chalk.blue('\n📖 Extracting command help for workflow tools...\n'));
    try {
      const helpOutputPath = '.augment/COMMAND_HELP.md';
      await extractCommandHelp(process.cwd(), helpOutputPath);
      console.log(chalk.green('✓ Command help reference generated'));
    } catch (error: any) {
      console.log(chalk.yellow(`⚠ Warning: Could not extract command help: ${error.message}`));
      console.log(chalk.gray('You can manually run: augx extract-help'));
    }

    // Initialize .beads directory and completed.jsonl
    const beadsDir = path.join(process.cwd(), '.beads');
    const beadsIssuesPath = path.join(beadsDir, 'issues.jsonl');
    const beadsConfigPath = path.join(beadsDir, 'config.json');

    // Check if Beads should be initialized (either .beads exists or issues.jsonl exists)
    const shouldInitBeads = fs.existsSync(beadsDir) || fs.existsSync(beadsIssuesPath);

    if (shouldInitBeads) {
      console.log(chalk.blue('\n📋 Initializing Beads integration...\n'));

      // Create .beads directory if it doesn't exist
      if (!fs.existsSync(beadsDir)) {
        fs.mkdirSync(beadsDir, { recursive: true });
        console.log(chalk.green('✓ Created .beads directory'));
      }

      // Create issues.jsonl if it doesn't exist
      if (!fs.existsSync(beadsIssuesPath)) {
        fs.writeFileSync(beadsIssuesPath, '', 'utf-8');
        console.log(chalk.green('✓ Created .beads/issues.jsonl'));
      }

      // Create config.json if it doesn't exist
      if (!fs.existsSync(beadsConfigPath)) {
        const beadsConfig = {
          version: '1.0.0',
          project: path.basename(process.cwd()),
          created: new Date().toISOString()
        };
        fs.writeFileSync(beadsConfigPath, JSON.stringify(beadsConfig, null, 2), 'utf-8');
        console.log(chalk.green('✓ Created .beads/config.json'));
      }

      // Create scripts directory if it doesn't exist
      const scriptsDir = path.join(process.cwd(), 'scripts');
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
        console.log(chalk.green('✓ Created scripts directory'));
      }

      // Create completed.jsonl if it doesn't exist
      const completedPath = path.join(scriptsDir, 'completed.jsonl');
      if (!fs.existsSync(completedPath)) {
        fs.writeFileSync(completedPath, '', 'utf-8');
        console.log(chalk.green('✓ Created scripts/completed.jsonl'));
      }
    }

    console.log(chalk.bold.green('\n✨ Augment Extensions initialized successfully!\n'));
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray('  1. Link modules: augx link coding-standards/typescript'));
    console.log(chalk.gray('  2. View modules: augx list'));
    console.log(chalk.gray('  3. Show details: augx show <module-name>\n'));

  } catch (error) {
    console.error(chalk.red('Error during initialization:'), error);
    process.exit(1);
  }
}

