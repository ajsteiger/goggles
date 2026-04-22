import { Suspense, lazy, useEffect, useState } from "react";
import { LeftPanel } from "./LeftPanel.js";

type Mode = "docs" | "templates" | "snippets";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

const loadDocsBrowser = () => import("./DocsBrowser.js");
const loadItemBrowser = () => import("./ItemBrowser.js");
const loadPreviewPanel = () => import("./PreviewPanel.js");

const DocsBrowser = lazy(() => loadDocsBrowser().then((module) => ({ default: module.DocsBrowser })));
const TemplateBrowser = lazy(() => loadItemBrowser().then((module) => ({ default: module.TemplateBrowser })));
const SnippetBrowser = lazy(() => loadItemBrowser().then((module) => ({ default: module.SnippetBrowser })));
const PreviewPanel = lazy(() => loadPreviewPanel().then((module) => ({ default: module.PreviewPanel })));

export function App() {
  const [mode, setMode] = useState<Mode>("docs");
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  useEffect(() => {
    const w = window as IdleWindow;
    const preload = () => {
      void loadDocsBrowser();
      void loadItemBrowser();
      void loadPreviewPanel();
    };
    if (w.requestIdleCallback) {
      const handle = w.requestIdleCallback(preload);
      return () => w.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(preload, 150);
    return () => window.clearTimeout(handle);
  }, []);

  return (
    <div className={mode === "docs" ? "app" : "app no-preview"}>
      <LeftPanel mode={mode} onChangeMode={setMode} />
      <main className="main">
        <Suspense fallback={<div className="empty">loading…</div>}>
          {mode === "docs" && <DocsBrowser onSelectDoc={setActiveDocId} />}
          {mode === "templates" && <TemplateBrowser />}
          {mode === "snippets" && <SnippetBrowser />}
        </Suspense>
      </main>
      {mode === "docs" && (
        <Suspense fallback={<aside className="preview-panel"><div className="preview-empty">loading preview…</div></aside>}>
          <PreviewPanel docId={activeDocId} />
        </Suspense>
      )}
    </div>
  );
}
