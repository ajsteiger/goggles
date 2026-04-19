import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, "../../data");

export const TEMPLATES_DIR = path.join(DATA_DIR, "templates");
export const SNIPPETS_DIR = path.join(DATA_DIR, "snippets");
export const DOCUMENTS_DIR = path.join(DATA_DIR, "documents");

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
