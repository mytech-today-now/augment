import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  poolOptions: {
    threads: {
      singleThread: true
    }
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'cli/src/utils/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist/',
        '**/*.test.ts',
        'test-all.ts',
        'cli/dist/**',
        'benchmarks/**',
        'scripts/**'
      ],
      lines: 80,
      branches: 70,
      functions: 75,
      statements: 80,
      all: false,
      clean: true
    },
    testTimeout: 5000,
    hookTimeout: 10000,
    isolate: true,
    pool: 'forks',
    maxConcurrency: 1
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './cli/src'),
      '@tests': path.resolve(__dirname, './tests'),
      '@cli': path.resolve(__dirname, './cli/src')
    }
  }
});

