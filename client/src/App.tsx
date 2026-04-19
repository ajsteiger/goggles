import { useState } from "react";
import { LeftPanel } from "./LeftPanel.js";
import { DocumentEditor } from "./DocumentEditor.js";
import { PreviewPanel } from "./PreviewPanel.js";

export function App() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="app">
      <LeftPanel activeDocId={activeId} onSelectDoc={setActiveId} />
      <main className="main">
        {activeId ? (
          <DocumentEditor key={activeId} id={activeId} />
        ) : (
          <div className="empty">select or create a document</div>
        )}
      </main>
      <PreviewPanel docId={activeId} />
    </div>
  );
}
