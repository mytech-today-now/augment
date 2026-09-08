import * as fs from 'fs';
import * as path from 'path';
import {
  compareSemanticVersions,
  isValidSemanticVersion,
  satisfiesVersionRange
} from '../utils/module-system';
import { execSync } from 'child_process';

/**
 * Compatibility check result
 */
export interface CompatibilityResult {
  compatible: boolean;
  errors: string[];
  warnings: string[];
  deprecations: string[];
  details: {
    typescript?: VersionCheckResult;
    node?: VersionCheckResult;
    augment?: VersionCheckResult;
  };
}

/**
 * Version check result for a specific runtime
 */
export interface VersionCheckResult {
  required: string;
  current: string;
  compatible: boolean;
  message?: string;
}

/**
 * Module compatibility metadata
 */
export interface CompatibilityMetadata {
  augmentMinVersion?: string;
  nodeMinVersion?: string;
  typescriptMinVersion?: string;
  deprecated?: boolean;
  deprecationMessage?: string;
  breaking?: boolean;
}

type CompatibilityCheckerOptions = {
  augmentVersion?: string | null;
};

const UNKNOWN_AUGMENT_VERSION_MESSAGE = 'Unable to determine current Augment version; compatibility cannot be verified';

/**
 * CompatibilityChecker class
 * Validates module compatibility with runtime environment
 */
export class CompatibilityChecker {
  private nodeVersion: string;
  private typescriptVersion: string | null;
  private augmentVersion: string | null;

  constructor(options: CompatibilityCheckerOptions = {}) {
    this.nodeVersion = process.version.replace('v', '');
    this.typescriptVersion = this.detectTypeScriptVersion();
    this.augmentVersion = options.augmentVersion ?? null;
  }

  /**
   * Check compatibility of a module
   * @param modulePath Path to the module directory
   * @returns Compatibility check result
   */
  checkCompatibility(modulePath: string): CompatibilityResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const deprecations: string[] = [];
    const details: CompatibilityResult['details'] = {};

    // Load module metadata
    const metadata = this.loadCompatibilityMetadata(modulePath);

    if (!metadata) {
      warnings.push('No compatibility metadata found');
      return {
        compatible: true,
        errors,
        warnings,
        deprecations,
        details
      };
    }

    // Check deprecation
    if (metadata.deprecated) {
      deprecations.push(metadata.deprecationMessage || 'This module is deprecated');
    }

    // Check breaking changes
    if (metadata.breaking) {
      warnings.push('This version contains breaking changes');
    }

    // Check Node.js version
    if (metadata.nodeMinVersion) {
      const nodeCheck = this.checkNodeVersion(metadata.nodeMinVersion);
      details.node = nodeCheck;
      if (!nodeCheck.compatible) {
        errors.push(nodeCheck.message || 'Node.js version incompatible');
      }
    }

    // Check TypeScript version
    if (metadata.typescriptMinVersion) {
      const tsCheck = this.checkTypeScriptVersion(metadata.typescriptMinVersion);
      details.typescript = tsCheck;
      if (!tsCheck.compatible) {
        warnings.push(tsCheck.message || 'TypeScript version may be incompatible');
      }
    }

    // Check Augment version (if available)
    if (metadata.augmentMinVersion) {
      const augmentCheck = this.checkAugmentVersion(metadata.augmentMinVersion);
      details.augment = augmentCheck;
      if (!augmentCheck.compatible) {
        errors.push(augmentCheck.message || 'Augment version incompatible');
      }
    }

    return {
      compatible: errors.length === 0,
      errors,
      warnings,
      deprecations,
      details
    };
  }

  /**
   * Check Node.js version compatibility
   * @param requiredVersion Minimum required Node.js version
   * @returns Version check result
   */
  private checkNodeVersion(requiredVersion: string): VersionCheckResult {
    const compatible = compareSemanticVersions(this.nodeVersion, requiredVersion) >= 0;

    return {
      required: requiredVersion,
      current: this.nodeVersion,
      compatible,
      message: compatible
        ? undefined
        : `Node.js ${requiredVersion} or higher required (current: ${this.nodeVersion})`
    };
  }

  /**
   * Check TypeScript version compatibility
   * @param requiredVersion Minimum required TypeScript version
   * @returns Version check result
   */
  private checkTypeScriptVersion(requiredVersion: string): VersionCheckResult {
    if (!this.typescriptVersion) {
      return {
        required: requiredVersion,
        current: 'not installed',
        compatible: false,
        message: `TypeScript ${requiredVersion} or higher required (not installed)`
      };
    }

    const compatible = compareSemanticVersions(this.typescriptVersion, requiredVersion) >= 0;

    return {
      required: requiredVersion,
      current: this.typescriptVersion,
      compatible,
      message: compatible
        ? undefined
        : `TypeScript ${requiredVersion} or higher required (current: ${this.typescriptVersion})`
    };
  }

  /**
   * Check Augment version compatibility
   * @param requiredVersion Minimum required Augment version or range
   * @returns Version check result
   */
  private checkAugmentVersion(requiredVersion: string): VersionCheckResult {
    if (!this.augmentVersion || !isValidSemanticVersion(this.augmentVersion)) {
      return {
        required: requiredVersion,
        current: 'unknown',
        compatible: false,
        message: UNKNOWN_AUGMENT_VERSION_MESSAGE
      };
    }

    try {
      const compatible = this.isVersionRequirementSatisfied(this.augmentVersion, requiredVersion);

      return {
        required: requiredVersion,
        current: this.augmentVersion,
        compatible,
        message: compatible
          ? undefined
          : `Augment ${requiredVersion} or higher required (current: ${this.augmentVersion})`
      };
    } catch {
      return {
        required: requiredVersion,
        current: this.augmentVersion,
        compatible: false,
        message: `Invalid Augment version requirement: ${requiredVersion}`
      };
    }
  }

  /**
   * Check whether a version satisfies a requirement string
   * @param currentVersion Current version string
   * @param requiredVersion Required version or range
   * @returns True when the current version satisfies the requirement
   */
  private isVersionRequirementSatisfied(currentVersion: string, requiredVersion: string): boolean {
    const normalizedRequirement = requiredVersion.trim();

    if (/^[~^<>=]/.test(normalizedRequirement)) {
      return satisfiesVersionRange(currentVersion, normalizedRequirement);
    }

    return compareSemanticVersions(currentVersion, normalizedRequirement) >= 0;
  }

  /**
   * Load compatibility metadata from module
   * @param modulePath Path to the module directory
   * @returns Compatibility metadata or null
   */
  private loadCompatibilityMetadata(modulePath: string): CompatibilityMetadata | null {
    const metadataFile = path.join(modulePath, 'metadata.json');
    const moduleFile = path.join(modulePath, 'module.json');
    const compatibility: CompatibilityMetadata = {};

    const metadataJson = this.readJsonFile(metadataFile);
    if (metadataJson) {
      Object.assign(compatibility, this.extractCompatibilityFields(metadataJson.compatibility));
    }

    const moduleJson = this.readJsonFile(moduleFile);
    if (moduleJson) {
      const moduleCompatibility = this.extractCompatibilityFields(moduleJson.compatibility);
      if (moduleCompatibility.augmentMinVersion && !compatibility.augmentMinVersion) {
        compatibility.augmentMinVersion = moduleCompatibility.augmentMinVersion;
      }

      if (!compatibility.augmentMinVersion) {
        const augmentEngine = this.extractAugmentEngine(moduleJson);
        if (augmentEngine) {
          compatibility.augmentMinVersion = augmentEngine;
        }
      }
    }

    return Object.keys(compatibility).length > 0 ? compatibility : null;
  }

  /**
   * Read and parse a JSON file if it exists
   * @param filePath File path to parse
   * @returns Parsed JSON object or null
   */
  private readJsonFile(filePath: string): Record<string, unknown> | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Extract supported compatibility fields from a manifest object
   * @param value Raw compatibility value
   * @returns Normalized compatibility metadata
   */
  private extractCompatibilityFields(value: unknown): CompatibilityMetadata {
    const compatibility: CompatibilityMetadata = {};

    if (!value || typeof value !== 'object') {
      return compatibility;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.augmentMinVersion === 'string') {
      compatibility.augmentMinVersion = record.augmentMinVersion;
    }
    if (typeof record.nodeMinVersion === 'string') {
      compatibility.nodeMinVersion = record.nodeMinVersion;
    }
    if (typeof record.typescriptMinVersion === 'string') {
      compatibility.typescriptMinVersion = record.typescriptMinVersion;
    }
    if (typeof record.deprecated === 'boolean') {
      compatibility.deprecated = record.deprecated;
    }
    if (typeof record.deprecationMessage === 'string') {
      compatibility.deprecationMessage = record.deprecationMessage;
    }
    if (typeof record.breaking === 'boolean') {
      compatibility.breaking = record.breaking;
    }

    return compatibility;
  }

  /**
   * Extract an Augment runtime requirement from module.json engines
   * @param moduleJson Parsed module.json content
   * @returns Augment version requirement or null
   */
  private extractAugmentEngine(moduleJson: Record<string, unknown>): string | null {
    const engines = moduleJson.engines;
    if (!engines || typeof engines !== 'object') {
      return null;
    }

    const augment = (engines as Record<string, unknown>).augment;
    return typeof augment === 'string' ? augment : null;
  }

  /**
   * Detect installed TypeScript version
   * @returns TypeScript version string or null if not installed
   */
  private detectTypeScriptVersion(): string | null {
    try {
      const output = execSync('tsc --version', { encoding: 'utf-8', stdio: 'pipe' });
      const match = output.match(/Version (\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }
}

