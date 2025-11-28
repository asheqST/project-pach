# Contributing to MCP Flow

Thank you for your interest in contributing to MCP Flow! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Git

### Setting Up Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-flow.git
   cd mcp-flow
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

### Building the Project

```bash
npm run build
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

## Development Workflow

### Branch Naming

- **Features**: `feature/description-of-feature`
- **Bug Fixes**: `fix/description-of-bug`
- **Documentation**: `docs/description-of-change`
- **Performance**: `perf/description-of-improvement`
- **Refactoring**: `refactor/description-of-refactor`

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semi-colons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(session): add Redis storage adapter
fix(wizard): await validation retry prompts
docs(readme): update installation instructions
test(protocol): add security tests for HMAC
```

## Pull Request Process

1. **Update your fork** with the latest changes from upstream:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/mcp-flow.git
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure all tests pass**:
   ```bash
   npm test
   npm run build
   npm run lint
   ```

3. **Update documentation** if you're changing functionality

4. **Add tests** for new features or bug fixes

5. **Submit your pull request**:
   - Use a clear, descriptive title
   - Reference any related issues (e.g., "Fixes #123")
   - Describe what changed and why
   - Include screenshots for UI changes
   - List any breaking changes

6. **Address review feedback**:
   - Make requested changes in new commits
   - Push updates to your branch
   - Respond to reviewer comments

7. **Squash commits** (if requested) before merging

## Coding Standards

### TypeScript Guidelines

- **Use TypeScript strict mode** - all code must pass strict type checking
- **No `any` types** - use proper types or `unknown` with type guards
- **Explicit return types** on public APIs
- **Use interfaces over type aliases** for object shapes
- **Prefer `const` and `readonly`** where applicable

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check linting
npm run lint

# Format code
npm run format
```

### File Organization

```
src/
├── protocol/       # Protocol types and utilities
├── session/        # Session management
├── server/         # Server implementation
├── client/         # Client implementation
└── patterns/       # Reusable interaction patterns
```

### Naming Conventions

- **Classes**: PascalCase (e.g., `InteractiveServer`)
- **Interfaces**: PascalCase (e.g., `SessionState`)
- **Functions/Methods**: camelCase (e.g., `createSession`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_SESSION_TIMEOUT`)
- **Files**: kebab-case (e.g., `interactive-server.ts`)

## Testing Guidelines

### Test Coverage

- Maintain **80%+ code coverage** for all changes
- Write tests for:
  - New features
  - Bug fixes
  - Edge cases
  - Error conditions

### Test Structure

```typescript
describe('FeatureName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = ...;

      // Act
      const result = ...;

      // Assert
      expect(result).toBe(...);
    });
  });
});
```

### Test Types

1. **Unit Tests**: Test individual functions/classes in isolation
2. **Integration Tests**: Test interactions between components
3. **Security Tests**: Test for vulnerabilities (HMAC, input validation, etc.)

## Documentation

### Code Documentation

- Add JSDoc comments to all public APIs
- Include examples in documentation where helpful
- Document parameters, return types, and exceptions

```typescript
/**
 * Creates a new interactive session
 *
 * @param toolName - Name of the tool to execute
 * @param params - Optional parameters for the tool
 * @returns Promise resolving to session ID
 * @throws {SessionError} If session creation fails
 *
 * @example
 * ```typescript
 * const sessionId = await server.createSession('booking');
 * ```
 */
async createSession(toolName: string, params?: object): Promise<SessionId>
```

### README Updates

Update the README.md if you:
- Add new features
- Change public APIs
- Modify installation/setup procedures

### Documentation Files

Update relevant documentation in `docs/`:
- `ARCHITECTURE.md` - For architectural changes
- `MIGRATION.md` - For breaking changes
- `PROTOCOL.md` - For protocol modifications
- `VALIDATION.md` - For validation/testing changes

## Security

### Reporting Vulnerabilities

Please refer to [SECURITY.md](SECURITY.md) for information on reporting security vulnerabilities.

### Security Best Practices

- Never commit secrets or credentials
- Use cryptographically secure random generation
- Validate all user inputs
- Use HMAC for token signing
- Follow principle of least privilege

## Questions or Need Help?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues and discussions first

## License

By contributing to MCP Flow, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to MCP Flow! 🎉