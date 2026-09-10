# `augx link --mirror` Day-to-Day Guide

## Purpose

`augx link <module> --mirror <tool>[,<tool>...]` materializes one Augx module's `rules/` content into each target tool's **per-module** rules location, transparently and idempotently. The canonical source under `augment-extensions/modules/` is never modified.

## Grammar

```
augx link <module> [--mirror <tool>[,<tool>...]] [--verbose]
```

The pre-existing `augx link` behavior (resolve module, update coordination manifest, no per-tool materialization) is preserved when `--mirror` is omitted **and** `.augment/coordination.json.export.mirror` is not `true`.

## Flags

| Flag | Default | Purpose |
|---|---|---|
| `--mirror` | none, or `export.mirror` from coordination.json when `true` | Comma-separated tool list: `claude-code`, `cursor`, `windsurf`, `copilot`. |
| `--force` | `false` | Overwrite drifted single-file mirrors after backing them up under `.augment/mirror-backups/`. |
| `--verbose` | `false` | Print the materialization mode (`symlink` vs `copy`) for each file. |

## Per-Tool Target Paths

| Tool | Per-Module Destination |
|---|---|
| `claude-code` | `.claude/rules/<module>/...` (mirrors source layout) + one-line include stub appended to `CLAUDE.md` |
| `cursor` | `.cursor/rules/augx-<module>.mdc` (one file per module, frontmatter generated) |
| `windsurf` | `.windsurf/rules/augx-<module>.md` (one file per module) |
| `copilot` | `.github/instructions/augx-<module>.instructions.md` (one file per module) |

For Cursor, Windsurf, and Copilot, the per-module file is a concatenation of the module's `rules/*.md` content with a banner identical to the `augx export` banner, scoped to a single module.

For Claude Code, the source directory layout is preserved file-for-file under `.claude/rules/<module>/`, and `CLAUDE.md` receives an include stub:

```
<!-- augx-include: .claude/rules/<module>/ -->
```

When a single-file mirror already exists, augx compares its banner and body to the freshly rendered content before writing. Unmarked files and drifted files are refused unless `--force` is supplied. Forced overwrites first move the previous target into `.augment/mirror-backups/` so the prior state stays recoverable.

## Materialization Strategy

For each rule file in the resolved module:

1. Compute the destination path under the tool's convention.
2. If `.augment/coordination.json.mirrors[<module>]` already records `mode: 'copy'` for that destination, skip directly to step 4.
3. Try `symlink(source, destination)`.
4. If symlink raises `EPERM`, `EACCES`, or `ENOSYS`, or succeeds but a subsequent read fails (Windows reparse misconfiguration), fall back to `copyFile(source, destination)`.
5. Record `{ moduleId, tool, sourcePath, targetPath, mode: 'symlink' | 'copy' }` in `.augment/coordination.json.mirrors[<moduleId>]`.

See `windows-fallback.md` for the detailed Windows behavior.

## Idempotency

On every invocation, the mirror hook computes the desired set of `(tool, targetPath)` tuples for the current module, compares against the tracked set in `mirrors[<module>]`, and reconciles:

| State | Action |
|---|---|
| Desired AND tracked AND same source | Leave alone. |
| Desired AND tracked AND different source | Update (re-symlink or re-copy). |
| Desired AND NOT tracked | Create. |
| NOT desired AND tracked | Prune (delete target, remove tracked entry). |

This guarantees that renaming, adding, or removing a module's rule files leaves the target tool's per-module rules clean and current with no stale artifacts.

## Typical Workflows

### Mirror a single module to one tool

```bash
augx link coding-standards/typescript --mirror cursor
```

Result:

```
.cursor/rules/augx-typescript-standards.mdc
.augment/coordination.json.mirrors["coding-standards/typescript"] = [
  { "tool": "cursor", "sourcePath": "...", "targetPath": ".cursor/rules/augx-typescript-standards.mdc", "mode": "symlink" }
]
```

### Mirror to multiple tools at once

```bash
augx link workflows/openspec --mirror claude-code,cursor,windsurf
```

### Default-mirror setup

Add to `.augment/coordination.json`:

```json
{
  "export": {
    "targets": ["claude-code", "cursor"],
    "mirror": true
  }
}
```

After this, `augx link <module>` (without `--mirror`) automatically mirrors into both `claude-code` and `cursor`. Use this when the project's policy is "always mirror everywhere by default".

## Unlink Cleanup

```bash
augx unlink <module>
```

Reads `mirrors[<module>]` and, for each tracked entry:

1. **Tracked symlink, still pointing to recorded source**: delete it.
2. **Tracked copy, content matches recorded source hash**: delete it.
3. **Hand-edited target** (content hash differs from recorded one): leave in place, emit a warning. User edits are never silently destroyed.

After processing, `mirrors[<module>]` is removed from the coordination manifest. For Claude Code, the include stub line is removed from `CLAUDE.md`.

If `mirrors` becomes empty after the unlink, the key itself is deleted from the manifest to keep the file clean.

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success (link + mirror complete) |
| 1 | Usage error (unknown tool name) |
| 2 | Module not found or unreadable |
| 4 | I/O error (permission denied, conflicting non-tracked file at destination) |

## Safety Rules

- Never writes outside the project root.
- Never follows symlinks out of `augment-extensions/` while resolving sources.
- Refuses to overwrite a destination that exists and is neither a previously-tracked symlink nor a previously-tracked copy (exit 4); the conflicting path is reported.
- All stub content uses LF line endings and forward-slash paths.

## Relationship to `augx export`

`augx export` produces one aggregated file per tool. `augx link --mirror` produces one file per module per tool. They write to disjoint paths (e.g., `.cursor/rules/augx.mdc` vs `.cursor/rules/augx-<module>.mdc`) and are safe to use together.
