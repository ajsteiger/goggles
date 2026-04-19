import { useEffect, useMemo, useState } from "react";
import {
  extractAuthorNotes,
  extractParams,
  assembleBuild,
} from "@goggles/shared/src";
import { LaTeXEditor } from "./LaTeXEditor.js";
import {
  api,
  type DocumentFull,
  type Snippet,
  type ParamBinding,
} from "./api.js";

export function DocumentEditor({ id }: { id: string }) {
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [templateParamDescs, setTemplateParamDescs] = useState<Record<string, string>>({});

  async function reload() {
    const [d, s] = await Promise.all([api.getDocument(id), api.listSnippets()]);
    setDoc(d);
    setSnippets(s);
    const tmpl = await api.getTemplate(d.baseTemplateId);
    setTemplateParamDescs(tmpl?.paramDescs ?? {});
  }
  useEffect(() => { reload(); }, [id]);

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

  async function renameDoc() {
    if (!doc) return;
    const name = prompt("rename", doc.name) ?? doc.name;
    await api.patchDocument(doc.id, { name });
    setDoc({ ...doc, name });
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

  const assembled = assembleBuild(doc);

  function downloadTex() {
    const blob = new Blob([assembled], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${doc!.name}.tex`;
    a.click();
  }

  return (
    <div className="editor">
      <header className="editor-header">
        <h2 onClick={renameDoc}>{doc.name}</h2>
        <span className="template-tag">{doc.baseTemplateId}</span>
        <div className="editor-actions">
          <button onClick={downloadTex}>↓ .tex</button>
        </div>
      </header>

      <section className="params">
        <h3>parameters</h3>
        {params.length === 0 && <div className="empty">no \@@params in template</div>}
        {params.map((p) => {
          const b = doc.paramBindings[p];
          const fork = b?.kind === "fork" ? doc.forks.find((f) => f.id === b.forkId) : null;
          return (
            <div key={p} className="param">
              <div className="param-name">
                <code>\@@{p}</code>
                {templateParamDescs[p] && (
                  <div className="param-desc-hint">{templateParamDescs[p]}</div>
                )}
              </div>
              <div className="param-body">
                <div className="param-mode">
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
                {(!b || b.kind === "text") && (
                  <LaTeXEditor
                    value={b?.kind === "text" ? b.value : ""}
                    onChange={(v) => setBinding(p, { kind: "text", value: v })}
                    minHeight="72px"
                  />
                )}
                {b?.kind === "fork" && fork && (
                  <div className="fork">
                    <div className="fork-head">
                      fork of <code>{fork.sourceSnippetId}</code>
                      <select
                        key={fork.id}
                        defaultValue={fork.sourceSnippetId}
                        onChange={async (e) => {
                          const newSnippetId = e.target.value;
                          const oldForkId = fork.id;
                          const newFork = await api.createFork(doc.id, newSnippetId);
                          const next = { ...doc.paramBindings, [p]: { kind: "fork" as const, forkId: newFork.id } };
                          await api.patchDocument(doc.id, { paramBindings: next });
                          await api.deleteFork(doc.id, oldForkId);
                          await reload();
                        }}
                      >
                        {snippets.map((s) => (
                          <option key={s.id} value={s.id}>{s.id}</option>
                        ))}
                      </select>
                    </div>
                    <LaTeXEditor
                      value={fork.content}
                      onChange={(v) => updateForkContent(fork.id, v)}
                      minHeight="140px"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="assembled">
        <div className="assembled-head">
          <h3>assembled LaTeX</h3>
          <button onClick={() => navigator.clipboard.writeText(assembled)}>copy</button>
        </div>
        <LaTeXEditor value={assembled} readOnly minHeight="200px" />
      </section>
    </div>
  );
}
