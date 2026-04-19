export type CompileResult =
  | { ok: true; pdf: Blob }
  | { ok: false; error: string; log?: string };

/**
 * Compile a document to PDF.
 * Currently delegates to the local pdflatex server endpoint.
 * Swap this implementation for SwiftLaTeX WASM when ready:
 *   - load PdfTeXEngine.wasm from /public/swiftlatex/
 *   - call engine.compileLaTeXToBytes(tex) → Uint8Array
 *   - wrap as Blob and return { ok: true, pdf }
 */
export async function compileTex(docId: string): Promise<CompileResult> {
  try {
    const res = await fetch(`/api/documents/${docId}/build`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? res.statusText, log: body.log };
    }
    return { ok: true, pdf: await res.blob() };
  } catch (e: any) {
    return { ok: false, error: e.message ?? "network error" };
  }
}
