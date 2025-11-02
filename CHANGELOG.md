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
