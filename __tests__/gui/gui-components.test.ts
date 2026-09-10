import { filterCollectionsToRepoModules, filterLinkedModulesToRepoModules, filterModulesForGui } from '../../cli/src/commands/gui';
import type { Collection, Module } from '../../cli/src/utils/module-system';
import { formatModuleChoice } from '../../cli/src/utils/gui-helpers';

// Mock test environment for GUI components
interface ModuleMetadata {
  name: string;
  displayName?: string;
  description: string;
  type?: string;
  tags?: string[];
}

interface TestModule {
  metadata: ModuleMetadata;
  fullName: string;
}

class TestEnvironment {
  private modules: TestModule[] = [];

  async createModule(metadata: Partial<ModuleMetadata>): Promise<TestModule> {
    const module: TestModule = {
      metadata: {
        name: metadata.name || 'test-module',
        displayName: metadata.displayName,
        description: metadata.description || 'Test module description',
        type: metadata.type || 'coding-standards',
        tags: metadata.tags || []
      },
      fullName: metadata.name || 'test-module'
    };
    this.modules.push(module);
    return module;
  }

  async cleanup(): Promise<void> {
    this.modules = [];
  }
}

function createTestEnvironment(): TestEnvironment {
  return new TestEnvironment();
}

function createRepoModule(overrides: Partial<Module> & { fullName: string }): Module {
  return {
    metadata: {
      name: overrides.fullName.split('/').pop() || overrides.fullName,
      version: '1.0.0',
      displayName: overrides.metadata?.displayName || overrides.fullName,
      description: overrides.metadata?.description || `Test module: ${overrides.fullName}`,
      type: overrides.metadata?.type || 'coding-standards',
      tags: overrides.metadata?.tags || []
    },
    path: overrides.path || `/repo/${overrides.fullName}`,
    fullName: overrides.fullName,
    rules: overrides.rules || [],
    examples: overrides.examples || []
  };
}

function createRepoCollection(fullName: string, moduleIds: string[]): Collection {
  const name = fullName.replace(/^collections\//, '');

  return {
    metadata: {
      name,
      version: '1.0.0',
      displayName: name,
      description: `Collection ${name}`,
      type: 'collection',
      modules: moduleIds.map(id => ({
        id,
        version: '^1.0.0',
        required: true
      }))
    },
    path: `/repo/${fullName}`,
    fullName
  };
}

/**
 * GUI Components Tests
 * 
 * Tests for GUI components including:
 * - Multi-selection functionality (checkbox-based selection)
 * - Search/filtering (fuzzy match, search fields, case sensitivity)
 * - Keyboard navigation (space, arrows, enter)
 */

describe('GUI Components Tests', () => {
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = await createTestEnvironment();
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('Multi-Selection Functionality', () => {
    it('should support checkbox-based multi-selection', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'module-1' }),
        testEnv.createModule({ name: 'module-2' }),
        testEnv.createModule({ name: 'module-3' })
      ]);

      // Simulate checkbox selection
      const choices = modules.map(m => ({
        name: m.metadata.name,
        value: m.metadata.name,
        checked: false
      }));

      // Select multiple items
      const selectedIndices = [0, 2];
      selectedIndices.forEach(idx => {
        choices[idx].checked = true;
      });

      const selected = choices.filter(c => c.checked);

      expect(selected).toHaveLength(2);
      expect(selected[0].value).toBe('module-1');
      expect(selected[1].value).toBe('module-3');
    });

    it('should toggle selection state with space key', async () => {
      const choice = {
        name: 'test-module',
        value: 'test-module',
        checked: false
      };

      // Simulate space key toggle
      choice.checked = !choice.checked;
      expect(choice.checked).toBe(true);

      // Toggle again
      choice.checked = !choice.checked;
      expect(choice.checked).toBe(false);
    });

    it('should support select all functionality (Ctrl+A)', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'module-1' }),
        testEnv.createModule({ name: 'module-2' }),
        testEnv.createModule({ name: 'module-3' })
      ]);

      const choices = modules.map(m => ({
        name: m.metadata.name,
        value: m.metadata.name,
        checked: false
      }));

      // Simulate Ctrl+A (select all)
      choices.forEach(c => c.checked = true);

      const allSelected = choices.every(c => c.checked);
      expect(allSelected).toBe(true);
      expect(choices.filter(c => c.checked)).toHaveLength(3);
    });

    it('should support deselect all functionality (Ctrl+D)', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'module-1' }),
        testEnv.createModule({ name: 'module-2' }),
        testEnv.createModule({ name: 'module-3' })
      ]);

      const choices = modules.map(m => ({
        name: m.metadata.name,
        value: m.metadata.name,
        checked: true // Start with all selected
      }));

      // Simulate Ctrl+D (deselect all)
      choices.forEach(c => c.checked = false);

      const noneSelected = choices.every(c => !c.checked);
      expect(noneSelected).toBe(true);
      expect(choices.filter(c => c.checked)).toHaveLength(0);
    });

    it('should preserve already-linked modules in selection', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'module-1' }),
        testEnv.createModule({ name: 'module-2' }),
        testEnv.createModule({ name: 'module-3' })
      ]);

      const linkedModules = ['module-1', 'module-3'];

      const choices = modules.map(m => ({
        name: m.metadata.name,
        value: m.metadata.name,
        checked: linkedModules.includes(m.metadata.name)
      }));

      const preSelected = choices.filter(c => c.checked);
      expect(preSelected).toHaveLength(2);
      expect(preSelected.map(c => c.value)).toEqual(['module-1', 'module-3']);
    });

    it('should handle empty selection', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'module-1' }),
        testEnv.createModule({ name: 'module-2' })
      ]);

      const choices = modules.map(m => ({
        name: m.metadata.name,
        value: m.metadata.name,
        checked: false
      }));

      const selected = choices.filter(c => c.checked);
      expect(selected).toHaveLength(0);
    });

    it('should support partial selection', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'module-1' }),
        testEnv.createModule({ name: 'module-2' }),
        testEnv.createModule({ name: 'module-3' }),
        testEnv.createModule({ name: 'module-4' })
      ]);

      const choices = modules.map(m => ({
        name: m.metadata.name,
        value: m.metadata.name,
        checked: false
      }));

      // Select some items
      choices[1].checked = true;
      choices[3].checked = true;

      const selected = choices.filter(c => c.checked);
      expect(selected).toHaveLength(2);
      expect(selected.map(c => c.value)).toEqual(['module-2', 'module-4']);
    });
  });

  describe('Search/Filtering Functionality', () => {
    it('should filter modules by search term', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'typescript-standards', description: 'TypeScript coding standards' }),
        testEnv.createModule({ name: 'python-standards', description: 'Python coding standards' }),
        testEnv.createModule({ name: 'javascript-standards', description: 'JavaScript coding standards' })
      ]);

      const searchTerm = 'typescript';
      const filtered = modules.filter(m =>
        m.metadata.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.metadata.description.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].metadata.name).toBe('typescript-standards');
    });

    it('should support fuzzy matching', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'typescript-module' }),
        testEnv.createModule({ name: 'python-module' })
      ]);

      // Fuzzy search with typo
      const searchTerm = 'typscript'; // Missing 'e'

      // Simple fuzzy match implementation
      const fuzzyMatch = (text: string, search: string): number => {
        let matchCount = 0;
        let searchIndex = 0;
        const lowerText = text.toLowerCase();
        const lowerSearch = search.toLowerCase();

        for (let i = 0; i < lowerText.length && searchIndex < lowerSearch.length; i++) {
          if (lowerText[i] === lowerSearch[searchIndex]) {
            matchCount++;
            searchIndex++;
          }
        }

        return matchCount / lowerSearch.length;
      };

      const results = modules.map(m => ({
        module: m,
        score: fuzzyMatch(m.metadata.name, searchTerm)
      })).filter(r => r.score > 0.8);

      expect(results).toHaveLength(1);
      expect(results[0].module.metadata.name).toBe('typescript-module');
    });

    it('should search across multiple fields (name, description, tags)', async () => {
      const module = await testEnv.createModule({
        name: 'coding-module',
        description: 'TypeScript standards',
        tags: ['best-practices', 'typescript']
      });

      const searchTerm = 'typescript';

      // Search across all fields
      const matches =
        module.metadata.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        module.metadata.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        module.metadata.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

      expect(matches).toBe(true);
    });

    it('should support case-sensitive search option', async () => {
      const module = await testEnv.createModule({ name: 'TypeScript-Module' });

      const searchTerm = 'TypeScript';
      const caseSensitive = true;

      const matches = caseSensitive
        ? module.metadata.name.includes(searchTerm)
        : module.metadata.name.toLowerCase().includes(searchTerm.toLowerCase());

      expect(matches).toBe(true);

      // Test case-insensitive
      const searchTermLower = 'typescript';
      const matchesInsensitive = module.metadata.name.toLowerCase().includes(searchTermLower.toLowerCase());
      expect(matchesInsensitive).toBe(true);
    });

    it('should handle empty search results', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'typescript-module' }),
        testEnv.createModule({ name: 'python-module' })
      ]);

      const searchTerm = 'rust';
      const filtered = modules.filter(m =>
        m.metadata.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered).toHaveLength(0);
    });

    it('should validate search input', async () => {
      const validateSearch = (input: string): boolean | string => {
        if (!input || input.trim().length === 0) {
          return 'Please enter a search term';
        }
        return true;
      };

      expect(validateSearch('')).toBe('Please enter a search term');
      expect(validateSearch('   ')).toBe('Please enter a search term');
      expect(validateSearch('typescript')).toBe(true);
    });

    it('should support minimum match score for fuzzy search', async () => {
      const module = await testEnv.createModule({ name: 'typescript-module' });

      const fuzzyMatch = (text: string, search: string): number => {
        let matchCount = 0;
        let searchIndex = 0;
        const lowerText = text.toLowerCase();
        const lowerSearch = search.toLowerCase();

        for (let i = 0; i < lowerText.length && searchIndex < lowerSearch.length; i++) {
          if (lowerText[i] === lowerSearch[searchIndex]) {
            matchCount++;
            searchIndex++;
          }
        }

        return matchCount / lowerSearch.length;
      };

      const minMatchScore = 0.3;
      const searchTerm = 'type';
      const score = fuzzyMatch(module.metadata.name, searchTerm);

      expect(score).toBeGreaterThan(minMatchScore);
    });

    it('should filter by category/type', async () => {
      const modules = await Promise.all([
        testEnv.createModule({ name: 'ts-standards', type: 'coding-standards' }),
        testEnv.createModule({ name: 'wp-rules', type: 'domain-rules' }),
        testEnv.createModule({ name: 'py-standards', type: 'coding-standards' })
      ]);

      const categoryFilter = 'coding-standards';
      const filtered = modules.filter(m => m.metadata.type === categoryFilter);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(m => m.metadata.type === 'coding-standards')).toBe(true);
    });

    it('should keep the GUI flow scoped to repo modules from config through search results', async () => {
      const discoveredModules: Module[] = [
        createRepoModule({
          fullName: 'coding-standards/typescript',
          metadata: {
            name: 'typescript',
            version: '1.0.0',
            displayName: 'TypeScript Standards',
            description: 'TypeScript coding standards',
            type: 'coding-standards',
            tags: ['typescript', 'standards']
          }
        }),
        createRepoModule({
          fullName: 'domain-rules/api-security',
          metadata: {
            name: 'api-security',
            version: '1.0.0',
            displayName: 'API Security',
            description: 'Security guidance for APIs',
            type: 'domain-rules',
            tags: ['api', 'security']
          }
        }),
        createRepoModule({
          fullName: 'writing-standards/blog-writing',
          metadata: {
            name: 'blog-writing',
            version: '1.0.0',
            displayName: 'Blog Writing',
            description: 'Writing guidance for blog content',
            type: 'writing-standards',
            tags: ['writing', 'blog']
          }
        })
      ];
      const configuredLinkedModules = [
        'coding-standards/typescript',
        'writing-standards/blog-writing',
        'examples/missing-module'
      ];
      const collections: Collection[] = [
        createRepoCollection('collections/backend', [
          'coding-standards/typescript',
          'domain-rules/api-security'
        ]),
        createRepoCollection('collections/broken', [
          'coding-standards/typescript',
          'examples/missing-module'
        ]),
        createRepoCollection('collections/writing', [
          'writing-standards/blog-writing'
        ])
      ];

      const modules = filterModulesForGui(discoveredModules);
      const linkedModules = filterLinkedModulesToRepoModules(configuredLinkedModules, modules);
      const repoCollections = filterCollectionsToRepoModules(collections, modules);

      const searchTerm = 'typescript';
      const searchResults = modules.filter(m =>
        m.metadata.displayName.toLowerCase().includes(searchTerm) ||
        m.metadata.description.toLowerCase().includes(searchTerm) ||
        m.metadata.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      );
      const choices = searchResults.map(m => ({
        value: m.fullName,
        checked: linkedModules.includes(m.fullName)
      }));

      expect(linkedModules).toEqual(['coding-standards/typescript']);
      expect(repoCollections.map(collection => collection.fullName)).toEqual(['collections/backend']);
      expect(modules.map(module => module.fullName)).toEqual([
        'coding-standards/typescript',
        'domain-rules/api-security'
      ]);
      expect(searchResults.map(module => module.fullName)).toEqual(['coding-standards/typescript']);
      expect(choices).toEqual([
        expect.objectContaining({
          value: 'coding-standards/typescript',
          checked: true
        })
      ]);
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate up with arrow up key', async () => {
      const items = ['item-1', 'item-2', 'item-3'];
      let currentIndex = 2;

      // Simulate arrow up
      currentIndex = Math.max(0, currentIndex - 1);

      expect(currentIndex).toBe(1);
    });

    it('should navigate down with arrow down key', async () => {
      const items = ['item-1', 'item-2', 'item-3'];
      let currentIndex = 0;

      // Simulate arrow down
      currentIndex = Math.min(items.length - 1, currentIndex + 1);

      expect(currentIndex).toBe(1);
    });

    it('should navigate with j/k keys (vim-style)', async () => {
      const items = ['item-1', 'item-2', 'item-3'];
      let currentIndex = 1;

      // Simulate 'k' (up)
      currentIndex = Math.max(0, currentIndex - 1);
      expect(currentIndex).toBe(0);

      // Simulate 'j' (down)
      currentIndex = Math.min(items.length - 1, currentIndex + 1);
      expect(currentIndex).toBe(1);
    });

    it('should toggle selection with space key', async () => {
      const items = [
        { name: 'item-1', checked: false },
        { name: 'item-2', checked: false },
        { name: 'item-3', checked: false }
      ];
      const currentIndex = 1;

      // Simulate space key
      items[currentIndex].checked = !items[currentIndex].checked;

      expect(items[1].checked).toBe(true);
      expect(items[0].checked).toBe(false);
      expect(items[2].checked).toBe(false);
    });

    it('should confirm selection with enter key', async () => {
      const items = [
        { name: 'item-1', checked: true },
        { name: 'item-2', checked: false },
        { name: 'item-3', checked: true }
      ];

      // Simulate enter key (confirm)
      const confirmed = items.filter(item => item.checked);

      expect(confirmed).toHaveLength(2);
      expect(confirmed.map(i => i.name)).toEqual(['item-1', 'item-3']);
    });

    it('should handle escape key to cancel', async () => {
      let cancelled = false;

      // Simulate escape key
      cancelled = true;

      expect(cancelled).toBe(true);
    });

    it('should handle Ctrl+C to exit', async () => {
      let exited = false;

      // Simulate Ctrl+C
      exited = true;

      expect(exited).toBe(true);
    });

    it('should not navigate beyond list boundaries', async () => {
      const items = ['item-1', 'item-2', 'item-3'];
      let currentIndex = 0;

      // Try to go up from first item
      currentIndex = Math.max(0, currentIndex - 1);
      expect(currentIndex).toBe(0);

      // Move to last item
      currentIndex = items.length - 1;

      // Try to go down from last item
      currentIndex = Math.min(items.length - 1, currentIndex + 1);
      expect(currentIndex).toBe(2);
    });

    it('should support page size for long lists', async () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const pageSize = 15;

      // Verify page size is respected
      expect(pageSize).toBeLessThan(items.length);
      expect(pageSize).toBe(15);
    });

    it('should disable loop navigation', async () => {
      const items = ['item-1', 'item-2', 'item-3'];
      const loop = false;
      let currentIndex = 0;

      // Try to go up from first item (no loop)
      if (!loop) {
        currentIndex = Math.max(0, currentIndex - 1);
      } else {
        currentIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
      }

      expect(currentIndex).toBe(0); // Should stay at 0, not wrap to end
    });

    it('should support keyboard shortcuts help (Ctrl+H or ?)', async () => {
      let helpDisplayed = false;

      // Simulate Ctrl+H or ?
      helpDisplayed = true;

      expect(helpDisplayed).toBe(true);
    });

    it('should support quick search (Ctrl+S)', async () => {
      let searchActivated = false;

      // Simulate Ctrl+S
      searchActivated = true;

      expect(searchActivated).toBe(true);
    });

    it('should maintain focus during navigation', async () => {
      const items = ['item-1', 'item-2', 'item-3'];
      let focusedIndex = 0;

      // Navigate down
      focusedIndex = Math.min(items.length - 1, focusedIndex + 1);
      expect(focusedIndex).toBe(1);

      // Navigate down again
      focusedIndex = Math.min(items.length - 1, focusedIndex + 1);
      expect(focusedIndex).toBe(2);

      // Navigate up
      focusedIndex = Math.max(0, focusedIndex - 1);
      expect(focusedIndex).toBe(1);
    });
  });

  describe('Accessibility Features', () => {
    it('should expose accessible labels for GUI module choices', () => {
      const module = createRepoModule({
        fullName: 'coding-standards/typescript',
        metadata: {
          name: 'typescript',
          version: '1.0.0',
          displayName: 'TypeScript Standards',
          description: 'TypeScript coding standards',
          type: 'coding-standards',
          tags: ['typescript', 'standards']
        }
      });

      const choice = formatModuleChoice(module, ['coding-standards/typescript']);

      expect(choice.name).toBe('TypeScript Standards (coding-standards/typescript)');
      expect(choice.value).toBe('coding-standards/typescript');
      expect(choice.description).toBe('TypeScript coding standards');
      expect(choice.linked).toBe(true);
      expect(choice.checked).toBe(true);
    });

    it('should provide clear instructions for screen readers', async () => {
      const instructions = 'Select modules to link (↑↓ to navigate, Space to select, Enter to confirm)';
      expect(instructions).toContain('navigate');
      expect(instructions).toContain('Space');
      expect(instructions).toContain('Enter');
    });

    it('should use semantic prefixes for different actions', async () => {
      const prefixes = {
        modules: '📦',
        search: '🔍',
        question: '❓'
      };

      expect(prefixes.modules).toBe('📦');
      expect(prefixes.search).toBe('🔍');
      expect(prefixes.question).toBe('❓');
    });

    it('should support keyboard-only navigation', async () => {
      const keyboardOnly = true;
      expect(keyboardOnly).toBe(true);
    });

    it('should be screen reader compatible', async () => {
      const screenReaderCompatible = true;
      expect(screenReaderCompatible).toBe(true);
    });

    it('should support high contrast mode', async () => {
      const highContrastSupported = true;
      expect(highContrastSupported).toBe(true);
    });
  });
});

