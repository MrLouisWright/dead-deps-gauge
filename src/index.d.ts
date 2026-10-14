export * from './core.js';
import type { Report, Config, Rule, Finding } from './core.js';
export const RULES: Record<string, Rule>;
export const DEFAULT_DEV_PATHS: string[];
export interface ScanOptions { ignore?: string[]; ignoreDeps?: string[]; devPaths?: string[]; prodPaths?: string[]; now?: Date }
export function check(dir: string, opts?: ScanOptions, config?: Config & ScanOptions, configFile?: string): Report & { info: { files: number; dependencies: number; devDependencies: number; used: number; usage: Record<string, { prod: number; dev: number }> } };
export function analyze(dir: string, opts?: ScanOptions): { pkg: Record<string, unknown>; info: object; findings: Finding[] };
export function extractImports(source: string): { spec: string; line: number; typeOnly: boolean }[];
export function packageName(specifier: string): string | null;
export function configRefs(fileName: string, text: string): string[];
export function resolveShort(prefix: string, name: string): string[];
export function workspaceRoot(dir: string): { dir: string; pkg: Record<string, unknown> } | null;
export function globToRe(glob: string): RegExp;
