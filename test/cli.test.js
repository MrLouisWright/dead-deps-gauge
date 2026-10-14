import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP, run, tmp, proj } from './helpers.js';

test('exit codes and thresholds', () => {
  assert.equal(run([APP]).code, 1);
  assert.equal(run([APP, '--fail-on', 'critical']).code, 0);
  assert.equal(run([proj({ 'package.json': { name: 'clean' }, 'a.js': "require('node:fs')" }), '--fail-on', 'info']).code, 0);
});
test('formats and report files', () => {
  const o = tmp();
  run([APP, '--json', join(o, 'r.json'), '--sarif', join(o, 'r.sarif'), '--markdown', join(o, 'r.md')]);
  const j = JSON.parse(readFileSync(join(o, 'r.json'), 'utf8')); assert.equal(j.counts.high, 2); assert.ok(j.info.usage.express);
  const s = JSON.parse(readFileSync(join(o, 'r.sarif'), 'utf8')); assert.ok(s.runs[0].results.some((x) => x.locations[0].physicalLocation.artifactLocation.uri === 'src/index.js' && x.locations[0].physicalLocation.region.startLine === 7));
  assert.match(readFileSync(join(o, 'r.md'), 'utf8'), /missing-dependency/);
  assert.match(run([APP, '-f', 'markdown']).out, /dead-deps-gauge/);
});
test('CLI flags and config', () => {
  assert.equal(run([APP, '--ignore-deps', 'dotenv,debug']).code, 0);
  const d = proj({ 'package.json': { name: 'p', deadDepsGauge: { ignoreDeps: ['x'] }, dependencies: { x: '1' } } });
  assert.equal(run([d, '--fail-on', 'info']).code, 0);
  writeFileSync(join(d, '.dead-deps-gauge.json'), JSON.stringify({ allowlist: 'nope' }));
  assert.equal(run([d]).code, 2);
});
test('usage errors', () => {
  assert.equal(run([tmp()]).code, 2, 'no package.json');
  assert.equal(run(['--zzz']).code, 2);
  assert.equal(run([proj({ 'package.json': '{oops' })]).code, 2);
});
test('--help, --version, --list-rules', () => {
  assert.match(run(['--help']).out, /--ignore-deps/);
  assert.match(run(['--version']).out, /^1\./);
  assert.match(run(['--list-rules']).out, /unused-dependency/);
});
