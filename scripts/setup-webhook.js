#!/usr/bin/env node

import axios from 'axios'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Configuration
const config = {
  dev: {
    webhookUrl: 'https://better-suitably-monkey.ngrok-free.app',
    description: 'Development webhook'
  },
  prod: {
    webhookUrl: 'https://my-first-worker.damir-cy.workers.dev',
    description: 'Production webhook'
  }
}

async function getBotToken() {
  try {
    // Try to get from environment variable first
    if (process.env.BOT_TOKEN) {
      return process.env.BOT_TOKEN
    }

    // Try to get from .env file
    const envPath = join(__dirname, '..', '.env')
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf8')
      const match = envContent.match(/BOT_TOKEN=([^\n]+)/)
      if (match) {
        return match[1]
      }
    }

    // Try to get from .env.local file
    const envLocalPath = join(__dirname, '..', '.env.local')
    if (existsSync(envLocalPath)) {
      const envContent = readFileSync(envLocalPath, 'utf8')
      const match = envContent.match(/BOT_TOKEN=([^\n]+)/)
      if (match) {
        return match[1]
      }
    }

    throw new Error(
      'BOT_TOKEN not found in environment variables or .env files'
    )
  } catch (error) {
    console.error('Error getting bot token:', error.message)
    process.exit(1)
  }
}

async function setWebhook(token, webhookUrl, description) {
  try {
    console.log(`Setting webhook for ${description}...`)
    console.log(`Webhook URL: ${webhookUrl}`)

    const response = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        url: webhookUrl,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
        drop_pending_updates: true
      }
    )

    if (response.data.ok) {
      console.log(`✅ Webhook set successfully for ${description}`)
      console.log(`Webhook info:`, response.data.result)
    } else {
      console.error(
        `❌ Failed to set webhook for ${description}:`,
        response.data.description
      )
    }
  } catch (error) {
    console.error(`❌ Error setting webhook for ${description}:`, error.message)
    if (error.response) {
      console.error('Response:', error.response.data)
    }
  }
}

async function deleteWebhook(token, description) {
  try {
    console.log(`Deleting webhook for ${description}...`)

    const response = await axios.post(
      `https://api.telegram.org/bot${token}/deleteWebhook`,
      {
        drop_pending_updates: true
      }
    )

    if (response.data.ok) {
      console.log(`✅ Webhook deleted successfully for ${description}`)
    } else {
      console.error(
        `❌ Failed to delete webhook for ${description}:`,
        response.data.description
      )
    }
  } catch (error) {
    console.error(
      `❌ Error deleting webhook for ${description}:`,
      error.message
    )
  }
}

async function getWebhookInfo(token) {
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    )

    if (response.data.ok) {
      console.log('📋 Current webhook info:')
      console.log(JSON.stringify(response.data.result, null, 2))
    } else {
      console.error('❌ Failed to get webhook info:', response.data.description)
    }
  } catch (error) {
    console.error('❌ Error getting webhook info:', error.message)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  const environment = args[1] || 'dev'

  if (!command) {
    console.log('Usage: node setup-webhook.js <command> [environment]')
    console.log('')
    console.log('Commands:')
    console.log('  set-dev     - Set webhook for development (ngrok)')
    console.log(
      '  set-prod    - Set webhook for production (Cloudflare Workers)'
    )
    console.log('  delete      - Delete current webhook')
    console.log('  info        - Get current webhook info')
    console.log('  switch-dev  - Switch to development mode')
    console.log('  switch-prod - Switch to production mode')
    console.log('')
    console.log('Environments: dev, prod')
    process.exit(1)
  }

  const token = await getBotToken()

  switch (command) {
    case 'set-dev':
      await setWebhook(token, config.dev.webhookUrl, config.dev.description)
      break

    case 'set-prod':
      await setWebhook(token, config.prod.webhookUrl, config.prod.description)
      break

    case 'delete':
      await deleteWebhook(token, 'current webhook')
      break

    case 'info':
      await getWebhookInfo(token)
      break

    case 'switch-dev':
      console.log('🔄 Switching to development mode...')
      await deleteWebhook(token, 'current webhook')
      await setWebhook(token, config.dev.webhookUrl, config.dev.description)
      console.log('✅ Switched to development mode')
      break

    case 'switch-prod':
      console.log('🔄 Switching to production mode...')
      await deleteWebhook(token, 'current webhook')
      await setWebhook(token, config.prod.webhookUrl, config.prod.description)
      console.log('✅ Switched to production mode')
      break

    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }
}

main().catch(console.error)
