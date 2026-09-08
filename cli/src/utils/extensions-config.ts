import * as fs from 'fs';
import * as path from 'path';

export interface LinkedModuleRecord {
  name: string;
  version: string;
  type?: string;
  description?: string;
  pinnedAt?: string;
  [key: string]: unknown;
}

export interface ExtensionsConfig {
  version?: string;
  modules: LinkedModuleRecord[];
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LoadedExtensionsConfig {
  exists: boolean;
  valid: boolean;
  config: ExtensionsConfig;
  error?: string;
}

export function getExtensionsConfigPath(projectRoot: string = process.cwd()): string {
  return path.join(projectRoot, '.augment', 'extensions.json');
}

export function loadExtensionsConfig(projectRoot: string = process.cwd()): LoadedExtensionsConfig {
  const configPath = getExtensionsConfigPath(projectRoot);

  if (!fs.existsSync(configPath)) {
    return {
      exists: false,
      valid: true,
      config: { modules: [] }
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ExtensionsConfig;

    if (!Array.isArray(parsed.modules)) {
      return {
        exists: true,
        valid: false,
        config: { modules: [] },
        error: 'expected modules array in .augment/extensions.json'
      };
    }

    return {
      exists: true,
      valid: true,
      config: {
        ...parsed,
        modules: parsed.modules
      }
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      config: { modules: [] },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function writeExtensionsConfig(projectRoot: string, config: ExtensionsConfig): void {
  const configPath = getExtensionsConfigPath(projectRoot);
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function pinModuleVersion(
  moduleName: string,
  version: string,
  projectRoot: string = process.cwd()
): void {
  const configPath = getExtensionsConfigPath(projectRoot);
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  let config: ExtensionsConfig = { modules: [] };

  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ExtensionsConfig;
      if (Array.isArray(parsed.modules)) {
        config = parsed;
      }
    } catch {
      config = { modules: [] };
    }
  }

  if (!Array.isArray(config.modules)) {
    config.modules = [];
  }

  const existingIndex = config.modules.findIndex((module) => module.name === moduleName);
  const pinnedAt = new Date().toISOString();

  if (existingIndex >= 0) {
    config.modules[existingIndex] = {
      ...config.modules[existingIndex],
      name: moduleName,
      version,
      pinnedAt
    };
  } else {
    config.modules.push({
      name: moduleName,
      version,
      pinnedAt
    });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
