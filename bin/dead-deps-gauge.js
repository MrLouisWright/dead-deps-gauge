#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, splitList } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'dead-deps-gauge', version: pkg.version, configKey: 'deadDepsGauge', rules: RULES,
  tagline: 'find unused dependencies and imports missing from package.json',
  usage: 'Usage: dead-deps-gauge [dir] [options]',
  help: `Scan
      --ignore <globs>       Paths to skip (comma-separated or repeated), e.g. "generated/**"
      --ignore-deps <globs>  Dependencies never to report, e.g. "@company/runtime-*"
      --dev-paths <globs>    Extra globs treated as dev-only (tests, tooling); defaults include test/, scripts/, *.test.*, *.config.*
`,
  options: { ignore: { type: 'string', multiple: true }, 'ignore-deps': { type: 'string', multiple: true }, 'dev-paths': { type: 'string', multiple: true } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { ignore: splitList(o.ignore), ignoreDeps: splitList(o['ignore-deps']), devPaths: splitList(o['dev-paths']), toolVersion: pkg.version }, config, configFile),
});
