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
    // Kotak hover (penjelasan error) dan daftar saran digambar di atas halaman,
    // bukan di dalam kotak editor. Tanpa ini, kotak hover untuk baris-baris
    // atas terpotong oleh overflow: hidden pada #editor (style.css).
    fixedOverflowWidgets: true,
  });
}

// Shortcut Ctrl+Enter (Cmd+Enter di Mac) untuk menjalankan aksi tertentu
export function addRunShortcut(
  editor: monaco.editor.IStandaloneCodeEditor,
  action: () => void,
) {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, action);
}

// Penjelasan Bahasa Indonesia (explain.ts) yang ikut ditandai di editor
export interface EditorHint {
  line: number | null;
  title: string;
  tip: string;
}

// Mengubah pesan error arduino-cli menjadi tanda merah/kuning di editor.
// Contoh baris stderr:
//   C:\...\sketch\sketch.ino:5:3: error: 'x' was not declared in this scope
//   sketch.ino:1:10: fatal error: Servoo.h: No such file or directory
// Penjelasan (hints) ditandai biru di baris yang perlu diperiksa, karena
// baris itu bisa berbeda dengan baris di pesan asli (misalnya titik koma
// yang kurang di akhir baris SEBELUMNYA).
export function showCompileErrors(
  editor: monaco.editor.IStandaloneCodeEditor,
  stderr: string,
  hints: readonly EditorHint[] = [],
) {
  const model = editor.getModel();
  if (!model) return;

  const markers: monaco.editor.IMarkerData[] = [];
  const pattern = /sketch\.ino:(\d+):(\d+): (fatal error|error|warning): (.*)/g;
  // Kode bisa sudah diedit sejak dikirim: abaikan baris yang sudah tidak ada
  const validLine = (line: number) => line >= 1 && line <= model.getLineCount();

  for (const match of stderr.matchAll(pattern)) {
    const line = Number(match[1]);
    const col = Number(match[2]);
    if (!validLine(line)) continue;
    markers.push({
      severity:
        match[3] === "warning"
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Error,
      message: match[4],
      startLineNumber: line,
      startColumn: col,
      endLineNumber: line,
      endColumn: model.getLineMaxColumn(line), // garisi sampai akhir baris
    });
  }

  for (const hint of hints) {
    if (hint.line === null || !validLine(hint.line)) continue;
    markers.push({
      severity: monaco.MarkerSeverity.Info,
      message: `${hint.title}\nSaran: ${hint.tip}`,
      startLineNumber: hint.line,
      startColumn: model.getLineFirstNonWhitespaceColumn(hint.line) || 1,
      endLineNumber: hint.line,
      endColumn: model.getLineMaxColumn(hint.line),
    });
  }

  monaco.editor.setModelMarkers(model, "arduino-cli", markers);
}

// Pindahkan kursor ke akhir baris tertentu dan tampilkan di tengah editor
export function goToLine(
  editor: monaco.editor.IStandaloneCodeEditor,
  line: number,
) {
  const model = editor.getModel();
  if (!model || line < 1 || line > model.getLineCount()) return;
  editor.setPosition({
    lineNumber: line,
    column: model.getLineMaxColumn(line),
  });
  editor.revealLineInCenter(line);
  editor.focus();
}

export function clearCompileErrors(
  editor: monaco.editor.IStandaloneCodeEditor,
) {
  const model = editor.getModel();
  if (model) monaco.editor.setModelMarkers(model, "arduino-cli", []);
}
