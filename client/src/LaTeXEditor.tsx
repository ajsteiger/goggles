import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";

const latexLang = StreamLanguage.define(stex);

export function LaTeXEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = "120px",
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  minHeight?: string;
}) {
  return (
    <CodeMirror
      value={value}
      extensions={[latexLang]}
      onChange={onChange}
      readOnly={readOnly}
      theme="light"
      basicSetup={{ lineNumbers: false, foldGutter: false }}
      style={{ minHeight, fontSize: "13px", border: "1px solid #ccc6", borderRadius: "4px", background: "#fff" }}
    />
  );
}
