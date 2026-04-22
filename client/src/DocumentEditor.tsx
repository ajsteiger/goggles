import { useEffect, useMemo, useState } from "react";
import {
  extractAuthorNotes,
  extractParams,
  assembleBuild,
} from "@goggles/shared";

function fuzzyMatchSnippet(query: string, snippet: Snippet): boolean {
  if (!query.trim()) return true;
  const haystack = [snippet.id, snippet.description, ...snippet.tags].join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}
import { LazyLaTeXEditor } from "./LazyLaTeXEditor.js";
import { TagEditor } from "./TagEditor.js";
import {
  api,
  type DocumentFull,
  type Snippet,
  type ParamBinding,
} from "./api.js";

export function DocumentEditor({
  id,
  baseTemplateId,
  autoFocusEditor = false,
  onFocused,
  onForked,
}: {
  id: string;
  baseTemplateId: string;
  autoFocusEditor?: boolean;
  onFocused?: () => void;
  onForked?: (id: string) => void;
}) {
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [templateParamDescs, setTemplateParamDescs] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [forkName, setForkName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [forkQuery, setForkQuery] = useState<Record<string, string>>({});
  const [templateView, setTemplateView] = useState<"template" | "assembled">("template");
  const [templateDraft, setTemplateDraft] = useState("");

  async function reload() {
    const [d, s, tmpl] = await Promise.all([
      api.getDocument(id),
      api.listSnippets(),
      api.getTemplate(baseTemplateId),
    ]);
    setDoc(d);
    setName(d.name);
    setTags(d.tags ?? []);
    setEditingName(false);
    setForkName(`${d.name} copy`);
    setTemplateDraft(d.templateContent);
    setSnippets(s);
    setTemplateParamDescs(tmpl?.paramDescs ?? {});
  }
  useEffect(() => { reload(); }, [id]);

  useEffect(() => {
    if (!autoFocusEditor) return;
    onFocused?.();
  }, [autoFocusEditor, onFocused]);

  const params = useMemo(() => {
    if (!doc) return [];
    const { stripped } = extractAuthorNotes(doc.templateContent);
    return extractParams(stripped);
  }, [doc]);

  if (!doc) return <div className="empty">loading…</div>;

  async function setBinding(name: string, b: ParamBinding | null) {
    if (!doc) return;
    const next = { ...doc.paramBindings };
    if (b) next[name] = b;
    else delete next[name];
    await api.patchDocument(doc.id, { paramBindings: next });
    setDoc({ ...doc, paramBindings: next });
  }

  async function saveName() {
    if (!doc) return;
    const trimmed = name.trim() || doc.name;
    await api.patchDocument(doc.id, { name: trimmed });
    setDoc({ ...doc, name: trimmed });
    setName(trimmed);
  }

  async function updateTags(next: string[]) {
    if (!doc) return;
    await api.patchDocument(doc.id, { tags: next });
    setDoc({ ...doc, tags: next });
    setTags(next);
  }

  async function forkDocument() {
    if (!doc) return;
    const trimmed = forkName.trim();
    if (!trimmed) return;
    const created = await api.forkDocument(doc.id, trimmed);
    setForkName(`${created.name} copy`);
    onForked?.(created.id);
  }

  async function addFork(name: string, sourceSnippetId: string) {
    if (!doc) return;
    const fork = await api.createFork(doc.id, sourceSnippetId);
    await setBinding(name, { kind: "fork", forkId: fork.id });
    await reload();
  }

  async function updateForkContent(forkId: string, content: string) {
    if (!doc) return;
    await api.updateFork(doc.id, forkId, { content });
    setDoc({
      ...doc,
      forks: doc.forks.map((f) => (f.id === forkId ? { ...f, content } : f)),
    });
  }

  async function updateTemplateContent(content: string) {
    if (!doc) return;
    setTemplateDraft(content);
    await api.setDocumentTemplate(doc.id, content);
    setDoc({ ...doc, templateContent: content, hasTemplateOverride: true });
  }

  const assembled = doc ? assembleBuild(doc) : "";

  function downloadTex() {
    if (!doc) return;
    const blob = new Blob([assembled], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name}.tex`;
    a.click();
  }

  return (
    <div className="entity-editor">
      <header className="entity-editor-header">
        <div className="entity-title-row">
          {editingName ? (
            <input
              className="entity-title-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={async () => {
                await saveName();
                setEditingName(false);
              }}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  await saveName();
                  setEditingName(false);
                }
                if (e.key === "Escape") {
                  setName(doc.name);
                  setEditingName(false);
                }
              }}
              autoFocus
            />
          ) : (
            <button className="entity-title-button" onClick={() => setEditingName(true)}>
              <h2>{doc.name}</h2>
            </button>
          )}
          <span className="template-tag">{doc.baseTemplateId}</span>
        </div>
        <div className="editor-actions editor-actions-wide">
          <input type="text" value={forkName} onChange={(e) => setForkName(e.target.value)} placeholder="copy name…" />
          <button onClick={forkDocument}>copy</button>
          <button onClick={downloadTex}>↓ .tex</button>
        </div>
      </header>

      <label className="field">
        <span>tags</span>
        <TagEditor tags={tags} onChange={updateTags} placeholder="add tag…" />
      </label>

      <section className="params">
        <h3>parameters</h3>
        {params.length === 0 && <div className="empty">no \@@params in template</div>}
        {params.map((p, index) => {
          const b = doc.paramBindings[p];
          const fork = b?.kind === "fork" ? doc.forks.find((f) => f.id === b.forkId) : null;
          const shouldFocus = autoFocusEditor && index === 0;
          return (
            <div key={p} className="param param-grid">
              <div className="param-name param-cell-title">
                <code>\@@{p}</code>
                {templateParamDescs[p] && (
                  <div className="param-desc-hint">{templateParamDescs[p]}</div>
                )}
              </div>
              <div className="param-mode param-cell-mode">
                <label>
                  <input
                    type="radio"
                    checked={!b || b.kind === "text"}
                    onChange={() => setBinding(p, { kind: "text", value: b?.kind === "text" ? b.value : "" })}
                  />
                  text
                </label>
                <label>
                  <input
                    type="radio"
                    checked={b?.kind === "fork"}
                    onChange={() => { if (snippets[0]) addFork(p, snippets[0].id); }}
                  />
                  fork
                </label>
              </div>
              <div className="param-cell-picker">
                {b?.kind === "fork" && (
                  <div className="fork-picker-inline">
                    <input
                      type="search"
                      value={forkQuery[p] ?? ""}
                      onChange={(e) => setForkQuery((current) => ({ ...current, [p]: e.target.value }))}
                      placeholder="filter questions…"
                    />
                    <select
                      size={5}
                      value={fork?.sourceSnippetId ?? ""}
                      onChange={async (e) => {
                        if (!doc || !fork) return;
                        const newSnippetId = e.target.value;
                        const oldForkId = fork.id;
                        const newFork = await api.createFork(doc.id, newSnippetId);
                        const next = { ...doc.paramBindings, [p]: { kind: "fork" as const, forkId: newFork.id } };
                        await api.patchDocument(doc.id, { paramBindings: next });
                        await api.deleteFork(doc.id, oldForkId);
                        const createdFork = await api.getDocument(doc.id);
                        setDoc(createdFork);
                      }}
                    >
                      {snippets.filter((s) => fuzzyMatchSnippet(forkQuery[p] ?? "", s)).map((s) => (
                        <option key={s.id} value={s.id}>{s.id}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="param-cell-editor">
                {(!b || b.kind === "text") && (
                  <LazyLaTeXEditor
                    value={b?.kind === "text" ? b.value : ""}
                    onChange={(v) => setBinding(p, { kind: "text", value: v })}
                    minHeight="34px"
                    compactSingleLine
                    autoFocus={shouldFocus}
                  />
                )}
                {b?.kind === "fork" && fork && (
                  <LazyLaTeXEditor
                    value={fork.content}
                    onChange={(v) => updateForkContent(fork.id, v)}
                    minHeight="140px"
                  />
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="assembled">
        <div className="assembled-head">
          <h3>{templateView === "template" ? "template" : "assembled LaTeX"}</h3>
          <div className="editor-actions">
            <button onClick={() => setTemplateView(templateView === "template" ? "assembled" : "template")}>
              {templateView === "template" ? "show assembled" : "show template"}
            </button>
            {templateView === "assembled" && <button onClick={() => navigator.clipboard.writeText(assembled)}>copy</button>}
          </div>
        </div>
        {templateView === "template" ? (
          <LazyLaTeXEditor value={templateDraft} onChange={updateTemplateContent} minHeight="260px" />
        ) : (
          <LazyLaTeXEditor value={assembled} readOnly minHeight="260px" />
        )}
      </section>
    </div>
  );
}
