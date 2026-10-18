// Serial Plotter: grafik garis dari angka yang dikirim sketch lewat Serial.
//
// Format yang dikenali (sama dengan Serial Plotter di Arduino IDE 2):
//   Serial.println(nilai);                       -> satu garis "Nilai 1"
//   Serial.print(a); Serial.print(" "); Serial.println(b);  -> "Nilai 1", "Nilai 2"
//   Serial.print("suhu:"); Serial.print(t); Serial.print(",lembab:"); Serial.println(h);
// Pemisah boleh spasi, koma, atau tab. Pesan biasa seperti "A0 = 512" atau
// "Ditekan: 3" juga terbaca, dengan nama di depan angkanya.
// Satu baris (diakhiri println) = satu titik di sumbu X.

export interface PlotSample {
  label: string; // nama garis
  value: number;
}

export const MAX_POINTS = 500; // jumlah titik terakhir yang ditampilkan
export const MAX_SERIES = 8; // jumlah garis paling banyak
const MAX_LABEL = 24;
const MAX_PARTIAL = 1000; // baris tanpa akhir (\n) lebih dari ini dibuang

// Warna garis, cukup terang untuk latar hitam
const COLORS = [
  "#4fc3f7",
  "#ff8a65",
  "#aed581",
  "#ffd54f",
  "#ba68c8",
  "#4db6ac",
  "#f06292",
  "#e0e0e0",
];

// Angka, boleh didahului "nama:" atau "nama =".
// Angka harus berdiri sendiri: "A0" atau "16x2" bukan angka.
const FIELD =
  /(?:([A-Za-z_][\w .]*?)\s*[:=]\s*)?(?<![\w.])(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?![\w.])/g;

// Mengubah satu baris teks menjadi daftar (nama, nilai).
// Baris tanpa angka menghasilkan daftar kosong (diabaikan plotter).
export function parsePlotLine(line: string): PlotSample[] {
  const samples: PlotSample[] = [];
  let unnamed = 0;
  for (const m of line.matchAll(FIELD)) {
    const value = Number(m[2]);
    if (!Number.isFinite(value)) continue;
    const label = m[1]?.trim().slice(0, MAX_LABEL) || `Nilai ${++unnamed}`;
    samples.push({ label, value });
  }
  return samples;
}

interface Series {
  color: string;
  xs: number[]; // nomor baris
  ys: number[];
  legendValue: HTMLSpanElement;
}

// Angka di sumbu Y dan legenda: bulat kalau besar, 2 desimal kalau kecil
function formatValue(v: number, range = Math.abs(v)): string {
  if (range >= 20 || Number.isInteger(v)) return String(Math.round(v));
  return v.toFixed(2);
}

export class SerialPlotter {
  private series = new Map<string, Series>(); // urut sesuai kemunculan
  private partial = ""; // potongan baris yang belum diakhiri \n
  private skipToNewline = false; // buang sisa baris yang terpotong (setelah Clear)
  private lineCount = 0; // jumlah baris berisi angka (sumbu X)
  private dirty = true;
  private visible = false;
  // Ditulis biasa (bukan "constructor(private canvas ...)") karena
  // tsconfig memakai erasableSyntaxOnly
  private canvas: HTMLCanvasElement;
  private legend: HTMLElement;
  private emptyHint: HTMLElement; // petunjuk saat belum ada angka

  constructor(
    canvas: HTMLCanvasElement,
    legend: HTMLElement,
    emptyHint: HTMLElement,
  ) {
    this.canvas = canvas;
    this.legend = legend;
    this.emptyHint = emptyHint;
    // Gambar ulang kalau ukuran kotak berubah (jendela diperkecil, dsb.)
    new ResizeObserver(() => {
      this.dirty = true;
      this.render();
    }).observe(canvas);
  }

  // Teks serial baru (bisa berisi setengah baris; sisanya menunggu \n)
  feed(text: string) {
    if (this.skipToNewline) {
      const nl = text.indexOf("\n");
      if (nl < 0) return;
      text = text.slice(nl + 1);
      this.skipToNewline = false;
    }
    const lines = (this.partial + text).split("\n");
    this.partial = lines.pop() ?? "";
    if (this.partial.length > MAX_PARTIAL) this.partial = "";
    for (const line of lines) this.addLine(line);
  }

  private addLine(line: string) {
    const samples = parsePlotLine(line);
    if (samples.length === 0) return;
    this.lineCount++;
    for (const { label, value } of samples) {
      let s = this.series.get(label);
      if (!s) {
        if (this.series.size >= MAX_SERIES) continue;
        s = this.createSeries(label);
      }
      s.xs.push(this.lineCount);
      s.ys.push(value);
      // Buang titik lama sekaligus beberapa (lebih hemat daripada shift() tiap titik)
      if (s.xs.length > MAX_POINTS + 100) {
        const cut = s.xs.length - MAX_POINTS;
        s.xs.splice(0, cut);
        s.ys.splice(0, cut);
      }
    }
    this.dirty = true;
  }

  // Legenda dibuat dengan createElement + textContent: nama garis berasal
  // dari keluaran sketch, jadi tidak dimasukkan sebagai HTML.
  private createSeries(label: string): Series {
    const color = COLORS[this.series.size % COLORS.length];
    const item = document.createElement("span");
    item.className = "plot-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "plot-swatch";
    swatch.style.background = color;
    const name = document.createElement("span");
    name.textContent = label;
    const legendValue = document.createElement("span");
    legendValue.className = "plot-value";
    item.append(swatch, name, legendValue);
    this.legend.append(item);
    const s: Series = { color, xs: [], ys: [], legendValue };
    this.series.set(label, s);
    return s;
  }

  // fresh = true saat Run (teks serial mulai dari awal baris).
  // Clear di tengah program berjalan: teks berikutnya bisa dimulai di tengah
  // baris (misalnya "us:845" dari "sinus:845"), jadi dibuang sampai \n.
  clear(fresh = false) {
    this.skipToNewline = !fresh;
    this.series.clear();
    this.partial = "";
    this.lineCount = 0;
    this.legend.replaceChildren();
    this.dirty = true;
    this.render();
  }

  setVisible(on: boolean) {
    this.visible = on;
    this.dirty = true;
    this.render();
  }

  // Dipanggil sekali per frame. Hanya menggambar kalau ada data baru
  // dan tab Plotter sedang terlihat (batching, Bab 6.2).
  render() {
    if (!this.dirty || !this.visible) return;
    this.dirty = false;
    this.emptyHint.hidden = this.series.size > 0;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (w === 0 || h === 0) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (this.series.size === 0) return;

    // Jendela sumbu X: MAX_POINTS baris terakhir, bergeser seperti di Arduino IDE
    const xEnd = Math.max(this.lineCount, MAX_POINTS);
    const xStart = xEnd - MAX_POINTS + 1;

    // Skala Y otomatis dari titik yang terlihat, ditambah sedikit ruang
    let min = Infinity;
    let max = -Infinity;
    for (const s of this.series.values()) {
      for (let i = 0; i < s.xs.length; i++) {
        if (s.xs[i] < xStart) continue;
        if (s.ys[i] < min) min = s.ys[i];
        if (s.ys[i] > max) max = s.ys[i];
      }
    }
    if (!Number.isFinite(min)) return;
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;

    const left = 52 * dpr; // ruang angka sumbu Y
    const top = 8 * dpr;
    const bottom = h - 8 * dpr;
    const xOf = (x: number) =>
      left + ((x - xStart) / (MAX_POINTS - 1)) * (w - left - 6 * dpr);
    const yOf = (y: number) =>
      bottom - ((y - min) / (max - min)) * (bottom - top);

    // Garis bantu dan angka sumbu Y
    ctx.font = `${11 * dpr}px Consolas, monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    const TICKS = 5;
    for (let i = 0; i < TICKS; i++) {
      const v = min + ((max - min) * i) / (TICKS - 1);
      const y = Math.round(yOf(v)) + 0.5;
      ctx.strokeStyle = "#262626";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillStyle = "#8a8a8a";
      ctx.fillText(formatValue(v, max - min), left - 6 * dpr, y);
    }

    // Garis setiap data
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = "round";
    for (const s of this.series.values()) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.xs.length; i++) {
        if (s.xs[i] < xStart) continue;
        const px = xOf(s.xs[i]);
        const py = yOf(s.ys[i]);
        if (started) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        started = true;
      }
      ctx.stroke();

      // Nilai terakhir di legenda (hanya ditulis ulang kalau berubah)
      const last = s.ys.length ? formatValue(s.ys[s.ys.length - 1]) : "";
      if (s.legendValue.textContent !== last) s.legendValue.textContent = last;
    }
  }
}
