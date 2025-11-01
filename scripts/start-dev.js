#!/usr/bin/env node

import { spawn, execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Configuration
const config = {
  wranglerPort: 8787,
  ngrokRegion: 'us', // or 'eu', 'au', 'ap', 'sa', 'jp', 'in'
  ngrokAuthToken: process.env.NGROK_AUTH_TOKEN || null
}

async function getBotToken() {
  try {
    if (process.env.BOT_TOKEN) {
      return process.env.BOT_TOKEN
    }

    const envPath = join(__dirname, '..', '.env')
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf8')
      const match = envContent.match(/BOT_TOKEN=([^\n]+)/)
      if (match) {
        return match[1]
      }
    }

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

async function checkNgrok() {
  try {
    execSync('ngrok version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function installNgrok() {
  console.log('📦 Installing ngrok...')
  try {
    execSync('npm install -g ngrok', { stdio: 'inherit' })
    console.log('✅ ngrok installed successfully')
  } catch (error) {
    console.error('❌ Failed to install ngrok:', error.message)
    console.log('Please install ngrok manually: https://ngrok.com/download')
    process.exit(1)
  }
}

async function startNgrok() {
  console.log('🚀 Starting ngrok tunnel...')

  const ngrokArgs = [
    'http',
    '--url=better-suitably-monkey.ngrok-free.app',
    config.wranglerPort.toString()
  ]

  if (config.ngrokAuthToken) {
    ngrokArgs.push('--authtoken', config.ngrokAuthToken)
  }

  const ngrok = spawn('ngrok', ngrokArgs, {
    stdio: ['pipe', 'pipe', 'pipe']
  })

  return new Promise((resolve, reject) => {
    let tunnelUrl = null

    ngrok.stdout.on('data', (data) => {
      const output = data.toString()
      console.log('ngrok:', output)

      // Extract the public URL from ngrok output
      const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.ngrok-free\.app/)
      if (urlMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[0]
        console.log(`✅ ngrok tunnel established: ${tunnelUrl}`)
        resolve({ ngrok, tunnelUrl })
      }
    })

    ngrok.stderr.on('data', (data) => {
      console.error('ngrok error:', data.toString())
    })

    ngrok.on('error', (error) => {
      console.error('❌ Failed to start ngrok:', error.message)
      reject(error)
    })

    ngrok.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ ngrok process exited with code ${code}`)
        reject(new Error(`ngrok exited with code ${code}`))
      }
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!tunnelUrl) {
        ngrok.kill()
        reject(new Error('Timeout waiting for ngrok tunnel'))
      }
    }, 30000)
  })
}

async function setWebhook(token, webhookUrl) {
  try {
    console.log(`�� Setting webhook to: ${webhookUrl}`)

    const response = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        url: webhookUrl,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
        drop_pending_updates: true
      }
    )

    if (response.data.ok) {
      console.log('✅ Webhook set successfully')
      return true
    } else {
      console.error('❌ Failed to set webhook:', response.data.description)
      return false
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error.message)
    return false
  }
}

async function startWrangler() {
  console.log('🔧 Starting Wrangler development server...')

  const wrangler = spawn(
    'npx',
    ['wrangler', 'dev', '--port', config.wranglerPort.toString()],
    {
      stdio: 'pipe',
      cwd: join(__dirname, '..')
    }
  )

  return new Promise((resolve, reject) => {
    let isReady = false

    wrangler.stdout.on('data', (data) => {
      const output = data.toString()
      console.log('wrangler:', output)

      // Check if Wrangler is ready (listening on port)
      if (
        output.includes(`http://localhost:${config.wranglerPort}`) &&
        !isReady
      ) {
        isReady = true
        console.log('✅ Wrangler development server is ready')
        resolve(wrangler)
      }
    })

    wrangler.stderr.on('data', (data) => {
      const output = data.toString()
      console.error('wrangler error:', output)
    })

    wrangler.on('error', (error) => {
      console.error('❌ Failed to start Wrangler:', error.message)
      reject(error)
    })

    wrangler.on('close', (code) => {
      if (code !== 0 && !isReady) {
        console.error(`❌ Wrangler process exited with code ${code}`)
        reject(new Error(`Wrangler exited with code ${code}`))
      }
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!isReady) {
        wrangler.kill()
        reject(new Error('Timeout waiting for Wrangler to start'))
      }
    }, 30000)
  })
}

async function waitForServer(url, maxAttempts = 10) {
  console.log('⏳ Waiting for server to be ready...')

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(url, { timeout: 5000 })
      if (response.status === 405) {
        // Method Not Allowed is expected for GET
        console.log('✅ Server is ready and responding')
        return true
      }
    } catch (error) {
      if (error.response && error.response.status === 405) {
        console.log('✅ Server is ready and responding')
        return true
      }
      console.log(`⏳ Attempt ${i + 1}/${maxAttempts}: Server not ready yet...`)
    }

    // Wait 2 seconds before next attempt
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  console.log('⚠️  Server might not be fully ready, but continuing...')
  return false
}

async function cleanup(ngrok, wrangler) {
  console.log('\n�� Cleaning up...')

  if (ngrok) {
    ngrok.kill()
    console.log('✅ ngrok stopped')
  }

  if (wrangler) {
    wrangler.kill()
    console.log('✅ Wrangler stopped')
  }

  // Delete webhook
  try {
    const token = await getBotToken()
    await axios.post(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      drop_pending_updates: true
    })
    console.log('✅ Webhook deleted')
  } catch (error) {
    console.error('❌ Failed to delete webhook:', error.message)
  }
}

async function main() {
  console.log('🚀 Starting development environment...\n')

  let ngrok = null
  let wrangler = null

  try {
    // Check if ngrok is installed
    const ngrokInstalled = await checkNgrok()
    if (!ngrokInstalled) {
      await installNgrok()
    }

    // Get bot token
    const token = await getBotToken()

    // Start Wrangler first
    wrangler = await startWrangler()

    // Wait a bit for Wrangler to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Start ngrok tunnel
    const { ngrok: ngrokProcess, tunnelUrl } = await startNgrok()
    ngrok = ngrokProcess

    // Wait for server to be ready
    await waitForServer(tunnelUrl)

    // Set webhook
    const webhookSet = await setWebhook(token, tunnelUrl)
    if (!webhookSet) {
      throw new Error('Failed to set webhook')
    }

    console.log('\n🎉 Development environment is ready!')
    console.log(`📱 Bot webhook: ${tunnelUrl}`)
    console.log(
      `🔧 Wrangler dev server: http://localhost:${config.wranglerPort}`
    )
    console.log('\nPress Ctrl+C to stop all services...')

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await cleanup(ngrok, wrangler)
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      await cleanup(ngrok, wrangler)
      process.exit(0)
    })

    // Keep the process alive
    await new Promise(() => {})
  } catch (error) {
    console.error('❌ Error starting development environment:', error.message)
    await cleanup(ngrok, wrangler)
    process.exit(1)
  }
}

main().catch(console.error)
