# Setup Guide

## Step 1: Environment Variables

Create a `.env` file in your project root with the following variables:

```env
# Telegram Bot Configuration
BOT_TOKEN=your_telegram_bot_token_here

# OpenAI Configuration
API_KEY=your_openai_api_key_here

# ngrok Configuration (optional, for authenticated tunnels)
NGROK_AUTH_TOKEN=your_ngrok_auth_token_here

# Environment
NODE_ENV=development
```

## Step 2: Update Configuration

Edit `scripts/config.js` and update the following values:

### Development Configuration
```javascript
dev: {
  webhookUrl: 'https://your-ngrok-url.ngrok-free.app', // Will be auto-detected
  description: 'Development webhook (ngrok)',
  wranglerPort: 8787,
  ngrokRegion: 'us' // or 'eu', 'au', 'ap', 'sa', 'jp', 'in'
}
```

### Production Configuration
```javascript
prod: {
  webhookUrl: 'https://my-first-worker.your-subdomain.workers.dev',
  description: 'Production webhook (Cloudflare Workers)',
}
```

### Worker Configuration
```javascript
// Update these functions with your actual values
export function getWorkerName() {
  return 'my-first-worker'; // Your actual worker name from wrangler.jsonc
}

export function getWorkerUrl() {
  const workerName = getWorkerName();
  return `https://${workerName}.your-subdomain.workers.dev`; // Your actual subdomain
}
```

## Step 3: Get Your Bot Token

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create a new bot or get the token for an existing bot
3. Copy the token and add it to your `.env` file

## Step 4: Get Your OpenAI API Key

1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy the key and add it to your `.env` file

## Step 5: Optional ngrok Setup

For better development experience, you can set up ngrok authentication:

1. Sign up at [ngrok.com](https://ngrok.com)
2. Get your auth token from the dashboard
3. Add it to your `.env` file as `NGROK_AUTH_TOKEN`

## Step 6: Cloudflare Workers Setup

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Update your `wrangler.jsonc` with your worker name and configuration

## Step 7: Test Your Setup

1. Check webhook status:
   ```bash
   npm run webhook:info
   ```

2. Start development:
   ```bash
   npm run dev:full
   ```

3. Deploy to production:
   ```bash
   npm run deploy:prod
   ```

## Troubleshooting

### Bot Token Issues
- Make sure the token is valid and not expired
- Check that the bot is not already in use by another webhook
- Verify the token format (should be numbers:letters)

### ngrok Issues
- Install ngrok globally: `npm install -g ngrok`
- Check if your firewall is blocking ngrok
- Try different regions if one doesn't work

### Cloudflare Workers Issues
- Make sure you're logged in: `npx wrangler login`
- Check your account has Workers enabled
- Verify your worker name is unique

### Webhook Issues
- Make sure the URL is accessible from the internet
- Check that your bot can receive webhooks
- Verify the webhook URL is using HTTPS 