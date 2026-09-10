---
id: cross-platform/mirror-hook
status: active
relatedTasks: [bd-xplat1, bd-xplat1-1, bd-xplat3-1, bd-xplat3-2, bd-xplat3-3, bd-xplat3-4]
relatedRules: [module-development.md, no-em-dash.md]
priority: high
labels: [augx, cli, cross-platform, link, unlink, mirror, symlink, interoperability, non-breaking]
---

# Spec: `augx link --mirror` Hook

## Purpose

Materialize the resolved `rules/` content of a linked Augx module into the native rules location of one or more target AI coding tools, transparently and idempotently, without changing the canonical source under `augment-extensions/modules/`.

## Command Surface

Extends the existing `augx link` command:

```
augx link <module> [--mirror <tool>[,<tool>...]] [--verbose]
```

### Flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `--mirror` | No | none, or value of `.augment/coordination.json.export.mirror` when true | One or more of `claude-code`, `cursor`, `windsurf`, `copilot`. |
| `--force` | No | false | Allow single-file mirrors to overwrite drifted content after backing up the previous target under `.augment/mirror-backups/`. |
| `--verbose` | No | false | Log materialization mode (`symlink` vs `copy`) for each file. |

The pre-existing `augx link` behavior (resolving the module, updating coordination manifest, no per-tool materialization) is preserved when `--mirror` is absent and `export.mirror` is not `true`.

## Per-Tool Target Paths

| Target | Per-Module Path |
|---|---|
| `claude-code` | `.claude/rules/<module>/...` mirroring source directory structure, plus a one-line include stub appended to `CLAUDE.md` |
| `cursor` | `.cursor/rules/augx-<module>.mdc` (one file per module, frontmatter generated) |
| `windsurf` | `.windsurf/rules/augx-<module>.md` (one file per module) |
| `copilot` | `.github/instructions/augx-<module>.instructions.md` (one file per module) |

For `cursor`, `windsurf`, and `copilot`, the per-module file is itself a concatenation of the module's `rules/*.md` content with a banner identical to the `augx export` banner, scoped to a single module.

For `claude-code`, the directory layout is preserved file-for-file and the `CLAUDE.md` stub contains:

```
<!-- augx-include: .claude/rules/<module>/ -->
```

For single-file tools, the mirrored file is compared against the freshly rendered output before writing. If the file is unmarked or its content drifts from the generated banner and body, `augx link --mirror` refuses to overwrite it unless `--force` is supplied. Forced overwrites preserve a recoverable backup under `.augment/mirror-backups/`.

## Materialization Strategy

For each file in the module's resolved `rulesFiles[]`:

1. Compute the destination path under the target tool's convention.
2. Try `symlink(source, destination)`.
3. If `symlink` fails with `EPERM`, `EACCES`, `ENOSYS`, or returns success but a subsequent read fails (Windows reparse misconfiguration), fall back to `copyFile(source, destination)`.
4. Record the resulting `{ moduleId, tool, sourcePath, targetPath, mode: 'symlink' | 'copy' }` entry in `.augment/coordination.json.mirrors[<moduleId>]`.

## Idempotency

On every invocation of `augx link <module> --mirror ...`:

1. Compute the desired set of `(tool, targetPath)` tuples from the current module rules.
2. Read the tracked set from `.augment/coordination.json.mirrors[<moduleId>]`.
3. For each tuple:
   - **In desired AND in tracked + identical source**: leave alone.
   - **In desired AND in tracked + different source**: update (re-symlink or re-copy).
   - **In desired AND NOT in tracked**: create.
   - **In tracked AND NOT in desired**: prune (delete target, remove tracked entry).

This guarantees that re-running `augx link` after the module's rule files have been renamed, added, or removed leaves the target tool's rules in a clean, current state with no stale artifacts.

## Unlink Cleanup

`augx unlink <module>` reads `.augment/coordination.json.mirrors[<moduleId>]` and, for each tracked entry:

1. If the target file is a symlink pointing to the recorded source, delete it.
2. If the target file is a copy whose content matches the recorded source hash, delete it.
3. If the target file has been hand-edited (content hash differs from the recorded one), leave it in place and emit a warning. Do NOT silently destroy user edits.
4. Remove the entire `mirrors[<moduleId>]` entry from the coordination manifest once all reachable targets are processed.

For `claude-code`, `augx unlink` also removes the `<!-- augx-include: .claude/rules/<module>/ -->` stub from `CLAUDE.md` if present.

## Cross-Platform Behavior

- **POSIX**: symlinks are preferred. `mode: 'symlink'` is recorded.
- **Windows**: `fs.symlinkSync` requires admin or Developer Mode. When it fails, fall back to copy. `mode: 'copy'` is recorded so subsequent re-links re-copy rather than attempting symlink again.
- **Tracked sets** never assume a specific mode; both symlinks and copies are valid and interchangeable.
- All generated stub content uses LF line endings and forward-slash paths.

## Safety Rules

- Never write outside the project root.
- Never follow symlinks out of `augment-extensions/` while resolving source files.
- Refuse to overwrite a destination path that exists and is neither a previously-tracked symlink nor a previously-tracked copy. Emit a clear error pointing to the conflicting path.

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success (link + mirror complete) |
| 1 | Usage error (unknown tool name) |
| 2 | Module not found or unreadable |
| 4 | I/O error (permission denied, conflicting non-tracked file at destination) |

## Relationship to `augx export`

The mirror hook materializes one file per module per tool. `augx export` produces a single aggregated file per tool. The two surfaces are complementary, independently opt-in, and both safe to use together: mirror gives per-module attribution and faster diffs, export gives single-file tools their preferred shape.
