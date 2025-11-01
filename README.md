# Telegram Bot - Cloudflare Workers

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-orange.svg)](https://pnpm.io/)

A Telegram bot built with Telegraf and OpenAI GPT-4 API, deployed on Cloudflare Workers. The bot provides AI-powered conversational responses with session management, multimedia support, and customizable behavior.

## Overview

This project is a Telegram bot that leverages OpenAI's GPT-4 API to simulate engaging conversations with users. The bot is designed to respond to user messages with AI-generated text, emojis, or reaction stickers based on the interpreted context of conversations.

## Features

- **AI-Powered Responses:** Utilizing OpenAI's GPT-4 API to generate human-like text responses based on conversation history
- **Session Management:** Maintains conversation history for users, storing and retrieving the last 50 messages for context
- **Multimedia Interaction:** Supports sending text responses, emojis, and reaction stickers
- **Customizable Bot Behavior:** Adjustable personalities and responses based on defined parameters
- **Embedding-Based Memory:** Uses vector embeddings for relevant message retrieval
- **User Balance System:** Integrated coin/balance system for usage tracking
- **Admin Panel:** Web-based admin interface for managing sessions and users
- **Cloudflare D1 Database:** Persistent storage for users and session data

## Prerequisites

- **Node.js** v22 or higher (see [.nvmrc](.nvmrc))
- **pnpm** package manager (v9+)
- A **Telegram Bot Token** (generated via [BotFather](https://t.me/botfather) on Telegram)
- An **OpenAI API Key**
- **Cloudflare Account** with Workers and D1 enabled
- **Wrangler CLI** (installed via dependencies)

## Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/yourusername/my-first-worker.git
   cd my-first-worker
   ```

2. **Install Dependencies:**

   ```bash
   pnpm install
   ```

3. **Set Environment Variables:**

   Create a `.env.local` file in the root of the project:

   ```plaintext
   API_KEY=your_openai_api_key
   BOT_TOKEN=your_telegram_bot_token
   ```

4. **Configure Cloudflare:**

   - Set up D1 database (see [D1_SETUP.md](D1_SETUP.md))
   - Configure KV namespace in `wrangler.jsonc`
   - Set secrets: `wrangler secret put BOT_TOKEN` and `wrangler secret put API_KEY`

## Development

### Available Scripts

- `pnpm dev` - Run the worker with Wrangler hot reload
- `pnpm dev:local` - Execute `src/local-test.ts` with `.env.local` to mimic Telegram locally
- `pnpm dev:full` - Start the full ngrok + Wrangler loop for webhook testing
- `pnpm test` - Run Vitest test suite
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Run ESLint with auto-fix
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting
- `pnpm deploy` - Deploy to Cloudflare Workers (preview)
- `pnpm deploy:prod` - Deploy to production
- `pnpm webhook:set-dev` - Set webhook to development URL
- `pnpm webhook:set-prod` - Set webhook to production URL
- `pnpm webhook:info` - Get current webhook information

### Local Development

```bash
# Start development server
pnpm dev

# For full webhook setup (requires ngrok)
pnpm dev:full
```

For more details on webhook setup, see [scripts/README.md](scripts/README.md).

## Project Structure

```
src/
├── api/                    # API endpoints (sessions, auth)
├── bot/                    # Bot core logic
│   ├── createBot.ts       # Bot initialization
│   ├── messageHandler.ts   # Message processing
│   ├── messageBuilder.ts  # Message construction
│   ├── responseDispatcher.ts
│   └── ...
├── commands/               # Telegram bot commands
│   ├── help.ts
│   ├── chatSettings.ts
│   └── ...
├── service/                # Business logic services
│   ├── SessionController.ts
│   ├── UserService.ts
│   └── EmbeddingService.ts
├── constants/              # Constants and configurations
├── gpt.ts                  # OpenAI API integration
├── index.ts                # Cloudflare Worker entry point
├── types.ts                # TypeScript type definitions
└── utils.ts                # Utility functions
```

For detailed project structure and guidelines, see [AGENTS.md](AGENTS.md).

## How It Works

1. **Message Reception**: The bot listens for incoming messages through a webhook endpoint
2. **Session Management**: For each chat, the bot retrieves conversation history and maintains context
3. **AI Communication**: When a user sends a message, the bot constructs a prompt and requests a response from OpenAI's API
4. **Response Handling**: The bot processes the API response (text, emojis, reactions) and replies accordingly
5. **Memory Storage**: Messages are embedded and stored for relevant context retrieval

## Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test --watch
```

Tests are located in the `test/` directory and mirror the `src/` structure. See [AGENTS.md](AGENTS.md) for testing guidelines.

## Code Quality

This project uses:

- **TypeScript** with strict mode
- **ESLint** for linting
- **Prettier** for code formatting
- **Husky** for git hooks
- **lint-staged** for pre-commit checks

All code is automatically formatted and linted on commit.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Code style and conventions
- Testing requirements
- Pull request process
- Development workflow

## Documentation

- [AGENTS.md](AGENTS.md) - Repository guidelines and coding standards
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [SECURITY.md](SECURITY.md) - Security policy
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [scripts/README.md](scripts/README.md) - Scripts documentation
- [D1_SETUP.md](D1_SETUP.md) - Database setup guide

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Security

For security-related issues, please see [SECURITY.md](SECURITY.md). **Never commit secrets or API keys to version control.**

## Acknowledgments

- **OpenAI** - For providing the GPT-4 API
- **Telegraf** - For simplifying Telegram Bot API interaction
- **Cloudflare** - For Workers platform and D1 database

## Support

- 📖 Check the [documentation](AGENTS.md)
- 🐛 Report bugs via [GitHub Issues](https://github.com/yourusername/my-first-worker/issues)
- 💡 Suggest features via [GitHub Issues](https://github.com/yourusername/my-first-worker/issues)
