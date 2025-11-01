# Security Policy

## Supported Versions

We actively support the latest version of the project. Security updates will be prioritized for the current release.

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| < Latest | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, please report it privately:

### How to Report

1. **Email**: Send details to [security contact email - UPDATE THIS]
2. **Include in your report**:
   - Description of the vulnerability
   - Steps to reproduce (if applicable)
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- You will receive an acknowledgment within 48 hours
- We will investigate and provide updates on progress
- We will notify you when the vulnerability is resolved
- We will credit you in the security advisories (unless you prefer anonymity)

### Disclosure Policy

- We will address confirmed vulnerabilities promptly
- Security fixes will be released as soon as possible
- We will publish security advisories for resolved issues
- We follow responsible disclosure practices

## Security Best Practices

For users of this project:

### Environment Variables & Secrets

- **Never commit secrets** to version control
- Use Cloudflare Workers secrets: `wrangler secret put SECRET_NAME`
- Store local secrets in `.env.local` (already in `.gitignore`)
- Rotate API keys if they may have been exposed

### API Keys & Tokens

- Keep Telegram bot tokens secure
- Protect OpenAI API keys
- Use environment-specific configurations
- Regularly audit and rotate credentials

### Dependencies

- Keep dependencies up to date
- Review dependency updates from Dependabot
- Run `pnpm audit` regularly to check for vulnerabilities
- Report any security issues found in dependencies

### Deployment

- Verify webhook URLs before switching environments
- Remove temporary ngrok URLs from production
- Double-check deployment scripts before running
- Monitor for unusual bot activity

## Security Updates

We actively monitor for:

- Dependency vulnerabilities (via Dependabot)
- Security advisories from Node.js, TypeScript, and other dependencies
- Cloudflare Workers security updates
- Telegram Bot API security notices

## Questions?

If you have security-related questions that are not vulnerabilities, please open a regular issue with the `security` label.
