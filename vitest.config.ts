import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['dist/**', 'coverage/**', 'node_modules/**'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
