/**
 * Inspection Cache Utility
 * 
 * Provides caching for module inspection results to improve performance.
 * Supports in-memory caching with file change detection for cache invalidation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  fileHash: string;
  filePath: string;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
  maxSize?: number; // Maximum number of entries (default: 100)
}

export class InspectionCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttl: number;
  private maxSize: number;
  private enabled: boolean = true;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl || 5 * 60 * 1000; // 5 minutes default
    this.maxSize = options.maxSize || 100;
  }

  /**
   * Get cached data if valid
   */
  get(key: string, filePath?: string): T | null {
    if (!this.enabled) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Check if file has changed (if filePath provided)
    if (filePath && entry.filePath) {
      const currentHash = this.getFileHash(filePath);
      if (currentHash !== entry.fileHash) {
        this.cache.delete(key);
        return null;
      }
    }

    return entry.data;
  }

  /**
   * Set cache data
   */
  set(key: string, data: T, filePath?: string): void {
    if (!this.enabled) {
      return;
    }

    // Enforce max size by removing oldest entries
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      fileHash: filePath ? this.getFileHash(filePath) : '',
      filePath: filePath || ''
    };

    this.cache.set(key, entry);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear cache entries for a specific file
   */
  clearFile(filePath: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.filePath === filePath) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Disable caching.
   */
  disable(): void {
    this.setEnabled(false);
  }

  /**
   * Enable caching.
   */
  enable(): void {
    this.setEnabled(true);
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; enabled: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      enabled: this.enabled
    };
  }

  /**
   * Calculate file hash for change detection
   */
  private getFileHash(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) {
        return '';
      }

      const stats = fs.statSync(filePath);
      // Use mtime and size for quick hash (faster than reading entire file)
      return `${stats.mtime.getTime()}-${stats.size}`;
    } catch (error) {
      return '';
    }
  }
}

// Global cache instance for module inspection
export const moduleInspectionCache = new InspectionCache({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100
});

