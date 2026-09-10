/**
 * Skill System Utilities
 * 
 * Manages skill file structure, storage, and validation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  category: 'retrieval' | 'transformation' | 'analysis' | 'generation' | 'integration' | 'utility';
  tags?: string[];
  tokenBudget: number;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  dependencies?: string[];
  cliCommand?: string;
  mcpServer?: string;
  autoLoad?: boolean;
  replaces?: string[];
}

export interface ParsedSkillCliCommand {
  command: string;
  args: string[];
}

export interface Skill {
  metadata: SkillMetadata;
  content: string;
  filePath: string;
}

export const SKILL_CATEGORIES = [
  'retrieval',
  'transformation',
  'analysis',
  'generation',
  'integration',
  'utility'
] as const;

/**
 * Get the skills directory path
 */
export function getSkillsDir(repoRoot?: string): string {
  const root = repoRoot || process.cwd();
  return path.join(root, 'skills');
}

/**
 * Get the path for a skill file
 */
export function getSkillPath(skillId: string, category: string, repoRoot?: string): string {
  const skillsDir = getSkillsDir(repoRoot);
  return path.join(skillsDir, category, `${skillId}.md`);
}

/**
 * Parse skill frontmatter and content
 */
export function parseSkill(filePath: string): Skill {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    throw new Error(`Invalid skill file: ${filePath} - Missing frontmatter`);
  }
  
  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2];
  
  // Parse YAML frontmatter
  const metadata = yaml.load(frontmatter) as SkillMetadata;
  
  return {
    metadata,
    content: body,
    filePath
  };
}

/**
 * Validate skill metadata
 */
export function validateSkillMetadata(metadata: SkillMetadata): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!metadata.id) errors.push('Missing required field: id');
  if (!metadata.name) errors.push('Missing required field: name');
  if (!metadata.version) errors.push('Missing required field: version');
  if (!metadata.category) errors.push('Missing required field: category');
  if (!metadata.tokenBudget) errors.push('Missing required field: tokenBudget');
  
  // Validate category
  if (metadata.category && !SKILL_CATEGORIES.includes(metadata.category)) {
    errors.push(`Invalid category: ${metadata.category}. Must be one of: ${SKILL_CATEGORIES.join(', ')}`);
  }
  
  // Validate version format (semantic versioning)
  if (metadata.version && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(metadata.version)) {
    errors.push(`Invalid version format: ${metadata.version}. Must follow semantic versioning (MAJOR.MINOR.PATCH)`);
  }
  
  // Validate token budget
  if (typeof metadata.tokenBudget === 'number') {
    if (metadata.tokenBudget < 500) {
      errors.push('tokenBudget too low: minimum 500 tokens');
    }
    if (metadata.tokenBudget > 10000) {
      errors.push('tokenBudget too high: maximum 10000 tokens');
    }
  }
  
  // Validate priority
  if (metadata.priority && !['critical', 'high', 'medium', 'low'].includes(metadata.priority)) {
    errors.push(`Invalid priority: ${metadata.priority}. Must be one of: critical, high, medium, low`);
  }

  if (metadata.cliCommand !== undefined) {
    if (typeof metadata.cliCommand !== 'string' || metadata.cliCommand.trim().length === 0) {
      errors.push('Invalid cliCommand: must be a non-empty string');
    } else {
      try {
        parseSkillCliCommand(metadata.cliCommand);
      } catch (error) {
        errors.push(`Invalid cliCommand: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Parse a skill CLI command into an executable and literal argv.
 *
 * This tokenizer only treats whitespace and quote characters as structure.
 * Shell operators such as `&&` and `|` remain plain arguments.
 */
export function parseSkillCliCommand(cliCommand: string): ParsedSkillCliCommand {
  const input = cliCommand.trim();

  if (input.length === 0) {
    throw new Error('CLI command is empty');
  }

  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let tokenStarted = false;

  const pushToken = (): void => {
    if (!tokenStarted) {
      return;
    }

    tokens.push(current);
    current = '';
    tokenStarted = false;
  };

  for (const char of input) {
    if (escaping) {
      if (char !== '"' && char !== '\\') {
        current += '\\';
      }

      current += char;
      tokenStarted = true;
      escaping = false;
      continue;
    }

    if (quote === '"') {
      if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        quote = null;
      } else {
        current += char;
      }

      tokenStarted = true;
      continue;
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }

      tokenStarted = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      pushToken();
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (escaping) {
    throw new Error('CLI command ends with an incomplete escape sequence');
  }

  if (quote) {
    throw new Error(`CLI command has an unterminated ${quote === '"' ? 'double' : 'single'} quote`);
  }

  pushToken();

  if (tokens.length === 0 || tokens[0].length === 0) {
    throw new Error('CLI command must name an executable');
  }

  return {
    command: tokens[0],
    args: tokens.slice(1)
  };
}

/**
 * Discover all skills in the skills directory
 */
export function discoverSkills(repoRoot?: string): Skill[] {
  const skillsDir = getSkillsDir(repoRoot);
  const skills: Skill[] = [];
  
  if (!fs.existsSync(skillsDir)) {
    return skills;
  }
  
  // Iterate through category directories
  for (const category of SKILL_CATEGORIES) {
    const categoryDir = path.join(skillsDir, category);
    
    if (!fs.existsSync(categoryDir)) {
      continue;
    }
    
    // Find all .md files in category
    const files = fs.readdirSync(categoryDir)
      .filter(f => f.endsWith('.md') && f !== 'README.md');
    
    for (const file of files) {
      const filePath = path.join(categoryDir, file);
      try {
        const skill = parseSkill(filePath);
        skills.push(skill);
      } catch (error) {
        console.warn(`Warning: Failed to parse skill ${filePath}: ${error}`);
      }
    }
  }
  
  return skills;
}

/**
 * Find a skill by ID
 */
export function findSkill(skillId: string, repoRoot?: string): Skill | null {
  const skills = discoverSkills(repoRoot);
  return skills.find(s => s.metadata.id === skillId) || null;
}

/**
 * Register skill in coordination manifest
 */
export function registerSkillInCoordination(skill: Skill, taskId?: string): void {
  const coordPath = path.join(process.cwd(), '.augment', 'coordination.json');

  if (!fs.existsSync(coordPath)) {
    console.warn('Coordination manifest not found. Skipping skill registration.');
    return;
  }

  const coordination = JSON.parse(fs.readFileSync(coordPath, 'utf-8'));

  // Add skill to files section
  if (!coordination.files) {
    coordination.files = {};
  }

  const relativePath = path.relative(process.cwd(), skill.filePath).replace(/\\/g, '/');

  coordination.files[relativePath] = {
    createdBy: taskId || 'skill-system',
    modifiedBy: [],
    governedBy: ['augment-extensions/spec'],
    rulesApplied: ['module-development.md']
  };

  // Update lastUpdated
  coordination.lastUpdated = new Date().toISOString();

  // Write back to file
  fs.writeFileSync(coordPath, JSON.stringify(coordination, null, 2));
}

/**
 * Dynamic Skill Loader
 *
 * Loads skills on-demand with dependency resolution and token budget management.
 */

export interface LoadedSkill {
  skill: Skill;
  dependencies: LoadedSkill[];
  totalTokens: number;
}

export interface SkillLoaderOptions {
  maxTokens?: number;
  resolveDependencies?: boolean;
  cache?: boolean;
}

// Skill cache
const skillCache = new Map<string, LoadedSkill>();

/**
 * Load a skill with dependency resolution
 */
export function loadSkillDynamic(
  skillId: string,
  options: SkillLoaderOptions = {}
): LoadedSkill | null {
  const {
    maxTokens = 50000,
    resolveDependencies = true,
    cache = true
  } = options;

  // Check cache first
  if (cache && skillCache.has(skillId)) {
    return skillCache.get(skillId)!;
  }

  // Find the skill
  const skill = findSkill(skillId);
  if (!skill) {
    return null;
  }

  // Load dependencies if requested
  const dependencies: LoadedSkill[] = [];
  let totalTokens = skill.metadata.tokenBudget;

  if (resolveDependencies && skill.metadata.dependencies) {
    for (const depId of skill.metadata.dependencies) {
      const depLoaded = loadSkillDynamic(depId, {
        ...options,
        cache: false // Don't cache dependencies during resolution
      });

      if (!depLoaded) {
        console.warn(`Warning: Dependency ${depId} not found for skill ${skillId}`);
        continue;
      }

      dependencies.push(depLoaded);
      totalTokens += depLoaded.totalTokens;
    }
  }

  // Check token budget
  if (totalTokens > maxTokens) {
    throw new Error(
      `Token budget exceeded: ${totalTokens} > ${maxTokens} for skill ${skillId} with dependencies`
    );
  }

  const loaded: LoadedSkill = {
    skill,
    dependencies,
    totalTokens
  };

  // Cache the result
  if (cache) {
    skillCache.set(skillId, loaded);
  }

  return loaded;
}

/**
 * Load multiple skills with shared dependency resolution
 */
export function loadSkillsBatch(
  skillIds: string[],
  options: SkillLoaderOptions = {}
): LoadedSkill[] {
  const loaded: LoadedSkill[] = [];
  const seen = new Set<string>();

  for (const skillId of skillIds) {
    if (seen.has(skillId)) {
      continue;
    }

    const loadedSkill = loadSkillDynamic(skillId, options);
    if (loadedSkill) {
      loaded.push(loadedSkill);
      seen.add(skillId);

      // Mark dependencies as seen to avoid duplicates
      const markDeps = (ls: LoadedSkill) => {
        for (const dep of ls.dependencies) {
          seen.add(dep.skill.metadata.id);
          markDeps(dep);
        }
      };
      markDeps(loadedSkill);
    }
  }

  return loaded;
}

/**
 * Get skill content for injection (flattened with dependencies)
 */
export function getSkillContentForInjection(loadedSkill: LoadedSkill): string {
  const parts: string[] = [];

  // Add dependencies first (depth-first)
  for (const dep of loadedSkill.dependencies) {
    parts.push(getSkillContentForInjection(dep));
  }

  // Add main skill content
  const { skill } = loadedSkill;
  parts.push(`# Skill: ${skill.metadata.name} (${skill.metadata.id})`);
  parts.push(`Category: ${skill.metadata.category}`);
  parts.push(`Token Budget: ${skill.metadata.tokenBudget}`);
  parts.push('');
  parts.push(skill.content);
  parts.push('');

  return parts.join('\n');
}

/**
 * Clear skill cache
 */
export function clearSkillCache(): void {
  skillCache.clear();
}

/**
 * Get cache statistics
 */
export function getSkillCacheStats(): { size: number; skills: string[] } {
  return {
    size: skillCache.size,
    skills: Array.from(skillCache.keys())
  };
}

