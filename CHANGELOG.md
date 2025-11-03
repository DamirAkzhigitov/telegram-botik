# 1.0.0 (2025-11-03)

### Bug Fixes

- Correctly slice conversation history ([fa8e9b4](https://github.com/DamirAkzhigitov/telegram-botik/commit/fa8e9b4d9f3a0dd258e3091c6f5086e9744308e5))
- Correctly slice conversation history ([#32](https://github.com/DamirAkzhigitov/telegram-botik/issues/32)) ([747b067](https://github.com/DamirAkzhigitov/telegram-botik/commit/747b0676a29303e94c38fd2e6401c5f3573b206a))

### Features

- add Memory interface to types ([8e096f3](https://github.com/DamirAkzhigitov/telegram-botik/commit/8e096f3dc1daf15877f1a3c83c23367dfe17195c))
- add memory management to SessionController ([661c8e3](https://github.com/DamirAkzhigitov/telegram-botik/commit/661c8e3e5b1ac7fb5bd5de6d9a426f067c14f300))
- admin panel ([0b49dde](https://github.com/DamirAkzhigitov/telegram-botik/commit/0b49ddeecaec1f7e033a9cc4e11f5b079384d769))
- admin panel - unit testing ([efaa53c](https://github.com/DamirAkzhigitov/telegram-botik/commit/efaa53c49d25b245b29e4fe1d69ed4325a7b0fc4))
- admin panel - unit testing ([12afd15](https://github.com/DamirAkzhigitov/telegram-botik/commit/12afd15010d6fcb1fc21297d08b13f2e2e1faf3c))
- create SessionController.ts, refactoring ([e0da33f](https://github.com/DamirAkzhigitov/telegram-botik/commit/e0da33fb150d1aff3769d942c60d8ee8c43af2b7))
- create SessionController.ts, refactoring ([85f02c5](https://github.com/DamirAkzhigitov/telegram-botik/commit/85f02c587203abaadde75516c1636b41b400ca53))
- Implement image recognition and integrate with OpenAI ([66cbf86](https://github.com/DamirAkzhigitov/telegram-botik/commit/66cbf86a3240b5bc23900a24271613a040631c91))
- Implement image recognition and integrate with OpenAI ([#16](https://github.com/DamirAkzhigitov/telegram-botik/issues/16)) ([0eff7ce](https://github.com/DamirAkzhigitov/telegram-botik/commit/0eff7cee907ee787aae24f787184bfa6ba8a3376))
- implement memory feature in bot ([ead0e4c](https://github.com/DamirAkzhigitov/telegram-botik/commit/ead0e4ca6fdeef529fcce7fd698abe629cf6e132))
- new history system ([#51](https://github.com/DamirAkzhigitov/telegram-botik/issues/51)) ([d1fe16a](https://github.com/DamirAkzhigitov/telegram-botik/commit/d1fe16a4adc2358f360b43bedf6081838de9fc50))
- semantic release ([3394eab](https://github.com/DamirAkzhigitov/telegram-botik/commit/3394eabeac4f29f9d4832a582911a1badb2e939c))
- update OpenAI client for memory management ([432c970](https://github.com/DamirAkzhigitov/telegram-botik/commit/432c97025d1c0b602f8f3a2a964d0ebf5666de5b))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **History Management System**: New history tracking feature with optional enable/disable via `toggle_history` command
  - `sanitizeHistoryMessages()`: Safely sanitizes conversation history by replacing image inputs with text placeholders for efficient storage
  - `buildAssistantHistoryMessages()`: Converts bot messages to proper format for history storage
  - Conversation history includes both user messages and assistant responses when enabled
- **Automatic Conversation Summarization**: Intelligent summarization system that automatically creates AI-powered summaries
  - When history reaches 20 messages, the bot automatically generates a summary using OpenAI
  - Summaries preserve conversation context while reducing storage overhead
  - Summaries are stored in the embedding service for future context retrieval
  - `createConversationSummary()`: Generates concise summaries (2-3 sentences) of conversations
  - `formatMessagesForSummarization()`: Formats messages for summarization processing
  - `createSummaryMessage()`: Creates summary message entries in conversation history
- History sanitization ensures efficient storage by handling multimedia content appropriately
- ESLint configuration with TypeScript support
- TypeScript type checking script (`pnpm typecheck`)
- LICENSE file (MIT)
- CONTRIBUTING.md with contribution guidelines
- SECURITY.md with security policy
- GitHub issue and pull request templates
- Dependabot configuration for automated dependency updates
- Node version pinning with `.nvmrc`
- Enhanced CI/CD pipeline with type checking, linting, and security audits

### Changed

- Enhanced message handler to conditionally store history based on `toggle_history` setting
- Improved memory and embedding integration with conversation summaries
- History management now properly handles multimedia content (images) in conversation history
- Enhanced package.json with metadata (description, keywords, repository, license)
- Improved README.md structure and accuracy with new history features documented
- Fixed EditorConfig and Prettier configuration consistency

## [0.0.0] - Initial Release

- Initial Telegram bot implementation
- OpenAI GPT-4 integration
- Session management with Cloudflare KV
- Command handlers for bot configuration
- Test suite with Vitest
- Deployment automation scripts
