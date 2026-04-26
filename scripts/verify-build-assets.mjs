import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gogglesRoot = path.resolve(__dirname, "..");

function buildServer() {
  execFileSync("npm", ["run", "build", "-w", "shared"], {
    cwd: gogglesRoot,
    stdio: "inherit",
  });
  execFileSync("npm", ["run", "build", "-w", "server"], {
    cwd: gogglesRoot,
    stdio: "inherit",
  });
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function main() {
  buildServer();

  const { snippets, documents } = await import(pathToFileURL(path.join(gogglesRoot, "server", "dist", "storage.js")).href);
  const { buildDocumentPdf, handleBuildRequest } = await import(pathToFileURL(path.join(gogglesRoot, "server", "dist", "routes", "build.js")).href);
  const { documentDir } = await import(pathToFileURL(path.join(gogglesRoot, "server", "dist", "paths.js")).href);

  const connectivity = await snippets.get("intake-connectivity");
  const drawing = await snippets.get("intake-drawing");
  assert.ok(connectivity, "expected intake-connectivity snippet");
  assert.ok(drawing, "expected intake-drawing snippet");

  const createdDocIds = [];

  async function createExamDoc(name, q1, q2 = " ") {
    const doc = await documents.create("exam", name);
    createdDocIds.push(doc.id);
    await documents.updateManifest(doc.id, {
      paramBindings: {
        title: { kind: "text", value: name },
        q1: { kind: "text", value: q1 },
        q2: { kind: "text", value: q2 },
      },
    });
    return doc.id;
  }

  try {
    const plainDocId = await createExamDoc("verify-build-assets plain", connectivity.content);
    const plainResult = await buildDocumentPdf(plainDocId);
    assert.equal(plainResult.ok, true, `expected plain snippet build to succeed, got ${JSON.stringify(plainResult)}`);
    assert.ok(Buffer.isBuffer(plainResult.pdf), "expected plain snippet PDF buffer");
    assert.ok(plainResult.pdf.length > 0, "expected non-empty plain snippet PDF");

    const drawingDocId = await createExamDoc("verify-build-assets drawing", drawing.content);
    const drawingResult = await buildDocumentPdf(drawingDocId);
    assert.equal(drawingResult.ok, true, `expected image-backed snippet build to succeed, got ${JSON.stringify(drawingResult)}`);
    assert.ok(Buffer.isBuffer(drawingResult.pdf), "expected image-backed snippet PDF buffer");
    assert.ok(drawingResult.pdf.length > 0, "expected non-empty image-backed PDF");

    const missingDocId = await createExamDoc(
      "verify-build-assets missing",
      "\\begin{center}\\includegraphics[width=0.4\\textwidth]{assets/__missing__/fixture.pdf}\\end{center}",
    );
    const missingResult = await buildDocumentPdf(missingDocId);
    assert.equal(missingResult.ok, false, "expected missing asset build to fail");
    assert.equal(missingResult.error, "missing assets", `expected missing-assets diagnostic, got ${JSON.stringify(missingResult)}`);
    assert.deepEqual(missingResult.missingAssets, ["assets/__missing__/fixture.pdf"]);

    const unsafeDocId = await createExamDoc(
      "verify-build-assets unsafe",
      [
        "\\begin{center}",
        "\\includegraphics[width=0.4\\textwidth]{../outside/escape.pdf}",
        "\\includegraphics[width=0.4\\textwidth]{/tmp/escape.pdf}",
        "\\end{center}",
      ].join("\n"),
    );
    const unsafeResult = await buildDocumentPdf(unsafeDocId);
    assert.equal(unsafeResult.ok, false, "expected unsafe asset refs build to fail");
    assert.equal(unsafeResult.error, "missing assets", `expected unsafe refs to be rejected as missing-assets, got ${JSON.stringify(unsafeResult)}`);
    assert.deepEqual(unsafeResult.missingAssets, ["../outside/escape.pdf", "/tmp/escape.pdf"]);

    const commentedDocId = await createExamDoc(
      "verify-build-assets commented",
      [
        "% \\includegraphics[width=0.4\\textwidth]{assets/__missing__/commented.pdf}",
        connectivity.content,
      ].join("\n"),
    );
    const commentedResult = await buildDocumentPdf(commentedDocId);
    assert.equal(commentedResult.ok, true, `expected commented-out includegraphics to be ignored, got ${JSON.stringify(commentedResult)}`);
    assert.ok(Buffer.isBuffer(commentedResult.pdf), "expected commented ref case PDF buffer");
    assert.ok(commentedResult.pdf.length > 0, "expected non-empty commented ref case PDF");

    const nonFileDocId = await createExamDoc(
      "verify-build-assets non-file",
      "\\begin{center}\\includegraphics[width=0.4\\textwidth]{assets/verify-build-assets/non-file.pdf}\\end{center}",
    );
    const nonFileAssetPath = path.join(
      documentDir(nonFileDocId),
      "assets",
      "verify-build-assets",
      "non-file.pdf",
    );
    await mkdir(nonFileAssetPath, { recursive: true });
    const nonFileResult = await buildDocumentPdf(nonFileDocId);
    assert.equal(nonFileResult.ok, false, "expected non-regular asset source build to fail");
    assert.equal(nonFileResult.error, "missing assets", `expected non-regular asset source to be treated as unresolved, got ${JSON.stringify(nonFileResult)}`);
    assert.deepEqual(nonFileResult.missingAssets, ["assets/verify-build-assets/non-file.pdf"]);

    const routeSuccessDocId = await createExamDoc("verify-build-route success", connectivity.content);
    const routeSuccessResponse = createMockResponse();
    await handleBuildRequest({ params: { id: routeSuccessDocId } }, routeSuccessResponse);
    assert.equal(routeSuccessResponse.statusCode, 200, "expected route-level build success");
    assert.equal(routeSuccessResponse.headers.get("content-type"), "application/pdf", "expected PDF route content type");
    assert.ok(Buffer.isBuffer(routeSuccessResponse.body), "expected route-level PDF buffer");
    assert.ok(routeSuccessResponse.body.length > 0, "expected non-empty route-level PDF response");

    const routeMissingDocId = await createExamDoc(
      "verify-build-route missing",
      "\\begin{center}\\includegraphics[width=0.4\\textwidth]{assets/__missing__/route-fixture.pdf}\\end{center}",
    );
    const routeMissingResponse = createMockResponse();
    await handleBuildRequest({ params: { id: routeMissingDocId } }, routeMissingResponse);
    assert.equal(routeMissingResponse.statusCode, 422, "expected route-level missing-assets failure");
    assert.deepEqual(routeMissingResponse.body, {
        error: "missing assets",
        missingAssets: ["assets/__missing__/route-fixture.pdf"],
      });
  } finally {
    await Promise.all(
      createdDocIds.map((docId) => rm(documentDir(docId), { recursive: true, force: true })),
    );
  }

  console.log("verify-build-assets: PASS");
}

main().catch((error) => {
  console.error("verify-build-assets: FAIL");
  console.error(error);
  process.exit(1);
});
