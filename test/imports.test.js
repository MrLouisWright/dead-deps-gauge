import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractImports, packageName, globToRe } from '../src/index.js';

const specs = (s) => extractImports(s).map((x) => x.spec);
test('ESM, CJS, dynamic, re-exports, TS forms', () => {
  const src = `/// <reference types="ref-types" />
import a from 'a'; import * as b from "b"; import { c } from 'c/sub'; import 'side-effect';
import type { T } from 't-only'; export * from 're1'; export { x } from 're2'; export type { Y } from 're3';
const d = require('d'); const e = require.resolve('e/package.json'); const f = await import('f');
import g = require('g'); jest.mock('h'); vi.mock('i');
/// <reference types="not-header" />
`;
  assert.deepEqual(specs(src).sort(), ['a', 'b', 'c/sub', 'd', 'e/package.json', 'f', 'g', 'h', 'i', 're1', 're2', 're3', 'ref-types', 'side-effect', 't-only'].sort());
  assert.ok(extractImports(src).find((x) => x.spec === 't-only').typeOnly);
  assert.ok(extractImports(src).find((x) => x.spec === 're3').typeOnly);
});
test('comments and template code samples are ignored; strings with // kept', () => {
  const src = `// import x from 'nope1'\n/* require('nope2') */\nconst u = "http://x"; const s = \`\nimport y from 'nope3'\n\`; require('yes');`;
  assert.deepEqual(specs(src), ['yes']);
  assert.equal(extractImports(src)[0].line, 5);
});
test('multi-line imports and line numbers', () => {
  const r = extractImports(`\n\nimport {\n  a,\n  b,\n} from 'multi';`);
  assert.deepEqual(r.map((x) => [x.spec, x.line]), [['multi', 3]]);
});
test('packageName', () => {
  assert.equal(packageName('lodash/fp'), 'lodash');
  assert.equal(packageName('@scope/pkg/deep/x'), '@scope/pkg');
  assert.equal(packageName('http-errors'), 'http-errors');
  for (const x of ['./x', '../y', '/abs', 'node:fs', 'fs', 'fs/promises', '#internal', 'https://cdn/x.js', 'data:text/js,1', '@scope']) assert.equal(packageName(x), null, x);
  assert.equal(packageName('css-loader!./x.css'), 'css-loader');
});
test('globToRe', () => {
  assert.ok(globToRe('**/test/**').test('a/test/b.js')); assert.ok(globToRe('**/test/**').test('test/b.js'));
  assert.ok(globToRe('**/*.test.*').test('src/x.test.ts')); assert.ok(!globToRe('src/*.js').test('src/a/b.js'));
  assert.ok(globToRe('{a,b}/*.js').test('b/x.js')); assert.ok(globToRe('dist/').test('dist/x/y.js'));
});
