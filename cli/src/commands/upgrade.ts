import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ModuleLoader } from '../core/module-loader';
import { VersionManager } from '../core/version-manager';
import { CompatibilityChecker } from '../core/compatibility-checker';
import { discoverModules, compareSemanticVersions } from '../utils/module-system';

export interface UpgradeCommandOptions {
  force?: boolean;
  json?: boolean;
  dryRun?: boolean;
  compatibilityChecker?: CompatibilityChecker;
}

export async function upgradeCommand(moduleName: string, options: UpgradeCommandOptions = {}): Promise<void> {
  try {
    const { force = false, json = false, dryRun = false } = options;
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

    const versionManager = new VersionManager();
    const currentMetadata = versionManager.getVersion(module.path);
    if (!currentMetadata) {
      if (json) {
        console.log(JSON.stringify({ error: 'Unable to determine current version' }, null, 2));
      } else {
        console.error(chalk.red('✗ Unable to determine current version'));
      }
      process.exit(1);
    }

    const currentVersion = currentMetadata.version;
    const loader = new ModuleLoader();
    const latestResult = loader.load(module.path, { version: 'latest' });
    if (!latestResult) {
      if (json) {
        console.log(JSON.stringify({ error: 'Unable to load latest version' }, null, 2));
      } else {
        console.error(chalk.red('✗ Unable to load latest version'));
      }
      process.exit(1);
    }

    const latestVersion = latestResult.version;
    const comparison = compareSemanticVersions(latestVersion, currentVersion);

    if (comparison === 0) {
      if (json) {
        console.log(JSON.stringify({
          success: true,
          message: 'Already at latest version',
          module: moduleName,
          version: currentVersion
        }, null, 2));
      } else {
        console.log(chalk.green(`✓ ${moduleName} is already at the latest version (${currentVersion})`));
      }
      return;
    }

    if (comparison < 0) {
      if (json) {
        console.log(JSON.stringify({
          warning: 'Current version is newer than latest',
          current: currentVersion,
          latest: latestVersion
        }, null, 2));
      } else {
        console.log(chalk.yellow(`⚠ Current version (${currentVersion}) is newer than latest (${latestVersion})`));
      }
      return;
    }

    const compatChecker = options.compatibilityChecker ?? new CompatibilityChecker();
    const compatResult = compatChecker.checkCompatibility(module.path);
    const hasCompatibilityErrors = compatResult.errors.length > 0;
    const shouldBlockOnCompatibility = hasCompatibilityErrors && !force;

    if (!json) {
      console.log(chalk.bold.blue(`\n📦 Upgrade Available for ${moduleName}\n`));
      console.log(`  ${chalk.gray('Current version:')} ${chalk.yellow(currentVersion)}`);
      console.log(`  ${chalk.gray('Latest version:')}  ${chalk.green(latestVersion)}`);

      if (latestResult.metadata.breaking) {
        console.log(chalk.red('\n  ⚠ WARNING: This version contains breaking changes!'));
      }

      if (latestResult.metadata.deprecated) {
        console.log(chalk.yellow('\n  ⚠ This version is deprecated'));
        if (latestResult.metadata.deprecationMessage) {
          console.log(chalk.yellow(`    ${latestResult.metadata.deprecationMessage}`));
        }
      }

      if (compatResult.warnings.length > 0) {
        console.log(chalk.yellow('\n  Compatibility Warnings:'));
        compatResult.warnings.forEach((w) => console.log(chalk.yellow(`    - ${w}`)));
      }

      if (compatResult.errors.length > 0) {
        console.log(chalk.red('\n  Compatibility Errors:'));
        compatResult.errors.forEach((e) => console.log(chalk.red(`    - ${e}`)));

        if (!force) {
          console.log(chalk.red('\n  Use --force to upgrade anyway'));
        }
      }
    }

    if (shouldBlockOnCompatibility) {
      if (json) {
        console.log(JSON.stringify({
          error: 'Compatibility checks failed',
          module: moduleName,
          currentVersion,
          latestVersion,
          compatibility: compatResult
        }, null, 2));
      }
      process.exit(1);
    }

    if (dryRun) {
      if (json) {
        console.log(JSON.stringify({
          dryRun: true,
          module: moduleName,
          currentVersion,
          latestVersion,
          breaking: latestResult.metadata.breaking,
          deprecated: latestResult.metadata.deprecated,
          compatibility: compatResult
        }, null, 2));
      } else {
        console.log(chalk.cyan('\n  [DRY RUN] No changes made'));
      }
      return;
    }

    const configPath = path.join(process.cwd(), '.augment', 'extensions.json');
    let upgraded = false;
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { modules?: Array<{ name: string; version?: string; upgradedAt?: string }> };
        if (Array.isArray(config.modules)) {
          const moduleIndex = config.modules.findIndex((m) => m.name === moduleName);
          if (moduleIndex >= 0) {
            config.modules[moduleIndex].version = latestVersion;
            config.modules[moduleIndex].upgradedAt = new Date().toISOString();
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            upgraded = true;
          }
        }
      } catch {
        // Ignore config write failures; command can still report the available upgrade.
      }
    }

    if (json) {
      console.log(JSON.stringify({
        success: true,
        module: moduleName,
        previousVersion: currentVersion,
        newVersion: latestVersion,
        breaking: latestResult.metadata.breaking,
        deprecated: latestResult.metadata.deprecated,
        configUpdated: upgraded,
        compatibility: compatResult
      }, null, 2));
      return;
    }

    console.log(chalk.green(`\n✓ Successfully upgraded ${moduleName}`));
    console.log(chalk.gray(`  ${currentVersion} → ${latestVersion}`));
    if (upgraded) {
      console.log(chalk.cyan('  📌 Config updated'));
    }

    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  - Review breaking changes if any'));
    console.log(chalk.gray('  - Test your project with the new version'));
    console.log(chalk.gray(`  - Run: augx show ${moduleName} to see details`));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('process.exit(')) {
      throw error;
    }

    if (options.json) {
      console.log(JSON.stringify({ error: String(error) }, null, 2));
    } else {
      console.error(chalk.red('Error upgrading module:'), error);
    }
    process.exit(1);
  }
}
