# Contributing to NatureCo CLI

Thank you for your interest in contributing! 🎉

## How to Contribute

### Reporting Bugs

- Check the [issue tracker](https://github.com/natureco-official/natureco-cli/issues) first
- Use the bug report template
- Include reproduction steps, expected vs actual behavior
- Mention your OS, Node.js version, CLI version

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the use case
- Explain why this would be useful

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run lint: `npm run lint`
6. Commit: `git commit -m "feat: add my feature"`
7. Push: `git push origin feature/my-feature`
8. Open a Pull Request

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `chore:` Maintenance
- `refactor:` Code refactor
- `test:` Tests
- `style:` Code style

## Development Setup

```bash
# Clone
git clone https://github.com/natureco-official/natureco-cli.git
cd cli

# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint

# Link for local development
npm link
natureco --version
```

## Code Style

- JavaScript Standard Style
- Use ES modules (`import`/`export`)
- Async/await preferred over callbacks
- JSDoc comments for public APIs

## Testing

- We use [Vitest](https://vitest.dev/)
- All new features need tests
- PRs without tests may be delayed

## License

By contributing, you agree that your contributions will be licensed under MIT.

## Code of Conduct

Be respectful. Be inclusive. Help others. Have fun. 🌿
