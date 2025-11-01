# Integration Tests for Telegram Bot

This directory contains integration tests that verify the Telegram bot works end-to-end by sending real messages and verifying responses.

## Overview

Integration tests send real messages to your Telegram bot using the Telegram Bot API and verify that:
- The worker receives webhook updates correctly
- The bot processes messages and commands
- Error handling works as expected
- The bot responds appropriately

## Prerequisites

1. **Test Telegram Bot**: You need a Telegram bot token for testing
   - Use [@BotFather](https://t.me/botfather) to create or get your bot token
   - Keep this separate from your production bot if possible

2. **Deployed Cloudflare Worker Preview**: 
   - Deploy your worker to a preview environment using `wrangler deploy`
   - Get the preview worker URL (e.g., `https://your-worker.your-subdomain.workers.dev`)

3. **Test Chat**: 
   - A private chat or group where the bot is added
   - You'll need the Chat ID (see "Getting Chat ID" below)

4. **Webhook Configuration**:
   - The preview worker must have its webhook configured to receive updates from Telegram
   - Use the `webhook:set-dev` or similar script to configure the webhook

## Environment Variables

Create a `.env` file or set these environment variables before running integration tests:

```bash
# Required
INTEGRATION_BOT_TOKEN=your_bot_token_here
INTEGRATION_CHAT_ID=your_chat_id_here
INTEGRATION_WORKER_URL=https://your-worker.your-subdomain.workers.dev

# Optional
INTEGRATION_TEST_TIMEOUT=60000  # Timeout in milliseconds (default: 60000)
```

### Getting Your Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` or use an existing bot
3. Copy the bot token provided
4. Set it as `INTEGRATION_BOT_TOKEN`

### Getting Chat ID

There are several ways to get your Chat ID:

**Method 1: Using a Telegram Bot**
1. Send a message to [@userinfobot](https://t.me/userinfobot)
2. It will reply with your user ID (for private chats)

**Method 2: Using Telegram API**
1. Start a chat with your bot
2. Send a message to your bot
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Look for `"chat":{"id":123456789}` in the response
5. For group chats, add the bot to the group and send a message, then check getUpdates

**Method 3: Using a Test Script**
```bash
# Create a test script to get updates
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

**Method 4: Forward Message Method**
1. In a group chat, forward a message to [@getidsbot](https://t.me/getidsbot)
2. It will show the chat ID

For **group chats**, the Chat ID is usually a negative number (e.g., `-1001234567890`).

### Getting Worker Preview URL

1. Deploy your worker with preview:
   ```bash
   wrangler deploy
   ```
2. The output will show the preview URL, or check your Cloudflare dashboard
3. The URL format is usually: `https://your-worker-name.your-subdomain.workers.dev`

## Setup Instructions

### 1. Configure Webhook

Before running integration tests, ensure the webhook is set for your preview worker:

```bash
# Using the setup script
pnpm webhook:set-dev

# Or manually using curl
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-worker-url.workers.dev"}'
```

### 2. Set Environment Variables

Create a `.env` file in the project root or export variables:

```bash
export INTEGRATION_BOT_TOKEN="your_token"
export INTEGRATION_CHAT_ID="your_chat_id"
export INTEGRATION_WORKER_URL="https://your-worker.workers.dev"
```

### 3. Run Integration Tests

```bash
# Run all integration tests
pnpm test:integration

# Or using vitest directly
TEST_INTEGRATION=true pnpm vitest run test/integration

# Run a specific test file
TEST_INTEGRATION=true pnpm vitest run test/integration/message.test.ts

# Run with watch mode
TEST_INTEGRATION=true pnpm vitest watch test/integration
```

## Test Structure

### Direct Webhook Testing
Tests that send Telegram Update objects directly to the worker webhook:
- Verifies webhook handling
- Tests error cases
- Validates response codes

### Real Telegram API Testing  
Tests that use the actual Telegram Bot API:
- Sends messages via `sendMessage`
- Verifies message delivery
- Tests command processing

### Message Processing Verification
Tests that verify the bot processes updates correctly:
- Sequential message handling
- Bot message filtering
- Processing time verification

## Test Isolation

Tests include markers and delays to:
- Avoid rate limiting
- Provide test boundaries in chat history
- Prevent test interference

## Limitations

1. **Bot Reply Verification**: Since the bot uses webhooks, directly verifying bot replies via `getUpdates` requires temporarily removing the webhook. The tests currently:
   - Verify webhook processing succeeds
   - Verify messages are sent correctly
   - Check worker response codes

2. **Rate Limiting**: Telegram has rate limits. Tests include delays to avoid hitting limits.

3. **Test Data**: Tests may create messages in your test chat. Use a dedicated test chat/group.

## Troubleshooting

### Tests Fail with "Missing required environment variable"
- Ensure all required environment variables are set
- Check that variable names match exactly (case-sensitive)

### Tests Fail with "Failed to send message"
- Verify your bot token is correct
- Check that the bot is added to the test chat
- Ensure you have permission to send messages

### Tests Fail with "Worker not accessible"
- Verify the worker URL is correct
- Check that the worker is deployed
- Ensure the worker is accessible (not behind authentication)

### Webhook Not Receiving Updates
- Verify webhook is set: `pnpm webhook:info`
- Check webhook URL matches your worker URL
- Ensure worker is deployed and running

### Bot Not Responding
- Check worker logs in Cloudflare dashboard
- Verify bot has necessary permissions in the chat
- Check that the bot is not blocked

## CI/CD Integration

To run integration tests in CI/CD:

1. Set environment variables in your CI/CD platform
2. Ensure the preview worker is deployed
3. Configure webhook for the preview environment
4. Run: `pnpm test:integration`

Example GitHub Actions:
```yaml
- name: Run Integration Tests
  env:
    INTEGRATION_BOT_TOKEN: ${{ secrets.INTEGRATION_BOT_TOKEN }}
    INTEGRATION_CHAT_ID: ${{ secrets.INTEGRATION_CHAT_ID }}
    INTEGRATION_WORKER_URL: ${{ secrets.INTEGRATION_WORKER_URL }}
  run: pnpm test:integration
```

## Best Practices

1. **Separate Test Bot**: Use a dedicated bot for testing
2. **Dedicated Test Chat**: Use a private chat or dedicated test group
3. **Clean Test Data**: Clear test messages periodically
4. **Monitor Rate Limits**: Add delays between tests
5. **Verify Worker State**: Ensure worker is deployed before tests

## Additional Resources

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [Wrangler Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Vitest Documentation](https://vitest.dev/)

