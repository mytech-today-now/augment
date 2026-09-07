import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { findModule } from '../utils/module-system';
import { resolveSingleModule } from '../lib/module-resolver';
import {
  ensureClaudeIncludeStub,
  mirrorModule,
} from '../lib/mirror-runner';
import {
  persistMirrorEntries,
  readMirrorManifest,
  recordedEntriesByTarget,
} from '../lib/mirror-coordination';
import {
  DEFAULT_EXPORT_IGNORE,
  MIRROR_TOOLS,
  isMirrorTool,
} from '../types/coordination-export';
import type {
  ExportBlock,
  MirrorTool,
} from '../types/coordination-export';

interface LinkOptions {
  version?: string;
  mirror?: string;
  verbose?: boolean;
}

/**
 * Resolve the set of tools to mirror for this `augx link` invocation.
 *
 * Precedence (per openspec/specs/cross-platform/mirror-hook.md):
 *   1. Explicit `--mirror` value (comma-separated, validated against the
 *      closed enum). An invalid token surfaces as a usage error.
 *   2. `.augment/coordination.json.export.mirror === true` plus
 *      `.export.targets[]` for the actual tool list.
 *   3. No mirroring.
 */
function resolveMirrorTools(
  flagValue: string | undefined,
  exportBlock: ExportBlock | undefined
): MirrorTool[] | { error: string } {
  if (flagValue !== undefined) {
    const tokens = flagValue
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) {
      return { error: 'Empty --mirror value.' };
    }
    if (tokens.length === 1 && tokens[0] === 'all') {
      return [...MIRROR_TOOLS];
    }
    const out: MirrorTool[] = [];
    for (const token of tokens) {
      if (!isMirrorTool(token)) {
        return {
          error: `Unknown --mirror value: ${token}. Valid: ${MIRROR_TOOLS.join(', ')}, all.`,
        };
      }
      if (!out.includes(token)) {
        out.push(token);
      }
    }
    return out;
  }
  if (exportBlock?.mirror === true) {
    const fromTargets = (exportBlock.targets ?? []).filter(isMirrorTool);
    return fromTargets.length > 0 ? [...fromTargets] : [];
  }
  return [];
}

function writeLinkedModulesConfig(
  configPath: string,
  config: any,
  moduleFullName: string,
  action: 'link' | 'update'
): void {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to ${action} module ${moduleFullName}: ${details}`);
  }
}

export async function linkCommand(moduleName: string, options: LinkOptions): Promise<void> {
  try {
    console.log(chalk.blue(`Linking module: ${moduleName}`));

    const projectRoot = process.cwd();
    const configPath = path.join(projectRoot, '.augment', 'extensions.json');

    if (!fs.existsSync(configPath)) {
      console.error(chalk.red('Augment Extensions not initialized. Run: augx init'));
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!Array.isArray(config.modules)) {
      throw new Error('Invalid extensions config: expected modules array in .augment/extensions.json');
    }
    const modules = config.modules;

    const module = findModule(moduleName);

    if (!module) {
      console.error(chalk.red(`Module not found: ${moduleName}`));
      process.exit(1);
    }

    const requestedVersion = options.version ?? module.metadata.version;
    const hasVersionOverride = options.version !== undefined;
    const existingIndex = modules.findIndex((m: any) =>
      m.name === module.fullName || m.name === moduleName
    );

    if (existingIndex < 0) {
      modules.push({
        name: module.fullName,
        version: requestedVersion,
        type: module.metadata.type,
        description: module.metadata.description,
      });
      writeLinkedModulesConfig(configPath, config, module.fullName, 'link');
      console.log(chalk.green(`✓ Linked ${module.fullName} (v${requestedVersion})`));
    } else if (hasVersionOverride) {
      const existingModule = modules[existingIndex];
      if (!existingModule || typeof existingModule !== 'object' || Array.isArray(existingModule)) {
        throw new Error(
          `Unable to update module ${module.fullName}: invalid linked module record in extensions.json`
        );
      }

      const currentVersion =
        typeof existingModule.version === 'string' ? existingModule.version : undefined;
      modules[existingIndex] = {
        ...existingModule,
        version: requestedVersion,
      };
      writeLinkedModulesConfig(configPath, config, module.fullName, 'update');

      if (currentVersion && currentVersion !== requestedVersion) {
        console.log(
          chalk.green(`✓ Updated ${module.fullName} (v${currentVersion} → v${requestedVersion})`)
        );
      } else {
        console.log(chalk.green(`✓ Updated ${module.fullName} (v${requestedVersion})`));
      }
    } else {
      console.log(chalk.yellow(`Module already linked: ${module.fullName}`));
    }

    const { manifest } = readMirrorManifest(projectRoot);
    const mirrorChoice = resolveMirrorTools(options.mirror, manifest.export as ExportBlock | undefined);
    if (!Array.isArray(mirrorChoice)) {
      console.error(chalk.red(`Usage error: ${mirrorChoice.error}`));
      process.exit(1);
      return;
    }

    if (mirrorChoice.length === 0) {
      console.log(chalk.gray(`\nUse "augx show ${module.fullName}" to view module details`));
      return;
    }

    const resolved = resolveSingleModule(module.fullName, DEFAULT_EXPORT_IGNORE);
    if (!resolved) {
      console.error(chalk.red(`Resolution error: could not load rules for ${module.fullName}`));
      process.exit(2);
      return;
    }

    const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const augxVersion = JSON.parse(
      fs.readFileSync(pkgPath, 'utf-8').replace(/^\uFEFF/, '')
    ).version as string;

    const result = mirrorModule(resolved, mirrorChoice, {
      projectRoot,
      augxVersion,
      ignorePatterns: DEFAULT_EXPORT_IGNORE,
      now: () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      verbose: options.verbose,
      recordedByTarget: recordedEntriesByTarget(manifest, module.fullName),
      log: (msg) => console.log(chalk.gray(msg)),
    });

    persistMirrorEntries(projectRoot, module.fullName, result.entries);
    if (result.claudeStubsAdded) {
      ensureClaudeIncludeStub(projectRoot, module.fullName, 'add');
    }

    console.log(
      chalk.green(
        `✓ Mirrored ${module.fullName} -> ${mirrorChoice.join(', ')} (${result.entries.length} entries)`
      )
    );
    console.log(chalk.gray(`\nUse "augx show ${module.fullName}" to view module details`));
  } catch (error) {
    console.error(chalk.red('Error linking module:'), error);
    process.exit(1);
  }
}

