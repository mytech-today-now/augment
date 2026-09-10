# Augment Extensions

**Reusable augmentation modules for Augment Code AI, with cross-platform distribution to Claude Code, Cursor, Windsurf, and GitHub Copilot.**

[![Version](https://img.shields.io/badge/version-3.1.3-blue.svg)](https://github.com/mytech-today-now/augment-extensions)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![npm](https://img.shields.io/badge/npm-%40mytechtoday%2Faugment--extensions-red.svg)](https://www.npmjs.com/package/@mytechtoday/augment-extensions)

Augment Extensions is the structural layer between your rule modules and the AI coding tools that consume them. It treats coding standards, domain rules, workflows, and examples as versioned, composable units, and ships them into the native rules surface of every major AI coding tool from a single source of truth. The `augx` CLI links modules into projects, materializes them into per-tool locations, aggregates them into per-tool single-file rule artifacts, and keeps the whole arrangement coordinated through a manifest that links specs, tasks, rules, and the files they govern.

The repository exists because rule content for AI agents has outgrown the surfaces individual tools provide. Each tool reserves a small budget for instructions the agent sees before it reasons about your code. Augment Code allocates roughly 49,400 characters to `.augment/`. Cursor, Windsurf, Copilot, and Claude Code each have their own constraints. The modules here live outside those budgets, are loaded on demand, and are emitted into the tool-native shapes those budgets expect, so the same module set can drive every tool without manual duplication.

Current release: 3.1.3 hardens module and file containment in inspection flows, keeps mirror reconciliation aligned with the module tree, and tightens catalog hook layout handling.

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Quickstart](#quickstart)
- [Concepts](#concepts)
- [CLI Reference](#cli-reference)
- [Cross-Platform Distribution](#cross-platform-distribution)
- [Coordination Manifest Schema](#coordination-manifest-schema)
- [MCP Integration](#mcp-integration)
- [OpenSpec Integration](#openspec-integration)
- [Beads Integration](#beads-integration)
- [Authoring Modules](#authoring-modules)
- [Operability](#operability)
- [Project Layout](#project-layout)
- [Module Catalog](#module-catalog)
- [Per-Tool Consumer Notes](#per-tool-consumer-notes)
- [Contributing](#contributing)
- [License](#license)

## Why This Exists

Every AI coding tool ships a "rules" surface: a place where you tell the agent how your project expects it to behave. Augment Code reads `.augment/`. Claude Code reads `CLAUDE.md` and `.claude/rules/`. Cursor reads `.cursor/rules/*.mdc`. Windsurf reads `.windsurfrules` and `.windsurf/rules/`. GitHub Copilot reads `.github/copilot-instructions.md` and `.github/instructions/`.

Three problems compound as a project grows:

1. **Budget.** Augment Code limits `.augment/` to roughly 49,400 characters. Comprehensive coding standards, security rules, workflow guidance, and worked examples cannot fit in that budget for any non-trivial project. The other tools have softer limits but the same diminishing-returns curve: the larger the rules file, the less the agent actually applies.
2. **Duplication.** Without a structural layer, teams maintain four or five parallel copies of the same guidelines, one per tool. Edits drift. Tools fall out of sync. A change to a TypeScript naming rule has to be made in five places by hand.
3. **Context discipline.** Rules embedded inline in a giant rules file cannot be selectively loaded, and they mix static guidance with volatile data like task state. The agent ends up parsing prose for state that should come from a live source.

Augment Extensions answers all three. Modules live in `augment-extensions/`, outside any tool's rules budget. The `augx` CLI links the modules a project actually needs, then either aggregates them into the single-file shape each tool expects (`augx export`) or materializes per-module files into each tool's per-module location (`augx link --mirror`). A coordination manifest in `.augment/coordination.json` tracks which specs are active, which tasks are in flight, which rules govern which files, and which mirror entries were materialized as symlinks versus copies. When the project declares a Beads MCP server, exported artifacts inline a snippet that points the consuming agent at the live task source instead of embedding stale snapshots.

The result: rules are authored once in plain Markdown and JSON, versioned per module, and propagate deterministically to every tool a developer might use.

## Quickstart

Install the CLI globally and link a module:

```bash
npm install -g @mytechtoday/augment-extensions

# In the project that will consume the modules
augx init
augx link coding-standards/typescript
augx list --linked
```

Mirror the module into one or more tools' native per-module rules locations:

```bash
augx link coding-standards/typescript --mirror cursor,windsurf
```

Or aggregate every currently linked module into one tool's single-file rules artifact:

```bash
augx export --target claude-code
augx export --target all --dry-run     # preview without writing
```

From a clean clone to a working `CLAUDE.md`, `.cursor/rules/augx-coding-standards-typescript.mdc`, and `.windsurf/rules/augx-coding-standards-typescript.md` is four commands.

## Concepts

### Modules

A module is a directory under `augment-extensions/` with a `module.json` manifest, a `rules/` directory of Markdown files, and optional `examples/` and `CHANGELOG.md`. Modules are versioned per semver, project-agnostic, and addressable by their canonical id (for example `coding-standards/typescript`, `workflows/cross-platform`, `domain-rules/security`).

Four module categories exist:

- **coding-standards** - language- or framework-specific guidance. Currently shipped: Bash, C, CSS, Go, HTML, HTML+CSS+JS, JavaScript, Perl, PHP, PowerShell, Python, Q, React, TypeScript.
- **domain-rules** - subject-matter guidance independent of language. Currently shipped: API Design, Database, Design (color), MCP, Security, SEO/Sales/Marketing, Software Architecture, WordPress, WordPress Plugin. The `visual-design/` module ships alongside as a sibling tree with its own vendor and domain palettes.
- **workflows** - process integration for spec-driven development, task tracking, and multi-tool distribution. Currently shipped: adr-support, cross-platform, database, mcp, wordpress-plugin.
- **examples** - canned working examples that illustrate the rules. Currently shipped: design-patterns, gutenberg-block-plugin, rest-api-plugin, woocommerce-extension.

### Linked vs. mirrored vs. exported

These three verbs are orthogonal and stack:

- **Linked** means a module is recorded in the project's `.augment/extensions.json` as one of the rule sets this project pulls from. It does not by itself write into any tool's rules surface.
- **Mirrored** means the linked module's `rules/` content has been materialized into one or more tools' per-module rules locations, one target file (or directory) per module. `augx link --mirror` writes these.
- **Exported** means the union of all currently linked modules has been concatenated into the single aggregated rules file each tool expects (`CLAUDE.md`, `.cursor/rules/augx.mdc`, `.windsurfrules`, `.github/copilot-instructions.md`). `augx export` writes these.

A project can use export only, mirror only, both, or neither. The two surfaces never share a target path.

### Coordination manifest

`.augment/coordination.json` is the harmonizer. It stores four kinds of relationships:

- **Specs** - active OpenSpec proposals or canonical specs, each with the tasks they spawned, the rules that govern them, and the file patterns they affect.
- **Tasks** - Beads issue ids referenced from specs, with the rules they applied while running.
- **Rules** - the `.augment/rules/` files that apply to specs and tasks.
- **Files** - the working-tree files created or modified under a given spec/task pair, with the rules that were in force at the time.

Two additional blocks, `export` and `mirrors`, are populated by the CLI when cross-platform features are in use. Both are optional and forward-compatible: loaders ignore unknown keys silently and missing keys preserve prior behavior.

### Context engineering, in practice

A consequence of the linked/mirrored/exported split is that the context an agent sees before it reasons can be tuned per tool, per module, and per session. Mirrored modules let you commit one file per module to source control and selectively prune what each tool sees. Aggregated exports keep the agent's static surface lean by routing volatile data (task state, dependency graphs) to the Beads MCP server instead of inlining it in the rules file. The repo's defaults push hard in this direction: exports inline an MCP wiring snippet only when a Beads MCP server is declared, and they never embed live task data.

## CLI Reference

Every command below is implemented by the `augx` binary shipped from `cli/`. Flags marked as defaults appear when omitted.

### Project lifecycle

#### `augx init`

Initialize Augment Extensions in the current project. Creates `.augment/extensions.json`, installs the `.augment/rules/character-count-management.md` and `.augment/rules/no-em-dash.md` rules, generates `.augment/COMMAND_HELP.md` with help text for the detected workflow tools, and (when `.beads/` is present) wires Beads integration. Prompts interactively for optional rules unless overridden.

```bash
augx init                          # interactive
augx init -y                       # accept defaults for optional-rule prompts
augx init --no-optional-rules      # skip optional-rule prompts entirely
augx init --from-submodule         # initialize when augment-extensions/ is a git submodule
augx init beads                    # nested subcommand: stand up Beads task tracking
```

#### `augx self-remove`

Safely unlink Augment Extensions from the project. It clears linked-module entries from `.augment/extensions.json`, prunes Augment recommendations from `.vscode/extensions.json` when present, writes `.augment-removal.log`, and preserves the `.augment/` directory plus user-generated content. Pair with `--dry-run` to preview the exact preserved and cleaned paths, or `--force` to skip confirmation.

```bash
augx self-remove --dry-run
augx self-remove --force
```

### Module discovery

#### `augx list`

List available or linked modules.

```bash
augx list                 # every module shipped by the package
augx list --linked        # only modules linked into this project
augx list --json          # machine-readable
augx list --versions      # include available versions per module
```

#### `augx show <module> [file-path]`

Display module metadata, aggregated content, or a single file inside a module. The same command surfaces three special pseudo-modules: `completed` (Beads completed tasks), `linked` (the linked-module set), `all` (every available module).

```bash
augx show coding-standards/typescript
augx show coding-standards/typescript rules/naming-conventions.md
augx show coding-standards/typescript --content --format markdown
augx show coding-standards/typescript --search "naming"
augx show coding-standards/typescript --filter "rules/*.md"
augx show coding-standards/typescript --depth 2
augx show coding-standards/typescript --page 1 --page-size 10
augx show coding-standards/typescript --secure      # redact API keys/tokens/passwords in output
augx show coding-standards/typescript --open        # open in VS Code editor
augx show linked
augx show all
augx show completed --since 2026-01-01 --priority 1
```

`--no-cache` disables the inspection cache for one call. `--preview` opens a VS Code preview pane instead of the editor.

#### `augx search <keyword>`

Search modules by keyword. `--type` restricts to a single category.

```bash
augx search typescript
augx search security --type domain-rules
```

### Linking and mirroring

#### `augx link <module>`

Link a module into the current project. Records the entry in `.augment/extensions.json`. With `--mirror`, materializes the module's `rules/` content into the per-module rules location of one or more target tools.

```bash
augx link coding-standards/typescript
augx link coding-standards/typescript --version 2.0.0
augx link coding-standards/typescript --mirror cursor
augx link coding-standards/typescript --mirror cursor,windsurf
augx link coding-standards/typescript --mirror all --verbose
```

When `.augment/coordination.json.export.mirror` is `true`, `--mirror` is implied and the targets are taken from `.export.targets`.

#### `augx unlink <module>`

Unlink a module from the project. Reverses tracked mirror entries: tracked symlinks are removed and tracked copies whose content still matches the recorded source are removed. Hand-edited copies are left in place with a warning, so user edits are never silently destroyed. `--force` overrides dependency-based refusal.

```bash
augx unlink coding-standards/typescript
augx unlink coding-standards/typescript --force
```

#### `augx use <module>`

Select and load a specific module version, optionally pinning it for the project.

```bash
augx use coding-standards/typescript --version 2.0.0
augx use coding-standards/typescript --version 2.0.0 --pin
```

### Module maintenance

#### `augx update`

Update the CLI itself, linked modules, or both.

```bash
augx update                       # update linked modules
augx update --module coding-standards/typescript
augx update --cli                 # update the CLI to latest
augx update --all                 # update CLI and modules
```

#### `augx upgrade <module>`

Upgrade a specific module to its latest version, with optional dry-run and forced upgrade through compatibility errors.

```bash
augx upgrade coding-standards/typescript
augx upgrade coding-standards/typescript --dry-run
augx upgrade coding-standards/typescript --force
augx upgrade coding-standards/typescript --json
```

#### `augx version-info <module>`

Show detailed version information including changelog and compatibility.

```bash
augx version-info coding-standards/typescript
augx version-info coding-standards/typescript --json
augx version-info coding-standards/typescript --no-changelog --no-compatibility
```

#### `augx validate <module>`

Validate a module's structure and `module.json` metadata.

```bash
augx validate coding-standards/typescript
augx validate coding-standards/typescript --verbose
```

#### `augx migrate`

Migrate existing Beads and OpenSpec data into the coordination manifest. A backup is created before any write.

```bash
augx migrate
```

### Cross-platform distribution

#### `augx export`

Aggregate every currently linked module into the native single-file rules artifact of one or more target tools. See [Cross-Platform Distribution](#cross-platform-distribution) for the full path table and drift semantics.

```bash
augx export --target claude-code
augx export --target cursor,windsurf
augx export --target all
augx export --target claude-code --output build/claude-rules.md
augx export --target all --dry-run
augx export --target claude-code --force         # overwrite drift
augx export --target all --verbose
augx export                                       # uses export.targets from coordination.json
```

### Coordination queries

#### `augx coord specs`

List all active specs from the coordination manifest.

```bash
augx coord specs
augx coord specs --json
```

#### `augx coord tasks <spec-id>`

List the tasks for a specific spec.

```bash
augx coord tasks bash-coding-standards
augx coord tasks bash-coding-standards --json
```

#### `augx coord rules <task-id>`

List the `.augment/` rules that applied while a task was in flight.

```bash
augx coord rules bd-xplat2-1
augx coord rules bd-xplat2-1 --json
```

#### `augx coord file <path>`

Show the coordination record for a specific file: which task created it, which tasks modified it, which specs govern it, and which rules applied.

```bash
augx coord file cli/src/adapters/banner.ts
augx coord file cli/src/adapters/banner.ts --json
```

### Sync

The `sync` subcommands keep the coordination manifest current with Beads and OpenSpec without manual edits.

```bash
augx sync beads          # sync Beads tasks to coordination manifest
augx sync openspec       # sync OpenSpec specs to coordination manifest
augx sync all            # sync both
augx sync watch          # watch for changes and auto-sync
```

### Catalog

The catalog command keeps the `MODULES.md` table of all available modules in sync with the on-disk module tree.

```bash
augx catalog
augx catalog --check                 # exit 1 if out of date
augx catalog --auto                  # update only if out of date
augx catalog --output cli/MODULES.md
augx catalog-hook                    # install pre-commit git hook
augx catalog-hook --type post-commit
augx catalog-hook --remove
```

### Rule installation

`install-rules` re-installs the character-count and em-dash management rules (and any other repo-mandated rule files) into `.augment/rules/`. Use the hook flags to keep rules current across branch switches and merges.

```bash
augx install-rules
augx install-rules --force
augx install-rules --interactive
augx install-rules --setup-hooks --git-hook-type post-checkout
augx install-rules --setup-hooks --git-hook-type post-merge
augx install-rules --remove-hooks
```

### MCP server management

The `augx mcp` family configures and exercises MCP servers from the CLI.

```bash
augx mcp list                                 # list configured MCP servers
augx mcp list --json
augx mcp add beads python --args="-m beads_mcp" --transport stdio
augx mcp remove beads
augx mcp exec beads tasks/list                # invoke a tool on a configured server
augx mcp exec beads tasks/get --args '{"id":"bd-init"}' --json
augx mcp discover beads                       # list tools the server exposes
augx mcp discover beads --json
augx mcp wrap beads tasks/list my-skill       # generate a skill wrapper for a tool
augx mcp generate-cli beads ./generated-cli   # generate a CLI from a server via mcporter
```

HTTP transport is not yet supported, use stdio.

### Skills

The `augx skill` family manages discoverable skills (small, addressable units of agent capability), separate from rule modules.

```bash
augx skill list
augx skill list --category retrieval
augx skill show <skillId>
augx skill validate <skillId>
augx skill search "<query>"
augx skill exec <skillId> [args...]
augx skill inject <skillId> --max-tokens 4000
augx skill load <skillId> <skillId> --max-tokens 8000
augx skill cache-clear
augx skill cache-stats
augx skill create-mcp --name beads --description "Beads tasks" \
                     --category retrieval --token-budget 2000 \
                     --tags tasks,beads
```

`augx skill inject` and `augx skill load` honor a token budget, so the agent's static context surface stays bounded even when several skills are active.

### Code analysis

`augx code-analysis` (aliased `augx analyze`) runs quality, complexity, security, and dependency checks against the project tree.

```bash
augx analyze --dir src --type quality
augx analyze --dir src --type security --severity high
augx analyze --file src/index.ts --type complexity
augx analyze --pattern "src/**/*.ts" --type patterns --format json
augx analyze --dir src --type dependencies --fix
```

### GUI

```bash
augx gui          # launch the interactive TUI module browser
```

### Help reference

After `augx init`, the file `.augment/COMMAND_HELP.md` is regenerated and contains the comprehensive help text for every workflow tool detected in the project (Augx, Beads, OpenSpec). Agents and humans can read it without invoking any command. It is regenerated each time `augx init` runs.

## Cross-Platform Distribution

The cross-platform feature materializes the same module set into four AI coding tools in addition to Augment Code, through two complementary surfaces. Both are opt-in. Neither touches `.augment/` or the canonical module source.

### Aggregated export (`augx export`)

`augx export --target <tool>` produces one file per target, containing the concatenated `rules/` content of every linked module, in alphabetical module-id order.

| Target | Output path | Format |
|---|---|---|
| `claude-code` | `CLAUDE.md` | Markdown |
| `cursor` | `.cursor/rules/augx.mdc` | Markdown with YAML frontmatter |
| `windsurf` | `.windsurfrules` | Markdown |
| `copilot` | `.github/copilot-instructions.md` | Markdown |
| `all` | all of the above | per format |

#### Banner anatomy

Every exported file starts with a five-line HTML-comment banner. For Cursor, the banner sits immediately below the required YAML frontmatter.

```text
<!-- GENERATED BY augx export - DO NOT EDIT -->
<!-- augx-version: 3.1.3 -->
<!-- generated-at: 2026-05-25T21:13:00Z -->
<!-- source-hash: a1b2c3d4e5f60718 -->
<!-- modules: coding-standards/typescript@2.0.0, workflows/cross-platform@1.0.0 -->
```

| Field | Meaning |
|---|---|
| `augx-version` | The version of the `augx` CLI that produced the file. |
| `generated-at` | ISO-8601 UTC timestamp, replaced only when content actually changes. |
| `source-hash` | 16 hex characters covering the canonical encoding of `{ sortedModuleIds, versions, contentDigests, ignorePatterns }`. |
| `modules` | The contributing modules in `<id>@<version>` form, alphabetical by id. |

The hash is the drift control point: the banner's recorded `source-hash` is compared against a hash recomputed from the file's current body. If they diverge, the file has been hand-edited.

#### Drift refusal (exit code 3)

If `augx export` finds the existing target file's body hash does not match the banner-recorded `source-hash`, it treats the file as hand-edited and refuses to overwrite. The export exits 3 and the file is preserved. Two resolution paths:

- Edit module sources under `augment-extensions/` and re-run `augx export`. Preferred; preserves traceability.
- Re-run with `--force`. Discards local edits.

#### `--dry-run` output

```text
[dry-run] claude-code -> CLAUDE.md (12_345 bytes, 7 modules)
[dry-run] cursor      -> .cursor/rules/augx.mdc (13_010 bytes, 7 modules)
```

No filesystem writes. Exit 0 on success.

#### Idempotency invariants

- Modules are emitted in alphabetical order of canonical id.
- All generated files use LF line endings regardless of host OS.
- All paths in generated content are forward-slash.
- Timestamps are only refreshed when content actually changes; a re-run with no upstream changes is a byte-identical no-op (exit 0, no writes).
- Glob patterns in `export.ignore` use forward slashes and are evaluated relative to each module root.

#### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (including no-op when nothing changed) |
| 1 | Usage error (missing or unknown `--target`, `--output` with multiple targets, empty `--mirror`) |
| 2 | Resolution error (no linked modules, broken module) |
| 3 | Drift refusal (re-run with `--force` to overwrite) |
| 4 | I/O error (cannot read or write, permission denied) |

#### Safety rules

- Never writes outside the project root.
- Never follows symlinks out of `augment-extensions/` during resolution.
- The Augment Code surface (`.augment/`) is never touched.

### Per-module mirror (`augx link --mirror`)

`augx link <module> --mirror <tool>` materializes a single module's `rules/` content into the per-module rules location of one or more tools. The aggregated `augx export` artifact and the per-module mirror artifacts never share a path; running both for the same project is supported and common.

| Target | Per-module path |
|---|---|
| `claude-code` | `.claude/rules/<module>/...` (directory, source layout preserved file-for-file) plus a one-line include stub appended to `CLAUDE.md` |
| `cursor` | `.cursor/rules/augx-<module>.mdc` (one file per module, frontmatter generated) |
| `windsurf` | `.windsurf/rules/augx-<module>.md` (one file per module) |
| `copilot` | `.github/instructions/augx-<module>.instructions.md` (one file per module) |

Module ids use forward slashes (`coding-standards/typescript`); the materializer collapses the slash to a dash when constructing the per-module segment (`coding-standards-typescript`).

The Claude Code include stub takes the form:

```text
<!-- augx-include: .claude/rules/coding-standards-typescript/ -->
```

#### Materialization strategy

For each rule file in the linked module:

1. Compute the destination path under the target tool's convention.
2. Try `symlink(source, destination)`.
3. If `symlink` raises `EPERM`, `EACCES`, or `ENOSYS`, fall back to `copyFile(source, destination)`.
4. Record `{ tool, sourcePath, targetPath, mode }` in `.augment/coordination.json.mirrors[<moduleId>]`, where `mode` is `"symlink"` or `"copy"`.

Subsequent invocations consult the recorded `mode` and skip the symlink attempt entirely, so there is no per-run retry storm on systems where symlink will never succeed.

#### Windows symlink-to-copy fallback

On Windows without Developer Mode, `fs.symlinkSync` raises `EPERM`. The mirror hook catches `EPERM`, `EACCES`, and `ENOSYS`, falls back to `copyFile`, records `mode: "copy"` once in `.augment/coordination.json.mirrors[<module>]`, and uses that recorded mode on every subsequent run. Users with Developer Mode enabled (or any non-Windows host) get `mode: "symlink"` recorded once and reused.

#### Idempotency and unlink reconciliation

`augx link <module> --mirror ...` is fully idempotent. On each run, the desired set of `(tool, targetPath)` tuples is reconciled against the tracked set:

- Tuples in desired AND tracked, source unchanged: left alone.
- Tuples in desired AND tracked, source changed: re-materialized.
- Tuples in desired AND not in tracked: created.
- Tuples in tracked AND not in desired (for example, a renamed source file): pruned.

`augx unlink <module>` walks the same tracked set in reverse:

1. Tracked symlinks pointing at the recorded source are deleted.
2. Tracked copies whose content still matches the recorded source hash are deleted.
3. Tracked copies whose content has been hand-edited are left in place with a warning.
4. The entire `mirrors[<module>]` entry is removed when cleanup completes.

This guarantees rename-safe, edit-preserving cleanup. User edits to mirrored files are never silently destroyed.

### Coordination block-driven defaults

When `--target` (export) or `--mirror` (link) is omitted, `augx` consults `.augment/coordination.json.export` for defaults:

- `export.targets[]` provides the default target list for `augx export`.
- `export.mirror: true` makes `augx link` run the mirror hook for every entry in `export.targets[]` without requiring `--mirror`.
- `export.ignore[]` provides glob patterns excluded from aggregation; defaults to `["**/examples/**"]`.

```bash
augx export                               # uses export.targets
augx link coding-standards/typescript     # mirrors when export.mirror is true
```

## Coordination Manifest Schema

`.augment/coordination.json` is the structural map of the repository. It is written and read by the CLI; manual edits are tolerated but the CLI may overwrite top-level blocks it owns (`mirrors`). Unknown top-level keys are preserved on round-trip.

Annotated example:

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-05-25T21:13:00Z",

  "specs": {
    "bash-coding-standards": {
      "path": "openspec/changes/bash-coding-standards/proposal.md",
      "status": "active",
      "relatedTasks": ["bd-0bqd", "bd-0bqd.2"],
      "relatedRules": [
        "module-development.md",
        "character-count-management.md"
      ],
      "affectedFiles": [
        "openspec/changes/bash-coding-standards/**/*",
        "augment-extensions/coding-standards/bash/**/*",
        ".augment/coordination.json"
      ],
      "dependencies": []
    }
  },

  "tasks": {
    "bd-xplat2-1": {
      "specs": ["cross-platform/export-command"],
      "rulesApplied": ["module-development.md", "no-em-dash.md"]
    }
  },

  "rules": {
    "no-em-dash.md": {
      "appliedBy": ["bd-xplat1-3", "bd-xplat2-1"]
    }
  },

  "files": {
    "cli/src/adapters/banner.ts": {
      "createdBy": "bd-xplat1-3",
      "modifiedBy": ["bd-xplat2-6", "bd-xplat4-2"],
      "governedBy": [
        "cross-platform/export-command",
        "cross-platform/mcp-template"
      ],
      "rulesApplied": ["module-development.md", "no-em-dash.md"]
    }
  },

  "export": {
    "targets": ["claude-code", "cursor"],
    "ignore": ["**/examples/**", "**/CHANGELOG.md"],
    "mirror": true
  },

  "mirrors": {
    "coding-standards/typescript": [
      {
        "tool": "cursor",
        "sourcePath": "augment-extensions/coding-standards/typescript/rules/naming-conventions.md",
        "targetPath": ".cursor/rules/augx-coding-standards-typescript.mdc",
        "mode": "symlink"
      }
    ]
  }
}
```

| Block | Owner | Purpose |
|---|---|---|
| `specs` | OpenSpec sync / manual | Active and archived specs with their related tasks, rules, and file globs. |
| `tasks` | Beads sync / manual | Task records keyed by Beads id, with the specs and rules each task touched. |
| `rules` | manual | `.augment/rules/*.md` files with their applying tasks. |
| `files` | manual | Working-tree files with creator/modifier task ids, governing specs, and applied rules. |
| `export` | manual | Defaults for `augx export` and `augx link --mirror`. Optional. |
| `mirrors` | CLI | Tracked materialization log for `augx link --mirror`. Do not hand-edit. Cleared by `augx unlink`. |

Loader rules per the spec:

- Loaders MUST treat missing keys as `undefined`.
- Loaders MUST preserve unknown top-level keys when round-tripping.
- Writers serialize keys in alphabetical order at each object level.
- Files end with a trailing newline, two-space indentation, LF line endings.

## MCP Integration

The repository treats live task state as something the agent should fetch from a Model Context Protocol server, not parse out of a static rules file. Two configuration surfaces are recognized:

- `.vscode/mcp.json` - the VS Code / Augment Code MCP configuration file.
- `.augment/mcp/servers.json` - the CLI-managed MCP configuration file.

Example `.vscode/mcp.json` declaring the Beads MCP server:

```json
{
  "mcpServers": {
    "beads": {
      "command": "python",
      "args": ["-m", "beads_mcp"],
      "env": {
        "BEADS_DIR": "${workspaceFolder}/.beads"
      }
    }
  }
}
```

### MCP-first task-context contract

Exported artifacts NEVER embed live task data: no `bd-` IDs, no statuses, no dependency snapshots, no endpoint URLs. This is enforced by construction. When the project declares an MCP server with id `beads` in either of the two configuration files above, `augx export` inlines a single tool-agnostic snippet (loaded from `augment-extensions/workflows/mcp/templates/beads.md`) directly after the banner. The snippet:

- Names the `beads` server and tells the consuming agent to query it for live task state.
- Lists the public operations: `tasks/list`, `tasks/get`, `dependencies/list`, `status/get`.
- References `augment-extensions/workflows/beads/` for the day-to-day command guide.
- Contains no IDs, statuses, secrets, or endpoint URLs.

When neither configuration file declares the `beads` server, the snippet is omitted entirely. Exported files remain static guidance; task state is fetched on demand.

This separation is intentional. The static surface stays small and stable. The volatile surface (open tasks, blockers, dependency graph) is queried from the server when the agent actually needs it. Stale task data never leaks into rule surfaces.

### Installing the Beads MCP server

```bash
pipx install beads-mcp
# or
pip install beads-mcp

python -m beads_mcp --version
```

Once installed and declared in `.vscode/mcp.json`, the Augment Code agent connects to the server automatically. `augx mcp list`, `augx mcp discover`, and `augx mcp exec` exercise the server from the command line.

## OpenSpec Integration

The repository uses OpenSpec for spec-driven development. Architectural changes start as a proposal, become a set of spec deltas, decompose into Beads tasks, and archive when complete.

### Workflow

1. **Draft proposal.** Create `openspec/changes/<change-name>/proposal.md` with motivation, scope, and acceptance criteria.
2. **Draft spec deltas.** Create `openspec/changes/<change-name>/specs/*.md` describing ADDED / MODIFIED / REMOVED sections relative to the source-of-truth specs in `openspec/specs/`.
3. **Break down into tasks.** Create `openspec/changes/<change-name>/tasks.md`. Each task corresponds to a Beads issue with a `bd-` id.
4. **Implement.** Each commit references the relevant task id. `augx sync beads` and `augx sync openspec` keep `.augment/coordination.json` current.
5. **Archive.** When all tasks close, move `openspec/changes/<change-name>/` to `openspec/archive/<change-name>/`.

### Layout

```
openspec/
├── project-context.md         # Project overview and architecture
├── specs/                     # Source-of-truth canonical specs
│   ├── cross-platform/        # export-command, mirror-hook, ...
│   ├── beads/                 # naming-convention, ...
│   ├── coding-standards/
│   └── augment-config/
├── changes/                   # Active proposals (deltas)
└── archive/                   # Completed proposals
```

Canonical cross-platform specs live under `openspec/specs/cross-platform/`:

- `export-command.md` - grammar, flags, exit codes, drift detection.
- `mirror-hook.md` - materialization strategy, idempotency, unlink cleanup.
- `coordination-export-block.md` - schema for the `export` and `mirrors` keys.
- `mcp-template.md` - canonical Beads MCP snippet contract.

## Beads Integration

The repository uses Beads for task tracking. Beads is an append-only JSONL log under `.beads/` with a SQLite cache for queries.

### Workflow

1. **Create task.** Append a JSON record to `.beads/issues.jsonl` (or run `bd create "<title>"`).
2. **Track dependencies.** Use `blocks` and `blocked_by` fields.
3. **Find ready tasks.** Tasks whose status is `open` and whose blockers are all closed.
4. **Work on task.** Update status to `in_progress`, add comments referencing commits.
5. **Close task.** Update status to `closed` with a close reason.

### Status lifecycle

| Status | Meaning |
|---|---|
| `open` | Created, not yet started. |
| `in_progress` | Actively being worked on. |
| `blocked` | Waiting on another task or external dependency. |
| `closed` | Complete. |

### Issue ID naming convention

All Beads issue IDs in this project use the `bd-` prefix.

| Form | Pattern | Examples |
|---|---|---|
| Standard hash | `bd-<hash>` | `bd-a1b2`, `bd-c3d4` |
| Named | `bd-<name>` | `bd-init`, `bd-rename1` |
| Hierarchical (dot) | `bd-<hash>.<number>` | `bd-a1b2.1`, `bd-a1b2.1.1` |
| Hierarchical (dash) | `bd-<name>-<number>` | `bd-rename1-1`, `bd-prefix1-1` |

The full normative specification is `openspec/specs/beads/naming-convention.md`. Invalid prefixes are rejected by the validator at `scripts/validate-beads-prefix.ps1`.

### Sync with the coordination manifest

```bash
augx sync beads          # mirror current Beads tasks into coordination.json
augx sync openspec       # mirror current OpenSpec specs into coordination.json
augx sync all
augx sync watch          # auto-sync on change
```

`bd sync` (provided by the Beads CLI) handles the upstream JSONL log; the Augx sync subcommands handle the downstream coordination map.

## Authoring Modules

A module is the unit of distribution. Each module is self-contained, versioned, and addressable by canonical id.

### Anatomy

```
augment-extensions/<category>/<module-name>/
├── module.json              # Required: metadata, version, dependencies
├── README.md                # Required: module overview
├── rules/                   # Required: Markdown guidance files
│   ├── <rule-1>.md
│   └── <rule-2>.md
├── examples/                # Optional: worked code examples
└── CHANGELOG.md             # Optional but encouraged
```

### `module.json` schema

```json
{
  "id": "coding-standards/typescript",
  "name": "TypeScript Standards",
  "version": "2.0.0",
  "category": "coding-standards",
  "description": "TypeScript coding conventions, type safety, and module structure.",
  "rules": ["rules/naming-conventions.md", "rules/type-safety.md"],
  "dependencies": [],
  "tags": ["typescript", "language"]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Canonical id, `<category>/<name>` form, forward-slash. |
| `version` | yes | Semver. |
| `category` | yes | One of `coding-standards`, `domain-rules`, `workflows`, `examples`. |
| `rules` | yes | Ordered list of relative paths to `.md` files. |
| `dependencies` | no | Other module ids this module needs. |
| `tags` | no | Free-form search tags. |

### Authoring guidance

- Keep each rule file focused on a single concept. Smaller files compose better in aggregated exports.
- Use plain Markdown. Avoid HTML except for the comment-banner pattern.
- Reference other modules by canonical id, never by relative path. The materializer rewrites paths as needed.
- No em-dashes anywhere in module content. The `no-em-dash.md` rule applies to module sources as well as agent output.
- Run `augx validate <module>` before committing.

### Versioning

- Patch: typo fixes, formatting, non-normative edits.
- Minor: new rule files or expanded guidance that preserves prior behavior.
- Major: removed rules, renamed canonical ids, or guidance that contradicts a prior major.

The catalog (`MODULES.md` at the package root and `cli/MODULES.md` at the CLI root) is regenerated by `augx catalog`. The pre-commit hook installed by `augx catalog-hook` keeps it from drifting.

## Operability

### Character-count discipline

The `.augment/` directory has a hard target of 48,599 - 49,299 characters. The rule file `.augment/rules/character-count-management.md` is installed by `augx init` and pinned by `augx install-rules`. The verification command is:

```powershell
Get-ChildItem -Path ".augment" -Recurse -File |
  Get-Content -Raw |
  Measure-Object -Character |
  Select-Object -ExpandProperty Characters
```

When the total exceeds the target, the priority order is: condense examples, then remove low-value examples, then reduce redundancy, then streamline language. Core requirements and validation rules are never removed.

### No em-dashes

The repository's `no-em-dash.md` rule forbids the em-dash character in all generated text, code, and documentation, including this README. Use `-` or `--` instead. Em-dashes cause encoding and copy-paste issues in terminals and cross-platform tooling.

### Testing

Unit and integration tests live under `tests/`, `__tests__/`, and the CLI's own `cli/src/__tests__/`. Vitest is the primary runner.

```bash
npm test                         # full suite
npm run test:unit                # unit tests only
npm run test:integration         # integration tests
npm run test:coverage            # with coverage
```

Cross-platform-specific suites:

- `tests/export-e2e.test.ts` - end-to-end `augx export` runs.
- `tests/drift-detection.test.ts` - hash-based drift refusal.
- `tests/dry-run.test.ts` - `--dry-run` writes nothing.
- `tests/mirror-idempotent.test.ts` - mirror is idempotent across runs.
- `tests/mirror-symlink-fallback.test.ts` - Windows EPERM fallback.
- `tests/source-hash.test.ts` - canonical hash properties.
- `tests/tool-parse.test.ts` - `--target` and `--mirror` parsing.

### Logging and debugging

Most commands accept `--verbose` for structured trace output. `augx export --verbose` prints per-target hash computations and the resolved module set. `augx link --verbose --mirror cursor` prints each materialization decision and the fallback mode chosen.

## Project Layout

```
augment-extensions/
├── augment-extensions/        # Module source tree (modules live here)
│   ├── coding-standards/
│   ├── domain-rules/
│   ├── workflows/
│   ├── examples/
│   ├── skills/
│   └── visual-design/
├── cli/                       # The augx CLI (TypeScript)
│   ├── src/
│   ├── config/
│   └── MODULES.md             # Generated catalog
├── openspec/                  # Spec-driven development
│   ├── specs/                 # Canonical specs
│   ├── changes/               # Active proposals
│   └── archive/               # Completed proposals
├── .beads/                    # Beads task tracker (JSONL log)
├── .augment/                  # Augment Code rules and coordination
│   ├── rules/
│   ├── coordination.json
│   └── extensions.json
├── .vscode/                   # VS Code / Augment Code MCP config
│   └── mcp.json
├── tests/                     # Cross-platform test suites
├── docs/                      # Operator-facing documentation
└── scripts/                   # Repository automation
```

## Module Catalog

The canonical catalog is generated at `MODULES.md` (package root) and `cli/MODULES.md` (CLI root). Run `augx catalog` to regenerate it, `augx catalog --check` to fail CI on drift, and `augx catalog-hook` to install a pre-commit hook that regenerates it automatically. A representative slice of what ships today:

### coding-standards

`bash`, `c`, `css`, `go`, `html`, `html-css-js`, `javascript`, `perl`, `php`, `powershell`, `python`, `q-sharp`, `react`, `typescript`.

### domain-rules

`api-design`, `database`, `design`, `mcp`, `security`, `seo-sales-marketing`, `software-architecture`, `wordpress`, `wordpress-plugin`, plus the sibling `visual-design/` tree of vendor and domain palettes.

### workflows

`adr-support`, `beads`, `cross-platform`, `database`, `mcp`, `openspec`, `wordpress-plugin`.

### examples

`design-patterns`, `gutenberg-block-plugin`, `rest-api-plugin`, `woocommerce-extension`.

### skills

The `augment-extensions/skills/` tree and the top-level `skills/` tree contain reusable agent skills, addressable through `augx skill`. Categories include `analysis`, `generation`, `integration`, `retrieval`, `transformation`, and `utility`.

For the authoritative, up-to-the-commit list, run:

```bash
augx list
augx list --json
```

## Per-Tool Consumer Notes

How the agent in each tool actually sees the materialized rules.

### Augment Code

- Reads `.augment/` (rules, coordination, extensions).
- Source of truth for `coordination.json`.
- Subject to the character-count rule. Volume control: prefer skills and MCP for volatile or large-volume context.

### Claude Code

- Aggregated export target: `CLAUDE.md`.
- Per-module mirror target: `.claude/rules/<module>/...` plus include stubs appended to `CLAUDE.md`.
- The include-stub convention keeps `CLAUDE.md` itself small while still surfacing per-module content.

### Cursor

- Aggregated export target: `.cursor/rules/augx.mdc`.
- Per-module mirror target: `.cursor/rules/augx-<module>.mdc`.
- Frontmatter is generated. Hand-editing the body invalidates the banner hash and triggers drift refusal on next export.

### Windsurf

- Aggregated export target: `.windsurfrules`.
- Per-module mirror target: `.windsurf/rules/augx-<module>.md`.

### GitHub Copilot

- Aggregated export target: `.github/copilot-instructions.md`.
- Per-module mirror target: `.github/instructions/augx-<module>.instructions.md`.

For any of the four, the rule for agents reading exported files is identical: treat content between banner and footer as canonical static guidance, query the Beads MCP server for live task state, never hand-edit (changes are overwritten on next export).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md) for the full workflow. The short form:

1. Discuss substantial changes as an OpenSpec proposal under `openspec/changes/<change-name>/`.
2. Decompose into Beads tasks with `bd-` prefixed ids. Append to `.beads/issues.jsonl`.
3. Implement the work, referencing the task id in each commit.
4. Run `npm test`, `augx validate <module>` for any touched modules, and `augx catalog --check`.
5. Run `augx export --target all --dry-run` to confirm no unintended drift.
6. Open a PR with a description that links the proposal and the closing task ids.

Branch and commit-message conventions live in `CONTRIBUTING.md`. The `Landing the Plane` section in `AGENTS.md` describes the mandatory session-close workflow for any AI agent contributing work.

## License

MIT. See [LICENSE](./LICENSE).
