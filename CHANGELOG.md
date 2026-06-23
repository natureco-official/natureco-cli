# Changelog

All notable changes to NatureCo CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.6.45] - 2026-06-23

### Added
- Smart Dangerous Command Approval (🔴 HIGH / 🟡 MEDIUM / 🟢 LOW)
- Tool result path anonymization (`~/` for sensitive paths)
- iMessage slash-prefix system (`/` commands only)
- WhatsApp slash-prefix system
- 8 critical bug fixes:
  - read_file priority (filesystem vs read_file)
  - write_file `~` expansion
  - memory_search found:0 (cross-file scan)
  - grep_search template literal fix
  - git auto-find repo (~/Projects)
  - media_understanding provider check
  - imsg `--to` flag (instead of `--address`)
  - imsg `--text` flag (instead of `--message`)

### Fixed
- is_from_me filter for iMessage inbound
- Echo loop prevention (30s window)
- WhatsApp WhatsApp Baileys QR generation
- iMessage `messages` → `watch` streaming
- Cron 404 errors on MiniMax API
- grep_search memory overflow (5MB limit)

## [5.6.22] - 2026-06-22

### Added
- Inline tool filter (BLOCKED_TOOL_NAMES)
- Tool alias mapping (brave_search → duckduckgo_search)
- Dynamic hard-coded prefix (botName from memory)
- Generic default templates in setup
- Slash commands (REPL): /clear, /bot, /skills, /memory, /help

## [5.6.0] - 2026-06-15

### Added
- Postinstall script (chalk@4 auto-install)
- API key validation (provider-specific test models)
- Reset command (`natureco reset --scope config|memory|sessions|all`)
- Doctor command (`natureco doctor`)
- 12-provider setup wizard
- 200+ model catalog

## [5.5.0] - 2026-06-01

### Added
- 10 messaging platform support (Telegram, Discord, Slack, WhatsApp, iMessage, Signal, Mattermost, IRC, SMS, Webhooks)
- Multi-channel gateway server
- Setup reset wizard

## [5.4.x] - Earlier

### Added
- Code agent (`natureco code`)
- Interactive REPL with 47 tools
- Memory system
- Skill system
- MCP server support
- Web dashboard
- NatureCo Native commands (NatureHub, Medium, SEO, XP)

---

## Types of changes

- `Added` for new features
- `Changed` for changes in existing functionality
- `Deprecated` for soon-to-be removed features
- `Removed` for now-removed features
- `Fixed` for any bug fixes
- `Security` in case of vulnerabilities
