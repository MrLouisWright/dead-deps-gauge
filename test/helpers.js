import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const BIN = fileURLToPath(new URL('../bin/dead-deps-gauge.js', import.meta.url));
export const APP = fileURLToPath(new URL('./fixtures/app', import.meta.url));
export const tmp = () => mkdtempSync(join(tmpdir(), 'dd-'));
export function proj(files) { const d = tmp(); for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), typeof c === 'string' ? c : JSON.stringify(c)); } return d; }
export function run(args) { const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }); return { code: r.status, out: r.stdout, err: r.stderr }; }
