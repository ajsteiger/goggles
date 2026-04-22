import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { assembleBuild } from "@goggles/shared";
import { api } from "./api.js";
import type { CompileStep } from "./compiler.js";

const PdfPreview = lazy(() => import("./PdfPreview.js").then((module) => ({ default: module.PdfPreview })));
const loadCompiler = (() => {
  let promise: Promise<typeof import("./compiler.js")> | null = null;
  return () => {
    if (!promise) promise = import("./compiler.js");
    return promise;
  };
})();

export function PreviewPanel({ docId }: { docId: string | null }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState<CompileStep | null>(null);
  const [stepDots, setStepDots] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    setPdfUrl(null);
    setError(null);
    setBuildStep(null);
    setStepDots("");
  }, [docId]);

  useEffect(() => {
    if (!building) {
      setStepDots("");
      return;
    }
    const interval = window.setInterval(() => {
      setStepDots((value) => (value === "..." ? "" : `${value}.`));
    }, 350);
    return () => window.clearInterval(interval);
  }, [building, buildStep?.index]);

  useEffect(() => () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); }, []);

  async function render(mode: "preview" | "download") {
    if (!docId) return;
    setBuilding(true);
    setError(null);
    setBuildStep({ index: 1, total: 5, label: "loading document" });
    const doc = await api.getDocument(docId);
    const tex = assembleBuild(doc);
    const { compileTex } = await loadCompiler();
    const result = await compileTex(tex, (step) => setBuildStep({ index: step.index + 1, total: 5, label: step.label }));
    if (!result.ok) {
      setBuilding(false);
      setBuildStep(null);
      setError(result.log ? `${result.error}\n\n${result.log.slice(-2000)}` : result.error);
      return;
    }
    if (mode === "download") {
      setBuilding(false);
      setBuildStep(null);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(result.pdf);
      a.download = `${doc.name}.pdf`;
      a.click();
      return;
    }
    setBuildStep({ index: 5, total: 5, label: "rendering preview" });
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    const url = URL.createObjectURL(result.pdf);
    prevUrl.current = url;
    setPdfUrl(url);
    setBuilding(false);
    setBuildStep(null);
  }

  return (
    <aside className="preview-panel">
      <div className="preview-toolbar">
        <span className="preview-title">preview</span>
        <button onClick={() => render("preview")} disabled={!docId || building}>
          {building ? `step ${buildStep?.index ?? 1} of ${buildStep?.total ?? 5}` : pdfUrl ? "↻ rebuild" : "build"}
        </button>
        <button onClick={() => render("download")} disabled={!docId || building}>↓ pdf</button>
      </div>

      {building && (
        <div className="preview-progress">
          <div className="preview-progress-meta">
            <span>{`step ${buildStep?.index ?? 1} of ${buildStep?.total ?? 5}`}</span>
            <span>{Math.round(((((buildStep?.index ?? 1) - 1) / (buildStep?.total ?? 5)) * 100))}%</span>
          </div>
          <div className="preview-progress-track">
            <div
              className="preview-progress-bar"
              style={{ width: `${(((buildStep?.index ?? 1) - 1) / (buildStep?.total ?? 5)) * 100}%` }}
            />
          </div>
          <div className="preview-progress-label">{`${buildStep?.label ?? "building"}${stepDots}`}</div>
        </div>
      )}

      {error && (
        <div className="preview-error">
          <div className="preview-error-label">latex error</div>
          <pre>{error}</pre>
        </div>
      )}

      {pdfUrl ? (
        <Suspense fallback={<div className="preview-empty">loading preview…</div>}>
          <PdfPreview pdfUrl={pdfUrl} />
        </Suspense>
      ) : (
        !error && !building && (
          <div className="preview-empty">
            {docId ? "click build to render" : "select a document"}
          </div>
        )
      )}
    </aside>
  );
}
