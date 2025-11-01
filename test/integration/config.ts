/**
 * Integration test configuration loader
 * Loads required environment variables for integration tests
 */

interface IntegrationConfig {
  botToken: string
  chatId: string
  workerUrl: string
  testTimeout: number
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Please set it before running integration tests.`
    )
  }
  return value
}

export function loadIntegrationConfig(): IntegrationConfig {
  return {
    botToken: requireEnv('INTEGRATION_BOT_TOKEN'),
    chatId: requireEnv('INTEGRATION_CHAT_ID'),
    workerUrl: requireEnv('INTEGRATION_WORKER_URL'),
    testTimeout: parseInt(
      process.env.INTEGRATION_TEST_TIMEOUT || '60000',
      10
    )
  }
}

export const INTEGRATION_CONFIG = loadIntegrationConfig()

