import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as semver from 'semver';
import { compareSemanticVersions, findModule } from '../utils/module-system';

interface UpdateOptions {
  module?: string;
  cli?: boolean;
  all?: boolean;
}

interface LinkedModule {
  name: string;
  version: string;
  type: string;
  description: string;
}

export async function updateCommand(options: UpdateOptions): Promise<void> {
  try {
    // If --cli flag is set, update the CLI itself
    if (options.cli || options.all) {
      await updateCLI();
      if (options.cli && !options.all) {
        return; // Only update CLI, not modules
      }
    }

    // Update modules
    console.log(chalk.blue('\n🔄 Updating modules...\n'));

    // Load extensions config
    const configPath = path.join(process.cwd(), '.augment', 'extensions.json');

    if (!fs.existsSync(configPath)) {
      console.error(chalk.red('Augment Extensions not initialized. Run: augx init'));
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const resolvedModuleName = options.module
      ? (findModule(options.module)?.fullName || options.module)
      : undefined;

    if (!config.modules || config.modules.length === 0) {
      console.log(chalk.yellow('No modules linked. Use "augx link <module>" to link modules.'));
      return;
    }

    const modulesToUpdate = resolvedModuleName
      ? config.modules.filter((m: LinkedModule) => m.name === resolvedModuleName)
      : config.modules;

    if (modulesToUpdate.length === 0) {
      console.error(chalk.red(`Module not found: ${options.module}`));
      process.exit(1);
    }

    let updatedCount = 0;
    let upToDateCount = 0;
    let errorCount = 0;

    for (const linkedModule of modulesToUpdate) {
      const result = await updateModule(linkedModule, config);

      if (result === 'updated') {
        updatedCount++;
      } else if (result === 'up-to-date') {
        upToDateCount++;
      } else {
        errorCount++;
      }
    }

    // Save updated config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(chalk.bold.green('\n✨ Update complete!\n'));
    console.log(chalk.gray(`Updated: ${updatedCount}`));
    console.log(chalk.gray(`Up to date: ${upToDateCount}`));
    if (errorCount > 0) {
      console.log(chalk.red(`Errors: ${errorCount}`));
    }
    console.log();

  } catch (error) {
    console.error(chalk.red('Error updating:'), error);
    process.exit(1);
  }
}

async function updateCLI(): Promise<void> {
  try {
    console.log(chalk.blue('\n🔄 Updating CLI...\n'));

    // Get current version from package.json
    const packageJsonPath = path.join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const currentVersion = packageJson.version;

    console.log(chalk.gray(`Current version: ${currentVersion}`));

    // Check npm registry for latest version
    console.log(chalk.gray('Checking npm registry for latest version...'));

    let latestVersion: string;
    try {
      const npmViewOutput = execSync('npm view @mytechtoday/augment-extensions version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      latestVersion = npmViewOutput;
    } catch (error) {
      console.error(chalk.red('✗ Failed to check npm registry'));
      console.error(chalk.gray('Make sure you have internet connection and npm is configured correctly'));
      throw error;
    }

    console.log(chalk.gray(`Latest version: ${latestVersion}`));

    // Compare versions
    if (semver.eq(currentVersion, latestVersion)) {
      console.log(chalk.green(`\n✓ CLI is already up to date (v${currentVersion})\n`));
      return;
    }

    if (semver.gt(currentVersion, latestVersion)) {
      console.log(chalk.yellow(`\n⚠ Current version (${currentVersion}) is newer than npm registry (${latestVersion})\n`));
      return;
    }

    // Update available
    console.log(chalk.cyan(`\n📦 Update available: ${currentVersion} → ${latestVersion}\n`));
    console.log(chalk.gray('Installing update...'));

    try {
      execSync('npm install -g @mytechtoday/augment-extensions@latest', {
        encoding: 'utf-8',
        stdio: 'inherit'
      });

      console.log(chalk.bold.green(`\n✨ CLI updated successfully to v${latestVersion}!\n`));
      console.log(chalk.gray('You may need to restart your terminal for changes to take effect.\n'));
    } catch (error) {
      console.error(chalk.red('\n✗ Failed to update CLI'));
      console.error(chalk.gray('You may need to run with elevated permissions (sudo/administrator)'));
      console.error(chalk.gray('Or try: npm install -g @mytechtoday/augment-extensions@latest'));
      throw error;
    }

  } catch (error) {
    console.error(chalk.red('Error updating CLI:'), error);
    process.exit(1);
  }
}

async function updateModule(linkedModule: LinkedModule, config: any): Promise<'updated' | 'up-to-date' | 'error'> {
  try {
    const modulesDir = path.join(__dirname, '../../../augment-extensions');
    const modulePath = path.join(modulesDir, linkedModule.name);
    const moduleJsonPath = path.join(modulePath, 'module.json');

    if (!fs.existsSync(moduleJsonPath)) {
      console.log(chalk.red(`✗ ${linkedModule.name}: Module not found`));
      return 'error';
    }

    const moduleData = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
    const latestVersion = moduleData.version;
    const currentVersion = linkedModule.version;

    const comparison = compareSemanticVersions(latestVersion, currentVersion);

    if (comparison === 0) {
      console.log(chalk.gray(`○ ${linkedModule.name}: Already up to date (v${currentVersion})`));
      return 'up-to-date';
    }

    // Check if it's a newer version
    if (comparison > 0) {
      // Update in config
      const moduleIndex = config.modules.findIndex((m: LinkedModule) => m.name === linkedModule.name);
      if (moduleIndex >= 0) {
        config.modules[moduleIndex].version = latestVersion;
        config.modules[moduleIndex].description = moduleData.description;
      }

      console.log(chalk.green(`✓ ${linkedModule.name}: Updated ${currentVersion} → ${latestVersion}`));
      return 'updated';
    } else {
      console.log(chalk.yellow(`⚠ ${linkedModule.name}: Current version (${currentVersion}) is newer than available (${latestVersion})`));
      return 'up-to-date';
    }

  } catch (error) {
    console.log(chalk.red(`✗ ${linkedModule.name}: Error updating - ${error}`));
    return 'error';
  }
}

