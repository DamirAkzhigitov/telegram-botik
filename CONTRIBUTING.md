# Contributing

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** and clone your fork locally
2. **Install dependencies**: `pnpm install`
3. **Read the guidelines**: See [AGENTS.md](AGENTS.md) for coding standards and project structure
4. **Create a branch**: Create a feature branch from `main` or `dev`

## Development Workflow

### Before You Start

- Check existing issues and pull requests to avoid duplicate work
- If you're working on a new feature, consider opening an issue first to discuss it
- Ensure you have the required Node.js version (see `.nvmrc` or README)

### Making Changes

1. **Follow coding standards**:

   - Use TypeScript with strict mode enabled
   - Follow the naming conventions in [AGENTS.md](AGENTS.md)
   - Use Prettier for formatting (runs automatically on commit)
   - Write clear, descriptive commit messages

2. **Write tests**:

   - Add tests for new features in `test/` directory
   - Follow the naming pattern `*.test.ts`
   - Maintain or improve test coverage
   - Run tests with `pnpm test` or `pnpm test:coverage`

3. **Code quality checks**:
   - Run `pnpm typecheck` to verify TypeScript types
   - Run `pnpm lint` to check for linting errors
   - Run `pnpm format:check` to verify formatting
   - Fix any errors before committing

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) format for commit messages to enable automatic versioning and changelog generation.

**Commit Message Format:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: A new feature (triggers minor version bump)
- `fix`: A bug fix (triggers patch version bump)
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring without changing functionality
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates, etc.
- `ci`: CI/CD configuration changes
- `build`: Build system or external dependencies changes

**Breaking Changes:**
To trigger a major version bump, include `BREAKING CHANGE:` in the footer:

```
feat(api): add new authentication method

BREAKING CHANGE: Old auth tokens are no longer supported
```

**Examples:**

- `feat: add history management system`
- `fix(bot): resolve memory leak in session handling`
- `feat(commands): add new sticker command`
- `fix(api): handle edge case in message parsing (#123)`
- `chore: update dependencies`

**Guidelines:**

- Use clear, imperative commit messages
- Reference issues when applicable: `fix: resolve memory leak (#123)`
- Keep commits focused and atomic
- Pre-commit hooks will automatically format and lint your code

### Pull Requests

1. **Before submitting**:

   - Ensure all tests pass: `pnpm test`
   - Run type checking: `pnpm typecheck`
   - Run linting: `pnpm lint`
   - Update documentation if needed
   - Add a clear description of changes

2. **PR Checklist**:

   - [ ] Code follows project style guidelines
   - [ ] Tests added/updated and passing
   - [ ] Documentation updated (if applicable)
   - [ ] No new linting or type errors
   - [ ] Secrets/config changes flagged for reviewers

3. **PR Description should include**:
   - Summary of changes
   - Verification steps or commands run
   - Screenshots for user-facing changes (if applicable)
   - Linked issues (if applicable)

## Project Structure

See [AGENTS.md](AGENTS.md) for detailed information about:

- Project structure and module organization
- Coding style and naming conventions
- Testing guidelines
- Security and configuration tips

## Code Style

- **TypeScript**: Strict mode enabled, ES2022 modules
- **Formatting**: Prettier (2-space indent, single quotes)
- **Exports**: Named exports preferred, barrel exports in `src/commands/index.ts`
- **Naming**: camelCase for identifiers, kebab-case for scripts, SCREAMING_SNAKE_CASE for env constants

## Testing

- Tests live in `test/` directory mirroring `src/` structure
- Use Vitest with Cloudflare Workers shims
- Mock external APIs (OpenAI, Telegram) in tests
- Aim for good coverage of command flows and session persistence

## Questions?

If you have questions or need help, please:

- Open an issue with the `question` label
- Check existing documentation in the repository
- Review [AGENTS.md](AGENTS.md) for project-specific guidelines

Thank you for contributing!
