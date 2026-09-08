import chalk from 'chalk';
import { ModuleLoader } from '../core/module-loader';
import { discoverModules } from '../utils/module-system';
import { pinModuleVersion } from '../utils/extensions-config';

export interface UseCommandOptions {
  version?: string;
  pin?: boolean;
  json?: boolean;
}

export async function useCommand(moduleName: string, options: UseCommandOptions = {}): Promise<void> {
  try {
    const { version = 'latest', pin = false, json = false } = options;
    const modules = discoverModules();
    const module = modules.find((m) => m.fullName === moduleName || m.metadata.name === moduleName);

    if (!module) {
      if (json) {
        console.log(JSON.stringify({ error: `Module not found: ${moduleName}` }, null, 2));
      } else {
        console.error(chalk.red(`✗ Module not found: ${moduleName}`));
        console.log(chalk.gray('\nAvailable modules:'));
        modules.forEach((m) => console.log(chalk.gray(`  - ${m.fullName}`)));
      }
      process.exit(1);
    }

    const loader = new ModuleLoader();
    const result = loader.load(module.path, { version });

    if (!result) {
      if (json) {
        console.log(JSON.stringify({ error: `Failed to load module ${moduleName} with version ${version}` }, null, 2));
      } else {
        console.error(chalk.red(`✗ Failed to load module ${moduleName} with version ${version}`));
        const availableVersions = loader.getAvailableVersions(module.path);
        if (availableVersions.length > 0) {
          console.log(chalk.gray('\nAvailable versions:'));
          availableVersions.forEach((v) => console.log(chalk.gray(`  - ${v}`)));
        }
      }
      process.exit(1);
    }

    if (pin) {
      await pinModuleVersion(module.fullName, result.version);
    }

    if (json) {
      console.log(JSON.stringify({
        success: true,
        module: moduleName,
        version: result.version,
        strategy: result.resolution.strategy,
        pinned: pin,
        metadata: {
          deprecated: result.metadata.deprecated,
          breaking: result.metadata.breaking,
          description: result.module.metadata.description
        }
      }, null, 2));
      return;
    }

    console.log(chalk.green(`✓ Successfully loaded ${moduleName} v${result.version}`));
    console.log(chalk.gray(`  Strategy: ${result.resolution.strategy}`));

    if (result.metadata.deprecated) {
      console.log(chalk.yellow('  ⚠ Warning: This version is deprecated'));
      if (result.metadata.deprecationMessage) {
        console.log(chalk.yellow(`    ${result.metadata.deprecationMessage}`));
      }
    }

    if (result.metadata.breaking) {
      console.log(chalk.yellow('  ⚠ Warning: This version contains breaking changes'));
    }

    if (pin) {
      console.log(chalk.cyan('  📌 Version pinned to config'));
    }

    console.log(chalk.gray(`\nModule: ${result.module.metadata.description}`));
    console.log(chalk.gray(`Type: ${result.module.metadata.type}`));
    console.log(chalk.gray(`Rules: ${result.module.rules.length}`));
    console.log(chalk.gray(`Examples: ${result.module.examples.length}`));
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ error: String(error) }, null, 2));
    } else {
      console.error(chalk.red('Error using module:'), error);
    }
    process.exit(1);
  }
}
