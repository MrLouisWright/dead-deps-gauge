import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, extname, basename, dirname, resolve } from 'node:path';
import { extractImports, packageName, BUILTIN_NAMES } from './imports.js';
import { globToRe, matchAny } from './glob.js';
import { buildReport, UsageError } from './core.js';
import { frameworkUsages, pathAliases, workspacePackages, fixPackageJson, PLUGINS, parseJsonc } from './plugins.js';

export { frameworkUsages, pathAliases, workspacePackages, fixPackageJson, PLUGINS };

export { extractImports, packageName, globToRe };
export * from './core.js';

export const RULES = {
  'missing-dependency': { severity: 'high', title: 'Imported by production code but not declared in package.json' },
  'dev-dependency-in-production': { severity: 'high', title: 'Imported by production code but only declared in devDependencies' },
  'unused-dependency': { severity: 'medium', title: 'Declared in dependencies but never used' },
  'missing-dev-dependency': { severity: 'medium', title: 'Imported by tests/tooling but not declared' },
  'duplicate-declaration': { severity: 'medium', title: 'Declared in both dependencies and devDependencies' },
  'unused-dev-dependency': { severity: 'low', title: 'Declared in devDependencies but never used' },
  'builtin-shadowed': { severity: 'low', title: 'Dependency has the same name as a Node.js built-in module' },
  'types-in-dependencies': { severity: 'low', title: '@types/* in dependencies of a package that ships no types' },
  'unused-optional-dependency': { severity: 'info', title: 'Declared in optionalDependencies but never used' },
};

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte', '.astro']);
const SKIP_DIRS = new Set(['fixtures', '__fixtures__', 'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output', '.turbo', '.cache', 'out', '.vercel', '.svelte-kit', 'vendor', '.yarn', '.pnpm-store']);
export const DEFAULT_DEV_PATHS = ['**/test/**', '**/tests/**', '**/__tests__/**', '**/__mocks__/**', '**/spec/**', '**/e2e/**', '**/fixtures/**', '**/scripts/**', '**/examples/**', '**/example/**', '**/playground/**', '**/demo/**', '**/bench/**', '**/benchmarks/**', '**/stories/**', '**/.storybook/**', '**/docs/**', '**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/*.bench.*', '**/*.config.*', '**/.*rc.*', '**/gulpfile.*', '**/Gruntfile.*', '**/Jakefile.*'];
const KNOWN_BINS = { tsc: 'typescript', tsserver: 'typescript', 'run-s': 'npm-run-all', 'run-p': 'npm-run-all', 'npm-run-all': 'npm-run-all', 'npm-run-all2': 'npm-run-all2', biome: '@biomejs/biome', changeset: '@changesets/cli', playwright: '@playwright/test', commitlint: '@commitlint/cli', 'webpack-cli': 'webpack-cli', 'ng': '@angular/cli', 'vue-cli-service': '@vue/cli-service', 'react-scripts': 'react-scripts', 'svelte-kit': '@sveltejs/kit', 'wrangler': 'wrangler', 'turbo': 'turbo', 'nx': 'nx', 'lerna': 'lerna', 'astro': 'astro', 'next': 'next', 'nuxt': 'nuxt', 'nuxi': 'nuxt', 'vite': 'vite', 'storybook': 'storybook', 'sb': 'storybook', 'tsup': 'tsup', 'tsx': 'tsx', 'ts-node': 'ts-node', 'jest': 'jest', 'vitest': 'vitest', 'mocha': 'mocha', 'c8': 'c8', 'nyc': 'nyc', 'eslint': 'eslint', 'prettier': 'prettier', 'husky': 'husky', 'lint-staged': 'lint-staged', 'rimraf': 'rimraf', 'cross-env': 'cross-env', 'concurrently': 'concurrently', 'nodemon': 'nodemon', 'semantic-release': 'semantic-release', 'typedoc': 'typedoc', 'rollup': 'rollup', 'esbuild': 'esbuild', 'webpack': 'webpack', 'ava': 'ava', 'tap': 'tap', 'standard': 'standard', 'xo': 'xo', 'stylelint': 'stylelint', 'patch-package': 'patch-package', 'shx': 'shx', 'copyfiles': 'copyfiles', 'mkdirp': 'mkdirp', 'del-cli': 'del-cli', 'del': 'del-cli', 'http-server': 'http-server', 'serve': 'serve', 'pkg': 'pkg', 'np': 'np', 'release-it': 'release-it', 'size-limit': 'size-limit', 'knip': 'knip', 'depcheck': 'depcheck', 'markdownlint': 'markdownlint-cli', 'markdownlint-cli2': 'markdownlint-cli2', 'tailwindcss': 'tailwindcss', 'postcss': 'postcss-cli', 'sass': 'sass', 'babel': '@babel/cli', 'swc': '@swc/cli', 'prisma': 'prisma', 'drizzle-kit': 'drizzle-kit', 'electron': 'electron', 'electron-builder': 'electron-builder' };
// packages that are used implicitly when a file exists
const IMPLICIT = [
  [/^tsconfig(\..+)?\.json$/, ['typescript']], [/^\.?eslint/, ['eslint']], [/^eslint\.config\./, ['eslint']], [/^\.?prettier/, ['prettier']], [/^prettier\.config\./, ['prettier']],
  [/^jest\.config\./, ['jest']], [/^vitest\.config\./, ['vitest']], [/^vite\.config\./, ['vite']], [/^\.?babelrc|^babel\.config\./, ['@babel/core']], [/^\.husky$/, ['husky']], [/^\.lintstagedrc|^lint-staged\.config\./, ['lint-staged']],
  [/^\.?commitlintrc|^commitlint\.config\./, ['@commitlint/cli']], [/^\.?stylelintrc|^stylelint\.config\./, ['stylelint']], [/^\.mocharc/, ['mocha']], [/^\.c8rc|^\.nycrc/, ['c8', 'nyc']], [/^playwright\.config\./, ['@playwright/test']],
  [/^tailwind\.config\./, ['tailwindcss']], [/^postcss\.config\./, ['postcss']], [/^next\.config\./, ['next']], [/^nuxt\.config\./, ['nuxt']], [/^svelte\.config\./, ['svelte', '@sveltejs/kit']], [/^astro\.config\./, ['astro']], [/^rollup\.config\./, ['rollup']], [/^webpack\.config\./, ['webpack', 'webpack-cli']], [/^tsup\.config\./, ['tsup']], [/^\.size-limit/, ['size-limit']], [/^\.releaserc|^release\.config\./, ['semantic-release']], [/^\.changeset$/, ['@changesets/cli']], [/^biome\.jsonc?$/, ['@biomejs/biome']], [/^typedoc\.json$/, ['typedoc']], [/^\.storybook$/, ['storybook']], [/^turbo\.json$/, ['turbo']], [/^nx\.json$/, ['nx']], [/^lerna\.json$/, ['lerna']], [/^\.swcrc$/, ['@swc/core']], [/^prisma$/, ['prisma', '@prisma/client']], [/^wrangler\.toml$/, ['wrangler']],
];

function walk(root, dir, ignore, out) {
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e.name); const rel = relative(root, p).split('\\').join('/');
    if (ignore.length && matchAny(rel, ignore)) continue;
    if (e.isDirectory()) { if (SKIP_DIRS.has(e.name)) continue; if (existsSync(join(p, 'package.json')) && p !== root) continue; walk(root, p, ignore, out); } else if (e.isFile() && (CODE_EXT.has(extname(e.name)) || /\.(json|ya?ml)$/.test(e.name) && /^\.?(eslint|babel|prettier|jest|commitlint|stylelint|lint-staged|tsconfig|swc)/.test(e.name) || /^\.(eslintrc|babelrc|prettierrc|commitlintrc|stylelintrc|lintstagedrc|mocharc)$/.test(e.name))) out.push(rel);
  }
  return out;
}

/** Resolve ESLint/Babel-style short names to package names (returns both the long and literal forms). */
export function resolveShort(prefix, x) {
  if (typeof x !== 'string' || /^[./]/.test(x) || /^eslint:/.test(x)) return [];
  if (x.startsWith('plugin:')) {
    const body = x.slice(7); const parts = body.split('/');
    const pluginId = body.startsWith('@') ? (parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0]) : parts[0];
    return resolveShort(prefix.replace(/-(config|preset)$/, '-plugin'), pluginId);
  }
  if (x.startsWith('@')) {
    const [scope, name] = x.split('/');
    if (!name) return [`${scope}/${prefix}`];
    return [name.startsWith(prefix) ? `${scope}/${name}` : `${scope}/${prefix}-${name}`, `${scope}/${name}`];
  }
  const base = x.split('/')[0];
  return [base.startsWith(`${prefix}-`) ? base : `${prefix}-${base}`, base];
}
const pluginNames = (prefix, v) => [].concat(v || []).flatMap((x) => resolveShort(prefix, Array.isArray(x) ? x[0] : x));

/** Packages referenced by a JSON-ish config file. */
export function configRefs(name, text) {
  const refs = [];
  let j = null; try { j = JSON.parse(text); } catch { j = null; }
  if (j && typeof j === 'object') {
    if (/eslint/.test(name)) { refs.push(...pluginNames('eslint-config', j.extends).filter((x) => !/^eslint-config-(eslint|plugin)$/.test(x)), ...pluginNames('eslint-plugin', j.plugins)); if (j.parser) refs.push(j.parser); for (const o of j.overrides || []) { refs.push(...pluginNames('eslint-config', o.extends), ...pluginNames('eslint-plugin', o.plugins)); if (o.parser) refs.push(o.parser); } }
    if (/babel/.test(name)) { refs.push(...pluginNames('babel-preset', j.presets), ...pluginNames('babel-plugin', j.plugins)); }
    if (/prettier/.test(name) && j.plugins) refs.push(...[].concat(j.plugins));
    if (/commitlint/.test(name)) refs.push(...[].concat(j.extends || []));
    if (/stylelint/.test(name)) refs.push(...[].concat(j.extends || []), ...[].concat(j.plugins || []));
    if (/tsconfig/.test(name)) { for (const e of [].concat(j.extends || [])) refs.push(e); for (const t of j.compilerOptions?.types || []) refs.push(t.includes('/') ? t : `@types/${t}`); for (const p of j.compilerOptions?.plugins || []) if (p.name) refs.push(p.name); if (j.compilerOptions?.importHelpers) refs.push('tslib'); if (j.compilerOptions?.jsxImportSource) refs.push(j.compilerOptions.jsxImportSource); }
    if (/jest/.test(name)) for (const k of ['preset', 'testEnvironment', 'testRunner', 'transform']) { const v = j[k]; if (typeof v === 'string') refs.push(v, `jest-environment-${v}`); else if (v && typeof v === 'object') for (const x of Object.values(v)) refs.push([].concat(x)[0]); }
  } else {
    for (const m of text.matchAll(/["']((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)?)["']/g)) refs.push(m[1]);
  }
  return refs.filter((x) => typeof x === 'string').map((x) => packageName(x)).filter(Boolean);
}

function binMap(dir, deps) {
  const map = { ...KNOWN_BINS };
  for (const d of deps) {
    map[d.replace(/^@[^/]+\//, '')] ??= d;
    const pj = join(dir, 'node_modules', d, 'package.json');
    if (!existsSync(pj)) continue;
    try { const p = JSON.parse(readFileSync(pj, 'utf8')); if (typeof p.bin === 'string') map[d.replace(/^@[^/]+\//, '')] = d; else for (const b of Object.keys(p.bin || {})) map[b] = d; } catch { /* ignore */ }
  }
  return map;
}

/** Nearest ancestor package.json declaring workspaces (npm/yarn) or a pnpm-workspace.yaml. */
export function workspaceRoot(dir) {
  let d = dirname(resolve(dir));
  for (;;) {
    const pj = join(d, 'package.json');
    if (existsSync(join(d, 'pnpm-workspace.yaml')) || existsSync(pj)) {
      try { const p = existsSync(pj) ? JSON.parse(readFileSync(pj, 'utf8')) : {}; if (p.workspaces || existsSync(join(d, 'pnpm-workspace.yaml'))) return { dir: d, pkg: p }; } catch { /* ignore */ }
    }
    const up = dirname(d); if (up === d) return null; d = up;
  }
}

export function analyze(dir, opts = {}) {
  const pjPath = join(dir, 'package.json');
  if (!existsSync(pjPath)) throw new UsageError(`No package.json in ${dir}`);
  let pkg; try { pkg = JSON.parse(readFileSync(pjPath, 'utf8')); } catch (e) { throw new UsageError(`Cannot parse package.json: ${e.message}`); }
  const prod = Object.keys(pkg.dependencies || {}); const dev = Object.keys(pkg.devDependencies || {});
  const peer = Object.keys(pkg.peerDependencies || {}); const optional = Object.keys(pkg.optionalDependencies || {});
  const declared = new Set([...prod, ...dev, ...peer, ...optional]);
  const root = workspaceRoot(dir);
  const rootDeclared = new Set(root ? [...Object.keys(root.pkg.dependencies || {}), ...Object.keys(root.pkg.devDependencies || {})] : []);
  const ignore = [...(opts.ignore || [])];
  const devGlobs = [...DEFAULT_DEV_PATHS, ...(opts.devPaths || [])];
  const prodGlobs = opts.prodPaths || [];
  const files = walk(dir, dir, ignore, []);
  const usage = new Map(); // name -> { prod: [{file,line}], dev: [...] , typeOnly }
  const use = (name, file, line, isDev, typeOnly = false, explicit = false) => { if (!name || name === pkg.name) return; let u = usage.get(name); if (!u) { u = { prod: [], dev: [], typeOnly: true }; usage.set(name, u); } (isDev ? u.dev : u.prod).push({ file, line, explicit }); if (!typeOnly) u.typeOnly = false; };
  // when package.json "files" exists, anything not published is dev-only
  const published = Array.isArray(pkg.files) ? pkg.files.flatMap((g) => { const x = String(g).replace(/^\.\//, '').replace(/\/$/, ''); return /[*?{]/.test(x) ? [x] : [x, `${x}/**`]; }) : null;
  const isDevFile = (f) => !matchAny(f, prodGlobs) && (matchAny(f, devGlobs) || (published !== null && !published.some((g) => globToRe(g).test(f))));
  let tsFiles = 0;
  const aliased = pathAliases(dir);
  const wsPkgs = workspacePackages(root);
  const subpathImport = (s) => s.startsWith('#');
  for (const f of files) {
    let src; try { src = readFileSync(join(dir, f), 'utf8'); } catch { continue; }
    if (src.length > 2e6) continue;
    const isDev = isDevFile(f);
    if (/\.(m|c)?tsx?$/.test(f)) tsFiles++;
    if (/\.(json|ya?ml)$/.test(f) || /^\.[\w-]+rc$/.test(basename(f))) { for (const r of configRefs(basename(f), src)) use(r, f, 1, true); continue; }
    for (const im of extractImports(src)) { if (aliased(im.spec) || subpathImport(im.spec)) continue; use(packageName(im.spec), f, im.line, isDev, im.typeOnly); }
    if (/\.config\.|^\.[\w-]+rc\./.test(basename(f))) for (const r of configRefs(basename(f), src)) if (declared.has(r)) use(r, f, 1, true);
  }
  // root-level implicit tools
  let rootEntries = []; try { rootEntries = readdirSync(dir); } catch { /* */ }
  for (const e of rootEntries) for (const [re, names] of IMPLICIT) if (re.test(e)) for (const n of names) use(n, e, 1, true);
  if (tsFiles) { use('typescript', 'package.json', 1, true); use('@types/node', 'package.json', 1, true, true); }
  // package.json embedded config
  for (const [k, kind] of [['eslintConfig', '.eslintrc'], ['babel', '.babelrc'], ['prettier', '.prettierrc'], ['jest', 'jest.config.json'], ['commitlint', '.commitlintrc'], ['stylelint', '.stylelintrc']]) if (pkg[k]) { use(k === 'eslintConfig' ? 'eslint' : k === 'babel' ? '@babel/core' : k === 'commitlint' ? '@commitlint/cli' : k, 'package.json', 1, true); for (const r of configRefs(kind, JSON.stringify(pkg[k]))) use(r, 'package.json', 1, true); }
  if (pkg['lint-staged']) use('lint-staged', 'package.json', 1, true);
  if (typeof pkg.prettier === 'string') use(pkg.prettier, 'package.json', 1, true);
  // framework plugins (Next, Vite/Vitest, Jest, ESLint flat config, Storybook, PostCSS, JSX runtimes)
  if (opts.plugins !== false) for (const u of frameworkUsages({ dir, pkg, files, declared, isDevFile }, Array.isArray(opts.plugins) ? opts.plugins : undefined)) use(u.name, u.file, 1, u.dev, false, true);
  // scripts
  const bins = binMap(dir, [...declared]);
  for (const [name, script] of Object.entries(pkg.scripts || {})) {
    const runtime = !pkg.private && /^(install|preinstall|postinstall)$/.test(name);
    for (const part of String(script).split(/&&|\|\||[;|&]/)) {
      const words = part.trim().split(/\s+/).filter((w) => !/^\w+=/.test(w));
      let w = words[0];
      if (['npx', 'pnpx', 'bunx', 'cross-env', 'dotenv', 'env-cmd', 'nyc', 'c8', 'node', 'tsx', 'ts-node', 'nodemon', 'time'].includes(w)) { if (KNOWN_BINS[w]) use(KNOWN_BINS[w], 'package.json', 1, !runtime); const rest = words.slice(1).filter((x) => !x.startsWith('-')); w = rest[0]; if (w && /\.[cm]?[jt]s$/.test(w)) w = null; }
      if (['pnpm', 'yarn', 'npm', 'bun'].includes(words[0]) && ['exec', 'dlx', 'x'].includes(words[1])) w = words.slice(2).find((x) => !x.startsWith('-'));
      if (w && bins[w]) use(bins[w], 'package.json', 1, !runtime);
      for (const x of words) { const m = /^--(?:require|import|loader|experimental-loader)=?(.*)$/.exec(x); if (m && m[1]) use(packageName(m[1]), 'package.json', 1, !runtime); }
      for (let k = 0; k < words.length - 1; k++) if (['-r', '--require', '--import', '--loader'].includes(words[k])) use(packageName(words[k + 1]), 'package.json', 1, !runtime);
    }
  }
  // @types pairing
  for (const d of [...declared].filter((x) => x.startsWith('@types/'))) {
    const base = d.slice(7); const target = base.includes('__') ? `@${base.replace('__', '/')}` : base;
    if (usage.has(target) || (BUILTIN_NAMES.has(target) && tsFiles) || (target === 'node' && tsFiles)) use(d, '(types)', 1, !usage.get(target)?.prod.length ? true : false, true);
    if (usage.has(d)) continue;
  }
  const ignored = (n) => (opts.ignoreDeps || []).some((g) => globToRe(g).test(n));
  const findings = [];
  const add = (rule, name, message, fix, loc = {}) => { if (!ignored(name)) findings.push({ rule, severity: RULES[rule].severity, subject: name, file: loc.file || 'package.json', line: loc.line, message, fix }); };
  const pm = existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm add' : existsSync(join(dir, 'yarn.lock')) ? 'yarn add' : 'npm install';
  for (const [name, u] of [...usage.entries()].sort()) {
    if (name.startsWith('@types/')) continue;
    const typesPkg = `@types/${name.startsWith('@') ? name.slice(1).replace('/', '__') : name}`;
    if (u.typeOnly && (declared.has(typesPkg) || rootDeclared.has(typesPkg))) continue;
    const at = (u.prod[0] || u.dev[0]);
    if (u.prod.length && !u.typeOnly) {
      if (!declared.has(name) && wsPkgs.has(name)) add('missing-dependency', name, `"${name}" is used by ${at.file}${at.line > 1 ? ':' + at.line : ''} but is not in package.json (it is the workspace package in ${wsPkgs.get(name)})`, `Add "${name}": "workspace:*" (pnpm/yarn) or "*" (npm) to dependencies.`, at);
      else if (!declared.has(name)) add('missing-dependency', name, `"${name}" is used by ${at.file}${at.line > 1 ? ':' + at.line : ''}${u.prod.length > 1 ? ` (+${u.prod.length - 1} more)` : ''} but is not in package.json`, `${pm} ${name}  (it only works today through hoisting or a transitive install)`, at);
      else if (!prod.includes(name) && !peer.includes(name) && !optional.includes(name)) add('dev-dependency-in-production', name, `"${name}" is used by production code (${at.file}${at.line > 1 ? ':' + at.line : ''}) but is only a devDependency`, `Move it to "dependencies" (${pm} ${name}${pm === 'npm install' ? ' --save-prod' : ''}), or mark the file as dev-only with "devPaths".`, at);
    } else if (!declared.has(name) && !rootDeclared.has(name) && (u.dev.length || u.prod.length)) {
      const real = u.dev.concat(u.prod).find((x) => x.explicit || x.file !== 'package.json' && x.file !== '(types)' && !IMPLICIT.some(([re]) => re.test(x.file)));
      if (real && !real.explicit && !/\.(json|ya?ml)$|rc$/.test(real.file)) add('missing-dev-dependency', name, `"${name}" is used by ${real.file}${real.line > 1 ? ':' + real.line : ''} but is not declared`, `${pm} -D ${name}`, real);
      else if (real) add('missing-dev-dependency', name, `"${name}" is referenced by ${real.file} but is not declared`, `${pm} -D ${name}`, real);
    }
  }
  for (const d of prod) {
    if (!usage.has(d) && !d.startsWith('@types/')) add('unused-dependency', d, `"${d}" is in dependencies but nothing imports or runs it`, `npm uninstall ${d}  (or allowlist it with a reason if it is loaded indirectly)`);
    if (dev.includes(d)) add('duplicate-declaration', d, `"${d}" is in both dependencies and devDependencies`, 'Keep it in one place (dependencies if production code uses it).');
    if (BUILTIN_NAMES.has(d)) add('builtin-shadowed', d, `"${d}" has the same name as the Node.js built-in "${d}"; imports resolve to the built-in`, `Remove it and use "node:${d}".`);
    if (d.startsWith('@types/') && !pkg.types && !pkg.typings && !Object.values(pkg.exports || {}).some((x) => x && typeof x === 'object' && x.types)) add('types-in-dependencies', d, `"${d}" is in dependencies but this package ships no type definitions`, 'Move it to devDependencies.');
    else if (d.startsWith('@types/') && !usage.has(d)) add('unused-dependency', d, `"${d}" is in dependencies but the package it types is not used`, `npm uninstall ${d}`);
  }
  for (const d of dev) {
    if (usage.has(d) || prod.includes(d)) continue;
    add('unused-dev-dependency', d, `"${d}" is in devDependencies but no file, script or config uses it`, `npm uninstall -D ${d}`);
  }
  for (const d of optional) if (!usage.has(d) && !prod.includes(d)) add('unused-optional-dependency', d, `"${d}" is in optionalDependencies but never imported`, `npm uninstall ${d}`);
  const info = { files: files.length, dependencies: prod.length, devDependencies: dev.length, used: usage.size, usage: Object.fromEntries([...usage.entries()].filter(([n]) => declared.has(n)).map(([n, u]) => [n, { prod: u.prod.length, dev: u.dev.length }])) };
  return { pkg, info, findings };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const merged = { ignore: [...(config.ignore || []), ...(opts.ignore || [])], ignoreDeps: [...(config.ignoreDeps || []), ...(opts.ignoreDeps || [])], devPaths: [...(config.devPaths || []), ...(opts.devPaths || [])], prodPaths: config.prodPaths, plugins: opts.plugins ?? config.plugins };
  const { pkg, info, findings } = analyze(dir, merged);
  const tool = { name: 'dead-deps-gauge', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '🪦', defaultFile: 'package.json' };
  return buildReport(tool, `${pkg.name || 'package'}${pkg.version ? '@' + pkg.version : ''}`, findings, config, { now: opts.now, configFile, summaryLine: `${info.files} file(s) scanned; ${info.dependencies} dependencies, ${info.devDependencies} devDependencies`, info });
}
