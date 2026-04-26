import path from "node:path";

const INCLUDEGRAPHICS_RE = /\\includegraphics(?:\s*\[[^\]]*])?\s*\{([^}]+)\}/g;

function stripTexComments(tex: string): string {
  return tex
    .split("\n")
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") continue;
        let backslashCount = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
          backslashCount += 1;
        }
        if (backslashCount % 2 === 1) continue;
        return line.slice(0, index);
      }
      return line;
    })
    .join("\n");
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "'" && last === "'") || (first === "\"" && last === "\"")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export function normalizeAssetRef(rawRef: string): string {
  const withoutQuotes = stripWrappingQuotes(rawRef);
  if (!withoutQuotes) return "";
  const normalizedSlashes = withoutQuotes.replaceAll("\\", "/");
  const normalizedPath = path.posix.normalize(normalizedSlashes);
  if (normalizedPath === ".") return "";
  return normalizedPath.replace(/^\.\/+/, "");
}

export function isSafeAssetRef(ref: string): boolean {
  if (!ref) return false;
  if (path.posix.isAbsolute(ref)) return false;
  if (/^[a-zA-Z]:\//.test(ref)) return false;
  if (ref === ".." || ref.startsWith("../")) return false;
  return true;
}

export function extractAssetRefs(tex: string): string[] {
  const refs = new Set<string>();
  const liveTex = stripTexComments(tex);
  for (const match of liveTex.matchAll(INCLUDEGRAPHICS_RE)) {
    const ref = normalizeAssetRef(match[1]);
    if (ref) refs.add(ref);
  }
  return Array.from(refs);
}

export function stageDestinationPath(rootDir: string, ref: string): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedDest = path.resolve(rootDir, ref);
  if (resolvedDest === resolvedRoot) return null;
  if (!resolvedDest.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  return resolvedDest;
}

export function candidateAssetSourcePaths(ref: string, docDir: string, baseDirs: string[]): string[] {
  return Array.from(new Set([
    path.join(docDir, ref),
    ...baseDirs.map((baseDir) => path.join(baseDir, ref)),
  ]));
}
