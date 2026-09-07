# Augment Extensions - AI Agent Integration

This repository provides extension modules for Augment Code AI that exceed the standard `.augment/` character limit.

## For AI Agents

### Discovery

You can discover and use extension modules through the `augx` CLI:

```bash
# List all available modules
augx list

# Show module details
augx show <module-name>

# Search for modules
augx search <keyword>
```

### Usage in Projects

When working on a project that has Augment Extensions linked:

1. **Check linked modules**: `augx list --linked`
2. **View module content**: `augx show <module-name>`
3. **Apply module rules**: Follow the guidelines in the module's rules/ directory

### Module Structure

Each module contains:
- `module.json` - Metadata and configuration
- `rules/` - Markdown files with detailed guidelines
- `examples/` - Code examples demonstrating best practices
- `README.md` - Module overview

### Integration Workflow

1. Human initializes: `augx init`
2. Human links modules: `augx link coding-standards/typescript`
3. AI agent queries: `augx show typescript-standards`
4. AI agent applies rules from module content

### CLI Commands Reference

- `augx list` - List all available modules
- `augx list --linked` - List modules linked to current project
- `augx show <module>` - Display module content
- `augx show linked` - Show all linked modules
- `augx show all` - Show all available modules
- `augx search <term>` - Search for modules
- `augx update` - Update all linked modules
- `augx version` - Show CLI version

### Command Help Reference

When `augx init` is run, the CLI automatically generates `.augment/COMMAND_HELP.md` containing comprehensive help documentation for all detected workflow tools (Beads, OpenSpec, Augx).

**For AI Agents:**

1. **Check for help reference**: Look for `.augment/COMMAND_HELP.md` in the project
2. **Use for command discovery**: Reference the file to learn available commands and their syntax
3. **Generate accurate commands**: Use the help text to construct correct command invocations
4. **Understand tool capabilities**: Learn what each tool can do without executing commands

**Example workflow:**

```bash
# AI agent discovers available commands
cat .augment/COMMAND_HELP.md

# AI agent learns Beads commands
# Sees: "bd create <title> - Create a new issue"

# AI agent generates correct command
bd create "Implement feature X" -p 1
```

**Benefits:**
- **No trial-and-error**: AI agents know exact command syntax before execution
- **Always current**: Regenerated on `augx init` to reflect latest tool versions
- **Comprehensive**: Includes main commands and all subcommands (up to 3 levels deep)
- **Multi-tool**: Single reference for all workflow tools in the project

## Module Types

1. **coding-standards** - Language/framework specific standards
2. **domain-rules** - Domain-specific guidelines (web, API, security, etc.)
3. **workflows** - Process and methodology integration (OpenSpec, Beads, etc.)
4. **examples** - Extensive code examples and patterns

## Character Limit Context

- Standard `.augment/` limit: ~49,400 characters
- Extension modules: No limit (stored separately)
- Modules are loaded on-demand when relevant to current task

## Best Practices for AI Agents

1. **Query before applying**: Always check module content before applying rules
2. **Respect versions**: Use pinned versions for consistency
3. **Combine modules**: Multiple modules can be active simultaneously
4. **Report issues**: If module content conflicts, notify the human

## Example Usage

```bash
# AI agent working on TypeScript project
$ augx list --linked
typescript-standards (v1.0.0)
react-patterns (v2.1.0)

$ augx show typescript-standards
# Returns full module content including all rules and examples
```

---

## OpenSpec Integration

This repository uses **OpenSpec** for spec-driven development.

### OpenSpec Workflow

1. **Draft Change Proposal**: Create `openspec/changes/[change-name]/proposal.md`
2. **Review & Align**: Create spec deltas in `openspec/changes/[change-name]/specs/`
3. **Implement Tasks**: Create `openspec/changes/[change-name]/tasks.md` and implement
4. **Archive**: Move completed change to `openspec/archive/[change-name]/`

### OpenSpec Files

- `openspec/project-context.md` - Project overview and architecture
- `openspec/specs/` - Source of truth specifications
- `openspec/changes/` - Proposed changes (deltas)
- `openspec/archive/` - Completed changes

### For AI Agents

When making architectural changes:
1. Create a change proposal in `openspec/changes/`
2. Define spec deltas (ADDED/MODIFIED/REMOVED sections)
3. Break down into tasks
4. Implement and archive when complete

**Learn More**: See `workflows/openspec/` for comprehensive workflow documentation.

---

## JIRA Integration

This repository integrates JIRA tickets into OpenSpec changes for traceability and context preservation.

### JIRA Workflow

1. **Store JIRA Tickets**: Place JIRA ticket content in `openspec/changes/[change-name]/jira/[TICKET-ID].md`
2. **Link to Proposal**: Add "Related JIRA" section in proposal.md linking to the JIRA ticket
3. **Update Coordination**: Track JIRA file in `.augment/coordination.json`
4. **Cleanup**: Remove temporary JIRA files after migration

### JIRA Directory Structure

```
openspec/changes/[change-name]/jira/
├── [TICKET-ID].md          # JIRA ticket content
└── .gitkeep                # Ensures directory is tracked
```

### For AI Agents

When working with JIRA tickets:
1. Create `jira/` directory within the OpenSpec change
2. Copy JIRA ticket content to `jira/[TICKET-ID].md`
3. Add "Related JIRA" section to proposal.md
4. Update coordination manifest with JIRA file tracking
5. Remove temporary JIRA files after successful migration

**Example**: See `openspec/changes/bash-coding-standards/spec-delta-jira-integration.md` for complete workflow documentation.

---

## Beads Integration

This repository uses **Beads** for task tracking and memory.
Use 'bd' for task tracking

### Beads Workflow

1. **Create Task**: Append to `.beads/issues.jsonl` with unique hash-based ID
2. **Add Dependencies**: Use `blocks` and `blocked_by` fields
3. **Find Ready Tasks**: Tasks with no open blockers
4. **Work on Task**: Update status to `in_progress`, add comments
5. **Close Task**: Update status to `closed`

### Beads Files

- `.beads/issues.jsonl` - All issues (append-only JSONL log)
- `.beads/config.json` - Beads configuration
- `.beads/cache.db` - SQLite cache (gitignored, CLI only)

### For AI Agents

When tracking work:
1. Create tasks by appending JSON to `.beads/issues.jsonl`
2. Use hash-based IDs with **"bd-" prefix**: `bd-<hash>` (e.g., `bd-a1b2`)
   - All issue IDs MUST use "bd-" prefix (see `openspec/specs/beads/naming-convention.md`)
   - Valid formats: `bd-<hash>`, `bd-<name>`, `bd-<hash>.<number>`
3. Track dependencies with `blocks`/`blocked_by` fields
4. Find ready tasks (status: "open", no blockers)
5. Update status and add comments as work progresses

**Task States**: `open`, `in_progress`, `blocked`, `closed`

**Naming Convention**: All issue IDs MUST use "bd-" prefix. See `openspec/specs/beads/naming-convention.md` for complete specification.

**Learn More**: See `augment-extensions/workflows/beads/` for comprehensive workflow documentation.

---

## Coordination System

This repository uses a **coordination manifest** (`.augment/coordination.json`) to harmonize OpenSpec, Beads, and `.augment/` rules.

### How It Works

The coordination manifest tracks relationships between:
- **Specs** (OpenSpec) - What needs to be built
- **Tasks** (Beads) - How it's being built
- **Rules** (`.augment/`) - Guidelines for building
- **Files** - What was built

### For AI Agents

**Before starting work**:
1. Check `.augment/coordination.json` for active specs
2. Find related tasks for the spec you're implementing
3. Load applicable rules for your task
4. Identify which files are affected

**While working**:
1. Track file creation/modification with task IDs
2. Update coordination manifest when creating files
3. Reference specs and rules in task comments

**Query Examples**:

```javascript
// Get all active specs
const coord = require('./.augment/coordination.json');
const activeSpecs = Object.entries(coord.specs)
  .filter(([id, spec]) => spec.status === 'active');

// Get tasks for a spec
const tasks = coord.specs['testing/functional-tests'].relatedTasks;

// Get rules for a task
const rules = coord.tasks['bd-xyz'].relatedRules;

// Get specs governing a file
const specsForFile = Object.entries(coord.specs)
  .filter(([id, spec]) =>
    spec.affectedFiles.some(pattern => filePath.match(pattern))
  );
```

**Learn More**: See `.augment-guidelines/system-integration/coordination-system.md` for detailed documentation.

---

## MCP Integration (Model Context Protocol)

This repository integrates **Model Context Protocol (MCP)** servers to enable real-time data access for AI agents.

### Beads MCP Server

The **beads-mcp** server provides real-time access to Beads tasks, enabling AI agents to:
- Query tasks, dependencies, and status
- Incorporate task context into prompts
- Automate task orchestration and code generation
- Link code changes to task resolution

### Configuration

MCP servers are configured in two locations:

1. **VS Code Integration**: `.vscode/mcp.json`
   - Automatically loaded by VS Code and Augment Code
   - Enables AI agents to query Beads in real-time
   - Configures context budget and priorities

2. **CLI Integration**: `.augment/mcp/servers.json`
   - Used by `augx mcp` commands
   - Enables manual MCP server management

### For AI Agents

When MCP is enabled, AI agents automatically:
1. Connect to configured MCP servers on startup
2. Query relevant data based on current context
3. Include MCP data in prompts (within context budget)
4. Suggest actions based on MCP data

**Example queries**:
- "Show me all open tasks for Phase 2"
- "What tasks are blocking bd-shot-list-2.3?"
- "Generate code for task bd-shot-list-2.4"
- "What's the status of the AI Shot List Generator?"

### Installation

Install the beads-mcp server:

```bash
pip install beads-mcp
# or
pipx install beads-mcp
```

Verify installation:

```bash
python -m beads_mcp --version
```

### Usage

The MCP server runs automatically when Augment Code starts. No manual intervention needed.

**Manual testing**:

```bash
# List MCP servers
augx mcp list

# Execute MCP tool
augx mcp exec beads tasks/list

# Discover available tools
augx mcp discover beads
```

**Learn More**: See `.vscode/MCP_SETUP.md` for detailed configuration and troubleshooting.

---

## Cross-Platform Distribution

This repository can materialize linked Augx modules into the native rules surfaces of other AI coding tools, so the same module set powers Claude Code, Cursor, Windsurf, and GitHub Copilot in addition to Augment Code. The Augment Code surface (`.augment/` rules) is unchanged.

Two complementary mechanisms, both opt-in, both safe to use together:

1. `augx export --target <tool>` - aggregates linked modules into the single-file format the tool expects.
2. `augx link <module> --mirror <tool>[,<tool>...]` - per-module symlink (or copy fallback on Windows) into the tool's native rules directory.

### `augx export` Command

```
augx export --target <claude-code|cursor|windsurf|copilot|all>
            [--output <path>] [--dry-run] [--force] [--verbose]
```

Per-target output paths:

| Target | Path |
|---|---|
| `claude-code` | `CLAUDE.md` |
| `cursor` | `.cursor/rules/augx.mdc` |
| `windsurf` | `.windsurfrules` |
| `copilot` | `.github/copilot-instructions.md` |
| `all` | all of the above |

Each generated file starts with a banner containing `augx-version`, `generated-at`, `source-hash`, and the contributing modules. Re-running with unchanged inputs is a byte-identical no-op. If the existing file has been hand-edited (banner hash mismatches the content), export refuses to overwrite and exits 3; pass `--force` to override.

### `--mirror` Flag on `augx link`

```
augx link <module> [--mirror <tool>[,<tool>...]] [--verbose]
```

Per-tool per-module destinations:

| Target | Per-Module Path |
|---|---|
| `claude-code` | `.claude/rules/<module>/...` plus a one-line include stub in `CLAUDE.md` |
| `cursor` | `.cursor/rules/augx-<module>.mdc` |
| `windsurf` | `.windsurf/rules/augx-<module>.md` |
| `copilot` | `.github/instructions/augx-<module>.instructions.md` |

The mirror hook tries `symlink` first and falls back to `copyFile` on Windows when `EPERM`/`EACCES`/`ENOSYS` is raised (no Developer Mode). The chosen mode is recorded in `.augment/coordination.json.mirrors[<module>]` so subsequent runs do not retry symlink. `augx unlink <module>` reverses both tracked symlinks and tracked copies; hand-edited targets are left in place with a warning.

### `export` and `mirrors` Blocks in `.augment/coordination.json`

Two optional top-level keys:

```json
{
  "export": {
    "targets": ["claude-code", "cursor"],
    "ignore": ["**/examples/**"],
    "mirror": false
  },
  "mirrors": {
    "<module-id>": [
      { "tool": "cursor",
        "sourcePath": "augment-extensions/modules/<module>/rules/<file>.md",
        "targetPath": ".cursor/rules/augx-<module>.mdc",
        "mode": "symlink" }
    ]
  }
}
```

- `export.targets` - default target list when `augx export` is called without `--target`.
- `export.ignore` - glob patterns excluded from aggregation (forward-slash, defaults to `["**/examples/**"]`).
- `export.mirror` - when `true`, `augx link` runs the mirror hook for all `targets` without requiring `--mirror`.
- `mirrors` - CLI-managed materialization log; do not hand-edit. Cleared by `augx unlink`.

Loaders MUST ignore unrecognized keys silently. Absence of both blocks preserves prior behavior exactly.

### MCP-First Task-Context Contract

Exported artifacts NEVER embed live task data (no `bd-` IDs, no statuses, no dependency snapshots). When the project declares a Beads MCP server in either `.vscode/mcp.json` or `.augment/mcp/servers.json`, `augx export` inlines a single tool-agnostic snippet from `augment-extensions/workflows/mcp/templates/beads.md` directly after the banner. The snippet:

- Names the Beads MCP `beads` server and tells the consuming agent to query it for live task state.
- Lists the public operations (`tasks/list`, `tasks/get`, `dependencies/list`, `status/get`).
- References `augment-extensions/workflows/beads/` for the command guide.
- Contains no IDs, statuses, secrets, or endpoint URLs.

When neither MCP config file declares the `beads` server, the snippet is omitted entirely. This keeps exported files focused on static guidance and prevents stale task data from leaking into rule surfaces.

### For AI Agents

When reading an exported file in any of the four target tools:

1. Treat the content between the banner and the footer as canonical static guidance.
2. For ANY task-related question, query the Beads MCP server (`beads`) rather than parsing prose for task state.
3. Never hand-edit exported files - changes are overwritten on the next `augx export`. Edit module sources under `augment-extensions/` and re-run export.
4. If a mirrored per-module file disappears after a module rename, run `augx link <module> --mirror ...` again to refresh the tracked set; stale targets are pruned automatically.

**Learn More**: See `augment-extensions/workflows/cross-platform/` for the day-to-day guide (per-tool paths, drift-resolution playbook, end-to-end session walkthrough).

---

**Note**: This is a meta-repository for extending Augment Code AI. The actual project-specific `.augment/` folder remains in individual projects.


## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in_progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Version Synchronization

The root `VERSION` file is the single source of truth for the workspace version.

- After editing `VERSION`, run `pnpm version:sync`.
- Use `pnpm version:sync:dry-run` to preview changes.
- Use `pnpm version:sync:force` in non-interactive contexts.
- `VERSIONING.md` defines the SemVer rules and supported rewrite targets.

## YAGNI

Prefer the smallest change that satisfies the current task. Add abstractions only when there is a clear current use case or when the cost of changing later is high.

## Working Rules

- Inspect the repository before editing.
- Reuse existing scripts, utilities, fixtures, and test harnesses.
- Keep changes focused and avoid unrelated edits.
- Avoid new dependencies unless the task requires them.
- Prefer behavior-based validation over compile-only checks.
- Run the smallest relevant tests first, then broader checks when they are useful.
- Never claim completion if the required validation was skipped or failed.
- Record skipped checks and any remaining risk.
- Use `test-artifacts/` or `test-results/` for local failure artifacts when you need them.

