import { useEffect, useRef, useState } from "react";
import { compileTex } from "./compiler.js";

export function PreviewPanel({ docId }: { docId: string | null }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    setPdfUrl(null);
    setError(null);
  }, [docId]);

  useEffect(() => () => { if (prevUrl.current) URL.revokeObjectURL(prevUrl.current); }, []);

  async function build() {
    if (!docId) return;
    setBuilding(true);
    setError(null);
    const result = await compileTex(docId);
    setBuilding(false);
    if (!result.ok) {
      setError(result.log ? `${result.error}\n\n${result.log.slice(-2000)}` : result.error);
      return;
    }
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    const url = URL.createObjectURL(result.pdf);
    prevUrl.current = url;
    setPdfUrl(url);
  }

  async function download() {
    if (!docId) return;
    setBuilding(true);
    const result = await compileTex(docId);
    setBuilding(false);
    if (!result.ok) { setError(result.error); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(result.pdf);
    a.download = `document.pdf`;
    a.click();
  }

  return (
    <aside className="preview-panel">
      <div className="preview-toolbar">
        <span className="preview-title">preview</span>
        <button onClick={build} disabled={!docId || building}>
          {building ? "building…" : pdfUrl ? "↻ rebuild" : "build"}
        </button>
        <button onClick={download} disabled={!docId || building}>↓ pdf</button>
      </div>

      {error && (
        <div className="preview-error">
          <div className="preview-error-label">pdflatex error</div>
          <pre>{error}</pre>
        </div>
      )}

      {pdfUrl ? (
        <iframe src={pdfUrl} title="PDF preview" className="preview-iframe" />
      ) : (
        !error && (
          <div className="preview-empty">
            {docId ? "click build to render" : "select a document"}
          </div>
        )
      )}
    </aside>
  );
}
