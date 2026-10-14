// Extract module specifiers from JS/TS source without a parser.
import { builtinModules } from 'node:module';

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
export const isBuiltin = (s) => BUILTINS.has(s) || s.startsWith('node:') || BUILTINS.has(s.split('/')[0]);
export const BUILTIN_NAMES = new Set(builtinModules.filter((m) => !m.startsWith('_') && !m.includes('/')));

/** Remove comments; keep string and template contents (so specifiers survive) and regex-ish text. */
export function stripComments(src) {
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const chunk = src.slice(i, e === -1 ? n : e + 2); out += chunk.replace(/[^\n]/g, ' '); i = e === -1 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; else if (c !== '`' && src[j] === '\n') break; j++; }
      const lit = src.slice(i, j + 1);
      // multi-line or interpolated template literals are usually code samples: blank them (keep newlines)
      // ...and strings that themselves contain quotes are code-in-a-string (specifiers never contain quotes)
      const inner = lit.slice(1, -1);
      const blank = (c === '`' && (inner.includes('\n') || inner.includes('${'))) || /["'`]/.test(inner);
      out += blank ? c + inner.replace(/[^\n]/g, ' ') + c : lit; i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

const PATTERNS = [
  /\bimport\s+(type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  /\bexport\s+(type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*["']([^"'\n]+)["']/g,
  /\bimport\s*\(\s*()["'`]([^"'`\n$]+)["'`]\s*[,)]/g,
  /\brequire(?:\.resolve)?\s*\(\s*()["'`]([^"'`\n$]+)["'`]\s*\)/g,
  /\bimport\s+\w+\s*=\s*require\s*\(\s*()["']([^"'\n]+)["']\s*\)/g,
  /\b(?:jest|vi)\.(?:mock|requireActual|importActual|doMock)\s*\(\s*()["']([^"'\n]+)["']/g,
];

/** Returns [{ spec, line, typeOnly }] */
export function extractImports(src) {
  const code = stripComments(src);
  const res = [];
  for (const re of PATTERNS) for (const m of code.matchAll(re)) res.push({ spec: m[2].trim(), typeOnly: !!m[1], index: m.index });
  // triple-slash directives are only valid in the file header
  let idx = 0;
  for (const ln of src.split('\n')) {
    const t = ln.trim();
    if (t && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('#!')) break;
    const m = /^\/\/\/\s*<reference\s+types=["']([^"']+)["']/.exec(t);
    if (m) res.push({ spec: m[1], typeOnly: true, index: idx });
    idx += ln.length + 1;
  }
  // compute lines lazily (sorted)
  res.sort((a, b) => a.index - b.index);
  let line = 1; let pos = 0;
  for (const r of res) { for (; pos < r.index; pos++) if (code.charCodeAt(pos) === 10) line++; r.line = line; delete r.index; }
  const seen = new Set();
  return res.filter((r) => { const k = `${r.spec}:${r.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Bare package name from a specifier, or null for relative/builtin/url/subpath-imports. */
export function packageName(spec) {
  if (!spec || /^[./]/.test(spec) || spec.startsWith('#') || /^[a-z]+:/i.test(spec) && !spec.startsWith('node:') || /^(https?|data|file|virtual):/.test(spec) || spec.startsWith('~')) return null;
  if (spec.startsWith('node:') || isBuiltin(spec)) return null;
  const s = spec.replace(/^npm:/, '');
  const parts = s.split('/');
  if (s.startsWith('@')) return parts.length >= 2 && parts[1] ? `${parts[0]}/${parts[1]}` : null;
  const name = parts[0].split('!')[0];
  return /^[\w.-]+$/.test(name) ? name : null;
}
