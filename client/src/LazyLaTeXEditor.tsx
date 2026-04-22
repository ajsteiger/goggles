import { Suspense, lazy } from "react";

const LaTeXEditor = lazy(() => import("./LaTeXEditor.js").then((module) => ({ default: module.LaTeXEditor })));

type Props = {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  autoFocus?: boolean;
  compactSingleLine?: boolean;
};

export function LazyLaTeXEditor(props: Props) {
  return (
    <Suspense fallback={<div className="latex-editor" style={{ minHeight: props.minHeight ?? "120px" }} />}>
      <LaTeXEditor {...props} />
    </Suspense>
  );
}
