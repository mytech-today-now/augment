import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

/**
 * Module metadata interface
 */
export interface ModuleMetadata {
  name: string;
  version: string;
  displayName: string;
  description: string;
  type: 'coding-standards' | 'domain-rules' | 'workflows' | 'examples' | 'marketing-standards' | 'writing-standards' | 'themes';
  tags?: string[];
  augment?: {
    characterCount?: number;
    priority?: 'high' | 'medium' | 'low';
    category?: string;
    subModules?: Array<{
      name: string;
      path: string;
      version?: string;
    }>;
  };
  installation?: 'required' | 'optional';
  dependencies?: string[];
}

/**
 * Module structure interface
 */
export interface Module {
  metadata: ModuleMetadata;
  path: string;
  fullName: string;
  rules: string[];
  examples: string[];
  isSubModule?: boolean;
  parentModule?: string;
  subModules?: string[];
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Get the modules directory path
 */
export function getModulesDir(): string {
  return path.join(__dirname, '../../../augment-extensions');
}

/**
 * Validate module.json structure
 */
export function validateModuleMetadata(metadata: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!metadata.name) errors.push('Missing required field: name');
  if (!metadata.version) errors.push('Missing required field: version');
  if (!metadata.displayName) errors.push('Missing required field: displayName');
  if (!metadata.description) errors.push('Missing required field: description');
  if (!metadata.type) errors.push('Missing required field: type');

  // Validate type
  const validTypes = ['coding-standards', 'domain-rules', 'workflows', 'examples', 'marketing-standards', 'writing-standards', 'themes'];
  if (metadata.type && !validTypes.includes(metadata.type)) {
    errors.push(`Invalid type: ${metadata.type}. Must be one of: ${validTypes.join(', ')}`);
  }

  // Validate version format (semantic versioning) - warning only
  // This allows modules with non-semver versions to still load
  if (metadata.version && !isValidSemanticVersion(metadata.version)) {
    warnings.push(`Invalid version format: ${metadata.version}. Should follow MAJOR.MINOR.PATCH`);
  }

  // Validate tags format (must be array if present)
  if (metadata.tags !== undefined && !Array.isArray(metadata.tags)) {
    errors.push('tags must be an array');
  }

  // Validate dependencies format (must be array if present)
  if (metadata.dependencies !== undefined && !Array.isArray(metadata.dependencies)) {
    errors.push('dependencies must be an array');
  }

  // Validate augment.characterCount if present
  if (metadata.augment?.characterCount !== undefined) {
    if (typeof metadata.augment.characterCount !== 'number' || metadata.augment.characterCount < 0) {
      errors.push('augment.characterCount must be a positive number');
    }
  }

  // Validate augment.priority if present
  if (metadata.augment?.priority) {
    const validPriorities = ['high', 'medium', 'low'];
    if (!validPriorities.includes(metadata.augment.priority)) {
      warnings.push(`Invalid priority: ${metadata.augment.priority}. Should be one of: ${validPriorities.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate semantic version format
 * Supports: MAJOR.MINOR.PATCH[-prerelease][+build]
 * Examples: 1.0.0, 1.0.0-alpha, 1.0.0-beta.1, 1.0.0+20130313144700, 1.0.0-beta+exp.sha.5114f85
 */
export function isValidSemanticVersion(version: string): boolean {
  // Full semver pattern with optional pre-release and build metadata
  const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverPattern.test(version);
}

/**
 * Parse semantic version into components
 */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

export function parseSemanticVersion(version: string): SemanticVersion | null {
  if (!isValidSemanticVersion(version)) {
    return null;
  }

  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9a-zA-Z-.]+))?(?:\+([0-9a-zA-Z-.]+))?$/);
  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5]
  };
}

/**
 * Compare two semantic versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareSemanticVersions(v1: string, v2: string): number {
  if (!isValidSemanticVersion(v1) || !isValidSemanticVersion(v2)) {
    throw new Error('Invalid semantic version format');
  }

  return semver.compare(v1, v2);
}

/**
 * Check if version satisfies a range (simple implementation)
 * Supports: ^1.0.0 (compatible), ~1.0.0 (patch), >=1.0.0, >1.0.0, <=1.0.0, <1.0.0, 1.0.0 (exact)
 */
export function satisfiesVersionRange(version: string, range: string): boolean {
  const parsed = parseSemanticVersion(version);
  if (!parsed) return false;

  // Exact match
  if (!range.match(/^[~^<>=]/)) {
    return version === range;
  }

  // Caret (^) - compatible with version
  if (range.startsWith('^')) {
    const rangeVersion = range.slice(1);
    const rangeParsed = parseSemanticVersion(rangeVersion);
    if (!rangeParsed) return false;

    if (parsed.major !== rangeParsed.major) return false;
    if (parsed.major === 0) {
      // For 0.x.y, minor version must match
      if (parsed.minor !== rangeParsed.minor) return false;
    }
    return compareSemanticVersions(version, rangeVersion) >= 0;
  }

  // Tilde (~) - patch updates
  if (range.startsWith('~')) {
    const rangeVersion = range.slice(1);
    const rangeParsed = parseSemanticVersion(rangeVersion);
    if (!rangeParsed) return false;

    if (parsed.major !== rangeParsed.major || parsed.minor !== rangeParsed.minor) {
      return false;
    }
    return compareSemanticVersions(version, rangeVersion) >= 0;
  }

  // Comparison operators
  if (range.startsWith('>=')) {
    return compareSemanticVersions(version, range.slice(2)) >= 0;
  }
  if (range.startsWith('>')) {
    return compareSemanticVersions(version, range.slice(1)) > 0;
  }
  if (range.startsWith('<=')) {
    return compareSemanticVersions(version, range.slice(2)) <= 0;
  }
  if (range.startsWith('<')) {
    return compareSemanticVersions(version, range.slice(1)) < 0;
  }

  return false;
}

/**
 * Load module from path
 */
export function loadModule(modulePath: string): Module | null {
  const moduleJsonPath = path.join(modulePath, 'module.json');

  if (!fs.existsSync(moduleJsonPath)) {
    return null;
  }

  try {
    const metadata: ModuleMetadata = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));

    // Get rules
    const rulesDir = path.join(modulePath, 'rules');
    const rules = fs.existsSync(rulesDir)
      ? fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'))
      : [];

    // Get examples
    const examplesDir = path.join(modulePath, 'examples');
    const examples = fs.existsSync(examplesDir)
      ? fs.readdirSync(examplesDir)
      : [];

    // Extract full name from path
    const modulesDir = getModulesDir();
    const relativePath = path.relative(modulesDir, modulePath);
    const fullName = relativePath.replace(/\\/g, '/');

    // Determine if this is a submodule
    const pathParts = fullName.split('/');
    const isSubModule = pathParts.length > 2;
    const parentModule = isSubModule ? pathParts.slice(0, -1).join('/') : undefined;

    // Get submodules from metadata or by scanning directory
    let subModules: string[] | undefined;
    if (metadata.augment?.subModules) {
      // Get submodules from metadata
      subModules = (metadata.augment.subModules as any[]).map((sub: any) => {
        const subPath = sub.path || sub.id;
        return `${fullName}/${subPath}`.replace(/\/$/, '');
      });
    } else {
      // Scan for subdirectories with module.json
      const subdirs = fs.readdirSync(modulePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const foundSubModules = subdirs
        .filter(dir => fs.existsSync(path.join(modulePath, dir, 'module.json')))
        .map(dir => `${fullName}/${dir}`);

      subModules = foundSubModules.length > 0 ? foundSubModules : undefined;
    }

    return {
      metadata,
      path: modulePath,
      fullName,
      rules,
      examples,
      isSubModule,
      parentModule,
      subModules
    };
  } catch (error) {
    return null;
  }
}

/**
 * Extended module metadata with file information
 */
export interface ExtendedModuleMetadata extends ModuleMetadata {
  files?: {
    total: number;
    rules: number;
    examples: number;
    other: number;
  };
  size?: {
    totalBytes: number;
    totalCharacters: number;
  };
  lastModified?: Date;
}

/**
 * Extract comprehensive metadata from a module
 * Includes file counts, sizes, and last modified dates
 */
export function extractModuleMetadata(modulePath: string): ExtendedModuleMetadata | null {
  const moduleJsonPath = path.join(modulePath, 'module.json');

  // Try to load module.json
  let metadata: ModuleMetadata;
  if (fs.existsSync(moduleJsonPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
    } catch (error) {
      // Invalid JSON - generate default metadata
      metadata = generateDefaultMetadata(modulePath);
    }
  } else {
    // Missing module.json - generate default metadata
    metadata = generateDefaultMetadata(modulePath);
  }

  // Collect file statistics
  const fileStats = collectFileStatistics(modulePath);
  const sizeStats = calculateSizeStatistics(modulePath);
  const lastModified = getLastModifiedDate(modulePath);

  return {
    ...metadata,
    files: fileStats,
    size: sizeStats,
    lastModified
  };
}

/**
 * Generate default metadata for modules without module.json
 */
export function generateDefaultMetadata(modulePath: string): ModuleMetadata {
  const modulesDir = getModulesDir();
  const relativePath = path.relative(modulesDir, modulePath);
  const parts = relativePath.split(path.sep);

  const category = parts[0] as ModuleMetadata['type'];
  const moduleName = parts[parts.length - 1];

  return {
    name: moduleName,
    version: '0.0.0',
    displayName: moduleName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    description: `Module: ${moduleName}`,
    type: ['coding-standards', 'domain-rules', 'workflows', 'examples', 'marketing-standards', 'writing-standards', 'themes'].includes(category)
      ? category as ModuleMetadata['type']
      : 'examples',
    augment: {
      characterCount: 0,
      priority: 'medium',
      category: category
    }
  };
}

/**
 * Collect file statistics for a module
 */
function collectFileStatistics(modulePath: string): { total: number; rules: number; examples: number; other: number } {
  let total = 0;
  let rules = 0;
  let examples = 0;
  let other = 0;

  function countFiles(dir: string, isRulesDir: boolean = false, isExamplesDir: boolean = false) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const isRules = entry.name === 'rules';
        const isExamples = entry.name === 'examples';
        countFiles(fullPath, isRules, isExamples);
      } else if (entry.isFile()) {
        total++;
        if (isRulesDir) {
          rules++;
        } else if (isExamplesDir) {
          examples++;
        } else {
          other++;
        }
      }
    }
  }

  countFiles(modulePath);

  return { total, rules, examples, other };
}

/**
 * Calculate size statistics for a module
 */
function calculateSizeStatistics(modulePath: string): { totalBytes: number; totalCharacters: number } {
  let totalBytes = 0;
  let totalCharacters = 0;

  function calculateSize(dir: string) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        calculateSize(fullPath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        totalBytes += stats.size;

        // Count characters for text files
        if (entry.name.endsWith('.md') || entry.name.endsWith('.json') || entry.name.endsWith('.txt')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            totalCharacters += content.length;
          } catch (error) {
            // Skip binary files
          }
        }
      }
    }
  }

  calculateSize(modulePath);

  return { totalBytes, totalCharacters };
}

/**
 * Get the last modified date of a module (most recent file modification)
 */
function getLastModifiedDate(modulePath: string): Date {
  let latestDate = new Date(0); // Epoch

  function findLatestDate(dir: string) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        findLatestDate(fullPath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        if (stats.mtime > latestDate) {
          latestDate = stats.mtime;
        }
      }
    }
  }

  findLatestDate(modulePath);

  return latestDate;
}

/**
 * File information interface
 */
export interface FileInfo {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modified: Date;
  type: 'rule' | 'example' | 'config' | 'documentation' | 'other';
  extension: string;
  directory: string;
}

/**
 * List all files in a module with metadata
 */
export function listModuleFiles(modulePath: string, options: {
  recursive?: boolean;
  filter?: string;
  groupByDirectory?: boolean;
  depth?: number;
} = {}): FileInfo[] {
  const {
    recursive = true,
    filter,
    groupByDirectory = false,
    depth = Infinity
  } = options;

  const files: FileInfo[] = [];

  // Enforce maximum depth limit of 5
  const maxDepth = Math.min(depth, 5);

  function scanDirectory(dir: string, baseDir: string = modulePath, currentDepth: number = 0) {
    if (!fs.existsSync(dir)) return;

    // Check depth limit
    if (currentDepth >= maxDepth) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        if (recursive) {
          scanDirectory(fullPath, baseDir, currentDepth + 1);
        }
      } else if (entry.isFile()) {
        // Apply filter if specified
        if (filter && !matchesFilter(entry.name, filter)) {
          continue;
        }

        const stats = fs.statSync(fullPath);
        const extension = path.extname(entry.name);
        const directory = path.dirname(relativePath);

        // Determine file type
        let fileType: FileInfo['type'] = 'other';
        if (directory.includes('rules')) {
          fileType = 'rule';
        } else if (directory.includes('examples')) {
          fileType = 'example';
        } else if (entry.name === 'module.json' || entry.name === 'collection.json') {
          fileType = 'config';
        } else if (entry.name === 'README.md' || extension === '.md') {
          fileType = 'documentation';
        }

        files.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          size: stats.size,
          modified: stats.mtime,
          type: fileType,
          extension,
          directory
        });
      }
    }
  }

  scanDirectory(modulePath);

  // Sort files
  if (groupByDirectory) {
    files.sort((a, b) => {
      // Sort by directory first, then by name
      if (a.directory !== b.directory) {
        return a.directory.localeCompare(b.directory);
      }
      return a.name.localeCompare(b.name);
    });
  } else {
    // Sort by name only
    files.sort((a, b) => a.name.localeCompare(b.name));
  }

  return files;
}

/**
 * Match file name against filter pattern (simple glob support)
 */
function matchesFilter(fileName: string, filter: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = filter
    .replace(/\./g, '\\.')  // Escape dots
    .replace(/\*/g, '.*')   // * matches any characters
    .replace(/\?/g, '.');   // ? matches single character

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(fileName);
}

/**
 * Group files by directory
 */
export function groupFilesByDirectory(files: FileInfo[]): Map<string, FileInfo[]> {
  const grouped = new Map<string, FileInfo[]>();

  for (const file of files) {
    const dir = file.directory || '.';
    if (!grouped.has(dir)) {
      grouped.set(dir, []);
    }
    grouped.get(dir)!.push(file);
  }

  return grouped;
}

/**
 * Get file statistics for a list of files
 */
export function getFileStatistics(files: FileInfo[]): {
  totalFiles: number;
  totalSize: number;
  byType: Record<FileInfo['type'], number>;
  byExtension: Record<string, number>;
} {
  const byType: Record<FileInfo['type'], number> = {
    rule: 0,
    example: 0,
    config: 0,
    documentation: 0,
    other: 0
  };

  const byExtension: Record<string, number> = {};

  let totalSize = 0;

  for (const file of files) {
    totalSize += file.size;
    byType[file.type]++;

    const ext = file.extension || 'no-extension';
    byExtension[ext] = (byExtension[ext] || 0) + 1;
  }

  return {
    totalFiles: files.length,
    totalSize,
    byType,
    byExtension
  };
}

/**
 * Recursively find all module.json files in a directory
 */
function findModuleJsonFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively search subdirectories
      results.push(...findModuleJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'module.json') {
      // Found a module.json file - return its parent directory
      results.push(dir);
    }
  }

  return results;
}

/**
 * Discover all modules in the modules directory
 */
export function discoverModules(): Module[] {
  const modules: Module[] = [];
  const modulesDir = getModulesDir();

  if (!fs.existsSync(modulesDir)) {
    return modules;
  }

  // Recursively find all directories containing module.json files
  const modulePaths = findModuleJsonFiles(modulesDir);

  // Filter out collections directory
  const filteredPaths = modulePaths.filter(p => !p.includes(path.join(modulesDir, 'collections')));

  for (const modulePath of filteredPaths) {
    const module = loadModule(modulePath);

    if (module) {
      modules.push(module);
    }
  }

  return modules;
}

/**
 * Collection metadata interface
 */
export interface CollectionMetadata {
  name: string;
  version: string;
  displayName: string;
  description: string;
  type: 'collection';
  tags?: string[];
  modules: Array<{
    id: string;
    version: string;
    required: boolean;
  }>;
  augment?: {
    priority?: 'high' | 'medium' | 'low';
    category?: string;
  };
}

/**
 * Collection structure interface
 */
export interface Collection {
  metadata: CollectionMetadata;
  path: string;
  fullName: string;
}

/**
 * Discover all collections in the collections directory
 */
export function discoverCollections(): Collection[] {
  const collections: Collection[] = [];
  const modulesDir = getModulesDir();
  const collectionsDir = path.join(modulesDir, 'collections');

  if (!fs.existsSync(collectionsDir)) {
    return collections;
  }

  const collectionNames = fs.readdirSync(collectionsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const collectionName of collectionNames) {
    const collectionPath = path.join(collectionsDir, collectionName);
    const collectionJsonPath = path.join(collectionPath, 'collection.json');

    if (fs.existsSync(collectionJsonPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(collectionJsonPath, 'utf-8'));
        collections.push({
          metadata,
          path: collectionPath,
          fullName: `collections/${collectionName}`
        });
      } catch (error) {
        console.error(`Error loading collection ${collectionName}:`, error);
      }
    }
  }

  return collections;
}

/**
 * Find module by name (supports both "category/module" and "module" formats)
 */
export function findModule(moduleName: string): Module | null {
  const normalizedName = moduleName.trim();

  if (!normalizedName) {
    return null;
  }

  const modulesDir = getModulesDir();

  // If moduleName includes category (e.g., "coding-standards/typescript")
  if (normalizedName.includes('/')) {
    const modulePath = path.join(modulesDir, normalizedName);
    return loadModule(modulePath);
  }

  // Search discovered modules for exact top-level, short-name, or category/module matches
  const modules = discoverModules();
  return modules.find(m =>
    m.fullName === normalizedName ||
    m.metadata.name === normalizedName ||
    m.fullName.endsWith(`/${normalizedName}`)
  ) || null;
}

/**
 * Search for modules by name with fuzzy matching
 * Supports exact, partial, and case-insensitive matching
 */
export interface ModuleSearchOptions {
  caseSensitive?: boolean;
  exactMatch?: boolean;
  category?: string;
}

export function searchModules(searchTerm: string, options: ModuleSearchOptions = {}): Module[] {
  const {
    caseSensitive = false,
    exactMatch = false,
    category
  } = options;

  const allModules = discoverModules();
  const searchLower = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  return allModules.filter(module => {
    const moduleName = caseSensitive ? module.fullName : module.fullName.toLowerCase();
    const moduleShortName = caseSensitive ? module.metadata.name : module.metadata.name.toLowerCase();

    // Filter by category if specified
    if (category) {
      const moduleCategory = module.fullName.split('/')[0];
      if (moduleCategory !== category) {
        return false;
      }
    }

    // Exact match
    if (exactMatch) {
      return moduleName === searchLower || moduleShortName === searchLower;
    }

    // Partial match (contains search term)
    return moduleName.includes(searchLower) ||
           moduleShortName.includes(searchLower) ||
           (module.metadata.displayName &&
            (caseSensitive ? module.metadata.displayName : module.metadata.displayName.toLowerCase()).includes(searchLower));
  });
}

/**
 * Find module with enhanced discovery
 * Tries exact match first, then falls back to fuzzy search
 */
export function findModuleEnhanced(moduleName: string): Module | null {
  // Try exact match first
  let module = findModule(moduleName);
  if (module) {
    return module;
  }

  // Try case-insensitive search
  const results = searchModules(moduleName, { caseSensitive: false, exactMatch: false });

  // If exactly one result, return it
  if (results.length === 1) {
    return results[0];
  }

  // If multiple results, try to find exact match (case-insensitive)
  const exactMatches = results.filter(m =>
    m.fullName.toLowerCase() === moduleName.toLowerCase() ||
    m.metadata.name.toLowerCase() === moduleName.toLowerCase()
  );

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  // No unique match found
  return null;
}

/**
 * Get module suggestions for a search term
 * Returns up to maxSuggestions similar modules
 */
export function getModuleSuggestions(searchTerm: string, maxSuggestions: number = 5): Module[] {
  const results = searchModules(searchTerm, { caseSensitive: false, exactMatch: false });

  // Sort by relevance (exact matches first, then by length)
  results.sort((a, b) => {
    const aName = a.fullName.toLowerCase();
    const bName = b.fullName.toLowerCase();
    const searchLower = searchTerm.toLowerCase();

    // Exact match scores highest
    if (aName === searchLower) return -1;
    if (bName === searchLower) return 1;

    // Starts with search term scores next
    if (aName.startsWith(searchLower) && !bName.startsWith(searchLower)) return -1;
    if (bName.startsWith(searchLower) && !aName.startsWith(searchLower)) return 1;

    // Shorter names score higher (more specific)
    return aName.length - bName.length;
  });

  return results.slice(0, maxSuggestions);
}

/**
 * Find collection by name (supports both "collections/name" and "name" formats)
 */
export function findCollection(collectionName: string): Collection | null {
  const modulesDir = getModulesDir();
  const collectionsDir = path.join(modulesDir, 'collections');

  // Remove "collections/" prefix if present
  const name = collectionName.replace(/^collections\//, '');
  const collectionPath = path.join(collectionsDir, name);
  const collectionJsonPath = path.join(collectionPath, 'collection.json');

  if (!fs.existsSync(collectionJsonPath)) {
    return null;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(collectionJsonPath, 'utf-8'));
    return {
      metadata,
      path: collectionPath,
      fullName: `collections/${name}`
    };
  } catch (error) {
    return null;
  }
}

/**
 * Resolve collection to its constituent modules
 * Returns array of module IDs that are part of the collection
 */
export function resolveCollection(collection: Collection): string[] {
  return collection.metadata.modules.map(m => m.id);
}

/**
 * Resolve collection by name to its constituent modules
 */
export function resolveCollectionByName(collectionName: string): string[] | null {
  const collection = findCollection(collectionName);
  if (!collection) {
    return null;
  }
  return resolveCollection(collection);
}

/**
 * Check if a name refers to a collection
 */
export function isCollection(name: string): boolean {
  return findCollection(name) !== null;
}

/**
 * Check if a name refers to a module
 */
export function isModule(name: string): boolean {
  return findModule(name) !== null;
}

/**
 * Validate module structure
 */
export function validateModuleStructure(modulePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check module.json exists
  const moduleJsonPath = path.join(modulePath, 'module.json');
  if (!fs.existsSync(moduleJsonPath)) {
    errors.push('Missing required file: module.json');
    return { valid: false, errors, warnings };
  }

  // Validate module.json content
  try {
    const metadata = JSON.parse(fs.readFileSync(moduleJsonPath, 'utf-8'));
    const metadataValidation = validateModuleMetadata(metadata);
    errors.push(...metadataValidation.errors);
    warnings.push(...metadataValidation.warnings);
  } catch (error) {
    errors.push(`Invalid JSON in module.json: ${error instanceof Error ? error.message : error}`);
    return { valid: false, errors, warnings };
  }

  // Check README.md exists
  const readmePath = path.join(modulePath, 'README.md');
  if (!fs.existsSync(readmePath)) {
    errors.push('Missing required file: README.md');
  }

  // Check rules directory exists
  const rulesDir = path.join(modulePath, 'rules');
  if (!fs.existsSync(rulesDir)) {
    errors.push('Missing required directory: rules/');
  } else {
    // Check that rules directory has at least one .md file
    const ruleFiles = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
    if (ruleFiles.length === 0) {
      warnings.push('rules/ directory is empty - should contain at least one .md file');
    }
  }

  // Check examples directory (optional, but warn if missing)
  const examplesDir = path.join(modulePath, 'examples');
  if (!fs.existsSync(examplesDir)) {
    warnings.push('Optional directory missing: examples/');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate module category matches directory structure
 */
export function validateModuleCategory(module: Module): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const modulesDir = getModulesDir();
  const relativePath = path.relative(modulesDir, module.path);
  const category = relativePath.split(path.sep)[0];

  if (module.metadata.type !== category) {
    errors.push(`Module type "${module.metadata.type}" does not match directory category "${category}"`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Calculate character count for a module
 */
export function calculateModuleCharacterCount(modulePath: string): number {
  let totalChars = 0;

  function countFilesRecursively(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        countFilesRecursively(fullPath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        totalChars += content.length;
      }
    }
  }

  if (fs.existsSync(modulePath)) {
    countFilesRecursively(modulePath);
  }

  return totalChars;
}

/**
 * Validate module is project-agnostic (no hardcoded paths or URLs)
 */
export function validateProjectAgnostic(modulePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Patterns to detect project-specific content
  const pathPatterns = [
    /[A-Z]:\\/g,  // Windows absolute paths (C:\, D:\, etc.)
    /\/home\/[a-zA-Z0-9_-]+\//g,  // Linux home paths
    /\/Users\/[a-zA-Z0-9_-]+\//g,  // macOS home paths
  ];

  const urlPatterns = [
    /https?:\/\/(?!github\.com|npmjs\.com|pypi\.org|crates\.io)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,  // URLs (excluding common registries)
  ];

  function scanFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for hardcoded paths
    for (const pattern of pathPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        warnings.push(`Potential hardcoded path in ${path.basename(filePath)}: ${matches[0]}`);
      }
    }

    // Check for project-specific URLs
    for (const pattern of urlPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        warnings.push(`Potential project-specific URL in ${path.basename(filePath)}: ${matches[0]}`);
      }
    }
  }

  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
        scanFile(fullPath);
      }
    }
  }

  if (fs.existsSync(modulePath)) {
    scanDirectory(modulePath);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

