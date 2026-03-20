// Configuration file for webhook URLs and settings
// Dev URL: set DEV_WEBHOOK_URL or CLOUDFLARE_TUNNEL_URL in .env (see .env.example)

export const config = {
  // Development — public HTTPS URL of cloudflared (or other tunnel) to wrangler dev :8787
  dev: {
    webhookUrl: '',
    description: 'Development webhook (Cloudflare Tunnel)',
    wranglerPort: 8787
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
    devWebhookUrlKey: 'DEV_WEBHOOK_URL',
    devWebhookUrlAltKey: 'CLOUDFLARE_TUNNEL_URL'
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
