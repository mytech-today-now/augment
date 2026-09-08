/**
 * Unit tests for CLI command parsing
 * Tests argument parsing and flag validation for all commands
 */

import { Command } from 'commander';

// Mock all command handlers
jest.mock('../commands/init');
jest.mock('../commands/list');
jest.mock('../commands/show');
jest.mock('../commands/link');
jest.mock('../commands/update');
jest.mock('../commands/search');
jest.mock('../commands/coord');
jest.mock('../commands/sync');
jest.mock('../commands/validate');
jest.mock('../commands/catalog');
jest.mock('../commands/install-rules');
jest.mock('../commands/gui');
jest.mock('../commands/unlink');
jest.mock('../commands/self-remove');
jest.mock('../commands/skill');
jest.mock('../commands/mcp');
jest.mock('chalk', () => ({
  default: {
    blue: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    gray: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    magenta: (str: string) => str,
    bold: (str: string) => str
  },
  blue: (str: string) => str,
  green: (str: string) => str,
  red: (str: string) => str,
  gray: (str: string) => str,
  yellow: (str: string) => str,
  cyan: (str: string) => str,
  magenta: (str: string) => str,
  bold: (str: string) => str
}));

describe('CLI Command Parsing', () => {
  let program: Command;

  beforeEach(() => {
    // Create a fresh Commander instance for each test
    program = new Command();
    program.exitOverride(); // Prevent process.exit() during tests
  });

  describe('Basic command structure', () => {
    it('should parse program name and description', () => {
      program
        .name('augx')
        .description('CLI tool for managing Augment Code AI extension modules')
        .version('1.0.0');

      expect(program.name()).toBe('augx');
      expect(program.description()).toBe('CLI tool for managing Augment Code AI extension modules');
    });

    it('should parse version flag', () => {
      program.version('1.0.0');
      
      const opts = program.opts();
      expect(program.version()).toBe('1.0.0');
    });
  });

  describe('init command', () => {
    it('should parse init command without options', () => {
      const mockAction = jest.fn();
      program
        .command('init')
        .description('Initialize Augment Extensions in current project')
        .option('--from-submodule', 'Initialize from existing submodule')
        .action(mockAction);

      program.parse(['node', 'augx', 'init']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].fromSubmodule).toBeUndefined();
    });

    it('should parse init command with --from-submodule flag', () => {
      const mockAction = jest.fn();
      program
        .command('init')
        .option('--from-submodule', 'Initialize from existing submodule')
        .action(mockAction);

      program.parse(['node', 'augx', 'init', '--from-submodule']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].fromSubmodule).toBe(true);
    });
  });

  describe('list command', () => {
    it('should parse list command without options', () => {
      const mockAction = jest.fn();
      program
        .command('list')
        .option('--linked', 'Show only linked modules')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'list']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].linked).toBeUndefined();
      expect(mockAction.mock.calls[0][0].json).toBeUndefined();
    });

    it('should parse list command with --linked flag', () => {
      const mockAction = jest.fn();
      program
        .command('list')
        .option('--linked', 'Show only linked modules')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'list', '--linked']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].linked).toBe(true);
    });

    it('should parse list command with --json flag', () => {
      const mockAction = jest.fn();
      program
        .command('list')
        .option('--linked', 'Show only linked modules')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'list', '--json']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].json).toBe(true);
    });

    it('should parse list command with multiple flags', () => {
      const mockAction = jest.fn();
      program
        .command('list')
        .option('--linked', 'Show only linked modules')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'list', '--linked', '--json']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].linked).toBe(true);
      expect(mockAction.mock.calls[0][0].json).toBe(true);
    });
  });

  describe('show command', () => {
    const registerShowCommand = (mockAction: jest.Mock) => {
      return program
        .command('show <command> [module-name] [file-path]')
        .option('--json', 'Output as JSON')
        .option('--content', 'Display aggregated content')
        .option('--format <format>', 'Output format', 'text')
        .option('--depth <number>', 'Recursion depth', '1')
        .option('--filter <pattern>', 'Filter files by pattern')
        .option('--search <term>', 'Search within content')
        .option('--task-search <term>', 'Search completed tasks by title, description, or close reason')
        .action(mockAction);
    };

    it('should parse show module command with required argument', () => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', 'module', 'php-standards']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('module');
      expect(mockAction.mock.calls[0][1]).toBe('php-standards');
      expect(mockAction.mock.calls[0][2]).toBeUndefined();
    });

    it('should parse show module command with optional file path', () => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', 'module', 'php-standards', 'rules/psr.md']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('module');
      expect(mockAction.mock.calls[0][1]).toBe('php-standards');
      expect(mockAction.mock.calls[0][2]).toBe('rules/psr.md');
    });

    it('should parse show module command with --content flag', () => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', 'module', 'php-standards', '--content']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('module');
      expect(mockAction.mock.calls[0][1]).toBe('php-standards');
      expect(mockAction.mock.calls[0][3].content).toBe(true);
    });

    it('should parse show module command with --format option', () => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', 'module', 'php-standards', '--format', 'json']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('module');
      expect(mockAction.mock.calls[0][1]).toBe('php-standards');
      expect(mockAction.mock.calls[0][3].format).toBe('json');
    });

    it('should parse show module command with --depth option', () => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', 'module', 'php-standards', '--depth', '3']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('module');
      expect(mockAction.mock.calls[0][1]).toBe('php-standards');
      expect(mockAction.mock.calls[0][3].depth).toBe('3');
    });

    it('should parse show module command with --filter option', () => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', 'module', 'php-standards', '--filter', '*.md']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('module');
      expect(mockAction.mock.calls[0][1]).toBe('php-standards');
      expect(mockAction.mock.calls[0][3].filter).toBe('*.md');
    });

    it('should parse show module command with --search option', () => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', 'module', 'php-standards', '--search', 'PSR-12']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('module');
      expect(mockAction.mock.calls[0][1]).toBe('php-standards');
      expect(mockAction.mock.calls[0][3].search).toBe('PSR-12');
    });

    it('should parse show completed command with --task-search option', () => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', 'completed', '--task-search', 'renamed']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('completed');
      expect(mockAction.mock.calls[0][3].taskSearch).toBe('renamed');
    });

    it.each([
      ['completed'],
      ['linked'],
      ['all']
    ])('should parse show %s shortcut command', (shortcut) => {
      const mockAction = jest.fn();
      registerShowCommand(mockAction);

      program.parse(['node', 'augx', 'show', shortcut, '--json']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe(shortcut);
      expect(mockAction.mock.calls[0][1]).toBeUndefined();
      expect(mockAction.mock.calls[0][2]).toBeUndefined();
      expect(mockAction.mock.calls[0][3].json).toBe(true);
    });
  });

  describe('link command', () => {
    it('should parse link command with module argument', () => {
      const mockAction = jest.fn();
      program
        .command('link <module>')
        .option('--version <version>', 'Specific version to link')
        .action(mockAction);

      program.parse(['node', 'augx', 'link', 'typescript-standards']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript-standards');
    });

    it('should parse link command with --version option', () => {
      const mockAction = jest.fn();
      program
        .command('link <module>')
        .option('--version <version>', 'Specific version to link')
        .action(mockAction);

      program.parse(['node', 'augx', 'link', 'typescript-standards', '--version', '1.2.3']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript-standards');
      expect(mockAction.mock.calls[0][1].version).toBe('1.2.3');
    });
  });

  describe('unlink command', () => {
    it('should parse unlink command with module argument', () => {
      const mockAction = jest.fn();
      program
        .command('unlink <module>')
        .option('--force', 'Force unlink')
        .action(mockAction);

      program.parse(['node', 'augx', 'unlink', 'typescript-standards']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript-standards');
    });

    it('should parse unlink command with --force flag', () => {
      const mockAction = jest.fn();
      program
        .command('unlink <module>')
        .option('--force', 'Force unlink')
        .action(mockAction);

      program.parse(['node', 'augx', 'unlink', 'typescript-standards', '--force']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript-standards');
      expect(mockAction.mock.calls[0][1].force).toBe(true);
    });
  });

  describe('update command', () => {
    it('should parse update command without options', () => {
      const mockAction = jest.fn();
      program
        .command('update')
        .option('--module <name>', 'Update specific module only')
        .action(mockAction);

      program.parse(['node', 'augx', 'update']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].module).toBeUndefined();
    });

    it('should parse update command with --module option', () => {
      const mockAction = jest.fn();
      program
        .command('update')
        .option('--module <name>', 'Update specific module only')
        .action(mockAction);

      program.parse(['node', 'augx', 'update', '--module', 'typescript-standards']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].module).toBe('typescript-standards');
    });
  });

  describe('search command', () => {
    it('should parse search command with keyword argument', () => {
      const mockAction = jest.fn();
      program
        .command('search <keyword>')
        .option('--type <type>', 'Filter by module type')
        .action(mockAction);

      program.parse(['node', 'augx', 'search', 'typescript']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript');
    });

    it('should parse search command with --type option', () => {
      const mockAction = jest.fn();
      program
        .command('search <keyword>')
        .option('--type <type>', 'Filter by module type')
        .action(mockAction);

      program.parse(['node', 'augx', 'search', 'typescript', '--type', 'coding-standards']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript');
      expect(mockAction.mock.calls[0][1].type).toBe('coding-standards');
    });
  });

  describe('validate command', () => {
    it('should parse validate command with module argument', () => {
      const mockAction = jest.fn();
      program
        .command('validate <module>')
        .option('--verbose', 'Show detailed validation information')
        .action(mockAction);

      program.parse(['node', 'augx', 'validate', 'typescript-standards']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript-standards');
    });

    it('should parse validate command with --verbose flag', () => {
      const mockAction = jest.fn();
      program
        .command('validate <module>')
        .option('--verbose', 'Show detailed validation information')
        .action(mockAction);

      program.parse(['node', 'augx', 'validate', 'typescript-standards', '--verbose']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript-standards');
      expect(mockAction.mock.calls[0][1].verbose).toBe(true);
    });
  });

  describe('self-remove command', () => {
    it('should parse self-remove command without options', () => {
      const mockAction = jest.fn();
      program
        .command('self-remove')
        .option('--dry-run', 'Preview what would be removed')
        .option('--force', 'Skip confirmation prompts')
        .action(mockAction);

      program.parse(['node', 'augx', 'self-remove']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].dryRun).toBeUndefined();
      expect(mockAction.mock.calls[0][0].force).toBeUndefined();
    });

    it('should parse self-remove command with --dry-run flag', () => {
      const mockAction = jest.fn();
      program
        .command('self-remove')
        .option('--dry-run', 'Preview what would be removed')
        .action(mockAction);

      program.parse(['node', 'augx', 'self-remove', '--dry-run']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].dryRun).toBe(true);
    });

    it('should parse self-remove command with --force flag', () => {
      const mockAction = jest.fn();
      program
        .command('self-remove')
        .option('--force', 'Skip confirmation prompts')
        .action(mockAction);

      program.parse(['node', 'augx', 'self-remove', '--force']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].force).toBe(true);
    });
  });

  describe('catalog command', () => {
    it('should parse catalog command without options', () => {
      const mockAction = jest.fn();
      program
        .command('catalog')
        .option('--output <path>', 'Output path for catalog file')
        .option('--check', 'Check if catalog is out of date')
        .option('--auto', 'Auto-update only if out of date')
        .action(mockAction);

      program.parse(['node', 'augx', 'catalog']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].output).toBeUndefined();
      expect(mockAction.mock.calls[0][0].check).toBeUndefined();
      expect(mockAction.mock.calls[0][0].auto).toBeUndefined();
    });

    it('should parse catalog command with --check flag', () => {
      const mockAction = jest.fn();
      program
        .command('catalog')
        .option('--check', 'Check if catalog is out of date')
        .action(mockAction);

      program.parse(['node', 'augx', 'catalog', '--check']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].check).toBe(true);
    });

    it('should parse catalog command with --auto flag', () => {
      const mockAction = jest.fn();
      program
        .command('catalog')
        .option('--auto', 'Auto-update only if out of date')
        .action(mockAction);

      program.parse(['node', 'augx', 'catalog', '--auto']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].auto).toBe(true);
    });

    it('should parse catalog command with --output option', () => {
      const mockAction = jest.fn();
      program
        .command('catalog')
        .option('--output <path>', 'Output path for catalog file')
        .action(mockAction);

      program.parse(['node', 'augx', 'catalog', '--output', 'custom-catalog.md']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].output).toBe('custom-catalog.md');
    });
  });

  describe('install-rules command', () => {
    it('should parse install-rules command without options', () => {
      const mockAction = jest.fn();
      program
        .command('install-rules')
        .option('--quiet', 'Suppress output messages')
        .option('--setup-hooks', 'Setup automatic rule installation hooks')
        .option('--remove-hooks', 'Remove automatic rule installation hooks')
        .option('--force', 'Force replace existing rule')
        .option('--interactive', 'Prompt for conflict resolution')
        .action(mockAction);

      program.parse(['node', 'augx', 'install-rules']);

      expect(mockAction).toHaveBeenCalled();
    });

    it('should parse install-rules command with --quiet flag', () => {
      const mockAction = jest.fn();
      program
        .command('install-rules')
        .option('--quiet', 'Suppress output messages')
        .action(mockAction);

      program.parse(['node', 'augx', 'install-rules', '--quiet']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].quiet).toBe(true);
    });

    it('should parse install-rules command with --setup-hooks flag', () => {
      const mockAction = jest.fn();
      program
        .command('install-rules')
        .option('--setup-hooks', 'Setup automatic rule installation hooks')
        .action(mockAction);

      program.parse(['node', 'augx', 'install-rules', '--setup-hooks']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].setupHooks).toBe(true);
    });

    it('should parse install-rules command with --force flag', () => {
      const mockAction = jest.fn();
      program
        .command('install-rules')
        .option('--force', 'Force replace existing rule')
        .action(mockAction);

      program.parse(['node', 'augx', 'install-rules', '--force']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].force).toBe(true);
    });
  });

  describe('coordination commands', () => {
    it('should parse coord specs command', () => {
      const mockAction = jest.fn();
      const coordCmd = program.command('coord');
      coordCmd
        .command('specs')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'coord', 'specs']);

      expect(mockAction).toHaveBeenCalled();
    });

    it('should parse coord specs command with --json flag', () => {
      const mockAction = jest.fn();
      const coordCmd = program.command('coord');
      coordCmd
        .command('specs')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'coord', 'specs', '--json']);

      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].json).toBe(true);
    });

    it('should parse coord tasks command with spec-id argument', () => {
      const mockAction = jest.fn();
      const coordCmd = program.command('coord');
      coordCmd
        .command('tasks <spec-id>')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'coord', 'tasks', 'features/new-feature']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('features/new-feature');
    });

    it('should parse coord rules command with task-id argument', () => {
      const mockAction = jest.fn();
      const coordCmd = program.command('coord');
      coordCmd
        .command('rules <task-id>')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'coord', 'rules', 'bd-xyz']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('bd-xyz');
    });

    it('should parse coord file command with path argument', () => {
      const mockAction = jest.fn();
      const coordCmd = program.command('coord');
      coordCmd
        .command('file <path>')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'coord', 'file', 'src/index.ts']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('src/index.ts');
    });
  });

  describe('skill commands', () => {
    it('should parse skill list command', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('list')
        .option('--category <category>', 'Filter by category')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'skill', 'list']);

      expect(mockAction).toHaveBeenCalled();
    });

    it('should parse skill list command with --category option', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('list')
        .option('--category <category>', 'Filter by category')
        .action(mockAction);

      program.parse(['node', 'augx', 'skill', 'list', '--category', 'retrieval']);

      // Commander passes: (options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].category).toBe('retrieval');
    });

    it('should parse skill show command with skillId argument', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('show <skillId>')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'skill', 'show', 'sdk-query']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('sdk-query');
    });

    it('should parse skill validate command with skillId argument', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('validate <skillId>')
        .action(mockAction);

      program.parse(['node', 'augx', 'skill', 'validate', 'sdk-query']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('sdk-query');
    });

    it('should parse skill search command with query argument', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('search <query>')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'skill', 'search', 'typescript']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('typescript');
    });

    it('should parse skill exec command with skillId and args', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('exec <skillId> [args...]')
        .action(mockAction);

      program.parse(['node', 'augx', 'skill', 'exec', 'sdk-query', 'arg1', 'arg2']);

      // Commander passes: (arg1, arg2, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('sdk-query');
      expect(mockAction.mock.calls[0][1]).toEqual(['arg1', 'arg2']);
    });

    it('should parse skill inject command with options', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('inject <skillId>')
        .option('--json', 'Output as JSON')
        .option('--no-deps', 'Do not resolve dependencies')
        .option('--max-tokens <number>', 'Maximum token budget', parseInt)
        .action(mockAction);

      program.parse(['node', 'augx', 'skill', 'inject', 'sdk-query', '--max-tokens', '5000']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('sdk-query');
      expect(mockAction.mock.calls[0][1].maxTokens).toBe(5000);
    });

    it('should parse skill load command with multiple skillIds', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('load <skillIds...>')
        .option('--json', 'Output as JSON')
        .option('--max-tokens <number>', 'Maximum token budget', parseInt)
        .action(mockAction);

      program.parse(['node', 'augx', 'skill', 'load', 'skill1', 'skill2', 'skill3']);

      // Commander passes: (args, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toEqual(['skill1', 'skill2', 'skill3']);
    });

    it('should parse skill create-mcp command with required options', () => {
      const mockAction = jest.fn();
      const skillCmd = program.command('skill');
      skillCmd
        .command('create-mcp')
        .requiredOption('--name <name>', 'MCP server name')
        .requiredOption('--description <description>', 'Brief description')
        .requiredOption('--category <category>', 'Skill category')
        .option('--package <package>', 'npm package or URL')
        .option('--token-budget <number>', 'Token budget estimate', parseInt, 2000)
        .action(mockAction);

      program.parse([
        'node', 'augx', 'skill', 'create-mcp',
        '--name', 'test-server',
        '--description', 'Test description',
        '--category', 'integration'
      ]);

      // Commander passes: (options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0].name).toBe('test-server');
      expect(mockAction.mock.calls[0][0].description).toBe('Test description');
      expect(mockAction.mock.calls[0][0].category).toBe('integration');
    });
  });

  describe('MCP commands', () => {
    it('should parse mcp list command', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('list')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'mcp', 'list']);

      expect(mockAction).toHaveBeenCalled();
    });

    it('should parse mcp add command with name and command arguments', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('add <name> <command>')
        .option('--args <args>', 'Command arguments')
        .option('--transport <type>', 'Transport type (stdio only)', 'stdio')
        .option('--env <json>', 'Environment variables')
        .action(mockAction);

      program.parse(['node', 'augx', 'mcp', 'add', 'test-server', 'node server.js']);

      // Commander passes: (arg1, arg2, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('test-server');
      expect(mockAction.mock.calls[0][1]).toBe('node server.js');
    });

    it('should parse mcp add command with options', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('add <name> <command>')
        .option('--transport <type>', 'Transport type (stdio only)', 'stdio')
        .option('--env <json>', 'Environment variables')
        .action(mockAction);

      program.parse([
        'node', 'augx', 'mcp', 'add', 'test-server', 'node server.js',
        '--transport', 'stdio',
        '--env', '{"KEY":"value"}'
      ]);

      // Commander passes: (arg1, arg2, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('test-server');
      expect(mockAction.mock.calls[0][1]).toBe('node server.js');
      expect(mockAction.mock.calls[0][2].transport).toBe('stdio');
      expect(mockAction.mock.calls[0][2].env).toBe('{"KEY":"value"}');
    });

    it('should parse mcp remove command with name argument', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('remove <name>')
        .action(mockAction);

      program.parse(['node', 'augx', 'mcp', 'remove', 'test-server']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('test-server');
    });

    it('should parse mcp exec command with serverName and toolName', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('exec <serverName> <toolName>')
        .option('--args <json>', 'Tool arguments (JSON)')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'mcp', 'exec', 'test-server', 'test-tool']);

      // Commander passes: (arg1, arg2, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('test-server');
      expect(mockAction.mock.calls[0][1]).toBe('test-tool');
    });

    it('should parse mcp exec command with --args option', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('exec <serverName> <toolName>')
        .option('--args <json>', 'Tool arguments (JSON)')
        .action(mockAction);

      program.parse([
        'node', 'augx', 'mcp', 'exec', 'test-server', 'test-tool',
        '--args', '{"param":"value"}'
      ]);

      // Commander passes: (arg1, arg2, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('test-server');
      expect(mockAction.mock.calls[0][1]).toBe('test-tool');
      expect(mockAction.mock.calls[0][2].args).toBe('{"param":"value"}');
    });

    it('should parse mcp wrap command with three arguments', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('wrap <serverName> <toolName> <skillId>')
        .option('--category <category>', 'Skill category', 'integration')
        .action(mockAction);

      program.parse(['node', 'augx', 'mcp', 'wrap', 'test-server', 'test-tool', 'test-skill']);

      // Commander passes: (arg1, arg2, arg3, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('test-server');
      expect(mockAction.mock.calls[0][1]).toBe('test-tool');
      expect(mockAction.mock.calls[0][2]).toBe('test-skill');
    });

    it('should parse mcp discover command with serverName argument', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('discover <serverName>')
        .option('--json', 'Output as JSON')
        .action(mockAction);

      program.parse(['node', 'augx', 'mcp', 'discover', 'test-server']);

      // Commander passes: (arg, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('test-server');
    });

    it('should parse mcp generate-cli command with two arguments', () => {
      const mockAction = jest.fn();
      const mcpCmd = program.command('mcp');
      mcpCmd
        .command('generate-cli <serverCommand> <outputPath>')
        .action(mockAction);

      program.parse(['node', 'augx', 'mcp', 'generate-cli', 'node server.js', './output']);

      // Commander passes: (arg1, arg2, options, command)
      expect(mockAction).toHaveBeenCalled();
      expect(mockAction.mock.calls[0][0]).toBe('node server.js');
      expect(mockAction.mock.calls[0][1]).toBe('./output');
    });
  });
});

