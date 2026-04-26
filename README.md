# Goggles Demo Workflow

Goggles reads snippets from a read-only corpus and writes edits into a separate local overlay.

## Default runtime contract

- Default snippet corpus: `../goggles-export/` when `../goggles-export/export-report.yml` exists, otherwise `data/snippets/`
- Default edit and fork destination: `data/snippets-local/`
- Documents and build artifacts: `data/documents/`

Local overlay wins on reads. If a snippet exists in both `data/snippets-local/` and the corpus, Goggles serves the local copy and leaves the corpus unchanged.

## Environment variables

- `GOGGLES_SNIPPETS_DIR`: overrides the read-only snippet corpus directory. The path is resolved relative to the outer `split-theory` workspace root, not relative to the nested `goggles/` repo.
- `GOGGLES_LOCAL_SNIPPETS_DIR`: overrides the writable overlay directory for snippet edits and forks. The path is resolved relative to the outer `split-theory` workspace root, not relative to the nested `goggles/` repo.
- `GOGGLES_SNIPPET_ASSET_ROOT`: adds extra asset search roots for `\includegraphics{...}` resolution at build time. Provide one or more paths relative to the outer `split-theory` workspace root, separated by your platform path delimiter (`:` on macOS/Linux, `;` on Windows).

## Demo commands

From the parent repo root:

```bash
cd goggles
npm run dev
```

On startup, the server prints whether it is using the external corpus, where snippet writes will land, and the effective resolved extra asset roots, if any.

## Verification commands

From the parent repo root:

```bash
uv run python -m unittest tests.test_curate -q
node goggles/scripts/verify-snippet-overlay.mjs
node goggles/scripts/verify-build-assets.mjs
```

To verify the Goggles build itself:

```bash
cd goggles
npm run build
```
