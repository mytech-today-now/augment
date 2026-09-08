import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { getInteractivePrompt, type InteractivePrompt } from '../utils/interactive-prompt';

interface SelfRemoveOptions {
  dryRun?: boolean;
  force?: boolean;
}

interface VscodeCleanupState {
  exists: boolean;
  recommendations: string[] | null;
}

const AUGMENT_EXTENSIONS_CONFIG_RELATIVE_PATH = '.augment/extensions.json';
const VSCODE_EXTENSIONS_CONFIG_RELATIVE_PATH = '.vscode/extensions.json';
const SELF_REMOVE_LOG_RELATIVE_PATH = '.augment-removal.log';

const SELF_REMOVE_PROMPT_UNAVAILABLE_MESSAGE =
  'Interactive prompts are unavailable in this terminal. Re-run `augx self-remove` from an interactive TTY to review the preserved .augment/ directory and user content before unlinking.';

function formatModuleLabel(module: any): string {
  if (typeof module === 'string') {
    return module;
  }

  const name = module?.name ?? '(unknown module)';
  const version = module?.version ? ` (v${module.version})` : '';
  return `${name}${version}`;
}

function getVscodeCleanupState(vscodeExtensionsJsonPath: string): VscodeCleanupState {
  if (!fs.existsSync(vscodeExtensionsJsonPath)) {
    return { exists: false, recommendations: null };
  }

  try {
    const extensionsJson = JSON.parse(fs.readFileSync(vscodeExtensionsJsonPath, 'utf-8'));
    return {
      exists: true,
      recommendations: Array.isArray(extensionsJson.recommendations) ? extensionsJson.recommendations : []
    };
  } catch {
    return { exists: true, recommendations: null };
  }
}

function getAugmentRecommendationsToRemove(state: VscodeCleanupState): string[] {
  if (!state.exists || state.recommendations === null) {
    return [];
  }

  return state.recommendations.filter((ext: string) => ext.includes('augment'));
}

function printCleanupScope(linkedModules: any[], vscodeCleanupState: VscodeCleanupState, dryRun: boolean): void {
  const removals = getAugmentRecommendationsToRemove(vscodeCleanupState);

  console.log(
    chalk.blue(
      dryRun
        ? 'Dry-run mode: this safe cleanup would update the following project-owned paths:\n'
        : 'This safe cleanup will update the following project-owned paths:\n'
    )
  );

  console.log(chalk.gray(`  - Linked modules recorded in ${AUGMENT_EXTENSIONS_CONFIG_RELATIVE_PATH}:`));
  if (linkedModules.length === 0) {
    console.log(chalk.gray('    • none'));
  } else {
    linkedModules.forEach((module: any) => {
      console.log(chalk.gray(`    • ${formatModuleLabel(module)}`));
    });
  }

  if (vscodeCleanupState.exists) {
    console.log(chalk.gray(`  - Augment recommendations in ${VSCODE_EXTENSIONS_CONFIG_RELATIVE_PATH}:`));
    if (removals.length === 0) {
      console.log(chalk.gray('    • none'));
    } else {
      removals.forEach((recommendation) => {
        console.log(chalk.gray(`    • ${recommendation}`));
      });
    }
  } else {
    console.log(chalk.gray(`  - Augment recommendations in ${VSCODE_EXTENSIONS_CONFIG_RELATIVE_PATH} (not present)`));
  }

  console.log(chalk.gray('  - Preserved: .augment/, .augment/extensions.json, user-generated content'));
  console.log(chalk.gray(`  - Cleanup log: ${SELF_REMOVE_LOG_RELATIVE_PATH}`));
}

export async function selfRemoveCommand(options: SelfRemoveOptions = {}): Promise<void> {
  try {
    console.log(chalk.red('\nAugment Extensions Safe Cleanup\n'));

    const augmentDir = path.join(process.cwd(), '.augment');
    const extensionsConfigPath = path.join(augmentDir, 'extensions.json');
    const vscodeExtensionsJsonPath = path.join(process.cwd(), '.vscode', 'extensions.json');

    if (!fs.existsSync(extensionsConfigPath)) {
      console.log(chalk.yellow('Augment Extensions not found in this project.'));
      return;
    }

    const config = JSON.parse(fs.readFileSync(extensionsConfigPath, 'utf-8'));
    const linkedModules = Array.isArray(config.modules) ? config.modules : [];
    const vscodeCleanupState = getVscodeCleanupState(vscodeExtensionsJsonPath);

    if (options.dryRun) {
      printCleanupScope(linkedModules, vscodeCleanupState, true);
      return;
    }

    printCleanupScope(linkedModules, vscodeCleanupState, false);

    // Confirmation prompt
    if (!options.force) {
      const promptApi: InteractivePrompt | null = await getInteractivePrompt();
      if (!promptApi) {
        console.log(chalk.yellow(SELF_REMOVE_PROMPT_UNAVAILABLE_MESSAGE));
        return;
      }

      const { confirm } = await promptApi.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: chalk.red('Are you sure you want to unlink all modules and preserve .augment/ and user content?'),
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }

      // Double confirmation only if there are many modules
      if (linkedModules.length > 5) {
        const { doubleConfirm } = await promptApi.prompt([
          {
            type: 'input',
            name: 'doubleConfirm',
            message: 'Type "REMOVE" to confirm:',
            validate: (input: string) => input === 'REMOVE' || 'You must type "REMOVE" to confirm'
          }
        ]);

        if (doubleConfirm !== 'REMOVE') {
          console.log(chalk.yellow('Cancelled.'));
          return;
        }
      }
    }

    console.log(chalk.blue('\nUpdating project-owned Augment Extensions state...\n'));

    const originalModules = Array.isArray(config.modules) ? [...config.modules] : [];
    config.modules = [];

    fs.writeFileSync(extensionsConfigPath, JSON.stringify(config, null, 2));
    console.log(
      chalk.green(
        `✓ Removed ${originalModules.length} linked module record(s) from ${AUGMENT_EXTENSIONS_CONFIG_RELATIVE_PATH}`
      )
    );

    let vscodeRecommendationsUpdated = false;
    if (vscodeCleanupState.exists && vscodeCleanupState.recommendations !== null) {
      try {
        const extensionsJson = JSON.parse(fs.readFileSync(vscodeExtensionsJsonPath, 'utf-8'));

        if (extensionsJson.recommendations) {
          const originalLength = extensionsJson.recommendations.length;
          extensionsJson.recommendations = extensionsJson.recommendations.filter(
            (ext: string) => !ext.includes('augment')
          );

          if (extensionsJson.recommendations.length < originalLength) {
            fs.writeFileSync(vscodeExtensionsJsonPath, JSON.stringify(extensionsJson, null, 2));
            vscodeRecommendationsUpdated = true;
            console.log(
              chalk.green(
                `✓ Cleaned Augment recommendations from ${VSCODE_EXTENSIONS_CONFIG_RELATIVE_PATH}`
              )
            );
          }
        }
      } catch {
        console.log(chalk.yellow(`⚠ Could not clean ${VSCODE_EXTENSIONS_CONFIG_RELATIVE_PATH}`));
      }
    }

    const logPath = path.join(process.cwd(), SELF_REMOVE_LOG_RELATIVE_PATH);
    const logContent = {
      timestamp: new Date().toISOString(),
      modulesRemoved: originalModules.length,
      modules: originalModules,
      success: true
    };
    fs.writeFileSync(logPath, JSON.stringify(logContent, null, 2));

    console.log(chalk.green('\n✓ Augment Extensions cleanup complete'));
    console.log(chalk.gray(`  - Cleanup log written to ${logPath}`));
    if (vscodeCleanupState.exists && vscodeCleanupState.recommendations !== null && !vscodeRecommendationsUpdated) {
      console.log(
        chalk.gray(`  - No Augment recommendations removed from ${VSCODE_EXTENSIONS_CONFIG_RELATIVE_PATH}`)
      );
    }
    console.log(chalk.cyan('Preserved: .augment/, .augment/extensions.json, user-generated content'));
    console.log(chalk.blue('\nTo link modules again:'));
    console.log(chalk.gray('  augx link <module-name>'));
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

