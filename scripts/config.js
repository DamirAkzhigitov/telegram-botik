// Configuration file for webhook URLs and settings
// Update these values according to your setup

export const config = {
  // Development environment (ngrok)
  dev: {
    webhookUrl: 'https://better-suitably-monkey.ngrok-free.app',
    description: 'Development webhook (ngrok)',
    wranglerPort: 8787,
    ngrokRegion: 'us' // or 'eu', 'au', 'ap', 'sa', 'jp', 'in'
  },

  // Production environment (Cloudflare Workers)
  prod: {
    webhookUrl: 'https://my-first-worker.damir-cy.workers.dev',
    description: 'Production webhook (Cloudflare Workers)'
    // Update this URL with your actual worker URL after deployment
    // Format: https://{worker-name}.{your-subdomain}.workers.dev
  },

  // Telegram Bot API settings
  telegram: {
    allowedUpdates: ['message', 'edited_message', 'callback_query'],
    dropPendingUpdates: true
  },

  // Environment variables
  env: {
    botTokenKey: 'BOT_TOKEN',
    apiKeyKey: 'API_KEY',
    ngrokAuthTokenKey: 'NGROK_AUTH_TOKEN'
  }
}

// Helper function to get the correct webhook URL based on environment
export function getWebhookUrl(environment = 'dev') {
  return config[environment]?.webhookUrl
}

// Helper function to get worker name from wrangler config
export function getWorkerName() {
  return 'my-first-worker' // Update this with your actual worker name
}

// Helper function to get worker URL
export function getWorkerUrl() {
  const workerName = getWorkerName()
  return `https://${workerName}.damir-cy.workers.dev` // Update subdomain
}
