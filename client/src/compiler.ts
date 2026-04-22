export type CompileResult =
  | { ok: true; pdf: Blob }
  | { ok: false; error: string; log?: string };

export type CompileStep = {
  index: number;
  total: number;
  label: string;
};

declare class PdfTeXEngine {
  loadEngine(): Promise<void>;
  setTexliveEndpoint(url: string): void;
  writeMemFSFile(name: string, content: string | Uint8Array): void;
  setEngineMainFile(name: string): void;
  compileLaTeX(): Promise<{ pdf: Uint8Array; log: string; status: number }>;
  isReady(): boolean;
}

declare global {
  interface Window {
    PdfTeXEngine?: new () => PdfTeXEngine;
  }
}

let engine: PdfTeXEngine | null = null;
let loadPromise: Promise<PdfTeXEngine> | null = null;
let scriptPromise: Promise<void> | null = null;

async function ensureCompileScript() {
  if (window.PdfTeXEngine) return;
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-swiftlatex-engine="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("failed to load compile engine")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "/swiftlatex/PdfTeXEngine.js";
      script.async = true;
      script.dataset.swiftlatexEngine = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("failed to load compile engine"));
      document.body.appendChild(script);
    });
  }
  await scriptPromise;
  if (!window.PdfTeXEngine) throw new Error("compile engine unavailable");
}

export async function warmCompileEngine(onStep?: (step: CompileStep) => void): Promise<PdfTeXEngine> {
  if (engine?.isReady()) return engine;
  if (!loadPromise) {
    loadPromise = (async () => {
      onStep?.({ index: 1, total: 4, label: "loading engine" });
      await ensureCompileScript();
      const Eng = window.PdfTeXEngine;
      if (!Eng) throw new Error("compile engine unavailable");
      const eng = new Eng();
      await eng.loadEngine();
      onStep?.({ index: 2, total: 4, label: "loading tex assets" });
      eng.setTexliveEndpoint(`${window.location.origin}/api/swiftlatex`);
      engine = eng;
      return eng;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

export async function compileTex(tex: string, onStep?: (step: CompileStep) => void): Promise<CompileResult> {
  try {
    const eng = await warmCompileEngine(onStep);
    onStep?.({ index: 3, total: 4, label: "writing files" });
    eng.writeMemFSFile("main.tex", tex);
    eng.setEngineMainFile("main.tex");
    onStep?.({ index: 4, total: 4, label: "compiling" });
    const result = await eng.compileLaTeX();
    if (result.status !== 0) {
      return { ok: false, error: "Compilation failed", log: result.log };
    }
    return { ok: true, pdf: new Blob([result.pdf.buffer as ArrayBuffer], { type: "application/pdf" }) };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "compile error" };
  }
}
