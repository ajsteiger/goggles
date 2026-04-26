import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_DATA_DIR = path.resolve(__dirname, "../../data");
const DEFAULT_SNIPPETS_DIR = path.join(DEFAULT_DATA_DIR, "snippets");
const DEFAULT_LOCAL_SNIPPETS_DIR = path.join(DEFAULT_DATA_DIR, "snippets-local");
const DEFAULT_GOGGLES_EXPORT_DIR = path.join(REPO_ROOT, "goggles-export");

function resolvePathOverride(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return path.resolve(REPO_ROOT, value);
}

function hasExportCorpus(dir: string): boolean {
  return existsSync(path.join(dir, "export-report.yml"));
}

function resolveCorpusSnippetsDir(): string {
  const override = resolvePathOverride(process.env.GOGGLES_SNIPPETS_DIR);
  if (override) return override;
  if (hasExportCorpus(DEFAULT_GOGGLES_EXPORT_DIR)) return DEFAULT_GOGGLES_EXPORT_DIR;
  return DEFAULT_SNIPPETS_DIR;
}

function resolveLocalSnippetsDir(): string {
  const override = resolvePathOverride(process.env.GOGGLES_LOCAL_SNIPPETS_DIR);
  return override ?? DEFAULT_LOCAL_SNIPPETS_DIR;
}

export const DATA_DIR = DEFAULT_DATA_DIR;

export const TEMPLATES_DIR = path.join(DATA_DIR, "templates");
export const CORPUS_SNIPPETS_DIR = resolveCorpusSnippetsDir();
export const LOCAL_SNIPPETS_DIR = resolveLocalSnippetsDir();
export const DOCUMENTS_DIR = path.join(DATA_DIR, "documents");
export const SNIPPET_READ_DIRS = Array.from(new Set([
  LOCAL_SNIPPETS_DIR,
  CORPUS_SNIPPETS_DIR,
]));
export const OVERRIDE_SNIPPET_ASSET_BASE_DIRS = Array.from(new Set(
  (process.env.GOGGLES_SNIPPET_ASSET_ROOT ?? "")
    .split(path.delimiter)
    .map((value) => resolvePathOverride(value))
    .filter((value): value is string => Boolean(value)),
));
export const SNIPPET_ASSET_BASE_DIRS = Array.from(new Set([
  DOCUMENTS_DIR,
  LOCAL_SNIPPETS_DIR,
  CORPUS_SNIPPETS_DIR,
  ...OVERRIDE_SNIPPET_ASSET_BASE_DIRS,
].filter((value): value is string => Boolean(value))));
export const USING_EXTERNAL_SNIPPETS = CORPUS_SNIPPETS_DIR !== DEFAULT_SNIPPETS_DIR;

export function documentDir(id: string) {
  return path.join(DOCUMENTS_DIR, id);
}
export function documentManifestPath(id: string) {
  return path.join(documentDir(id), "manifest.json");
}
export function documentTemplatePath(id: string) {
  return path.join(documentDir(id), "template.tex");
}
export function documentForksDir(id: string) {
  return path.join(documentDir(id), "forks");
}
export function forkContentPath(docId: string, forkId: string) {
  return path.join(documentForksDir(docId), `${forkId}.tex`);
}
export function forkMetaPath(docId: string, forkId: string) {
  return path.join(documentForksDir(docId), `${forkId}.json`);
}
