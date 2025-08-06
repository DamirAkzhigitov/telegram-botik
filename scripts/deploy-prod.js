#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getBotToken() {
  try {
    if (process.env.BOT_TOKEN) {
      return process.env.BOT_TOKEN;
    }
    
    const envPath = join(__dirname, '..', '.env');
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf8');
      const match = envContent.match(/BOT_TOKEN=([^\n]+)/);
      if (match) {
        return match[1];
      }
    }
    
    throw new Error('BOT_TOKEN not found in environment variables or .env files');
  } catch (error) {
    console.error('Error getting bot token:', error.message);
    process.exit(1);
  }
}

async function getWorkerUrl() {
  try {
    // Read wrangler config to get worker name
    const wranglerConfigPath = join(__dirname, '..', 'wrangler.jsonc');
    if (!existsSync(wranglerConfigPath)) {
      throw new Error('wrangler.jsonc not found');
    }
    
    const configContent = readFileSync(wranglerConfigPath, 'utf8');
    const nameMatch = configContent.match(/"name":\s*"([^"]+)"/);
    
    if (!nameMatch) {
      throw new Error('Worker name not found in wrangler.jsonc');
    }
    
    const workerName = nameMatch[1];
    return `https://${workerName}.your-subdomain.workers.dev`;
  } catch (error) {
    console.error('Error getting worker URL:', error.message);
    process.exit(1);
  }
}

async function deployWorker() {
  console.log('🚀 Deploying to Cloudflare Workers...');
  
  try {
    execSync('npx wrangler deploy', {
      stdio: 'inherit',
      cwd: join(__dirname, '..')
    });
    console.log('✅ Worker deployed successfully');
    return true;
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    return false;
  }
}

async function setWebhook(token, webhookUrl) {
  try {
    console.log(`🔗 Setting webhook to: ${webhookUrl}`);
    
    const response = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: true
    });
    
    if (response.data.ok) {
      console.log('✅ Webhook set successfully');
      return true;
    } else {
      console.error('❌ Failed to set webhook:', response.data.description);
      return false;
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error.message);
    return false;
  }
}

async function testWebhook(webhookUrl) {
  try {
    console.log('🧪 Testing webhook endpoint...');
    
    const response = await axios.get(webhookUrl, {
      timeout: 10000
    });
    
    if (response.status === 405) {
      console.log('✅ Webhook endpoint is working (Method Not Allowed is expected for GET requests)');
      return true;
    } else {
      console.log(`⚠️  Unexpected response: ${response.status}`);
      return false;
    }
  } catch (error) {
    if (error.response && error.response.status === 405) {
      console.log('✅ Webhook endpoint is working (Method Not Allowed is expected for GET requests)');
      return true;
    } else {
      console.error('❌ Webhook endpoint test failed:', error.message);
      return false;
    }
  }
}

async function getBotInfo(token) {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
    
    if (response.data.ok) {
      const bot = response.data.result;
      console.log(`🤖 Bot: @${bot.username} (${bot.first_name})`);
      console.log(`📝 ID: ${bot.id}`);
      return bot;
    } else {
      console.error('❌ Failed to get bot info:', response.data.description);
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting bot info:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting production deployment...\n');
  
  try {
    // Get bot token
    const token = await getBotToken();
    
    // Get bot info
    const botInfo = await getBotInfo(token);
    if (!botInfo) {
      throw new Error('Failed to get bot info');
    }
    
    // Deploy worker
    const deployed = await deployWorker();
    if (!deployed) {
      throw new Error('Deployment failed');
    }
    
    // Get worker URL
    const workerUrl = await getWorkerUrl();
    
    // Test webhook endpoint
    const webhookTested = await testWebhook(workerUrl);
    if (!webhookTested) {
      console.log('⚠️  Webhook endpoint test failed, but continuing...');
    }
    
    // Set webhook
    const webhookSet = await setWebhook(token, workerUrl);
    if (!webhookSet) {
      throw new Error('Failed to set webhook');
    }
    
    console.log('\n🎉 Production deployment completed successfully!');
    console.log(`📱 Bot: @${botInfo.username}`);
    console.log(`🔗 Webhook: ${workerUrl}`);
    console.log('\nYour bot is now live in production! 🚀');
    
  } catch (error) {
    console.error('❌ Production deployment failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error); 