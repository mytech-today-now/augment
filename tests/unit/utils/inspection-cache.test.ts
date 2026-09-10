/**
 * Unit Tests for Inspection Cache
 * Tests the caching system for module inspection results
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InspectionCache } from '@cli/utils/inspection-cache';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, rmSync } from 'fs';

describe('InspectionCache', () => {
  let cache: InspectionCache<any>;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    cache = new InspectionCache({ ttl: 1000, maxSize: 5 });
    
    // Create test directory and file
    testDir = path.join(tmpdir(), `inspection-cache-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = path.join(testDir, 'test.txt');
    writeFileSync(testFile, 'test content');
  });

  afterEach(() => {
    cache.clear();
    if (fs.existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Basic Operations', () => {
    it('should store and retrieve data', () => {
      const data = { test: 'value' };
      cache.set('key1', data);

      const retrieved = cache.get('key1');
      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent key', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should overwrite existing key', () => {
      cache.set('key1', { value: 1 });
      cache.set('key1', { value: 2 });

      const result = cache.get('key1');
      expect(result).toEqual({ value: 2 });
    });

    it('should clear all entries', () => {
      cache.set('key1', { value: 1 });
      cache.set('key2', { value: 2 });

      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      const shortCache = new InspectionCache({ ttl: 100 }); // 100ms TTL
      shortCache.set('key1', { value: 'test' });

      // Should exist immediately
      expect(shortCache.get('key1')).toEqual({ value: 'test' });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      expect(shortCache.get('key1')).toBeNull();
    });

    it('should not expire entries before TTL', async () => {
      const longCache = new InspectionCache({ ttl: 5000 }); // 5s TTL
      longCache.set('key1', { value: 'test' });

      // Wait a short time
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still exist
      expect(longCache.get('key1')).toEqual({ value: 'test' });
    });
  });

  describe('Max Size', () => {
    it('should enforce max size limit', () => {
      const smallCache = new InspectionCache({ maxSize: 3 });

      smallCache.set('key1', { value: 1 });
      smallCache.set('key2', { value: 2 });
      smallCache.set('key3', { value: 3 });
      smallCache.set('key4', { value: 4 }); // Should evict key1

      expect(smallCache.get('key1')).toBeNull(); // Evicted
      expect(smallCache.get('key2')).toEqual({ value: 2 });
      expect(smallCache.get('key3')).toEqual({ value: 3 });
      expect(smallCache.get('key4')).toEqual({ value: 4 });
    });

    it('should evict oldest entry when full', () => {
      const smallCache = new InspectionCache({ maxSize: 2 });

      smallCache.set('oldest', { value: 1 });
      smallCache.set('middle', { value: 2 });
      smallCache.set('newest', { value: 3 }); // Should evict 'oldest'

      expect(smallCache.get('oldest')).toBeNull();
      expect(smallCache.get('middle')).toEqual({ value: 2 });
      expect(smallCache.get('newest')).toEqual({ value: 3 });
    });
  });

  describe('File Change Detection', () => {
    it('should invalidate cache when file changes', () => {
      cache.set('key1', { value: 'original' }, testFile);

      // Verify cached
      expect(cache.get('key1', testFile)).toEqual({ value: 'original' });

      // Modify file
      writeFileSync(testFile, 'modified content');

      // Cache should be invalidated
      expect(cache.get('key1', testFile)).toBeNull();
    });

    it('should not invalidate cache if file unchanged', () => {
      cache.set('key1', { value: 'test' }, testFile);

      // Get multiple times without changing file
      expect(cache.get('key1', testFile)).toEqual({ value: 'test' });
      expect(cache.get('key1', testFile)).toEqual({ value: 'test' });
    });

    it('should work without file path', () => {
      cache.set('key1', { value: 'test' });

      expect(cache.get('key1')).toEqual({ value: 'test' });
    });
  });

  describe('Enable/Disable', () => {
    it('should respect enabled state', () => {
      cache.disable();
      cache.set('key1', { value: 'test' });

      expect(cache.get('key1')).toBeNull();
    });

    it('should work when enabled', () => {
      cache.enable();
      cache.set('key1', { value: 'test' });

      expect(cache.get('key1')).toEqual({ value: 'test' });
    });
  });
});

