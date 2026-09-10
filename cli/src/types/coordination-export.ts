/**
 * Coordination Manifest Export/Mirror Types
 *
 * Optional top-level keys on `.augment/coordination.json` introduced by the
 * cross-platform capability. Loaders MUST treat missing keys as `undefined`
 * and MUST preserve unknown top-level keys when round-tripping the file.
 *
 * See: openspec/specs/cross-platform/coordination-export-block.md
 */

export type MirrorTool = 'claude-code' | 'cursor' | 'windsurf' | 'copilot';

export type MirrorMode = 'symlink' | 'copy';

export interface ExportBlock {
  targets?: MirrorTool[];
  ignore?: string[];
  mirror?: boolean;
}

export interface MirrorEntry {
  tool: MirrorTool;
  sourcePath: string;
  targetPath: string;
  mode: MirrorMode;
  /**
   * SHA-256 digest of the mirrored content at materialization time.
   * Used to verify copy-mode targets even if the source path later disappears.
   */
  sourceDigest?: string;
}

export type MirrorsBlock = Record<string, MirrorEntry[]>;

export const DEFAULT_EXPORT_IGNORE: readonly string[] = ['**/examples/**'];

export const MIRROR_TOOLS: readonly MirrorTool[] = [
  'claude-code',
  'cursor',
  'windsurf',
  'copilot',
];

export function isMirrorTool(value: unknown): value is MirrorTool {
  return typeof value === 'string' && (MIRROR_TOOLS as readonly string[]).includes(value);
}

export function isMirrorMode(value: unknown): value is MirrorMode {
  return value === 'symlink' || value === 'copy';
}
