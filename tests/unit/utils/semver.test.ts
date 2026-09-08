/**
 * Tests for semantic versioning utilities
 */

import {
  isValidSemanticVersion,
  parseSemanticVersion,
  compareSemanticVersions,
  satisfiesVersionRange
} from '@cli/utils/module-system';

describe('Semantic Versioning', () => {
  describe('isValidSemanticVersion', () => {
    it('should validate basic versions', () => {
      expect(isValidSemanticVersion('1.0.0')).toBe(true);
      expect(isValidSemanticVersion('0.0.1')).toBe(true);
      expect(isValidSemanticVersion('10.20.30')).toBe(true);
    });

    it('should validate pre-release versions', () => {
      expect(isValidSemanticVersion('1.0.0-alpha')).toBe(true);
      expect(isValidSemanticVersion('1.0.0-beta.1')).toBe(true);
      expect(isValidSemanticVersion('1.0.0-rc.1.2.3')).toBe(true);
    });

    it('should validate build metadata', () => {
      expect(isValidSemanticVersion('1.0.0+20130313144700')).toBe(true);
      expect(isValidSemanticVersion('1.0.0-beta+exp.sha.5114f85')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(isValidSemanticVersion('1.0')).toBe(false);
      expect(isValidSemanticVersion('1')).toBe(false);
      expect(isValidSemanticVersion('v1.0.0')).toBe(false);
      expect(isValidSemanticVersion('1.0.0.0')).toBe(false);
    });
  });

  describe('parseSemanticVersion', () => {
    it('should parse basic versions', () => {
      const parsed = parseSemanticVersion('1.2.3');
      expect(parsed).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: undefined,
        build: undefined
      });
    });

    it('should parse pre-release versions', () => {
      const parsed = parseSemanticVersion('1.0.0-beta.1');
      expect(parsed).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: 'beta.1',
        build: undefined
      });
    });

    it('should parse build metadata', () => {
      const parsed = parseSemanticVersion('1.0.0+build.123');
      expect(parsed).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: undefined,
        build: 'build.123'
      });
    });

    it('should return null for invalid versions', () => {
      expect(parseSemanticVersion('invalid')).toBeNull();
    });
  });

  describe('compareSemanticVersions', () => {
    it('should compare major versions', () => {
      expect(compareSemanticVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareSemanticVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    it('should compare minor versions', () => {
      expect(compareSemanticVersions('1.2.0', '1.1.0')).toBe(1);
      expect(compareSemanticVersions('1.1.0', '1.2.0')).toBe(-1);
    });

    it('should compare patch versions', () => {
      expect(compareSemanticVersions('1.0.2', '1.0.1')).toBe(1);
      expect(compareSemanticVersions('1.0.1', '1.0.2')).toBe(-1);
    });

    it('should handle equal versions', () => {
      expect(compareSemanticVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should handle pre-release versions', () => {
      expect(compareSemanticVersions('1.0.0', '1.0.0-alpha')).toBe(1);
      expect(compareSemanticVersions('1.0.0-alpha', '1.0.0')).toBe(-1);
      expect(compareSemanticVersions('1.0.0-beta', '1.0.0-alpha')).toBe(1);
    });

    it('should ignore build metadata in precedence', () => {
      expect(compareSemanticVersions('1.0.0+build.1', '1.0.0+build.2')).toBe(0);
      expect(compareSemanticVersions('1.0.0-alpha+build.1', '1.0.0-alpha+build.2')).toBe(0);
    });

    it('should order numeric prerelease identifiers correctly', () => {
      expect(compareSemanticVersions('1.0.0-rc.10', '1.0.0-rc.2')).toBe(1);
      expect(compareSemanticVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBe(-1);
    });
  });

  describe('satisfiesVersionRange', () => {
    it('should handle exact matches', () => {
      expect(satisfiesVersionRange('1.0.0', '1.0.0')).toBe(true);
      expect(satisfiesVersionRange('1.0.1', '1.0.0')).toBe(false);
    });

    it('should handle caret ranges', () => {
      expect(satisfiesVersionRange('1.2.3', '^1.0.0')).toBe(true);
      expect(satisfiesVersionRange('2.0.0', '^1.0.0')).toBe(false);
      expect(satisfiesVersionRange('0.2.0', '^0.1.0')).toBe(false);
    });

    it('should handle tilde ranges', () => {
      expect(satisfiesVersionRange('1.0.5', '~1.0.0')).toBe(true);
      expect(satisfiesVersionRange('1.1.0', '~1.0.0')).toBe(false);
    });

    it('should handle comparison operators', () => {
      expect(satisfiesVersionRange('1.0.1', '>=1.0.0')).toBe(true);
      expect(satisfiesVersionRange('1.0.0', '>1.0.0')).toBe(false);
      expect(satisfiesVersionRange('0.9.0', '<1.0.0')).toBe(true);
      expect(satisfiesVersionRange('1.0.0', '<=1.0.0')).toBe(true);
    });
  });
});

