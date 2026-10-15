#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, splitList, fixPackageJson } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'dead-deps-gauge', version: pkg.version, configKey: 'deadDepsGauge', rules: RULES,
  tagline: 'find unused dependencies and imports missing from package.json',
  usage: 'Usage: dead-deps-gauge [dir] [options]',
  help: `Scan
      --ignore <globs>       Paths to skip (comma-separated or repeated), e.g. "generated/**"
      --ignore-deps <globs>  Dependencies never to report, e.g. "@company/runtime-*"
      --dev-paths <globs>    Extra globs treated as dev-only (tests, tooling); defaults include test/, scripts/, *.test.*, *.config.*
      --no-plugins           Disable framework plugins (Next, Vite/Vitest, Jest, ESLint, Storybook, PostCSS, JSX)
      --fix                  Remove unused dependencies/devDependencies/optionalDependencies from package.json
      --dry-run              With --fix, print what would be removed without writing
`,
  options: { ignore: { type: 'string', multiple: true }, 'ignore-deps': { type: 'string', multiple: true }, 'dev-paths': { type: 'string', multiple: true }, 'no-plugins': { type: 'boolean' }, fix: { type: 'boolean' }, 'dry-run': { type: 'boolean' } },
  run: async ({ dir, values: o, config, configFile }) => {
    const opts = { ignore: splitList(o.ignore), ignoreDeps: splitList(o['ignore-deps']), devPaths: splitList(o['dev-paths']), toolVersion: pkg.version, ...(o['no-plugins'] ? { plugins: false } : {}) };
    let report = check(dir, opts, config, configFile);
    if (o.fix) {
      const removed = fixPackageJson(dir, report, { dryRun: o['dry-run'] });
      for (const [section, name] of removed) process.stderr.write(`${o['dry-run'] ? 'would remove' : 'removed'} ${name} from ${section}\n`);
      if (!removed.length) process.stderr.write('nothing to fix\n');
      if (removed.length && !o['dry-run']) report = check(dir, opts, config, configFile);
    }
    return report;
  },
});
