# Telegram Bot Webhook Setup Scripts

This directory contains scripts to manage webhook setup and environment switching for your Telegram bot.

## Prerequisites

1. **Bot Token**: Make sure your bot token is available in one of these locations:
   - Environment variable: `BOT_TOKEN`
   - `.env` file: `BOT_TOKEN=your_bot_token_here`
   - `.env.local` file: `BOT_TOKEN=your_bot_token_here`

2. **ngrok** (for development): Install ngrok for local development tunneling
   ```bash
   npm install -g ngrok
   # or download from https://ngrok.com/download
   ```

3. **Cloudflare Workers**: Make sure you're logged in to Cloudflare Workers
   ```bash
   npx wrangler login
   ```

## Configuration

Before using the scripts, update the configuration in `scripts/config.js`:

1. **Development webhook URL**: Update the ngrok URL in the `dev.webhookUrl` field
2. **Production webhook URL**: Update your Cloudflare Workers URL in the `prod.webhookUrl` field
3. **Worker name**: Update the worker name in the `getWorkerName()` function
4. **Subdomain**: Update the subdomain in the `getWorkerUrl()` function

## Available Scripts

### Development Environment

#### Full Development Setup
```bash
npm run dev:full
```
This script will:
- Check if ngrok is installed and install it if needed
- Start an ngrok tunnel to your local Wrangler dev server
- Set the webhook to the ngrok URL
- Start the Wrangler development server
- Clean up everything when you stop the process (Ctrl+C)

#### Manual Webhook Management
```bash
# Set webhook to development (ngrok)
npm run webhook:set-dev

# Switch to development mode (delete current + set dev)
npm run webhook:switch-dev
```

### Production Environment

#### Full Production Deployment
```bash
npm run deploy:prod
```
This script will:
- Deploy your worker to Cloudflare Workers
- Test the webhook endpoint
- Set the webhook to your production URL
- Display bot information

#### Manual Webhook Management
```bash
# Set webhook to production
npm run webhook:set-prod

# Switch to production mode (delete current + set prod)
npm run webhook:switch-prod
```

### General Webhook Management

```bash
# Delete current webhook
npm run webhook:delete

# Get current webhook information
npm run webhook:info
```

## Environment Variables

The scripts will look for these environment variables:

- `BOT_TOKEN`: Your Telegram bot token
- `API_KEY`: Your OpenAI API key (for bot functionality)
- `NGROK_AUTH_TOKEN`: Your ngrok auth token (optional, for authenticated tunnels)

## Usage Examples

### Starting Development
```bash
# Start full development environment
npm run dev:full
```

### Deploying to Production
```bash
# Deploy and set up production webhook
npm run deploy:prod
```

### Switching Between Environments
```bash
# Switch from production to development
npm run webhook:switch-dev

# Switch from development to production
npm run webhook:switch-prod
```

### Checking Webhook Status
```bash
# Check current webhook configuration
npm run webhook:info
```

## Troubleshooting

### Common Issues

1. **Bot token not found**
   - Make sure your bot token is in the environment or .env files
   - Check that the token is valid

2. **ngrok not working**
   - Install ngrok globally: `npm install -g ngrok`
   - Or download from https://ngrok.com/download
   - Make sure you're not behind a restrictive firewall

3. **Webhook URL not accessible**
   - For development: Make sure ngrok is running and the URL is correct
   - For production: Make sure your Cloudflare Worker is deployed and accessible

4. **Deployment fails**
   - Make sure you're logged in to Cloudflare Workers: `npx wrangler login`
   - Check your wrangler.jsonc configuration
   - Verify your Cloudflare account has Workers enabled

### Debugging

Use the webhook info command to check the current state:
```bash
npm run webhook:info
```

This will show you:
- Current webhook URL
- Webhook status
- Last error (if any)
- Pending updates count

## Security Notes

- Never commit your bot token to version control
- Use environment variables or .env files for sensitive data
- The .env files should be in your .gitignore
- Consider using Cloudflare Workers secrets for production environment variables

## File Structure

```
scripts/
├── README.md           # This file
├── config.js           # Configuration settings
├── setup-webhook.js    # Webhook management script
├── start-dev.js        # Development environment setup
└── deploy-prod.js      # Production deployment script
``` 