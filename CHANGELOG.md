# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Import extraction for ESM, CommonJS, TypeScript (`import type`, `import x = require()`), dynamic `import()`, `require.resolve`, re-exports and `jest.mock`, with a comment/string-aware lexer.
- Usage outside code: package.json scripts (via each dependency's `bin`), ESLint/Babel/Prettier/Jest/commitlint/TypeScript config files, `@types/*` pairing, `typescript` when a tsconfig exists.
- Production vs development files (tests, fixtures, scripts, config files), with configurable globs.
- Rules: missing-dependency, dev-dependency-in-production, unused-dependency, missing-dev-dependency, duplicate-declaration, unused-dev-dependency, builtin-shadowed, types-in-dependencies.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
