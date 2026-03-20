# Telegram Bot Webhook Setup Scripts

This directory contains scripts to manage webhook setup and environment switching for your Telegram bot.

## Prerequisites

1. **Bot Token**: Make sure your bot token is available in one of these locations:

   - Environment variable: `BOT_TOKEN`
   - `.env` file: `BOT_TOKEN=your_bot_token_here`
   - `.env.local` file: `BOT_TOKEN=your_bot_token_here`

2. **cloudflared** (for development): Install Cloudflare Tunnel CLI so Telegram can reach `localhost:8787`

   ```bash
   # Debian/Ubuntu example; see https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   sudo apt install cloudflared
   # or: brew install cloudflare/cloudflare/cloudflared
   ```

3. **Cloudflare Workers**: Make sure you're logged in to Cloudflare Workers
   ```bash
   npx wrangler login
   ```

## Configuration

1. **Development webhook URL**: Set **`DEV_WEBHOOK_URL`** (or `CLOUDFLARE_TUNNEL_URL`) in `.env` to the **HTTPS** URL printed by `pnpm serve` (quick tunnel to `http://localhost:8787`). See `.env.example`.
2. **Production webhook URL**: Update `prod.webhookUrl` in `scripts/config.js` to your deployed Workers URL (or keep in sync with Wrangler).
3. Optional: adjust `getWorkerName()` / `getWorkerUrl()` in `scripts/config.js` if you use those helpers elsewhere.

## Available Scripts

### Development Environment

#### Development flow (two terminals)

1. **Terminal A** — Wrangler dev (worker on `http://localhost:8787`):

   ```bash
   pnpm dev
   ```

2. **Terminal B** — Quick tunnel (URL changes each run unless you use a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/run-tunnel/trycloudflare/)):

   ```bash
   pnpm serve
   ```

   Copy the `https://….trycloudflare.com` (or your named tunnel URL).

3. Put that URL in **`.env`**: `DEV_WEBHOOK_URL=https://…`
4. Point Telegram at it:

   ```bash
   pnpm webhook:set-dev
   ```

If the tunnel restarts and the hostname changes, update `DEV_WEBHOOK_URL` and run `pnpm webhook:set-dev` again.

#### Manual Webhook Management

```bash
# Set webhook to development (reads DEV_WEBHOOK_URL from env / .env)
pnpm webhook:set-dev
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
- `DEV_WEBHOOK_URL` or `CLOUDFLARE_TUNNEL_URL`: HTTPS URL of your dev tunnel (required for `pnpm webhook:set-dev`)

## Usage Examples

### Starting Development

```bash
# Terminal 1
pnpm dev
# Terminal 2 — copy https URL into DEV_WEBHOOK_URL, then:
pnpm serve
pnpm webhook:set-dev
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

2. **cloudflared not found**

   - Install the Cloudflare Tunnel client (`cloudflared`) — see Cloudflare docs for your OS.

3. **Webhook URL not accessible**

   - For development: `pnpm dev` must be running on :8787 and `pnpm serve` must show a reachable `https://` URL; update `DEV_WEBHOOK_URL` whenever the quick-tunnel hostname changes.
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
