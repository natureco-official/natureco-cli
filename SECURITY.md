# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 5.6.x   | Active support     |
| 5.5.x   | Critical fixes only |
| < 5.5   | End of life        |

## Reporting a Vulnerability

If you discover a security vulnerability in NatureCo CLI:

1. **DO NOT** open a public GitHub issue
2. Email: **security@natureco.me**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact

We will respond within **48 hours**.

## Security Best Practices

- **Never commit API keys** — use `.env` files
- **Review** `natureco doctor` output
- **Use Dangerous Command Approval** — enabled by default in v5.6.x
- **Update regularly** — `npm update -g natureco-cli`
