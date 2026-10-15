# dead-deps-gauge

[![npm version](https://img.shields.io/npm/v/dead-deps-gauge.svg)](https://www.npmjs.com/package/dead-deps-gauge) [![CI](https://github.com/MrLouisWright/dead-deps-gauge/actions/workflows/ci.yml/badge.svg)](https://github.com/MrLouisWright/dead-deps-gauge/actions/workflows/ci.yml) [![Node](https://img.shields.io/node/v/dead-deps-gauge.svg)](https://nodejs.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)

> Find dependencies you declare but never use, and imports that are missing from package.json.

`dead-deps-gauge` reads every JavaScript and TypeScript file in a package, works out which packages each one imports, and compares that with `package.json`. Code that imports something not in `package.json` (and only works through hoisting), production code that needs a package listed only under `devDependencies`, and dependencies nothing uses all fail the build, each with the file and line and the **exact command to fix it**.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. By Louis Wright.

## Features

- **Import extraction** without a parser: `import`/`export … from`, `import type`, side-effect imports, `require`, `require.resolve`, dynamic `import()`, TypeScript `import x = require()`, `jest.mock`/`vi.mock`, and `/// <reference types>` headers. A lexer skips comments, and template literals and strings that hold code samples.
- **More than imports:** binaries run from `package.json` scripts (resolved through each dependency's `bin`, or a table of well-known tools), ESLint/Babel/Prettier/Jest/commitlint/stylelint/TypeScript config files and their short plugin names, `tsconfig` `types`/`extends`/`importHelpers`, `@types/*` paired with the package they type, and tools implied by config files (`tsconfig.json` → `typescript`, `.husky/` → `husky`…).
- **Production vs development:** tests, fixtures, scripts, examples, stories and `*.config.*` files are dev-only. If `package.json` has `"files"`, anything that isn't published is dev-only too. `install`/`postinstall` scripts of published packages count as production.
- **Monorepos:** nested packages are skipped. A workspace root's devDependencies satisfy dev imports inside packages, but production imports must still be declared locally, which catches "works only because it's hoisted" bugs.
- **Output:** text, JSON, SARIF 2.1.0 and Markdown; `--fail-on`; exit codes 0/1/2; allowlist entries with expiry dates.

## Rules

| Rule | Default severity | What it catches |
|---|---|---|
| `missing-dependency` | high | Imported by production code but not declared in package.json |
| `dev-dependency-in-production` | high | Imported by production code but only declared in devDependencies |
| `unused-dependency` | medium | Declared in dependencies but never used |
| `missing-dev-dependency` | medium | Imported by tests/tooling but not declared |
| `duplicate-declaration` | medium | Declared in both dependencies and devDependencies |
| `unused-dev-dependency` | low | Declared in devDependencies but never used |
| `builtin-shadowed` | low | Dependency has the same name as a Node.js built-in module |
| `types-in-dependencies` | low | @types/* in dependencies of a package that ships no types |
| `unused-optional-dependency` | info | Declared in optionalDependencies but never used |
| `allowlist-expired` | medium | Allowlist entry has expired |
| `allowlist-unused` | info | Allowlist entry matched nothing |

## Install and run

```bash
npx dead-deps-gauge                              # scan the current package
npx dead-deps-gauge packages/api --fail-on medium
npx dead-deps-gauge --ignore "generated/**" --ignore-deps "@company/runtime-*"
npx dead-deps-gauge -f json > deps-report.json
```

### Sample output

```text
dead-deps-gauge — fixture-app@1.0.0
6 file(s) scanned; 6 dependencies, 9 devDependencies

HIGH     src/index.js:5 "debug" is used by production code (src/index.js:5) but is only a devDependency [dev-dependency-in-production]
         ↳ fix: Move it to "dependencies" (npm install debug --save-prod), or mark the file as dev-only with "devPaths".
HIGH     src/index.js:7 "dotenv" is used by src/index.js:7 but is not in package.json [missing-dependency]
         ↳ fix: npm install dotenv  (it only works today through hoisting or a transitive install)
MEDIUM   package.json "left-pad" is in dependencies but nothing imports or runs it [unused-dependency]
         ↳ fix: npm uninstall left-pad  (or allowlist it with a reason if it is loaded indirectly)
LOW      package.json "fs" has the same name as the Node.js built-in "fs"; imports resolve to the built-in [builtin-shadowed]
         ↳ fix: Remove it and use "node:fs".
```

## Options

```text
dead-deps-gauge 1.0.0 — find unused dependencies and imports missing from package.json

Usage: dead-deps-gauge [dir] [options]

Scan
      --ignore <globs>       Paths to skip (comma-separated or repeated), e.g. "generated/**"
      --ignore-deps <globs>  Dependencies never to report, e.g. "@company/runtime-*"
      --dev-paths <globs>    Extra globs treated as dev-only (tests, tooling); defaults include test/, scripts/, *.test.*, *.config.*

Common
  -c, --config <file>     JSON config (default: .dead-deps-gauge.json or "deadDepsGauge" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

Some packages are loaded by name at runtime (template engines, framework plugins, `reflect-metadata`). List them in `ignoreDeps`, or allowlist them with a reason so the exception is documented.

## Configuration and allowlist

Options can live in `.dead-deps-gauge.json` (or a `"deadDepsGauge"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": { "unused-dev-dependency": "low" },
  "allowlist": [
    { "rule": "unused-dependency", "subject": "reflect-metadata", "reason": "Loaded by the framework at runtime", "expires": "2027-03-31" }
  ],
  "ignoreDeps": ["@company/runtime-*"],
  "ignore": ["generated/**"],
  "devPaths": ["tools/**"]
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

`prodPaths` (globs) forces files to count as production even if they match a dev pattern.

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  dead-deps-gauge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - uses: MrLouisWright/dead-deps-gauge@v1
        with:
          fail-on: high
          sarif: dead-deps-gauge.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: dead-deps-gauge.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Project directory | `.` |
| `ignore` | Comma-separated path globs to skip | `` |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, extractImports, packageName } from 'dead-deps-gauge';
const report = check('.', { ignoreDeps: ['reflect-metadata'] });
extractImports("import x from 'lodash/fp'"); // [{ spec: 'lodash/fp', line: 1, typeOnly: false }]
packageName('lodash/fp');                    // 'lodash'
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Credit (optional)

Free to use under MIT, no attribution required. If dead-deps-gauge helps you, a link back is appreciated:

```html
<a href="https://louiswright.co.uk">Built with dead-deps-gauge by Louis Wright</a>
```

```markdown
[![Built with dead-deps-gauge by Louis Wright](https://img.shields.io/badge/built%20with-dead--deps--gauge-blue)](https://louiswright.co.uk)
```

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))

## Framework plugins, aliases and `--fix`

Frameworks load packages that no `import` mentions. Built-in plugins understand them, so they are not reported as unused:

| Plugin | What it reads |
|---|---|
| next | `next` implies `react` and `react-dom` |
| jsx | `.jsx`/`.tsx` files use `react`, `preact` or `solid-js` through the automatic JSX runtime |
| vite | `vite.config.*` / `vitest.config.*`: `environment: 'jsdom' \| 'happy-dom'`, `coverage.provider`, browser mode |
| jest | `jest.config.*` or `"jest"` in package.json: `testEnvironment`, `preset`, `transform` |
| eslint | `eslint.config.*` flat-config packages |
| storybook | `.storybook/main.*` `addons` and `framework` |
| postcss | `postcss.config.*` plugin objects (`{ autoprefixer: {} }`) |

Disable with `--no-plugins`, or choose with `"plugins": ["next", "jest"]` in the config.

Imports matching tsconfig/jsconfig `compilerOptions.paths` (including through `extends`) and `#subpath` imports are not packages. In a workspace, a missing sibling package gets a `workspace:*` fix.

```bash
npx dead-deps-gauge --fix --dry-run   # show what would be removed
npx dead-deps-gauge --fix             # remove unused (dev/optional) dependencies from package.json
```

## Module formats and types

Ships ESM (`import`) and a bundled CommonJS build (`require`), with TypeScript declarations generated from the source:

```js
import * as lib from 'dead-deps-gauge';      // ESM
const lib = require('dead-deps-gauge');      // CommonJS
```

Tests live in [`test/`](test) and run on Node 18, 20 and 22 in [GitHub Actions](https://github.com/MrLouisWright/dead-deps-gauge/actions/workflows/ci.yml), including a require+import check. Releases are published with `npm publish --provenance`.

