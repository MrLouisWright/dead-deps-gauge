// Framework plugins, tsconfig path aliases, workspace packages and --fix.
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const stripJsonComments = (s) => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '').replace(/,(\s*[}\]])/g, '$1');
export const parseJsonc = (s) => { try { return JSON.parse(stripJsonComments(s)); } catch { return null; } };

/**
 * Framework plugins: packages a framework loads implicitly, which no import statement mentions.
 * Each plugin returns [{ name, file, dev }] usages.
 */
export const PLUGINS = {
  next: ({ declared }) => declared.has('next') ? ['react', 'react-dom'].map((name) => ({ name, file: 'package.json', dev: false })) : [],
  jsx: ({ files, declared, isDevFile }) => {
    const jsx = files.filter((f) => /\.[jt]sx$/.test(f)); if (!jsx.length) return [];
    const out = []; const prod = jsx.some((f) => !isDevFile(f));
    for (const n of ['react', 'preact', 'solid-js']) if (declared.has(n)) out.push({ name: n, file: jsx[0], dev: !prod });
    return out;
  },
  vite: ({ cfg }) => {
    const out = [];
    for (const [file, src] of cfg(/^(vite|vitest)\.(config|workspace)\./)) {
      for (const env of ['jsdom', 'happy-dom', 'edge-runtime']) if (new RegExp(`environment\\s*:\\s*['"]${env}['"]`).test(src)) out.push({ name: env === 'edge-runtime' ? '@edge-runtime/vm' : env, file, dev: true });
      const prov = /provider\s*:\s*['"](v8|istanbul)['"]/.exec(src); if (prov) out.push({ name: `@vitest/coverage-${prov[1]}`, file, dev: true });
      if (/browser\s*:\s*\{[^}]*enabled\s*:\s*true/.test(src)) out.push({ name: '@vitest/browser', file, dev: true });
    }
    return out;
  },
  jest: ({ cfg, pkg }) => {
    const out = []; const srcs = cfg(/^jest\.config\./); if (pkg.jest) srcs.push(['package.json', JSON.stringify(pkg.jest)]);
    for (const [file, src] of srcs) {
      const env = /testEnvironment["']?\s*:\s*['"]([\w@/.-]+)['"]/.exec(src); if (env && !env[1].startsWith('.') && env[1] !== 'node') out.push({ name: env[1].startsWith('jest-environment-') || env[1].startsWith('@') ? env[1] : `jest-environment-${env[1]}`, file, dev: true });
      for (const m of src.matchAll(/["']((?:@[\w.-]+\/)?[\w.-]+)["']/g)) out.push({ name: m[1], file, dev: true, soft: true });
    }
    return out;
  },
  eslint: ({ cfg }) => cfg(/^eslint\.config\./).flatMap(([file, src]) => [...src.matchAll(/["']((?:@[\w.-]+\/)?[\w.-]+)(?:\/[\w./-]+)?["']/g)].map((m) => ({ name: m[1], file, dev: true, soft: true }))),
  storybook: ({ dir, declared }) => {
    const sb = join(dir, '.storybook'); if (!existsSync(sb)) return [];
    const out = [];
    for (const f of readdirSync(sb)) {
      if (!/^(main|preview|manager)\.[cm]?[jt]sx?$/.test(f)) continue; const src = read(join(sb, f)) || '';
      for (const m of src.matchAll(/["']((?:@[\w.-]+\/)?[\w.-]+)(?:\/[\w./-]+)?["']/g)) if (declared.has(m[1])) out.push({ name: m[1], file: `.storybook/${f}`, dev: true });
      if (declared.has('storybook')) out.push({ name: 'storybook', file: `.storybook/${f}`, dev: true });
    }
    return out;
  },
  postcss: ({ cfg }) => cfg(/^postcss\.config\.|^\.postcssrc/).flatMap(([file, src]) => [...src.matchAll(/["']?((?:@[\w.-]+\/)?[\w.-]+)["']?\s*:/g)].map((m) => ({ name: m[1], file, dev: true, soft: true }))),
};

/** Run every plugin (or the named ones). `soft` usages only count when the package is declared. */
export function frameworkUsages(ctx, names = Object.keys(PLUGINS)) {
  const files = ctx.files;
  const cfg = (re) => files.filter((f) => !f.includes('/') && re.test(f)).map((f) => [f, read(join(ctx.dir, f)) || '']);
  const out = [];
  for (const n of names) { const p = PLUGINS[n]; if (!p) continue; for (const u of p({ ...ctx, cfg })) if (!u.soft || ctx.declared.has(u.name)) out.push({ ...u, plugin: n }); }
  return out;
}

/** tsconfig/jsconfig `compilerOptions.paths` (follows relative "extends"). Returns a matcher for aliased specifiers. */
export function pathAliases(dir) {
  const keys = []; const seen = new Set();
  const load = (file, depth = 0) => {
    if (depth > 5 || seen.has(file)) return; seen.add(file);
    const j = parseJsonc(read(file) || ''); if (!j) return;
    for (const k of Object.keys(j.compilerOptions?.paths || {})) keys.push(k);
    for (const e of [].concat(j.extends || [])) if (typeof e === 'string' && e.startsWith('.')) load(join(dirname(file), e.endsWith('.json') ? e : `${e}.json`), depth + 1);
  };
  for (const f of ['tsconfig.json', 'jsconfig.json']) if (existsSync(join(dir, f))) load(join(dir, f));
  const res = keys.map((k) => k.includes('*') ? ((s) => s.startsWith(k.slice(0, k.indexOf('*'))) && s.endsWith(k.slice(k.indexOf('*') + 1))) : ((s) => s === k));
  const fn = (spec) => res.some((r) => r(spec)); fn.keys = keys; return fn;
}

/** Package names of every workspace under a workspace root (npm/yarn "workspaces", pnpm-workspace.yaml). */
export function workspacePackages(root) {
  if (!root) return new Map();
  let globs = Array.isArray(root.pkg.workspaces) ? root.pkg.workspaces : root.pkg.workspaces?.packages || [];
  const pnpm = read(join(root.dir, 'pnpm-workspace.yaml')); if (pnpm) globs = globs.concat([...pnpm.matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/gm)].map((m) => m[1]));
  const out = new Map();
  for (const g of globs) {
    if (g.startsWith('!')) continue;
    const base = g.replace(/\/\*\*?$/, ''); const dirs = g.endsWith('*') ? (() => { try { return readdirSync(join(root.dir, base)).map((d) => join(base, d)); } catch { return []; } })() : [g];
    for (const d of dirs) { const p = parseJsonc(read(join(root.dir, d, 'package.json')) || ''); if (p?.name) out.set(p.name, d); }
  }
  return out;
}

const FIXABLE = { 'unused-dependency': 'dependencies', 'unused-dev-dependency': 'devDependencies', 'unused-optional-dependency': 'optionalDependencies' };

/** Remove unused dependencies from package.json, keeping its indentation. Returns the removed [section, name] pairs. */
export function fixPackageJson(dir, report, { dryRun = false, rules = Object.keys(FIXABLE) } = {}) {
  const file = join(dir, 'package.json'); const text = readFileSync(file, 'utf8');
  const pkg = JSON.parse(text); const indent = /^[ \t]+/m.exec(text)?.[0] || '  ';
  const removed = [];
  for (const f of report.findings) {
    const section = FIXABLE[f.rule]; if (!section || !rules.includes(f.rule) || f.suppressed) continue;
    if (pkg[section] && f.subject in pkg[section]) { delete pkg[section][f.subject]; removed.push([section, f.subject]); }
  }
  if (removed.length && !dryRun) writeFileSync(file, JSON.stringify(pkg, null, indent) + (text.endsWith('\n') ? '\n' : ''));
  return removed;
}
