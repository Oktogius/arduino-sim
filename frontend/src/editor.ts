// Editor kode berbasis Monaco (editor yang sama dengan VS Code).
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";

// Monaco menjalankan sebagian pekerjaannya di Web Worker (thread terpisah)
// agar mengetik tetap lancar. Vite membuat worker lewat akhiran "?worker".
self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

export function createEditor(container: HTMLElement, initialCode: string) {
  return monaco.editor.create(container, {
    value: initialCode,
    language: "cpp", // sketch Arduino pada dasarnya C++
    theme: "vs-dark",
    fontFamily: "Consolas, monospace",
    fontSize: 14,
    minimap: { enabled: false },
    automaticLayout: true, // ikut menyesuaikan saat ukuran jendela berubah
    scrollBeyondLastLine: false,
    tabSize: 2,
  });
}

// Shortcut Ctrl+Enter (Cmd+Enter di Mac) untuk menjalankan aksi tertentu
export function addRunShortcut(
  editor: monaco.editor.IStandaloneCodeEditor,
  action: () => void,
) {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, action);
}

// Mengubah pesan error arduino-cli menjadi tanda merah/kuning di editor.
// Contoh baris stderr:
//   C:\...\sketch\sketch.ino:5:3: error: 'x' was not declared in this scope
export function showCompileErrors(
  editor: monaco.editor.IStandaloneCodeEditor,
  stderr: string,
) {
  const model = editor.getModel();
  if (!model) return;

  const markers: monaco.editor.IMarkerData[] = [];
  const pattern = /sketch\.ino:(\d+):(\d+): (error|warning): (.*)/g;

  for (const match of stderr.matchAll(pattern)) {
    const line = Number(match[1]);
    const col = Number(match[2]);
    markers.push({
      severity:
        match[3] === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      message: match[4],
      startLineNumber: line,
      startColumn: col,
      endLineNumber: line,
      endColumn: model.getLineMaxColumn(line), // garisi sampai akhir baris
    });
  }

  monaco.editor.setModelMarkers(model, "arduino-cli", markers);
}

export function clearCompileErrors(
  editor: monaco.editor.IStandaloneCodeEditor,
) {
  const model = editor.getModel();
  if (model) monaco.editor.setModelMarkers(model, "arduino-cli", []);
}
