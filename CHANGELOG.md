# Changelog

## 1.0.0 (2026-10-15)

### Added before first publish

- Framework plugins (`--no-plugins` to disable, `plugins` config to pick): Next.js (`react`, `react-dom`), JSX/TSX automatic runtime (`react`, `preact`, `solid-js`), Vite/Vitest (`environment`, coverage provider, browser mode), Jest (`testEnvironment`, presets, transforms in config or package.json), ESLint flat config, Storybook (`.storybook/main` addons and framework), PostCSS plugin objects.
- tsconfig/jsconfig `paths` aliases (following relative `extends`) and `#subpath` imports are no longer reported as packages.
- Workspace packages (npm/yarn `workspaces`, `pnpm-workspace.yaml`) are recognised; missing ones get a `workspace:*` fix.
- `--fix` removes unused dependencies, devDependencies and optionalDependencies from package.json (keeps indentation); `--dry-run` previews. Library: `fixPackageJson(dir, report)`.

### Packaging

- Dual ESM + CommonJS: `import` loads `src/`, `require` loads a bundled `dist/index.cjs`, via package.json `exports`.
- TypeScript declarations are generated from the source (`dist/types`) instead of hand-written.
- CI runs build, tests and a require+import check on Node 18/20/22; releases use `npm publish --provenance`.

First release, by Louis Wright.

- Import extraction for ESM, CommonJS, TypeScript (`import type`, `import x = require()`), dynamic `import()`, `require.resolve`, re-exports and `jest.mock`, with a comment/string-aware lexer.
- Usage outside code: package.json scripts (via each dependency's `bin`), ESLint/Babel/Prettier/Jest/commitlint/TypeScript config files, `@types/*` pairing, `typescript` when a tsconfig exists.
- Production vs development files (tests, fixtures, scripts, config files), with configurable globs.
- Rules: missing-dependency, dev-dependency-in-production, unused-dependency, missing-dev-dependency, duplicate-declaration, unused-dev-dependency, builtin-shadowed, types-in-dependencies.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
