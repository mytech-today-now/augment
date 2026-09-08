import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompatibilityChecker } from '@cli/core/compatibility-checker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const UNKNOWN_AUGMENT_VERSION_MESSAGE = 'Unable to determine current Augment version; compatibility cannot be verified';

describe('CompatibilityChecker', () => {
  let checker: CompatibilityChecker;
  let testDir: string;

  beforeEach(() => {
    checker = new CompatibilityChecker();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compatibility-checker-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function writeCompatibilityMetadata(compatibility: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(testDir, 'metadata.json'),
      JSON.stringify({ compatibility }, null, 2)
    );
  }

  function writeModuleManifest(manifest: Record<string, unknown>): void {
    fs.writeFileSync(
      path.join(testDir, 'module.json'),
      JSON.stringify(manifest, null, 2)
    );
  }

  describe('checkCompatibility', () => {
    it('should return compatible with warnings if no metadata exists', () => {
      const result = checker.checkCompatibility(testDir);
      
      expect(result.compatible).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain('No compatibility metadata found');
    });

    it('should check Node.js version compatibility', () => {
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        compatibility: {
          nodeMinVersion: '0.10.0' // Very old version, should be compatible
        }
      }));
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.compatible).toBe(true);
      expect(result.details.node).toBeDefined();
      expect(result.details.node?.compatible).toBe(true);
    });

    it('should detect incompatible Node.js version', () => {
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        compatibility: {
          nodeMinVersion: '999.0.0' // Future version, should be incompatible
        }
      }));
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.compatible).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.details.node?.compatible).toBe(false);
    });

    it('should detect deprecated modules', () => {
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        compatibility: {
          deprecated: true,
          deprecationMessage: 'This module is deprecated. Use v2 instead.'
        }
      }));
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.deprecations).toContain('This module is deprecated. Use v2 instead.');
    });

    it('should warn about breaking changes', () => {
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        compatibility: {
          breaking: true
        }
      }));
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.warnings).toContain('This version contains breaking changes');
    });

    it('should check TypeScript version if specified', () => {
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        compatibility: {
          typescriptMinVersion: '3.0.0'
        }
      }));
      
      const result = checker.checkCompatibility(testDir);

      expect(result.details.typescript).toBeDefined();
      // TypeScript check may warn if not installed, but shouldn't error
    });

    it('should return compatible when the Augment runtime satisfies the minimum', () => {
      checker = new CompatibilityChecker({ augmentVersion: '1.2.3' });
      writeCompatibilityMetadata({
        augmentMinVersion: '1.0.0'
      });

      const result = checker.checkCompatibility(testDir);

      expect(result.compatible).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details.augment).toMatchObject({
        required: '1.0.0',
        current: '1.2.3',
        compatible: true
      });
    });

    it('should detect incompatible Augment runtime version', () => {
      checker = new CompatibilityChecker({ augmentVersion: '0.9.0' });
      writeCompatibilityMetadata({
        augmentMinVersion: '1.0.0'
      });

      const result = checker.checkCompatibility(testDir);

      expect(result.compatible).toBe(false);
      expect(result.errors).toContain('Augment 1.0.0 or higher required (current: 0.9.0)');
      expect(result.details.augment).toMatchObject({
        required: '1.0.0',
        current: '0.9.0',
        compatible: false
      });
    });

    it('should fail closed when the Augment version cannot be determined', () => {
      writeCompatibilityMetadata({
        augmentMinVersion: '1.0.0'
      });

      const result = checker.checkCompatibility(testDir);

      expect(result.compatible).toBe(false);
      expect(result.details.augment).toMatchObject({
        required: '1.0.0',
        current: 'unknown',
        compatible: false
      });
      expect(result.errors).toContain(UNKNOWN_AUGMENT_VERSION_MESSAGE);
    });

    it('should read Augment requirements from module.json engines', () => {
      checker = new CompatibilityChecker({ augmentVersion: '1.2.3' });
      writeModuleManifest({
        engines: {
          augment: '>=1.0.0'
        }
      });

      const result = checker.checkCompatibility(testDir);

      expect(result.compatible).toBe(true);
      expect(result.details.augment).toMatchObject({
        required: '>=1.0.0',
        current: '1.2.3',
        compatible: true
      });
    });

    it('should handle multiple compatibility checks', () => {
      checker = new CompatibilityChecker({ augmentVersion: '1.0.0' });
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        compatibility: {
          nodeMinVersion: '14.0.0',
          typescriptMinVersion: '4.0.0',
          augmentMinVersion: '1.0.0',
          deprecated: true,
          deprecationMessage: 'Use newer version',
          breaking: true
        }
      }));
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.details.node).toBeDefined();
      expect(result.details.typescript).toBeDefined();
      expect(result.details.augment).toBeDefined();
      expect(result.details.augment?.compatible).toBe(true);
      expect(result.deprecations.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle malformed metadata.json gracefully', () => {
      fs.writeFileSync(path.join(testDir, 'metadata.json'), 'invalid json');
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.compatible).toBe(true);
      expect(result.warnings).toContain('No compatibility metadata found');
    });
  });

  describe('version comparison', () => {
    it('should correctly identify compatible versions', () => {
      const nodeVersion = process.version.replace('v', '');
      const [major] = nodeVersion.split('.');
      const olderVersion = `${parseInt(major) - 1}.0.0`;
      
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        compatibility: {
          nodeMinVersion: olderVersion
        }
      }));
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.compatible).toBe(true);
      expect(result.details.node?.current).toBe(nodeVersion);
      expect(result.details.node?.required).toBe(olderVersion);
    });
  });

  describe('edge cases', () => {
    it('should handle empty compatibility object', () => {
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        compatibility: {}
      }));
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.compatible).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing compatibility field', () => {
      fs.writeFileSync(path.join(testDir, 'metadata.json'), JSON.stringify({
        name: 'test-module',
        version: '1.0.0'
      }));
      
      const result = checker.checkCompatibility(testDir);
      
      expect(result.compatible).toBe(true);
      expect(result.warnings).toContain('No compatibility metadata found');
    });
  });
});

