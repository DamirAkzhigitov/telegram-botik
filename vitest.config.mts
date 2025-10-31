import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['test/**', '**/*.test.ts', '**/*.d.ts', 'node_modules/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 80
      }
    }
  }
}))
