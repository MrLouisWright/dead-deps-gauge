import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, pathAliases, workspacePackages, fixPackageJson, workspaceRoot } from '../src/index.js';
import { proj, run } from './helpers.js';

const subjects = (r, rule) => r.findings.filter((f) => f.rule === rule).map((f) => f.subject).sort();

test('next plugin: react and react-dom are used implicitly', () => {
  const d = proj({ 'package.json': { name: 'p', dependencies: { next: '1', react: '1', 'react-dom': '1' } }, 'next.config.js': 'module.exports = {}', 'pages/index.js': 'export default function P() { return null }' });
  assert.deepEqual(subjects(check(d), 'unused-dependency'), []);
  assert.deepEqual(subjects(check(d, { plugins: false }), 'unused-dependency').sort(), ['react', 'react-dom']);
});
test('jsx plugin: .tsx files use react via the automatic runtime', () => {
  const d = proj({ 'package.json': { name: 'p', dependencies: { react: '1' } }, 'src/App.tsx': 'export const A = () => <div/>;' });
  assert.deepEqual(subjects(check(d), 'unused-dependency'), []);
});
test('vitest plugin: environment and coverage provider', () => {
  const d = proj({ 'package.json': { name: 'p', devDependencies: { vitest: '1', jsdom: '1', '@vitest/coverage-v8': '1' } }, 'vitest.config.js': "import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { environment: 'jsdom', coverage: { provider: 'v8' } } })" });
  assert.deepEqual(subjects(check(d), 'unused-dev-dependency'), []);
});
test('vitest plugin: undeclared environment is missing', () => {
  const d = proj({ 'package.json': { name: 'p', devDependencies: { vitest: '1' } }, 'vitest.config.js': "export default { test: { environment: 'happy-dom' } }" });
  assert.deepEqual(subjects(check(d), 'missing-dev-dependency'), ['happy-dom']);
});
test('jest plugin: testEnvironment and preset in package.json', () => {
  const d = proj({ 'package.json': { name: 'p', jest: { testEnvironment: 'jsdom', preset: 'ts-jest' }, devDependencies: { jest: '1', 'jest-environment-jsdom': '1', 'ts-jest': '1' } } });
  assert.deepEqual(subjects(check(d), 'unused-dev-dependency'), []);
});
test('storybook plugin: addons and framework in .storybook/main', () => {
  const d = proj({ 'package.json': { name: 'p', devDependencies: { storybook: '1', '@storybook/addon-essentials': '1', '@storybook/react-vite': '1', unused: '1' } }, '.storybook/main.ts': "export default { framework: '@storybook/react-vite', addons: ['@storybook/addon-essentials'] }" });
  assert.deepEqual(subjects(check(d), 'unused-dev-dependency'), ['unused']);
});
test('postcss and eslint flat config plugins', () => {
  const d = proj({ 'package.json': { name: 'p', devDependencies: { postcss: '1', autoprefixer: '1', eslint: '1', 'typescript-eslint': '1' } }, 'postcss.config.js': 'module.exports = { plugins: { autoprefixer: {} } }', 'eslint.config.js': "import tseslint from 'typescript-eslint';\nexport default tseslint.config();" });
  assert.deepEqual(subjects(check(d), 'unused-dev-dependency'), []);
});
test('tsconfig paths aliases are not packages (with extends)', () => {
  const d = proj({ 'package.json': { name: 'p' }, 'tsconfig.base.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }', 'tsconfig.json': '{ // comment\n "extends": "./tsconfig.base.json", "compilerOptions": { "paths": { "~utils": ["src/utils.ts"] } } }', 'src/a.ts': "import x from '@/lib/x';\nimport u from '~utils';\nimport y from '#internal';" });
  const alias = pathAliases(d); assert.ok(alias('@/lib/x')); assert.ok(alias('~utils')); assert.ok(!alias('@scope/pkg'));
  assert.deepEqual(subjects(check(d), 'missing-dependency'), []);
});
test('workspace packages get a workspace: fix', () => {
  const d = proj({ 'package.json': { name: 'root', private: true, workspaces: ['packages/*'] }, 'packages/a/package.json': { name: '@me/a' }, 'packages/b/package.json': { name: '@me/b' }, 'packages/b/index.js': "import a from '@me/a';" });
  const ws = workspacePackages(workspaceRoot(join(d, 'packages/b')));
  assert.equal(ws.get('@me/a'), 'packages/a');
  const f = check(join(d, 'packages/b')).findings.find((x) => x.subject === '@me/a');
  assert.equal(f.rule, 'missing-dependency'); assert.match(f.fix, /workspace:\*/);
});
test('fixPackageJson removes unused deps and keeps indentation', () => {
  const d = proj({ 'src/i.js': "import a from 'used';" });
  const file = join(d, 'package.json');
  require_write(file, '{\n    "name": "p",\n    "dependencies": { "used": "1", "gone": "1" },\n    "devDependencies": { "old": "1" }\n}\n');
  const r = check(d);
  assert.deepEqual(fixPackageJson(d, r, { dryRun: true }).length, 2);
  assert.deepEqual(fixPackageJson(d, r).sort(), [['dependencies', 'gone'], ['devDependencies', 'old']]);
  const text = readFileSync(file, 'utf8'); assert.match(text, /^ {4}"name"/m);
  assert.deepEqual(JSON.parse(text).dependencies, { used: '1' });
});
test('CLI --fix --dry-run does not write', () => {
  const d = proj({ 'package.json': { name: 'p', dependencies: { gone: '1' } } });
  const r = run([d, '--fix', '--dry-run', '--fail-on', 'none']);
  assert.match(r.err, /would remove gone from dependencies/);
  assert.ok(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).dependencies.gone);
  const r2 = run([d, '--fix', '--fail-on', 'none']);
  assert.match(r2.err, /removed gone/); assert.equal(r2.code, 0);
  assert.equal(JSON.parse(readFileSync(join(d, 'package.json'), 'utf8')).dependencies.gone, undefined);
});
import { writeFileSync as require_write } from 'node:fs';
