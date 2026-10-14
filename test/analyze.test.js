import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, configRefs, workspaceRoot } from '../src/index.js';
import { APP, proj } from './helpers.js';

const now = new Date('2026-10-14T00:00:00Z');
const by = (r) => Object.fromEntries(Object.keys(r.tool.rules).map((k) => [k, r.findings.filter((f) => f.rule === k).map((f) => f.subject).sort()]).filter(([, v]) => v.length));

test('fixture app: every rule', () => {
  const r = check(APP, { now });
  assert.deepEqual(by(r), {
    'missing-dependency': ['dotenv'],
    'dev-dependency-in-production': ['debug'],
    'unused-dependency': ['chalk', 'fs', 'left-pad'],
    'missing-dev-dependency': ['esbuild', 'express-serve-static-core', 'sinon'],
    'duplicate-declaration': ['chalk'],
    'builtin-shadowed': ['fs'],
    'types-in-dependencies': ['@types/express'],
    'unused-dev-dependency': ['unused-tool'],
  });
  const m = r.findings.find((f) => f.rule === 'missing-dependency');
  assert.equal(m.file, 'src/index.js'); assert.equal(m.line, 7); assert.match(m.fix, /npm install dotenv/);
});
test('scripts, bins and config files count as usage', () => {
  const r = check(APP, { now });
  const flagged = new Set(r.findings.map((f) => f.subject));
  for (const used of ['mocha', 'typescript', 'cross-env', 'eslint', 'eslint-plugin-import', '@types/node', 'express', 'lodash']) assert.ok(!flagged.has(used), used);
});
test('bins read from node_modules', () => {
  const d = proj({ 'package.json': { name: 'p', scripts: { fmt: 'fancy-fmt --write .' }, devDependencies: { 'fancy-formatter': '1' } }, 'node_modules/fancy-formatter/package.json': { name: 'fancy-formatter', bin: { 'fancy-fmt': 'x.js' } } });
  assert.deepEqual(check(d, { now }).findings, []);
});
test('package.json "files" makes unpublished files dev-only', () => {
  const d = proj({ 'package.json': { name: 'p', files: ['lib'], dependencies: { a: '1' }, devDependencies: { tool: '1' } }, 'lib/index.js': "require('a')", 'tools/gen.js': "require('tool')" });
  assert.deepEqual(check(d, { now }).findings, []);
  const d2 = proj({ 'package.json': { name: 'p', files: ['lib'], devDependencies: { tool: '1' } }, 'lib/index.js': "require('tool')" });
  assert.deepEqual(by(check(d2, { now })), { 'dev-dependency-in-production': ['tool'] });
});
test('install scripts are production usage', () => {
  const d = proj({ 'package.json': { name: 'p', scripts: { postinstall: 'patch-package' }, devDependencies: { 'patch-package': '1' } } });
  assert.deepEqual(by(check(d, { now })), { 'dev-dependency-in-production': ['patch-package'] });
  const priv = proj({ 'package.json': { name: 'p', private: true, scripts: { postinstall: 'patch-package' }, devDependencies: { 'patch-package': '1' } } });
  assert.deepEqual(check(priv, { now }).findings, []);
});
test('@types pairing and type-only imports', () => {
  const d = proj({ 'package.json': { name: 'p', types: 'index.d.ts', dependencies: { foo: '1', '@types/foo': '1' }, devDependencies: { '@types/bar': '1', '@types/scoped__lib': '1' }, peerDependencies: { '@scoped/lib': '1' } }, 'src/a.ts': "import foo from 'foo'; import type { B } from 'bar'; import l from '@scoped/lib';" });
  assert.deepEqual(check(d, { now }).findings, []);
});
test('workspace root devDependencies satisfy dev imports in packages', () => {
  const d = proj({ 'package.json': { name: 'root', private: true, workspaces: ['packages/*'], devDependencies: { vitest: '1' } }, 'packages/a/package.json': { name: 'a', dependencies: {} }, 'packages/a/src/x.test.js': "import { it } from 'vitest'", 'packages/a/src/x.js': "import y from 'hoisted-only'" });
  assert.equal(workspaceRoot(d + '/packages/a').pkg.name, 'root');
  assert.deepEqual(by(check(d + '/packages/a', { now })), { 'missing-dependency': ['hoisted-only'] });
});
test('nested packages, node_modules and fixtures are skipped', () => {
  const d = proj({ 'package.json': { name: 'p' }, 'sub/package.json': { name: 'sub' }, 'sub/x.js': "require('nope')", 'node_modules/z/x.js': "require('nope2')", 'test/fixtures/y.js': "require('nope3')" });
  assert.deepEqual(check(d, { now }).findings, []);
});
test('ignore, ignoreDeps, devPaths', () => {
  const d = proj({ 'package.json': { name: 'p', dependencies: { 'runtime-plugin': '1' } }, 'gen/x.js': "require('missing1')", 'tools/t.js': "require('missing2')" });
  const r = check(d, { now, ignore: ['gen/**'], ignoreDeps: ['runtime-*'], devPaths: ['tools/**'] });
  assert.deepEqual(by(r), { 'missing-dev-dependency': ['missing2'] });
});
test('configRefs', () => {
  const e = configRefs('.eslintrc.json', JSON.stringify({ extends: ['airbnb', 'plugin:@typescript-eslint/recommended'], plugins: ['react'], parser: '@typescript-eslint/parser' }));
  for (const x of ['eslint-config-airbnb', '@typescript-eslint/eslint-plugin', 'eslint-plugin-react', '@typescript-eslint/parser']) assert.ok(e.includes(x), x);
  const b = configRefs('.babelrc', JSON.stringify({ presets: ['@babel/preset-env', ['react', {}]], plugins: ['transform-runtime'] }));
  for (const x of ['@babel/preset-env', 'babel-preset-react', 'babel-plugin-transform-runtime']) assert.ok(b.includes(x), x);
  const t = configRefs('tsconfig.json', JSON.stringify({ extends: '@tsconfig/node18/tsconfig.json', compilerOptions: { types: ['node', 'vite/client'], importHelpers: true } }));
  for (const x of ['@tsconfig/node18', '@types/node', 'vite', 'tslib']) assert.ok(t.includes(x), x);
  assert.ok(!t.includes('node'));
});
test('allowlist with reason and expiry', () => {
  const ok = check(APP, { now }, { allowlist: [{ subject: 'left-pad', reason: 'loaded by plugin system', expires: '2027-01-01' }] });
  assert.ok(!ok.findings.some((f) => f.subject === 'left-pad')); assert.equal(ok.suppressed.length, 1);
  const exp = check(APP, { now }, { allowlist: [{ subject: 'left-pad', reason: 'x', expires: '2026-01-01' }] });
  assert.ok(exp.findings.some((f) => f.rule === 'allowlist-expired'));
});
