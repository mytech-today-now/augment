/**
 * Mirror runner for `augx link --mirror`.
 *
 * Materializes a resolved module's `rules/` content into the native rule
 * locations of each requested target tool. Symlinks are attempted first;
 * the runner falls back to a deterministic copy when symlink creation is
 * unavailable (Windows without Developer Mode, restricted filesystems).
 *
 * The runner persists every materialized destination under
 * `.augment/coordination.json#mirrors[<moduleId>]` so that subsequent
 * `augx link` and `augx unlink` invocations can honor the recorded mode
 * and prune stale entries.
 *
 * See: openspec/specs/cross-platform/mirror-hook.md
 * See: openspec/specs/cross-platform/coordination-export-block.md
 */

import * as fs from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import type { ResolvedModule } from '../adapters/types';
import type {
  MirrorEntry,
  MirrorMode,
  MirrorTool,
} from '../types/coordination-export';
import { ADAPTERS } from '../adapters';
import { aggregate, assessDrift, buildExportMeta } from './export-runner';
import { hasBeadsMcpServer, loadBeadsMcpSnippet } from './mcp-detection';
import { DEFAULT_EXPORT_IGNORE } from '../types/coordination-export';
import { extractEmbeddedHash } from './source-hash';

/** Errno codes that mark a permission/feature gap and trigger copy fallback. */
const SYMLINK_FALLBACK_CODES: ReadonlySet<string> = new Set([
  'EPERM',
  'EACCES',
  'ENOSYS',
  'EOPNOTSUPP',
]);

/** Return `true` when `err` is the normal "path does not exist" failure. */
function isMissingPathError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/** Read the directory entry at `targetAbs` without following symlinks. */
function lstatIfPresent(targetAbs: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(targetAbs);
  } catch (err) {
    if (isMissingPathError(err)) {
      return undefined;
    }
    throw err;
  }
}

/** SHA-256 digest for a Buffer or UTF-8 string. */
function digestBytes(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Digest a tracked source file as it exists on disk. */
function digestFile(sourceAbs: string): string {
  return digestBytes(fs.readFileSync(sourceAbs));
}

/** Digest generated copy-mode content using the same LF normalization as writes. */
function digestGeneratedContent(content: string): string {
  return digestBytes(content.replace(/\r\n?/g, '\n'));
}

/** Resolve the project root to a stable path for containment checks. */
function resolveProjectRoot(projectRoot: string): string {
  try {
    return fs.realpathSync(projectRoot);
  } catch {
    return path.resolve(projectRoot);
  }
}

/** Refuse to operate on paths that resolve outside the project root. */
function assertContainedPath(
  projectRoot: string,
  absPath: string,
  label: string
): void {
  const rootAbs = resolveProjectRoot(projectRoot);
  const candidateAbs = path.resolve(absPath);
  const rel = path.relative(rootAbs, candidateAbs);
  if (rel.length === 0 || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    return;
  }
  throw new Error(`Refusing to write ${label} outside project root: ${candidateAbs}`);
}

/** Forward-slash backup path under `.augment/mirror-backups/`. */
function generatedBackupPath(projectRoot: string, targetAbs: string): string {
  const rel = relativeForward(projectRoot, targetAbs).split('/').filter(Boolean);
  return path.join(projectRoot, '.augment', 'mirror-backups', ...rel);
}

/** Result of materializing a single (sourceAbs, targetAbs) pair. */
export interface MaterializeResult {
  mode: MirrorMode;
  /** True when the target already existed and matched the source. */
  reused: boolean;
}

export interface MaterializeOptions {
  /** When set, force this mode instead of attempting symlink-first. */
  recordedMode?: MirrorMode;
  /** When true, refuse to overwrite an unknown existing target. */
  safeOverwrite?: boolean;
}

/**
 * Materialize a single source file at the given target path. Tries symlink
 * first unless `recordedMode === 'copy'`, then falls back to copy on the
 * permission errnos catalogued in `SYMLINK_FALLBACK_CODES`. Idempotent: an
 * existing target whose contents match the source is left alone.
 */
export function materializeFile(
  sourceAbs: string,
  targetAbs: string,
  options: MaterializeOptions = {}
): MaterializeResult {
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });

  if (lstatIfPresent(targetAbs)) {
    const decision = reconcileExistingTarget(sourceAbs, targetAbs, options);
    if (decision.reused) {
      return decision;
    }
    fs.unlinkSync(targetAbs);
  }

  if (options.recordedMode === 'copy') {
    fs.copyFileSync(sourceAbs, targetAbs);
    return { mode: 'copy', reused: false };
  }

  try {
    fs.symlinkSync(sourceAbs, targetAbs, 'file');
    return { mode: 'symlink', reused: false };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? '';
    if (!SYMLINK_FALLBACK_CODES.has(code)) {
      throw err;
    }
    fs.copyFileSync(sourceAbs, targetAbs);
    return { mode: 'copy', reused: false };
  }
}

/**
 * Decide whether an existing target can be left in place. A symlink that
 * resolves to `sourceAbs` is reused as-is; a copy whose bytes match the
 * source is reused as a copy. Anything else is replaced.
 */
function reconcileExistingTarget(
  sourceAbs: string,
  targetAbs: string,
  _options: MaterializeOptions
): MaterializeResult {
  const stat = fs.lstatSync(targetAbs);
  if (stat.isSymbolicLink()) {
    const linkDest = fs.readlinkSync(targetAbs);
    const resolved = path.isAbsolute(linkDest)
      ? linkDest
      : path.resolve(path.dirname(targetAbs), linkDest);
    if (path.resolve(resolved) === path.resolve(sourceAbs)) {
      return { mode: 'symlink', reused: true };
    }
    return { mode: 'symlink', reused: false };
  }
  if (stat.isFile() && filesEqual(sourceAbs, targetAbs)) {
    return { mode: 'copy', reused: true };
  }
  return { mode: 'copy', reused: false };
}

/** Byte-equality check used to keep idempotent copy materialization. */
function filesEqual(a: string, b: string): boolean {
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  if (sa.size !== sb.size) {
    return false;
  }
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/** Project-root-relative forward-slash path used in `mirrors[]` entries. */
export function relativeForward(projectRoot: string, absPath: string): string {
  const rel = path.relative(projectRoot, absPath);
  return rel.split(path.sep).join('/');
}

/**
 * Compose the per-module aggregated body emitted by single-file mirror
 * targets (cursor, windsurf, copilot). Uses the shared `aggregate`
 * function so a mirror file for one module is structurally identical to
 * an `augx export` output that happens to contain only that module.
 */
export function renderSingleModuleFile(
  module: ResolvedModule,
  tool: MirrorTool,
  options: {
    augxVersion: string;
    projectRoot: string;
    ignorePatterns: readonly string[];
    now: () => string;
  }
): string {
  const adapter = ADAPTERS[tool];
  const mcpSnippet = hasBeadsMcpServer(options.projectRoot)
    ? loadBeadsMcpSnippet(options.projectRoot)
    : undefined;
  const meta = buildExportMeta({
    modules: [module],
    ignorePatterns: [...options.ignorePatterns],
    augxVersion: options.augxVersion,
    mcpSnippet,
    now: options.now,
  });
  return aggregate(adapter, meta, [module]);
}

/**
 * Produce the desired `MirrorEntry[]` for one module under one tool. For
 * claude-code, returns one entry per rule file (directory mirror). For the
 * single-file tools (cursor / windsurf / copilot), returns exactly one
 * entry pointing at the per-module aggregated file.
 */
export function computeDesiredEntries(
  projectRoot: string,
  module: ResolvedModule,
  tool: MirrorTool
): Array<{ sourceAbs: string; targetAbs: string; entry: Omit<MirrorEntry, 'mode'> }> {
  const adapter = ADAPTERS[tool];
  if (tool === 'claude-code') {
    const baseDir = adapter.mirrorPath(projectRoot, module.id);
    return module.rulesFiles.map((file) => {
      const sourceAbs = path.join(module.rootPath, file.relativePath);
      const targetAbs = path.join(baseDir, ...file.relativePath.split('/'));
      return {
        sourceAbs,
        targetAbs,
        entry: {
          tool,
          sourcePath: relativeForward(projectRoot, sourceAbs),
          targetPath: relativeForward(projectRoot, targetAbs),
        },
      };
    });
  }
  const targetAbs = adapter.mirrorPath(projectRoot, module.id);
  return [
    {
      sourceAbs: module.rootPath,
      targetAbs,
      entry: {
        tool,
        sourcePath: relativeForward(projectRoot, module.rootPath),
        targetPath: relativeForward(projectRoot, targetAbs),
      },
    },
  ];
}

/** Inputs threaded through `mirrorModule` for a single tool. */
export interface MirrorToolContext {
  projectRoot: string;
  augxVersion: string;
  ignorePatterns: readonly string[];
  now: () => string;
  force?: boolean;
  verbose?: boolean;
  /** Existing mirror entries from `mirrors[<moduleId>]`, keyed by targetPath. */
  recordedByTarget: Map<string, MirrorEntry>;
  /** Optional logger; defaults to a no-op. */
  log?: (message: string) => void;
}

/** Returned by `mirrorModule` for caller persistence. */
export interface MirrorModuleResult {
  /** Final `MirrorEntry[]` for this module across all tools, sorted. */
  entries: MirrorEntry[];
  /** Tools that produced a CLAUDE.md include stub for this module. */
  claudeStubsAdded: boolean;
}

/**
 * Materialize one module across every requested tool. Pure-ish: filesystem
 * I/O is bounded to the tools' destination paths; caller is responsible for
 * coordinating the project-wide `mirrors[]` persistence.
 */
export function mirrorModule(
  module: ResolvedModule,
  tools: readonly MirrorTool[],
  ctx: MirrorToolContext
): MirrorModuleResult {
  const log = ctx.log ?? (() => {});
  const entries: MirrorEntry[] = [];
  let claudeStub = false;

  for (const tool of tools) {
    if (tool === 'claude-code') {
      const desired = computeDesiredEntries(ctx.projectRoot, module, tool);
      for (const item of desired) {
        const recorded = ctx.recordedByTarget.get(item.entry.targetPath);
        const result = materializeFile(item.sourceAbs, item.targetAbs, {
          recordedMode: recorded?.mode,
        });
        const entry: MirrorEntry = { ...item.entry, mode: result.mode };
        if (result.mode === 'copy') {
          entry.sourceDigest = digestFile(item.sourceAbs);
        }
        entries.push(entry);
        if (ctx.verbose) {
          log(
            `  ${tool} ${result.reused ? 'reused' : 'wrote'} ${result.mode} ` +
              `${item.entry.targetPath}`
          );
        }
      }
      claudeStub = true;
      continue;
    }

    const [single] = computeDesiredEntries(ctx.projectRoot, module, tool);
    const content = renderSingleModuleFile(module, tool, {
      augxVersion: ctx.augxVersion,
      projectRoot: ctx.projectRoot,
      ignorePatterns: ctx.ignorePatterns,
      now: ctx.now,
    });
    const writeResult = writeGeneratedFile(single.targetAbs, content, {
      projectRoot: ctx.projectRoot,
      safeOverwrite: !ctx.force,
    });
    entries.push({
      ...single.entry,
      mode: 'copy',
      sourceDigest: digestGeneratedContent(content),
    });
    if (ctx.verbose) {
      const suffix = writeResult.backupPath
        ? ` (backup ${relativeForward(ctx.projectRoot, writeResult.backupPath)})`
        : '';
      log(
        `  ${tool} ${writeResult.status === 'noop' ? 'reused' : 'wrote'} copy ` +
          `${single.entry.targetPath}${suffix}`
      );
    }
  }

  prunePreviouslyTracked(ctx, tools, entries);

  entries.sort(compareMirrorEntries);
  return { entries, claudeStubsAdded: claudeStub };
}

/**
 * Delete recorded targets that are no longer desired after this run.
 *
 * "No longer desired" means: a `targetPath` recorded in
 * `mirrors[<moduleId>]` for one of the tools being re-linked is not
 * produced by `computeDesiredEntries` this time around (e.g., a rule file
 * was renamed or removed). The destination is removed only when its
 * current contents are a known materialization (symlink to source or
 * unchanged copy); a hand-edited file is left in place and warned about.
 */
function prunePreviouslyTracked(
  ctx: MirrorToolContext,
  tools: readonly MirrorTool[],
  desiredEntries: readonly MirrorEntry[]
): void {
  const log = ctx.log ?? (() => {});
  const desiredKeys = new Set(
    desiredEntries.map((e) => `${e.tool}\0${e.targetPath}`)
  );
  for (const [targetPath, recorded] of ctx.recordedByTarget) {
    if (!tools.includes(recorded.tool)) {
      continue;
    }
    const key = `${recorded.tool}\0${targetPath}`;
    if (desiredKeys.has(key)) {
      continue;
    }
    const absTarget = path.join(ctx.projectRoot, ...targetPath.split('/'));
    const absSource = path.join(ctx.projectRoot, ...recorded.sourcePath.split('/'));
    const removed = removeTrackedTarget(
      absSource,
      absTarget,
      recorded.mode,
      recorded.sourceDigest
    );
    if (ctx.verbose) {
      log(
        `  ${recorded.tool} ${removed ? 'pruned' : 'kept (hand-edited)'} ${targetPath}`
      );
    }
  }
}

/**
 * Delete a materialized target if it still matches what `augx link` wrote
 * (an unmodified symlink or content-equal copy). Returns `true` when the
 * destination was removed; returns `false` when the file appears to be
 * hand-edited, in which case the caller leaves it in place.
 */
export function removeTrackedTarget(
  sourceAbs: string,
  targetAbs: string,
  recordedMode: MirrorMode,
  sourceDigest?: string
): boolean {
  const stat = lstatIfPresent(targetAbs);
  if (!stat) {
    return true;
  }
  if (stat.isSymbolicLink()) {
    const linkDest = fs.readlinkSync(targetAbs);
    const resolved = path.isAbsolute(linkDest)
      ? linkDest
      : path.resolve(path.dirname(targetAbs), linkDest);
    if (path.resolve(resolved) === path.resolve(sourceAbs)) {
      fs.unlinkSync(targetAbs);
      return true;
    }
    return false;
  }
  if (recordedMode === 'copy' && stat.isFile()) {
    if (sourceDigest !== undefined) {
      if (digestFile(targetAbs) === sourceDigest) {
        fs.unlinkSync(targetAbs);
        return true;
      }
      return false;
    }
    if (fs.existsSync(sourceAbs) && fs.statSync(sourceAbs).isFile() && filesEqual(sourceAbs, targetAbs)) {
      fs.unlinkSync(targetAbs);
      return true;
    }
    return false;
  }
  return false;
}

/** Deterministic ordering for `mirrors[<id>]` entries. */
function compareMirrorEntries(a: MirrorEntry, b: MirrorEntry): number {
  if (a.tool !== b.tool) return a.tool < b.tool ? -1 : 1;
  if (a.targetPath !== b.targetPath) return a.targetPath < b.targetPath ? -1 : 1;
  return 0;
}

interface GeneratedWriteOptions {
  projectRoot: string;
  /**
   * When true, overwrite managed drift only when the existing target is
   * already generated by augx. When false, back up and replace any existing
   * target that would otherwise be overwritten.
   */
  safeOverwrite: boolean;
}

interface GeneratedWriteResult {
  status: 'noop' | 'written';
  backupPath?: string;
}

/**
 * Write a single generated file with LF line endings. Existing managed
 * files are compared with the freshly rendered body first; drifted content
 * is refused unless `safeOverwrite` is disabled.
 */
function writeGeneratedFile(
  targetAbs: string,
  content: string,
  options: GeneratedWriteOptions
): GeneratedWriteResult {
  assertContainedPath(options.projectRoot, targetAbs, 'mirror target');
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });

  const lf = content.replace(/\r\n?/g, '\n');
  const stat = lstatIfPresent(targetAbs);
  if (!stat) {
    fs.writeFileSync(targetAbs, lf, { encoding: 'utf-8' });
    return { status: 'written' };
  }

  if (!stat.isFile()) {
    if (stat.isSymbolicLink()) {
      if (options.safeOverwrite) {
        throw new Error(
          `Refusing to overwrite ${relativeForward(options.projectRoot, targetAbs)}: ` +
            'existing target is a symbolic link. Re-run with --force to overwrite.'
        );
      }
      return overwriteGeneratedTarget(targetAbs, lf, options.projectRoot);
    }
    throw new Error(
      `Refusing to overwrite ${relativeForward(options.projectRoot, targetAbs)}: ` +
        'existing target is not a regular file.'
    );
  }

  const existing = fs.readFileSync(targetAbs, 'utf-8').replace(/\r\n?/g, '\n');
  const newSourceHash = extractEmbeddedHash(lf);
  if (!newSourceHash) {
    throw new Error('Internal error: generated mirror content is missing a source-hash banner.');
  }
  const drift = assessDrift(existing, lf, newSourceHash);
  if (drift.status === 'equivalent') {
    return { status: 'noop' };
  }
  if (drift.status === 'drift' && options.safeOverwrite) {
    throw new Error(
      `[drift] ${relativeForward(options.projectRoot, targetAbs)}: ` +
        `${drift.reason ?? 'hand-edited file detected'}. Re-run with --force to overwrite.`
    );
  }

  if (!options.safeOverwrite) {
    return overwriteGeneratedTarget(targetAbs, lf, options.projectRoot);
  }

  fs.writeFileSync(targetAbs, lf, { encoding: 'utf-8' });
  return { status: 'written' };
}

/** Replace a target file after moving its previous contents into a backup. */
function overwriteGeneratedTarget(
  targetAbs: string,
  lf: string,
  projectRoot: string
): GeneratedWriteResult {
  const backupAbs = generatedBackupPath(projectRoot, targetAbs);
  assertContainedPath(projectRoot, backupAbs, 'mirror backup');
  fs.mkdirSync(path.dirname(backupAbs), { recursive: true });
  if (lstatIfPresent(backupAbs)) {
    fs.rmSync(backupAbs, { recursive: true, force: true });
  }
  if (lstatIfPresent(targetAbs)) {
    fs.renameSync(targetAbs, backupAbs);
  }

  try {
    fs.writeFileSync(targetAbs, lf, { encoding: 'utf-8' });
  } catch (err) {
    try {
      if (lstatIfPresent(targetAbs)) {
        fs.unlinkSync(targetAbs);
      }
      if (lstatIfPresent(backupAbs)) {
        fs.copyFileSync(backupAbs, targetAbs);
      }
    } catch {
      // Best-effort rollback. The original error is still surfaced below.
    }
    throw err;
  }

  return { status: 'written', backupPath: backupAbs };
}

/**
 * Maintain the CLAUDE.md include stub for a mirrored module. Idempotent:
 * the stub is added on first call and left alone on subsequent calls.
 * `mode === 'remove'` strips an existing stub (used by `augx unlink` once
 * Phase 3-4 lands).
 */
export function ensureClaudeIncludeStub(
  projectRoot: string,
  moduleId: string,
  mode: 'add' | 'remove'
): void {
  const claudePath = path.join(projectRoot, 'CLAUDE.md');
  const segment = moduleId.replace(/\//g, '-');
  const stub = `<!-- augx-include: .claude/rules/${segment}/ -->`;
  let existing = '';
  if (fs.existsSync(claudePath)) {
    existing = fs.readFileSync(claudePath, 'utf-8').replace(/\r\n?/g, '\n');
  }
  const hasStub = existing.includes(stub);
  if (mode === 'add') {
    if (hasStub) return;
    const next =
      existing.length === 0
        ? stub + '\n'
        : (existing.endsWith('\n') ? existing : existing + '\n') + stub + '\n';
    fs.writeFileSync(claudePath, next, { encoding: 'utf-8' });
    return;
  }
  if (!hasStub) return;
  const stripped = existing
    .replace(new RegExp(stub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?', 'g'), '')
    .replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(claudePath, stripped, { encoding: 'utf-8' });
}

/** Outcome of cleaning up one previously-tracked mirror target. */
export interface UnlinkTargetOutcome {
  tool: MirrorTool;
  targetPath: string;
  status: 'removed' | 'kept-hand-edited' | 'absent';
}

/** Aggregate outcome of `unlinkModuleMirrors`. */
export interface UnlinkModuleResult {
  outcomes: UnlinkTargetOutcome[];
  claudeStubRemoved: boolean;
}

/**
 * Clean up every materialized target recorded for `moduleId`. Symlinks
 * pointing at the recorded source and unchanged copies are deleted; files
 * whose content has drifted are left in place and reported as
 * `kept-hand-edited`. Removes empty parent directories (per-tool roots
 * such as `.claude/rules/<module>/`). The CLAUDE.md include stub is
 * stripped when at least one claude-code entry was recorded.
 */
export function unlinkModuleMirrors(
  projectRoot: string,
  moduleId: string,
  entries: readonly MirrorEntry[]
): UnlinkModuleResult {
  const outcomes: UnlinkTargetOutcome[] = [];
  const toolsTouched = new Set<MirrorTool>();
  const dirsToPrune = new Set<string>();

  for (const entry of entries) {
    toolsTouched.add(entry.tool);
    const absTarget = path.join(projectRoot, ...entry.targetPath.split('/'));
    const absSource = path.join(projectRoot, ...entry.sourcePath.split('/'));
    if (!lstatIfPresent(absTarget)) {
      outcomes.push({ tool: entry.tool, targetPath: entry.targetPath, status: 'absent' });
      dirsToPrune.add(path.dirname(absTarget));
      continue;
    }
    const removed = removeTrackedTarget(
      absSource,
      absTarget,
      entry.mode,
      entry.sourceDigest
    );
    outcomes.push({
      tool: entry.tool,
      targetPath: entry.targetPath,
      status: removed ? 'removed' : 'kept-hand-edited',
    });
    if (removed) {
      dirsToPrune.add(path.dirname(absTarget));
    }
  }

  pruneEmptyDirsBottomUp(projectRoot, dirsToPrune);

  let claudeStubRemoved = false;
  if (toolsTouched.has('claude-code')) {
    const stubBefore = readClaudeStubPresence(projectRoot, moduleId);
    ensureClaudeIncludeStub(projectRoot, moduleId, 'remove');
    const stubAfter = readClaudeStubPresence(projectRoot, moduleId);
    claudeStubRemoved = stubBefore && !stubAfter;
  }

  return { outcomes, claudeStubRemoved };
}

/**
 * Best-effort cleanup of empty per-tool subdirectories left behind by a
 * successful unlink. Walks each path upward until reaching the project
 * root or encountering a non-empty directory.
 */
function pruneEmptyDirsBottomUp(projectRoot: string, dirs: Set<string>): void {
  const rootResolved = path.resolve(projectRoot);
  for (const start of dirs) {
    let current = path.resolve(start);
    while (
      current.startsWith(rootResolved) &&
      current !== rootResolved &&
      fs.existsSync(current)
    ) {
      let contents: string[];
      try {
        contents = fs.readdirSync(current);
      } catch {
        break;
      }
      if (contents.length !== 0) {
        break;
      }
      try {
        fs.rmdirSync(current);
      } catch {
        break;
      }
      current = path.dirname(current);
    }
  }
}

/**
 * Return `true` when CLAUDE.md currently contains an augx-include stub for
 * the given module id. Used to detect whether the stub was actually
 * removed (vs. absent already) during unlink.
 */
function readClaudeStubPresence(projectRoot: string, moduleId: string): boolean {
  const claudePath = path.join(projectRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudePath)) {
    return false;
  }
  const existing = fs.readFileSync(claudePath, 'utf-8').replace(/\r\n?/g, '\n');
  const segment = moduleId.replace(/\//g, '-');
  return existing.includes(`<!-- augx-include: .claude/rules/${segment}/ -->`);
}
