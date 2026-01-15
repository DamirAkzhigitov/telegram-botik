import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isIntegrationTest = env.TEST_INTEGRATION === 'true'

  return {
    test: {
      env,
      // Separate timeout for integration tests (longer for network calls)
      testTimeout: isIntegrationTest
        ? parseInt(env.INTEGRATION_TEST_TIMEOUT || '60000', 10)
        : 30000,
      include: ['test/**/*.test.ts'],
      exclude: ['node_modules/**', 'dist/**'],
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
  }
})
