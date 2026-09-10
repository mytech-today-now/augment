# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

## [3.1.3] - 2026-09-10

### Security

- Hardened module and file containment in `augx show` and related resolution paths so inspection stays inside the requested module boundary
- Tightened module path resolution in link, unlink, and catalog flows to close off traversal edge cases outside the module tree

### Fixed

- Reconciled single-file mirror bookkeeping so tracked symlinks and copied mirrors stay aligned with the recorded source
- Fixed duplicate `--search` handling in `augx show`, keeping module search parsing stable
- Strengthened catalog-hook layout guards so `MODULES.md` regeneration stays consistent with hook installation

## [3.1.2] - 2026-04-15

### Added

- **No-em-dash rule** installed by `augx init` - drops `.augment/rules/no-em-dash.md` into target projects, instructing AI agents never to use the em-dash character (U+2014) in generated text, code, comments, or documentation
- `installEmDashRule()` helper in `install-rules.ts` following the same idempotent, rollback-safe pattern as `installCharacterCountRule()`

### Fixed

- Replaced two em-dash characters in `extractCommandHelp.ts` code comments with plain hyphens, keeping the source file itself em-dash-free

## [3.1.1] - 2026-04-15

### Removed

- **`archiver`** removed from production dependencies — the package was never imported in the CLI source and pulled in the deprecated `glob@10.5.0` transitively via `archiver-utils@5.0.2`
- **`@types/archiver`** and **`@types/glob`** removed from devDependencies (types for packages no longer in use)

### Security

- Patched `lodash` from `4.17.23` → `4.18.1` (transitive via `ink`) — resolves prototype-pollution and code-injection advisories (GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh)
- Patched `vite` from `7.3.1` → `7.3.2` (transitive via `vitest`) — resolves path-traversal and arbitrary file-read advisories (GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583)

## [3.1.0] - 2026-03-30

### Security

- Eliminated 14 vulnerabilities (1 critical, 11 high, 2 moderate) from the dependency tree
  - **Critical**: `handlebars` ≤4.7.8 — JavaScript injection via AST type confusion
  - **High**: `tar` ≤7.5.10 — path traversal via symlink/hardlink; `fast-xml-parser` 5.0–5.5.6 — entity expansion DoS bypass; `minimatch` (multiple ranges) — ReDoS via wildcards and globstar; `@typescript-eslint/*` 6.16–7.5 — ReDoS in bundled minimatch; `flatted` ≤3.4.1 — DoS + prototype pollution; `rollup` 4.0–4.58 — arbitrary file write via path traversal
  - **Moderate**: `brace-expansion` — DoS via zero-step sequence; `yaml` 2.0–2.8.2 — stack overflow via deeply nested collections; `picomatch` — ReDoS + method injection
- Upgraded `@typescript-eslint/typescript-estree`, `@typescript-eslint/eslint-plugin`, and `@typescript-eslint/parser` from v6 to v8

### Changed

- Moved `@types/highlight.js` and `@types/js-yaml` from `dependencies` to `devDependencies`
- Streamlined README to focus on Programming, Design, and Sales & Marketing modules
- Removed references to cinematic, literature, and shot-list content from documentation

## [2.5.1] - 2026-03-06

### Added
- **GitHub Packages Support** - Package now publishes to both npm and GitHub Packages
  - Added GitHub Actions workflow for automated dual-registry publishing
  - Added .npmrc.example for local authentication setup
  - Updated PUBLISHING.md with GitHub Packages documentation

### Changed
- **Package Configuration** - Updated package.json with explicit registry configuration
- **Gitignore** - Added .npmrc to prevent credential leaks

## [2.5.0] - 2026-03-04

### Added
- **Commercial Techniques Guide** - Comprehensive guide covering commercial execution strategies
  - Hook development techniques (visual, audio, narrative, question-based)
  - Call-to-Action (CTA) optimization strategies
  - Testimonials and social proof implementation
  - Product demonstration best practices
  - Voiceover techniques and delivery styles
  - Music and sound design principles
  - Visual storytelling methods
  - Emotional trigger frameworks

### Changed
- **Gitignore** - Updated to exclude CLI development and test files
  - Excludes debug-output.txt, test-*.md, wizard-*.md files
  - Excludes cli/evaluation/ directory

## [2.4.1] - 2026-03-04

### Fixed
- **GUI Module Unlinking** - Fixed critical bug where `augx gui` did not properly unlink modules when unchecked
  - GUI now correctly detects and unlinks modules that are unchecked in the interactive module selector
  - Prevents `augx update` from re-linking modules that were intentionally unlinked via GUI
  - Added user feedback showing count of linked and unlinked modules
  - Added tip message: "Tip: Uncheck modules to unlink them"

## [2.0.0] - 2026-02-25

### 🚨 Breaking Changes

#### Module Versioning System
- **All modules now require VERSION files** - Modules without VERSION files are treated as v1.0.0
- **New metadata.json format** - All modules must include compatibility information
- **Config schema updated** - `.augment/extensions.json` now includes `pinnedVersions` field
- **Module structure changes** - All modules now include VERSION, CHANGELOG.md, and metadata.json

#### TypeScript Module v2.0.0
- **Expanded from ~6K to ~25K characters** - 4× content increase with modern TypeScript 5.x features
- **New rule files** - 9 comprehensive rule files (modern-features, type-patterns, monorepo, tooling, security-performance, testing, architecture, error-handling)
- **Breaking content changes** - Updated best practices may conflict with v1.x guidance

### Added

#### Module Versioning System
- **VERSION files** - Semantic versioning (MAJOR.MINOR.PATCH) for all modules
- **CHANGELOG.md** - Version history and change documentation for all modules
- **metadata.json** - Compatibility metadata (Augment version, Node.js version, TypeScript version, etc.)
- **Version generation script** - `scripts/generate-module-metadata.js` for automated VERSION/CHANGELOG/metadata generation
- **Validation script** - `cli/src/utils/validate-versioning.ts` for versioning metadata validation

#### Core Version Management
- **VersionManager class** - `cli/src/core/version-manager.ts`
  - Version loading from VERSION and metadata.json files
  - Version comparison and validation
  - Caching with TTL support
  - Deprecation detection
- **VersionResolver class** - `cli/src/core/version-resolver.ts`
  - Latest version resolution
  - Specific version resolution
  - Version range resolution (e.g., `^1.0.0`, `~2.1.0`)
  - Automatic strategy detection
- **CompatibilityChecker class** - `cli/src/core/compatibility-checker.ts`
  - Node.js version validation
  - TypeScript version validation
  - Deprecation warnings
  - Breaking change detection
- **Enhanced ModuleLoader** - `cli/src/core/module-loader.ts`
  - Version parameter support
  - Metadata reading from VERSION and metadata.json
  - Module-level caching with version keys
  - Integration with VersionManager and VersionResolver

#### CLI Commands
- **`augx use <module> [--version <version>] [--pin]`** - Select and load specific module version
  - Version selection with automatic resolution
  - `--pin` flag to persist version in config
  - `--json` output for programmatic use
  - Available version display on error
- **`augx list --versions`** - Show available versions for all modules
  - Enhanced list command with version display
  - Current version indicator
  - Linked module highlighting
- **`augx upgrade <module> [--force] [--dry-run] [--json]`** - Upgrade module to latest version
  - Version comparison and compatibility checking
  - Breaking change warnings
  - `--dry-run` for preview
  - `--force` to skip compatibility checks
  - Config update for pinned modules
- **`augx version-info <module> [--version <version>] [--json] [--no-changelog] [--no-compatibility]`** - Show detailed version information
  - Metadata display (author, license, repository, dependencies)
  - Available versions list
  - Compatibility information
  - CHANGELOG display
  - Flexible output options

#### GUI/TUI Enhancements
- **Modern TUI framework** - Migrated to Ink (React for CLIs)
  - Dark/light theme support
  - Responsive layout
  - State management (navigation and selection)
- **TreeNavigator component** - `cli/src/gui/components/tree-navigator.tsx`
  - Arrow key navigation (↑/↓/←/→)
  - Collapse/expand functionality
  - Category grouping
  - Depth indentation with visual indicators
- **VersionSelector component** - `cli/src/gui/components/version-selector.tsx`
  - Version list display
  - Current version indicator
  - Pin/unpin functionality (P key)
  - Detailed version information on focus
- **SearchFilter component** - `cli/src/gui/components/search-filter.tsx`
  - Real-time search
  - Category filtering (C key)
  - Tag filtering (T key)
  - Multi-select filters with visual indicators
- **PreviewPane component** - `cli/src/gui/components/preview-pane.tsx`
  - Module description display
  - Metadata display (author, license, repository, size, lastUpdated)
  - Version history (up to 3 versions with changes)
  - Dependency information
- **StatusBar component** - `cli/src/gui/components/status-bar.tsx`
  - Current module/version display with color coding
  - Total/linked modules count
  - Loading state indicator
  - Error message display
  - Context-aware help hints
- **MainLayout** - `cli/src/gui/layouts/main-layout.tsx`
  - Three-panel responsive layout (tree 30%, version+search 25%, preview flexible)
  - Comprehensive keyboard shortcuts (Tab, Shift+Tab, Q, Ctrl+C, ?, Ctrl+R)
  - Linked modules count calculation
  - Loading/error state management

#### TypeScript Module v2.0.0
- **Modern TypeScript Features** - `rules/modern-features.md` (872 lines)
  - Const type parameters
  - Inferred type predicates
  - `satisfies` operator
  - Variance annotations (`in`, `out`)
  - Template literal types
  - Declaration merging patterns
- **Advanced Type Patterns** - `rules/type-patterns.md` (1095 lines)
  - Discriminated unions with exhaustive type guards
  - Branded types and nominal typing
  - Type-level programming basics
  - Recursive conditional types
  - Mapped types and key remapping
- **Monorepo Patterns** - `rules/monorepo.md` (745 lines)
  - Turborepo configuration
  - Nx workspace setup
  - Shared tsconfig patterns
  - Package dependencies and versioning
- **Modern Tooling** - `rules/tooling.md` (1068 lines)
  - Flat ESLint config (eslint.config.js)
  - Biome as prettier+eslint replacement
  - tsup/vite library mode
  - Vitest + MSW for testing
- **Security & Performance** - `rules/security-performance.md` (848 lines)
  - Secure headers in Next.js
  - Type-safe runtime validation (Zod)
  - Memoization patterns
  - Bundle analysis and tree-shaking
- **Testing Strategies** - `rules/testing.md` (872 lines)
  - Unit/integration/e2e patterns
  - Snapshot vs assertion testing
  - Property-based testing (fast-check)
  - MSW for API mocking
- **Architecture Patterns** - `rules/architecture.md` (1095 lines)
  - Folder-by-convention vs by-feature
  - Dependency inversion
  - Domain-driven design (entities, value objects, aggregates)
  - Layered/clean/hexagonal architecture
- **Error Handling** - `rules/error-handling.md` (1173 lines)
  - Neverthrow patterns with ResultAsync
  - Effect-TS introduction
  - Traditional try/catch with custom error classes
  - React error boundary patterns

#### Configuration System
- **Version pinning support** - `cli/src/utils/config-system.ts`
  - `pinnedVersions` field in AugmentConfig interface
  - Helper methods: `pinModuleVersion`, `unpinModuleVersion`, `getPinnedVersion`, `isModulePinned`, `getPinnedModules`
  - Schema and default config updates
  - Migration support for old configs

#### Documentation
- **Migration Guide** - `docs/MIGRATION_V2.md`
  - Breaking changes list
  - Step-by-step migration instructions
  - Common migration scenarios
  - FAQ section
  - Troubleshooting guide
- **Updated README** - Enhanced with versioning system documentation
  - Version selection strategies
  - Upgrade workflow
  - GUI version selection guide
  - Version compatibility information
  - Migration quick start

### Changed

- **Module structure** - All modules now include VERSION, CHANGELOG.md, and metadata.json
- **CLI help system** - Updated with version command documentation and examples
- **GUI interface** - Complete redesign with modern TUI framework and version selection
- **Config schema** - Added `pinnedVersions` field to `.augment/extensions.json`
- **TypeScript module** - Expanded from ~6K to ~25K characters with 9 rule files

### Fixed

- **Module loading** - Improved caching and version resolution
- **Compatibility checking** - Enhanced validation for Node.js and TypeScript versions
- **GUI navigation** - Better keyboard shortcuts and state management

### Deprecated

- None (all v1.x commands still work for backward compatibility)

### Removed

- None (all v1.x functionality preserved)

### Security

- **Enhanced TypeScript security guidance** - Secure headers, type-safe validation, OWASP best practices

---

## [1.4.0] - 2026-02-18

### Added

#### CLI Expansion - Phase 3: Integration Commands
- **Beads Integration** - Full Beads system management
  - `augx beads status` - System status and statistics with completion rates
  - `augx beads validate` - Validate task structure and quality
  - `augx beads export/import` - Export/import tasks in JSON/CSV formats
  - `augx beads stats` - Detailed statistics by priority, label, or owner
  - `augx beads graph` - Dependency graph visualization (ASCII, Mermaid, DOT, SVG)
  - `augx beads report` - Generate reports in Markdown, HTML, JSON, or CSV
  - Core utilities: `beads-integration.ts`, `beads-reporter.ts`, `beads-graph.ts`

- **Task Management** - AI-friendly task wrapper commands
  - `augx task list/show/create/update/close` - Complete task CRUD operations
  - `augx task search` - Search tasks by query, labels, status, priority
  - `augx task deps` - Manage task dependencies (add/remove blockers)
  - Simplified interface for AI agents to manage Beads tasks

- **OpenSpec Integration** - Spec-driven development workflow
  - `augx spec list/show/create/validate/archive` - Specification management
  - `augx spec status` - Track specification status across the project
  - Core utility: `spec-manager.ts` for spec lifecycle management

- **Change Management** - Change proposal workflow
  - `augx change list/show/create/validate/archive` - Change proposal management
  - Support for JIRA ticket integration in change proposals
  - Templates for feature, bugfix, and refactor changes
  - Core utility: `change-manager.ts` for change lifecycle

- **Collection Management** - Module collection operations
  - `augx collection list/show/link/unlink/validate` - Collection management
  - Dependency resolution for bundled modules
  - Core utility: `collection-manager.ts` for collection handling

#### CLI Expansion - Phase 4: Quality & Documentation
- **Test Runner** - Comprehensive module testing utility (`test-runner.ts`)
  - Validate AI context modules with comprehensive checks
  - Generate test reports with detailed validation results

- **Linter** - AI context quality validation (`linter.ts`)
  - Rule-based quality checking for modules and content
  - Comprehensive reporting of quality issues

- **Docs Generator** - Automatic API documentation (`docs-generator.ts`)
  - Generate documentation from module metadata
  - Create usage examples and API references

- **Enhanced Help System** - Intelligent command suggestions (`help-system.ts`)
  - Context-aware help for AI agents
  - Command discovery and suggestion engine

#### Testing & Documentation
- Comprehensive integration tests for all Phase 3 commands
- Integration documentation for Beads and OpenSpec workflows
- Usage examples and best practices for AI agents

### Changed
- Updated package version from 1.3.1 to 1.4.0
- Enhanced README.md with complete CLI expansion documentation
- Updated CLI command reference with all new commands
- Improved coordination system for Beads, OpenSpec, and Collection integration

### Performance
- Optimized task filtering and search operations
- Efficient dependency graph generation
- Cached statistics for improved performance


## [1.3.0] - 2026-02-06

### Added

#### ADR Support Module
- **Architecture Decision Records (ADR) Workflow Module** - Complete ADR lifecycle management
  - Automatic decision detection from code changes and conversations
  - 4 ADR templates: Nygard, MADR Simple, MADR Elaborate, Business Case
  - Full lifecycle management: draft → proposed → approved → implemented → maintained
  - OpenSpec and Beads integration for traceability
  - Validation and conflict detection
  - Template selection logic based on decision complexity
  - 8 comprehensive rule files
  - 4 ready-to-use templates
  - 3 complete examples with integration workflows
  - 2 JSON schemas for configuration and metadata

#### Visual Design Module
- **Visual Design System Module** - Multi-domain visual design support
  - Support for web pages, motion pictures, print campaigns, and other visual domains
  - Vendor-agnostic style definitions (Tailwind, Bootstrap, Material-UI, custom CSS)
  - AI prompt generation for visual design tools
  - Style comparison and selection utilities
  - Domain-specific workflows and examples
  - TypeScript utilities for style management
  - Comprehensive test coverage

### Changed
- Updated package version from 1.2.2 to 1.3.0
- Enhanced module catalog with new workflow and domain modules


## [0.4.0] - 2026-01-31

### Added

#### Skills System (Beta)
- **Token-Efficient Skills** - Lightweight, focused modules (500-10K tokens vs 50K+ for full modules)
  - 97.2% average token reduction compared to full modules
  - On-demand loading with dynamic dependency resolution
  - 6 skill categories: retrieval, transformation, analysis, generation, integration, utility
  - Intelligent caching for performance optimization

#### Skill Commands
- `augx skill list` - List all available skills
- `augx skill show <skill-id>` - Show skill details and content
- `augx skill search <keyword>` - Search for skills by name, description, or tags
- `augx skill validate <file>` - Validate skill file format and metadata
- `augx skill exec <skill-id>` - Execute skill CLI commands
- `augx skill inject <skill-id>` - Inject skill content into AI context with dependency resolution
- `augx skill load <skill-ids...>` - Load multiple skills in batch
- `augx skill cache-clear` - Clear skill cache
- `augx skill cache-stats` - Show cache statistics
- `augx skill create-mcp` - Create new MCP skill wrapper

#### MCP Integration (Beta)
- **MCP Server Management** - Wrap Model Context Protocol servers as CLI commands and skills
  - Inspired by [mcporter](https://github.com/steipete/mcporter)
  - Configure MCP servers in `.augment/mcp/servers.json`
  - Execute MCP tools via CLI
  - Generate skill wrappers for MCP tools
  - Discover available tools from MCP servers

#### MCP Commands
- `augx mcp list` - List configured MCP servers
- `augx mcp add <name> <command>` - Add MCP server configuration
- `augx mcp remove <name>` - Remove MCP server
- `augx mcp exec <server> <tool>` - Execute MCP tool
- `augx mcp wrap <server> <tool> <skill-id>` - Generate skill wrapper
- `augx mcp discover <server>` - Discover tools from server
- `augx mcp generate-cli <command> <output>` - Generate CLI using mcporter

#### Documentation
- **Skill Development Guide** (`docs/SKILL_DEVELOPMENT.md`) - Comprehensive guide for creating skills
- **Migration Guide** (`docs/MIGRATION_GUIDE.md`) - Migrate from modules to skills
- **CLI Reference** (`docs/CLI_REFERENCE.md`) - Complete CLI command reference
- **MCP Integration** (`.augment/mcp/README.md`) - MCP integration documentation

#### Initial Skills
- **sdk-query** (retrieval) - Query SDK documentation and code examples
- **context-retrieval** (retrieval) - Retrieve code context using semantic search
- **code-analysis** (analysis) - Analyze code for quality and security
- **add-mcp-skill** (generation) - Meta-skill for automating MCP skill creation

### Changed
- Updated repository structure to include `skills/` directory
- Enhanced README.md with Skills System and MCP Integration sections
- Updated package.json repository URLs to `mytech-today-now/augment-extensions`
- Improved coordination system to track skills alongside modules

### Performance
- **97.2% token reduction** - Measured in benchmarks (skills vs full modules)
- **Faster context injection** - Smaller files, faster parsing
- **Better organization** - Focused, single-purpose skills

### Statistics
- **Total Skills**: 4 (1 retrieval, 1 analysis, 1 generation)
- **Total Modules**: 20 (8 coding standards, 6 domain rules, 2 workflows, 4 examples, 1 collection)
- **Total Character Count**: ~1,774,692 (1.7M+ characters in modules)

## [0.3.0] - 2026-01-29

### Added

#### New Modules
- **Model Context Protocol (MCP) Guidelines** (`domain-rules/mcp`) - 219,130 characters
  - 6 MCP types: token-based, state-based, vector-based, hybrid, graph-augmented, compressed
  - Universal rules for context optimization, error handling, security, monitoring, testing
  - Configuration system with JSON schema and validation
  - Testing framework with unit, integration, and synthetic testing strategies
  - 6 complete implementation examples with production-ready code
  - RAG patterns with embeddings and vector search
  - State management with Redis, serialization, and concurrency control
  - Graph integration with Neo4j knowledge graphs

- **PHP Coding Standards** (`coding-standards/php`) - 186,539 characters
  - PSR standards (PSR-1, PSR-12, PSR-4, PSR-7, PSR-11)
  - Security guidelines following OWASP best practices
  - Testing standards with PHPUnit
  - CMS integration patterns (WordPress, Drupal)
  - E-commerce development (WooCommerce)
  - Legacy migration strategies

- **Database Design Guidelines** (`domain-rules/database`) - 449,449 characters
  - Relational databases: schema design, normalization, indexing, query optimization, transactions
  - NoSQL databases: document stores (MongoDB), key-value stores (Redis), graph databases (Neo4j)
  - Vector databases: embeddings, indexing, semantic search (Pinecone, Weaviate, Qdrant)
  - Flat databases: CSV, JSON, SQLite use cases
  - Performance optimization and security standards

#### CLI Features
- **GUI Module Manager** - Interactive terminal UI for module selection (`augx gui`)
- **Unlink Command** - Remove modules or collections with dependency checking
- **Self-Remove Command** - Safely uninstall all Augment Extensions with dry-run mode
- **Enhanced Search** - Find modules by name, description, or tags in the GUI

#### Module System
- **Collections System** - Bundle multiple related modules together
  - `collections/html-css-js` - Complete frontend development bundle (164,851 chars)
- **Modular HTML/CSS/JS** - Split monolithic module into independent modules
  - `coding-standards/html` (32,477 chars)
  - `coding-standards/css` (30,556 chars)
  - `coding-standards/js` (101,818 chars)

### Changed
- Refactored README.md to accurately reflect all 20 modules and 1.7M+ characters of content
- Updated repository structure documentation
- Enhanced usage examples for different project types (frontend, Python/AI, WordPress, full-stack, PHP)
- Improved module statistics and categorization

### Deprecated
- `coding-standards/html-css-js` - Use `collections/html-css-js` or individual modules instead

### Statistics
- **Total Modules**: 20 (8 coding standards, 6 domain rules, 2 workflows, 4 examples, 1 collection)
- **Total Character Count**: ~1,774,692 (1.7M+ characters)
- **Languages Covered**: HTML, CSS, JavaScript, TypeScript, Python, React, PHP
- **Domains Covered**: APIs, Databases, MCP, Security, WordPress

## [0.2.0] - 2026-01-XX

### Added
- **WordPress Plugin Development Module** (`domain-rules/wordpress-plugin`) - 344,186 characters
- **WordPress Plugin Workflow** (`workflows/wordpress-plugin`)
- **Beads Workflow Integration** (`workflows/beads`) - 39,912 characters
- **Example Modules**: Gutenberg blocks, REST API plugins, WooCommerce extensions
- **Migration Guides**: WordPress core, PHP, theme, and plugin migrations
- **VS Code Integration**: Complete IDE setup for WordPress development
- **Python Coding Standards** (`coding-standards/python`) - 116,868 characters
- **React Patterns** (`coding-standards/react`) - 32,000 characters

## [0.1.3] - 2025-XX-XX

### Added
- Initial module system
- TypeScript coding standards
- OpenSpec workflow integration

## [0.1.2] - 2025-XX-XX

### Added
- CLI improvements
- Module validation

## [0.1.1] - 2025-XX-XX

### Added
- Bug fixes and improvements

## [0.1.0] - 2025-XX-XX

### Added
- Initial release
- Basic CLI functionality
- Module linking system

[0.4.0]: https://github.com/mytech-today-now/augment-extensions/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mytech-today-now/augment-extensions/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mytech-today-now/augment-extensions/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/mytech-today-now/augment-extensions/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/mytech-today-now/augment-extensions/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mytech-today-now/augment-extensions/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mytech-today-now/augment-extensions/releases/tag/v0.1.0

