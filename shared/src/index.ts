export const PARAM_RE = /\\@@([a-zA-Z_][a-zA-Z0-9_]*)/g;
export const DESC_RE = /\\@@DESC\{([^}]*)\}\s*\n?/;
export const AUTHOR_NOTES_RE = /\\@@AUTHORNOTES\{([\s\S]*?)\}\s*\n?/;
export const CONVERSION_NOTES_RE = /\\@@CONVERSIONNOTES\{([\s\S]*?)\}\s*\n?/;
export const TAGS_RE = /\\@@TAGS\{([^}]*)\}\s*\n?/;
export const PARAM_DESC_RE = /\\@@PARAMDESC\{([^}]+)\}\{([^}]*)\}\s*\n?/g;

const META_NAMES = new Set(["DESC", "AUTHORNOTES", "CONVERSIONNOTES", "TAGS", "PARAMDESC"]);

export type Template = {
  id: string;
  name: string;
  content: string;
  description: string;
  notes: string;
  conversionNotes?: string;
  tags: string[];
  paramDescs: Record<string, string>;
};

export type Snippet = {
  id: string;
  name: string;
  content: string;
  description: string;
  notes: string;
  conversionNotes?: string;
  tags: string[];
  paramDescs: Record<string, string>;
};

export type SnippetFork = {
  id: string;
  sourceSnippetId: string;
  content: string;
  notes: string;
};

export type ParamBinding =
  | { kind: "text"; value: string }
  | { kind: "fork"; forkId: string };

export type DocumentManifest = {
  id: string;
  name: string;
  baseTemplateId: string;
  hasTemplateOverride: boolean;
  paramBindings: Record<string, ParamBinding>;
  notes: string;
  tags: string[];
};

export type DocumentFull = DocumentManifest & {
  templateContent: string;
  forks: SnippetFork[];
};

export function extractParams(src: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of src.matchAll(PARAM_RE)) {
    if (META_NAMES.has(m[1])) continue;
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

export function extractDesc(src: string): { description: string; stripped: string } {
  const m = src.match(DESC_RE);
  if (!m) return { description: "", stripped: src };
  return { description: m[1], stripped: src.replace(DESC_RE, "") };
}

export function extractAuthorNotes(src: string): { notes: string; stripped: string } {
  const m = src.match(AUTHOR_NOTES_RE);
  if (!m) return { notes: "", stripped: src };
  return { notes: m[1], stripped: src.replace(AUTHOR_NOTES_RE, "") };
}

export function extractConversionNotes(src: string): { notes: string; stripped: string } {
  const m = src.match(CONVERSION_NOTES_RE);
  if (!m) return { notes: "", stripped: src };
  return { notes: m[1], stripped: src.replace(CONVERSION_NOTES_RE, "") };
}

export function extractParamDescs(src: string): { paramDescs: Record<string, string>; stripped: string } {
  const paramDescs: Record<string, string> = {};
  const stripped = src.replace(PARAM_DESC_RE, (_m, name, desc) => {
    paramDescs[name] = desc;
    return "";
  });
  return { paramDescs, stripped };
}

export function injectParamDescs(src: string, paramDescs: Record<string, string>): string {
  const stripped = src.replace(PARAM_DESC_RE, () => "");
  const lines = Object.entries(paramDescs)
    .filter(([, d]) => d.trim())
    .map(([n, d]) => `\\@@PARAMDESC{${n}}{${d}}`);
  if (!lines.length) return stripped;
  return lines.join("\n") + "\n" + stripped;
}

export function extractTags(src: string): { tags: string[]; stripped: string } {
  const m = src.match(TAGS_RE);
  if (!m) return { tags: [], stripped: src };
  const tags = m[1].split(",").map((t) => t.trim()).filter(Boolean);
  return { tags, stripped: src.replace(TAGS_RE, "") };
}

export function injectDesc(src: string, description: string): string {
  const stripped = src.replace(DESC_RE, "");
  if (!description.trim()) return stripped;
  return `\\@@DESC{${description}}\n${stripped}`;
}

export function injectAuthorNotes(src: string, notes: string): string {
  const stripped = src.replace(AUTHOR_NOTES_RE, "");
  if (!notes.trim()) return stripped;
  return `\\@@AUTHORNOTES{${notes}}\n${stripped}`;
}

export function injectConversionNotes(src: string, notes: string): string {
  const stripped = src.replace(CONVERSION_NOTES_RE, "");
  if (!notes.trim()) return stripped;
  return `\\@@CONVERSIONNOTES{${notes}}\n${stripped}`;
}

export function injectTags(src: string, tags: string[]): string {
  const stripped = src.replace(TAGS_RE, "");
  if (!tags.length) return stripped;
  return `\\@@TAGS{${tags.join(",")}}\n${stripped}`;
}

export function assembleBuild(doc: DocumentFull): string {
  const { templateContent, paramBindings, forks } = doc;
  const { stripped: s1 } = extractDesc(templateContent);
  const { stripped: s2 } = extractAuthorNotes(s1);
  const { stripped } = extractParamDescs(s2);
  const params = extractParams(stripped);

  const defs: string[] = [];
  for (const p of params) {
    const b = paramBindings[p];
    let body = "";
    if (b?.kind === "text") body = b.value;
    else if (b?.kind === "fork") {
      const fork = forks.find((f) => f.id === b.forkId);
      body = fork ? fork.content : "";
    }
    defs.push(`\\expandafter\\long\\expandafter\\def\\csname @@${p}\\endcsname{${body}}`);
  }

  const rendered = stripped.replace(PARAM_RE, (_match, name: string) => `\\csname @@${name}\\endcsname`);
  return `\\makeatletter\n${defs.join("\n")}\n${rendered}\n\\makeatother\n`;
}
