# Security Policy

## Supported versions

| Version | Support |
| --- | --- |
| 6.0.x | Active support |
| 5.71.x | Critical security fixes only |
| < 5.71 | End of life |

Security support follows the latest published minor line. This table is updated as
part of every minor release.

## Reporting a vulnerability

Do not open a public issue for an undisclosed vulnerability. Email
**security@natureco.me** with a description, reproduction steps, affected versions,
and potential impact. We aim to acknowledge reports within 48 hours and will share
status updates until remediation or coordinated disclosure.

Never include live API keys or tokens in issues, logs, screenshots, or chat. Revoke
and rotate any credential that has been disclosed, even if it was only used for a
short-lived test.

## Release controls

Releases run syntax, lint, unit/regression, smoke, provenance, package-integrity,
and dependency-audit gates. Use `.env` or the operating system credential store for
secrets, keep dangerous-command approval enabled, and update the CLI regularly.
