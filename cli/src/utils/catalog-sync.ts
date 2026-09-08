/**
 * Catalog Auto-Sync Utilities
 * 
 * Automatically updates MODULES.md catalog when modules change.
 */

import * as fs from 'fs';
import * as path from 'path';
import { updateModulesCatalog } from './modules-catalog';

/**
 * Create a Git hook for auto-updating catalog
 */
export function createCatalogGitHook(
  hookType: 'pre-commit' | 'post-commit' = 'pre-commit',
  gitDir: string = '.git'
): void {
  const hookPath = path.join(gitDir, 'hooks', hookType);
  
  // Check if hook already exists
  let existingContent = '';
  if (fs.existsSync(hookPath)) {
    existingContent = fs.readFileSync(hookPath, 'utf-8');
    
    // Check if catalog sync is already in the hook
    if (existingContent.includes('augx catalog')) {
      console.log(`Catalog sync already configured in ${hookType} hook`);
      return;
    }
  }
  
  const catalogHookContent = `# Auto-update MODULES.md catalog
if [ -d augment-extensions ]; then
  echo "Updating MODULES.md catalog..."
  augx catalog

  # Add catalog to commit if changed
  if [ -f MODULES.md ]; then
    git add MODULES.md
  fi
else
  echo "Skipping MODULES.md catalog sync: this hook only runs in the Augment Extensions repository layout (missing augment-extensions/)."
fi
`;

  // If hook exists, append to it; otherwise create new
  if (existingContent) {
    const updatedContent = existingContent.trimEnd() + '\n\n' + catalogHookContent;
    fs.writeFileSync(hookPath, updatedContent, { mode: 0o755 });
    console.log(`Updated ${hookType} hook with catalog sync`);
  } else {
    const newHookContent = `#!/bin/sh
${catalogHookContent}`;
    fs.writeFileSync(hookPath, newHookContent, { mode: 0o755 });
    console.log(`Created ${hookType} hook with catalog sync`);
  }
}

/**
 * Remove catalog sync from Git hook
 */
export function removeCatalogGitHook(
  hookType: 'pre-commit' | 'post-commit' = 'pre-commit',
  gitDir: string = '.git'
): void {
  const hookPath = path.join(gitDir, 'hooks', hookType);
  
  if (!fs.existsSync(hookPath)) {
    console.log(`No ${hookType} hook found`);
    return;
  }
  
  const content = fs.readFileSync(hookPath, 'utf-8');
  
  // Remove catalog sync section
  const updatedContent = removeCatalogHookBlock(content);
  
  if (updatedContent.length === 0 || updatedContent === '#!/bin/sh') {
    // Hook is now empty, remove it
    fs.unlinkSync(hookPath);
    console.log(`Removed empty ${hookType} hook`);
  } else {
    fs.writeFileSync(hookPath, updatedContent, { mode: 0o755 });
    console.log(`Removed catalog sync from ${hookType} hook`);
  }
}

function removeCatalogHookBlock(content: string): string {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const startIndex = lines.findIndex(line => line.trim() === '# Auto-update MODULES.md catalog');

  if (startIndex === -1) {
    return content;
  }

  let depth = 0;
  let endIndex = -1;
  let inBlock = false;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === 'if [ -d augment-extensions ]; then') {
      depth += 1;
      inBlock = true;
      continue;
    }

    if (inBlock && trimmed.startsWith('if ') && trimmed.endsWith('then')) {
      depth += 1;
      continue;
    }

    if (inBlock && trimmed === 'fi') {
      depth -= 1;

      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) {
    return content;
  }

  return [...lines.slice(0, startIndex), ...lines.slice(endIndex + 1)]
    .join('\n')
    .trim();
}

/**
 * Check if catalog is out of date
 */
export function isCatalogOutOfDate(catalogPath: string = 'MODULES.md'): boolean {
  if (!fs.existsSync(catalogPath)) {
    return true;
  }
  
  const catalogStat = fs.statSync(catalogPath);
  const modulesDir = path.join(__dirname, '../../../augment-extensions');
  
  if (!fs.existsSync(modulesDir)) {
    return false;
  }
  
  // Check if any module.json is newer than catalog
  function checkDirectory(dir: string): boolean {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (checkDirectory(fullPath)) {
          return true;
        }
      } else if (entry.name === 'module.json') {
        const moduleStat = fs.statSync(fullPath);
        if (moduleStat.mtime > catalogStat.mtime) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  return checkDirectory(modulesDir);
}

/**
 * Auto-update catalog if out of date
 */
export function autoUpdateCatalog(catalogPath: string = 'MODULES.md'): boolean {
  if (isCatalogOutOfDate(catalogPath)) {
    console.log('Catalog is out of date, updating...');
    updateModulesCatalog(catalogPath);
    return true;
  }
  
  return false;
}

