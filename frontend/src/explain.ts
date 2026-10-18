// Penjelasan error compile dalam Bahasa Indonesia untuk pemula.
// File ini hanya berisi logika (tanpa tampilan, lihat explainPanel.ts).
//
// Pesan asli GCC tetap ditampilkan; penjelasan ini hanya pendamping.
// Beberapa hal yang sengaja ditangani:
// - Error sering ditandai di baris SETELAH baris yang salah (titik koma kurang).
// - Saran GCC ("suggested alternative") kadang menyesatkan: 'high' disarankan
//   menjadi 'sinh', padahal maksudnya HIGH. Saran diambil dari daftar nama
//   Arduino dan nama di kode sendiri, saran GCC hanya dipakai kalau masuk akal.
// - Satu kesalahan bisa memicu banyak error berikutnya (efek domino). Error
//   yang biasanya hanya akibat, hanya dijelaskan kalau ia error pertama.

export interface Explanation {
  line: number | null; // baris yang sebaiknya diperiksa (bisa beda dengan pesan asli)
  title: string;
  detail: string;
  tip: string;
  source: string | null; // isi baris itu, untuk ditampilkan
}

// --- Membaca pesan GCC ---
// Contoh baris: "sketch.ino:5:3: error: 'x' was not declared in this scope"

interface Note {
  file: string;
  line: number;
  message: string;
}

interface Diagnostic {
  line: number | null; // baris di sketch.ino (null kalau error di file lain)
  col: number;
  message: string;
  notes: Note[];
  fn: string | null; // fungsi tempat error, dari "In function 'void loop()':"
}

const DIAG_LINE = /^(.+?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/;
const FUNCTION_LINE = /^sketch\.ino: In function '(.+)':$/;
const isSketch = (file: string) => /(^|[\\/])sketch\.ino$/.test(file);

function parseDiagnostics(stderr: string): Diagnostic[] {
  const list: Diagnostic[] = [];
  let fn: string | null = null;
  let last: Diagnostic | null = null;
  for (const raw of stderr.split(/\r?\n/)) {
    const fnMatch = raw.match(FUNCTION_LINE);
    if (fnMatch) {
      fn = fnMatch[1];
      continue;
    }
    const m = raw.match(DIAG_LINE);
    if (!m) continue;
    const [, file, line, col, kind, message] = m;
    if (kind === "warning") {
      last = null; // catatan sesudah warning bukan milik error sebelumnya
      continue;
    }
    if (kind === "note") {
      last?.notes.push({ file, line: Number(line), message });
      // Error di Arduino.h (misalnya dalam #define HIGH): lokasinya di sketch
      // ada di catatan "in expansion of macro"
      if (last && last.line === null && isSketch(file))
        last.line = Number(line);
      continue;
    }
    last = {
      line: isSketch(file) ? Number(line) : null,
      col: Number(col),
      message,
      notes: [],
      fn,
    };
    list.push(last);
  }
  return list;
}

// --- Data tentang Arduino ---

// Nama-nama Arduino yang sering salah huruf besar/kecil atau salah ketik
const ARDUINO_NAMES = [
  "setup",
  "loop",
  "pinMode",
  "digitalWrite",
  "digitalRead",
  "analogRead",
  "analogWrite",
  "analogReference",
  "delay",
  "delayMicroseconds",
  "millis",
  "micros",
  "tone",
  "noTone",
  "pulseIn",
  "map",
  "constrain",
  "random",
  "randomSeed",
  "attachInterrupt",
  "detachInterrupt",
  "digitalPinToInterrupt",
  "Serial",
  "OUTPUT",
  "INPUT",
  "INPUT_PULLUP",
  "HIGH",
  "LOW",
  "LED_BUILTIN",
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "true",
  "false",
  "byte",
  "boolean",
  "String",
  "abs",
  "min",
  "max",
  "sq",
  "sqrt",
  "pow",
  "bitRead",
  "bitWrite",
  "shiftOut",
  "shiftIn",
  "MSBFIRST",
  "LSBFIRST",
  "CHANGE",
  "RISING",
  "FALLING",
  "DEC",
  "HEX",
  "BIN",
  "Servo",
  "LiquidCrystal",
];

// Jenis (class) dari library, beserta file yang harus di-#include
const LIBRARY_TYPES: Record<string, string> = {
  Servo: "Servo.h",
  LiquidCrystal: "LiquidCrystal.h",
  SoftwareSerial: "SoftwareSerial.h",
  TwoWire: "Wire.h",
  SPISettings: "SPI.h",
  DHT: "DHT.h",
};

// Library yang tersedia di server compile (Servo, LiquidCrystal, dan DHT
// dipasang di Dockerfile, sisanya bawaan core Arduino AVR)
const AVAILABLE_LIBRARIES = [
  "Servo.h",
  "LiquidCrystal.h",
  "DHT.h",
  "Wire.h",
  "SPI.h",
  "EEPROM.h",
  "SoftwareSerial.h",
];

// Isi (argumen) fungsi Arduino yang sering dipakai, untuk error jumlah argumen
const FUNCTION_ARGS: Record<string, { args: string; example: string }> = {
  pinMode: { args: "pin, mode", example: "pinMode(13, OUTPUT);" },
  digitalWrite: { args: "pin, nilai", example: "digitalWrite(13, HIGH);" },
  digitalRead: { args: "pin", example: "int s = digitalRead(2);" },
  analogRead: { args: "pin", example: "int nilai = analogRead(A0);" },
  analogWrite: { args: "pin, nilai 0-255", example: "analogWrite(9, 128);" },
  delay: { args: "lama dalam milidetik", example: "delay(500);" },
  delayMicroseconds: {
    args: "lama dalam mikrodetik",
    example: "delayMicroseconds(10);",
  },
  map: {
    args: "nilai, dariMin, dariMax, keMin, keMax",
    example: "int sudut = map(pot, 0, 1023, 0, 180);",
  },
  constrain: { args: "nilai, min, max", example: "x = constrain(x, 0, 255);" },
};

// Karakter yang sering terbawa saat menyalin kode dari web, Word, atau chat
const STRANGE_CHARS: Record<string, string> = {
  "\u201C": "tanda kutip miring “",
  "\u201D": "tanda kutip miring ”",
  "\u201E": "tanda kutip bawah „",
  "\u2018": "tanda petik miring ‘",
  "\u2019": "tanda petik miring ’",
  "\u00A0": "spasi khusus (non-breaking space)",
  "\u2013": "tanda pisah –",
  "\u2014": "tanda pisah panjang —",
  "\u00D7": "tanda kali ×",
};

// --- Alat bantu ---

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = temp;
    }
  }
  return row[b.length];
}

const quoted = (token: string) =>
  token.replace(/ token$/, "").replace(/^'(.*)'$/, "$1");

class SketchCode {
  readonly lines: string[];
  readonly names: string[]; // semua nama (identifier) yang ada di kode

  constructor(code: string) {
    this.lines = code.split(/\r?\n/);
    this.names = [...new Set(code.match(/\b[A-Za-z_]\w*\b/g) ?? [])];
  }

  text(line: number | null): string | null {
    if (line === null) return null;
    const t = this.lines[line - 1];
    return t === undefined ? null : t;
  }

  indent(line: number): number {
    return (this.text(line) ?? "").search(/\S|$/);
  }

  // Baris kode sebelumnya (melewati baris kosong dan komentar)
  previousCodeLine(line: number): number {
    for (let n = line - 1; n >= 1; n--) {
      const t = (this.text(n) ?? "").trim();
      if (t !== "" && !t.startsWith("//")) return n;
    }
    return line;
  }

  // Cari baris pertama (1-based) yang cocok dengan pola
  find(pattern: RegExp, before = Infinity): number | null {
    for (let i = 0; i < this.lines.length && i + 1 < before; i++) {
      if (pattern.test(this.lines[i])) return i + 1;
    }
    return null;
  }

  // Kurung kurawal yang belum ditutup. Memakai indentasi untuk menebak
  // { mana yang lupa ditutup: } yang tidak sejajar dengan baris pembukanya.
  unclosedBrace(): number | null {
    const stack: number[] = [];
    let suspect: number | null = null;
    let inBlock = false;
    this.lines.forEach((text, i) => {
      let inString: string | null = null;
      for (let c = 0; c < text.length; c++) {
        const ch = text[c];
        if (inBlock) {
          if (ch === "*" && text[c + 1] === "/") ((inBlock = false), c++);
        } else if (inString) {
          if (ch === "\\") c++;
          else if (ch === inString) inString = null;
        } else if (ch === "/" && text[c + 1] === "/") break;
        else if (ch === "/" && text[c + 1] === "*") ((inBlock = true), c++);
        else if (ch === '"' || ch === "'") inString = ch;
        else if (ch === "{") stack.push(i + 1);
        else if (ch === "}") {
          const open = stack.pop();
          const closeAtStart = text.trim().startsWith("}");
          if (
            open &&
            closeAtStart &&
            suspect === null &&
            this.indent(open) !== this.indent(i + 1)
          ) {
            suspect = open;
          }
        }
      }
    });
    if (stack.length === 0) return null;
    return suspect ?? stack[stack.length - 1];
  }
}

// Nama yang mirip: huruf besar/kecil saja yang beda, atau salah ketik 1-2 huruf
function similarName(
  name: string,
  code: SketchCode,
): { name: string; caseOnly: boolean } | null {
  const candidates = [...new Set([...ARDUINO_NAMES, ...code.names])].filter(
    (n) => n !== name,
  );
  const lower = name.toLowerCase();
  const sameLetters = candidates.find((n) => n.toLowerCase() === lower);
  if (sameLetters) return { name: sameLetters, caseOnly: true };
  if (name.length < 4) return null; // nama pendek (x, i, led) terlalu mudah "mirip"
  const maxDistance = name.length >= 6 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const n of candidates) {
    if (Math.abs(n.length - name.length) > maxDistance) continue;
    const d = levenshtein(lower, n.toLowerCase());
    if (d <= maxDistance && d < bestDistance) {
      best = n;
      bestDistance = d;
    }
  }
  return best ? { name: best, caseOnly: false } : null;
}

// Saran dari GCC sendiri: "did you mean 'x'?" atau catatan "suggested alternative"
function gccSuggestion(d: Diagnostic): string | null {
  const m =
    d.message.match(/did you mean '(\w+)'\?/) ??
    d.notes
      .map((n) => n.message.match(/suggested alternative: '(\w+)'/))
      .find(Boolean);
  return m ? m[1] : null;
}

const TYPE_WORDS =
  "(?:const\\s+)?(?:unsigned\\s+)?(?:int|long|short|float|double|bool|boolean|byte|char|word|String|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t)";

// --- Aturan penjelasan ---

interface Context {
  code: SketchCode;
  first: boolean; // error pertama di daftar
  strayLines: Set<number>; // baris yang berisi karakter aneh
  errorLines: Set<number>; // semua baris yang punya error
  failedTypes: Set<string>; // jenis yang "does not name a type"
}

type Rule = (d: Diagnostic, ctx: Context) => Omit<Explanation, "source"> | null;

const RULES: [RegExp, Rule][] = [
  // #define diakhiri titik koma: ikut tertempel di setiap pemakaian
  [
    /./,
    (d, { code }) => {
      const t = code.text(d.line);
      if (!t || !/^\s*#define\b.*;\s*$/.test(t)) return null;
      const name = t.match(/#define\s+(\w+)/)?.[1] ?? "";
      return {
        line: d.line,
        title: "#define tidak memakai titik koma",
        detail:
          `#define bukan perintah biasa: isinya (termasuk ;) ditempel apa adanya di setiap tempat ${name} dipakai, ` +
          `jadi ${name} berubah menjadi "${t.replace(/^\s*#define\s+\w+\s+/, "").trim()}".`,
        tip: `Hapus ; di akhir baris ${d.line}, misalnya: #define ${name} 13`,
      };
    },
  ],
  [
    /^stray '\\\d+' in program$/,
    (d, { code }) => {
      const t = code.text(d.line) ?? "";
      const found = [...new Set([...t].filter((ch) => ch.charCodeAt(0) > 127))];
      const names = found.map((ch) => STRANGE_CHARS[ch] ?? `karakter "${ch}"`);
      const tips: string[] = [];
      if (found.some((ch) => "\u201C\u201D\u201E".includes(ch)))
        tips.push('ganti tanda kutip miring dengan tanda kutip biasa "');
      if (found.some((ch) => "\u2018\u2019".includes(ch)))
        tips.push("ganti tanda petik miring dengan petik biasa '");
      if (found.includes("\u00A0"))
        tips.push("hapus spasi di baris itu lalu ketik ulang spasinya");
      if (found.some((ch) => "\u2013\u2014".includes(ch)))
        tips.push("ganti tanda pisah dengan tanda minus biasa -");
      if (found.includes("\u00D7")) tips.push("ganti × dengan tanda kali *");
      return {
        line: d.line,
        title: "Ada karakter yang tidak dikenal compiler",
        detail:
          `Baris ${d.line} berisi ${names.length ? names.join(", ") : "karakter khusus"}. ` +
          "Karakter seperti ini biasanya ikut terbawa saat menyalin kode dari web, Word, PDF, atau WhatsApp. " +
          "Satu karakter bisa memunculkan beberapa error sekaligus.",
        tip: tips.length
          ? `Di baris ${d.line}: ${tips.join("; ")}.`
          : `Hapus karakter aneh di baris ${d.line} lalu ketik ulang dengan keyboard.`,
      };
    },
  ],
  [
    /^expected (?:';'|',' or ';') before (.+)$/,
    (d, { code }) => {
      const t = code.text(d.line) ?? "";
      if (/\bfor\s*\(/.test(t) && t.includes(",")) {
        return {
          line: d.line,
          title: "Bagian for dipisah titik koma, bukan koma",
          detail:
            "for punya tiga bagian: nilai awal, syarat, dan langkah. Ketiganya dipisah titik koma.",
          tip: "Contoh yang benar: for (int i = 0; i < 10; i++) {",
        };
      }
      const token = quoted(
        d.message.replace(/^expected (?:';'|',' or ';') before /, ""),
      );
      // Kalau yang ditunjuk adalah awal baris, berarti ; kurang di akhir baris sebelumnya
      const atLineStart = d.col - 1 <= code.indent(d.line ?? 1);
      const previous =
        atLineStart && d.line ? code.previousCodeLine(d.line) : d.line;
      // Baris sebelumnya sudah berakhir ; { atau }: kurangnya bukan di sana
      const endsClosed = /[;{}]\s*$/.test(code.text(previous) ?? "");
      const target = endsClosed ? d.line : previous;
      return {
        line: target,
        title: "Titik koma ; kurang",
        detail:
          `Compiler mengharapkan ; sebelum ${token}.` +
          (target !== d.line
            ? ` Pesan aslinya menunjuk baris ${d.line}, tetapi yang kurang adalah akhir baris ${target}: ` +
              "compiler baru sadar saat membaca baris berikutnya."
            : ""),
        tip: `Tambahkan ; di akhir baris ${target}. Di C++, setiap perintah diakhiri titik koma.`,
      };
    },
  ],
  [
    /^a function-definition is not allowed here/,
    (d, { code }) => {
      const name =
        (code.text(d.line) ?? "").match(/(\w+)\s*\(/)?.[1] ?? "fungsi ini";
      const outer = d.fn?.match(/(\w+)\s*\(/)?.[1] ?? "fungsi sebelumnya";
      return {
        line: d.line,
        title: `Kurung } penutup ${outer}() kurang`,
        detail:
          `Compiler mengira ${name}() ditulis DI DALAM ${outer}(), karena ${outer}() belum ditutup dengan }. ` +
          "Di C++, fungsi tidak boleh dibuat di dalam fungsi lain.",
        tip: `Tambahkan } untuk menutup ${outer}() sebelum baris ${d.line}.`,
      };
    },
  ],
  [
    /^expected '}' at end of input$/,
    (d, { code, first }) => {
      if (!first) return null; // biasanya akibat error sebelumnya
      const open = code.unclosedBrace();
      return {
        line: open ?? d.line,
        title: "Kurung kurawal } kurang",
        detail:
          "Ada { yang belum ditutup. Compiler baru sadar setelah sampai di akhir kode, " +
          "jadi baris yang ditandai di pesan asli belum tentu tempat salahnya.",
        tip: open
          ? `Periksa { di baris ${open}: pasangan } nya kemungkinan belum ada. Setiap { harus punya pasangan }.`
          : "Hitung pasangan { dan }. Setiap { harus punya pasangan }.",
      };
    },
  ],
  [
    /^expected declaration before '}' token$/,
    (d, { first }) =>
      first
        ? {
            line: d.line,
            title: "Kurung kurawal } berlebih",
            detail:
              "Ada } yang tidak punya pasangan {, sehingga compiler mengira fungsinya sudah selesai lebih awal.",
            tip: `Hapus } di baris ${d.line}, atau cari { yang tidak sengaja terhapus di atasnya.`,
          }
        : null,
  ],
  [
    /^variable or field '(\w+)' declared void$/,
    (d) => {
      const name = d.message.match(/'(\w+)'/)![1];
      return {
        line: d.line,
        title: `Kurung () setelah ${name} hilang`,
        detail: `Tanpa (), compiler mengira ${name} adalah variabel bertipe void, bukan fungsi.`,
        tip: `Tulis: void ${name}() {`,
      };
    },
  ],
  [
    /^'(\w+)' was not declared in this scope/,
    (d, ctx) => {
      const { code } = ctx;
      const name = d.message.match(/^'(\w+)'/)![1];
      if (d.line !== null && ctx.strayLines.has(d.line)) return null; // akibat karakter aneh
      // Akibat error lain: dideklarasikan dengan jenis yang gagal (lupa #include)
      const declaredWith = code.lines.find((l) =>
        new RegExp(`^\\s*(\\w+)\\s+${name}\\b`).test(l),
      );
      const declType = declaredWith?.match(/^\s*(\w+)/)?.[1];
      if (declType && ctx.failedTypes.has(declType)) return null;

      const gcc = gccSuggestion(d);
      const similar = similarName(name, code);
      if (similar?.caseOnly) {
        return {
          line: d.line,
          title: `Huruf besar/kecil: ${name} seharusnya ${similar.name}`,
          detail: `C++ membedakan huruf besar dan kecil, jadi ${name} dan ${similar.name} dianggap dua nama yang berbeda.`,
          tip: `Ganti ${name} menjadi ${similar.name} di baris ${d.line}.`,
        };
      }

      // Sudah dideklarasikan, tetapi di dalam fungsi lain atau sesudah dipakai
      const declLine = code.find(
        new RegExp(
          `\\b${TYPE_WORDS}\\s+(?:\\w+\\s*(?:=[^,;]*)?,\\s*)*${name}\\b`,
        ),
      );
      // Deklarasinya sendiri error (misalnya array terlalu besar): ini hanya akibat
      if (
        declLine !== null &&
        declLine !== d.line &&
        ctx.errorLines.has(declLine)
      )
        return null;
      if (declLine !== null && declLine !== d.line) {
        if (code.indent(declLine) > 0) {
          return {
            line: d.line,
            title: `${name} hanya dikenal di dalam fungsi tempat ia dibuat`,
            detail:
              `${name} dibuat di baris ${declLine} di dalam sebuah fungsi (variabel lokal), ` +
              "jadi tidak bisa dipakai di fungsi lain.",
            tip: `Pindahkan deklarasi di baris ${declLine} ke atas, di luar semua fungsi (sebelum void setup()), supaya menjadi variabel global.`,
          };
        }
        if (d.line !== null && declLine > d.line) {
          return {
            line: d.line,
            title: `${name} dipakai sebelum dibuat`,
            detail: `${name} baru dibuat di baris ${declLine}, sedangkan dipakai di baris ${d.line}. C++ membaca kode dari atas ke bawah.`,
            tip: `Pindahkan baris ${declLine} ke atas, sebelum void setup().`,
          };
        }
      }

      if (similar) {
        return {
          line: d.line,
          title: `Salah ketik? Mungkin maksudmu ${similar.name}`,
          detail: `Nama ${name} tidak dikenal, tetapi mirip dengan ${similar.name}.`,
          tip: `Ganti ${name} menjadi ${similar.name} di baris ${d.line}.`,
        };
      }
      return {
        line: d.line,
        title: `${name} belum dibuat (dideklarasikan)`,
        detail:
          `Kode memakai nama ${name}, tetapi nama itu belum pernah dibuat.` +
          (gcc
            ? ` Saran '${gcc}' dari compiler kurang tepat, abaikan saja.`
            : ""),
        tip:
          `Buat dulu sebelum dipakai, misalnya: int ${name} = 13; di atas void setup(). ` +
          "Kalau maksudnya nama fungsi atau konstanta Arduino, periksa ejaannya.",
      };
    },
  ],
  [
    /^'class (\w+)' has no member named '(\w+)'/,
    (d) => {
      const [, cls, member] = d.message.match(
        /^'class (\w+)' has no member named '(\w+)'/,
      )!;
      const obj = cls === "HardwareSerial" ? "Serial" : cls;
      const gcc = gccSuggestion(d);
      if (gcc && gcc.toLowerCase() === member.toLowerCase()) {
        return {
          line: d.line,
          title: `Huruf besar/kecil: ${member} seharusnya ${gcc}`,
          detail: "C++ membedakan huruf besar dan kecil pada nama fungsi.",
          tip: `Ganti .${member}( menjadi .${gcc}( di baris ${d.line}.`,
        };
      }
      return {
        line: d.line,
        title: `${obj} tidak punya fungsi ${member}`,
        detail: `Nama fungsi ${member} tidak ada di ${obj}.`,
        tip: gcc
          ? `Mungkin maksudmu ${obj}.${gcc}(...)?`
          : obj === "Serial"
            ? "Fungsi Serial yang sering dipakai: begin, print, println, available, read."
            : "Periksa ejaan nama fungsinya.",
      };
    },
  ],
  [
    /^redefinition of '(.+)'$/,
    (d) => {
      const what = d.message.match(/^redefinition of '(.+)'$/)![1];
      const prev = d.notes.find((n) =>
        /previously defined here/.test(n.message),
      )?.line;
      const fn = what.match(/(\w+)\(\)$/)?.[1];
      if (fn) {
        return {
          line: d.line,
          title: `${fn}() ditulis dua kali`,
          detail:
            "Sketch hanya boleh punya satu fungsi dengan nama yang sama. Ini sering terjadi saat menggabungkan dua sketch.",
          tip: `Gabungkan isi kedua ${fn}() (baris ${prev ?? "?"} dan ${d.line}) menjadi satu, lalu hapus yang lain.`,
        };
      }
      const name = what.split(/\s+/).pop()!;
      return {
        line: d.line,
        title: `Nama ${name} dibuat dua kali`,
        detail: `${name} sudah dibuat di baris ${prev ?? "sebelumnya"}.`,
        tip: `Untuk mengubah nilainya cukup tulis ${name} = ...; tanpa jenis (int dan sebagainya) di depannya. Atau pakai nama lain.`,
      };
    },
  ],
  [
    /^(.+): No such file or directory$/,
    (d) => {
      const header = d.message.replace(/: No such file or directory$/, "");
      const lower = header.toLowerCase();
      const near = AVAILABLE_LIBRARIES.find(
        (h) =>
          h.toLowerCase() === lower || levenshtein(h.toLowerCase(), lower) <= 2,
      );
      if (near) {
        return {
          line: d.line,
          title: `Nama library salah: maksudmu <${near}>?`,
          detail:
            "Nama file library harus persis sama, termasuk huruf besar/kecil.",
          tip: `Ganti menjadi #include <${near}>`,
        };
      }
      return {
        line: d.line,
        title: `Library ${header} tidak ditemukan`,
        detail:
          "Library ini belum terpasang di server compile, atau namanya salah ketik.",
        tip: `Library yang tersedia saat ini: ${AVAILABLE_LIBRARIES.join(", ")}.`,
      };
    },
  ],
  [
    /^'(\w+)' does not name a type/,
    (d, { code }) => {
      const name = d.message.match(/^'(\w+)'/)![1];
      const header = LIBRARY_TYPES[name];
      if (header) {
        return {
          line: d.line,
          title: `Lupa #include <${header}>`,
          detail:
            `${name} berasal dari library, jadi compiler baru mengenalnya setelah library itu di-#include.` +
            (gccSuggestion(d)
              ? ` Saran '${gccSuggestion(d)}' dari compiler tidak tepat.`
              : ""),
          tip: `Tambahkan #include <${header}> di baris paling atas.`,
        };
      }
      const similar = similarName(name, code);
      if (similar?.caseOnly) {
        return {
          line: d.line,
          title: `Huruf besar/kecil: ${name} seharusnya ${similar.name}`,
          detail: "C++ membedakan huruf besar dan kecil.",
          tip: `Ganti ${name} menjadi ${similar.name} di baris ${d.line}.`,
        };
      }
      return outsideFunction(d.line);
    },
  ],
  [
    /^expected constructor, destructor, or type conversion before/,
    (d, { code }) => {
      const t = code.text(d.line) ?? "";
      const fn = t.match(/^\s*(\w+)\s*\([^)]*\)\s*\{?\s*$/)?.[1];
      if (fn && t.includes("{")) {
        return {
          line: d.line,
          title: `Fungsi ${fn}() belum diberi jenis`,
          detail:
            "Setiap fungsi harus diawali jenis nilai yang dikembalikannya.",
          tip: `Tulis void ${fn}() kalau tidak mengembalikan nilai, atau int ${fn}() kalau mengembalikan angka.`,
        };
      }
      return outsideFunction(d.line);
    },
  ],
  [
    /^too (few|many) arguments to function '(.+)'$/,
    (d) => {
      const [, amount, signature] = d.message.match(
        /^too (few|many) arguments to function '(.+)'$/,
      )!;
      const fn = signature.match(/(\w+)\(/)?.[1] ?? signature;
      const info = FUNCTION_ARGS[fn];
      return {
        line: d.line,
        title: `Isi (argumen) ${fn}() ${amount === "few" ? "kurang" : "kelebihan"}`,
        detail: info
          ? `${fn} membutuhkan: ${fn}(${info.args}).`
          : `Bentuk lengkapnya: ${signature}.`,
        tip: info
          ? `Contoh: ${info.example}`
          : "Sesuaikan jumlah isi di dalam kurung dengan bentuk lengkap di atas.",
      };
    },
  ],
  [
    /^expected '\)' before/,
    (d, { code }) => {
      const t = code.text(d.line) ?? "";
      const open = (t.match(/\(/g) ?? []).length;
      const close = (t.match(/\)/g) ?? []).length;
      return {
        line: d.line,
        title: "Kurung tutup ) kurang",
        detail:
          open > close
            ? `Di baris ${d.line} ada ${open} kurung buka ( tetapi hanya ${close} kurung tutup ).`
            : `Compiler mengharapkan ) sebelum ${quoted(d.message.replace(/^expected '\)' before /, ""))}.`,
        tip: "Setiap ( harus punya pasangan ). Contoh: if (digitalRead(2) == LOW) {",
      };
    },
  ],
  [
    /^missing terminating (["']) character$/,
    (d) =>
      d.message.includes('"')
        ? {
            line: d.line,
            title: 'Tanda kutip " belum ditutup',
            detail:
              "Teks harus diapit dua tanda kutip: satu di awal, satu di akhir.",
            tip: 'Contoh: Serial.println("Halo");',
          }
        : {
            line: d.line,
            title: "Tanda petik ' belum ditutup",
            detail:
              "Petik satu ' hanya untuk satu huruf, misalnya 'A'. Untuk teks pakai tanda kutip dua \"...\".",
            tip: "Contoh: char huruf = 'A'; atau Serial.println(\"Halo\");",
          },
  ],
  [
    /^'else' without a previous 'if'$/,
    (d, { code }) => {
      const semicolonIf = code.find(
        /\bif\s*\(.*\)\s*;\s*$/,
        d.line ?? Infinity,
      );
      return {
        line: semicolonIf ?? d.line,
        title: "else tanpa if",
        detail: "else harus langsung mengikuti blok if.",
        tip: semicolonIf
          ? `Hapus ; setelah if (...) di baris ${semicolonIf}. Titik koma di situ membuat if langsung selesai, sehingga else kehilangan pasangannya.`
          : "Pastikan else langsung mengikuti } milik if, tanpa perintah lain di antaranya.",
      };
    },
  ],
  [
    /^lvalue required as left operand of assignment$/,
    (d, { code }) => {
      const t = code.text(d.line) ?? "";
      return {
        line: d.line,
        title: "Sisi kiri tanda = harus variabel",
        detail:
          'Tanda = berarti "isi dengan". Yang di sebelah kirinya harus variabel, bukan angka atau hasil fungsi.',
        tip: /digitalRead/.test(t)
          ? "Untuk menyalakan pin pakai digitalWrite(pin, HIGH). Untuk membandingkan pakai ==, misalnya if (digitalRead(2) == HIGH)."
          : "Untuk membandingkan pakai == (dua tanda sama dengan).",
      };
    },
  ],
  [
    /^assignment of read-only variable '(\w+)'$/,
    (d) => {
      const name = d.message.match(/'(\w+)'/)![1];
      return {
        line: d.line,
        title: `${name} adalah const, nilainya tidak bisa diubah`,
        detail:
          "Variabel yang dibuat dengan const nilainya tetap selama program berjalan.",
        tip: `Hapus kata const di deklarasi ${name} kalau nilainya memang perlu berubah.`,
      };
    },
  ],
  [
    /^size of array '(\w+)' is too large$/,
    (d) => ({
      line: d.line,
      title: "Array terlalu besar",
      detail: "Arduino Uno hanya punya 2 KB RAM dan 32 KB memori program.",
      tip: "Kecilkan ukuran array.",
    }),
  ],
  [
    /^expected primary-expression before/,
    (d, { code, first }) => {
      const t = code.text(d.line) ?? "";
      if (/=>|=</.test(t)) {
        return {
          line: d.line,
          title: "Maksudmu >= atau <=?",
          detail: "Tanda sama dengan selalu ditulis di belakang.",
          tip: "Lebih besar atau sama dengan: >= (bukan =>). Lebih kecil atau sama dengan: <= (bukan =<).",
        };
      }
      if (!first) return null; // biasanya akibat error sebelumnya
      return {
        line: d.line,
        title: `Ada yang hilang sebelum ${quoted(d.message.replace(/^expected primary-expression before /, ""))}`,
        detail:
          "Compiler mengharapkan sebuah nilai di sini, tetapi tidak menemukannya.",
        tip: "Periksa baris ini dan baris di atasnya: mungkin ada kurung, tanda kutip, atau nilai yang belum lengkap.",
      };
    },
  ],
];

function outsideFunction(line: number | null): Omit<Explanation, "source"> {
  return {
    line,
    title: "Perintah ditulis di luar fungsi",
    detail:
      "Di luar fungsi hanya boleh membuat variabel atau fungsi baru (misalnya int x = 5;). " +
      "Perintah seperti pinMode(...) atau x = 5; harus berada di dalam setup() atau loop().",
    tip: `Pindahkan baris ${line} ke dalam setup() (dijalankan sekali) atau loop() (diulang terus).`,
  };
}

// Error saat linking dan ukuran memori (tidak menunjuk baris tertentu)
function explainBuildErrors(
  stderr: string,
  code: SketchCode,
): Omit<Explanation, "source">[] {
  const out: Omit<Explanation, "source">[] = [];
  const missing = new Set(
    [...stderr.matchAll(/undefined reference to `(\w+)'/g)].map((m) => m[1]),
  );
  for (const fn of missing) {
    if (fn === "setup" || fn === "loop") {
      // Salah huruf, misalnya void Loop() atau void SETUP()
      const isWrongCase = (l: string) => {
        const name = l.match(/\bvoid\s+(\w+)\s*\(/)?.[1];
        return !!name && name !== fn && name.toLowerCase() === fn;
      };
      const index = code.lines.findIndex(isWrongCase);
      const wrongLine = index >= 0 ? index + 1 : null;
      const wrong = wrongLine
        ? code.text(wrongLine)!.match(/void\s+(\w+)/)![1]
        : null;
      out.push({
        line: wrongLine,
        title: `Fungsi ${fn}() tidak ditemukan`,
        detail:
          "Setiap sketch Arduino wajib punya void setup() dan void loop(), walaupun isinya kosong.",
        tip: wrong
          ? `Di baris ${wrongLine} tertulis ${wrong}(). Ganti menjadi ${fn}() (huruf kecil semua).`
          : `Tambahkan di kode: void ${fn}() { }`,
      });
    } else {
      out.push({
        line: null,
        title: `Fungsi ${fn} dipakai tetapi isinya tidak ada`,
        detail: `${fn} sudah disebut (dideklarasikan), tetapi isi fungsinya tidak ditemukan.`,
        tip: `Periksa ejaan ${fn}, atau tulis isi fungsinya.`,
      });
    }
  }
  if (/text section exceeds available space|Sketch too big/.test(stderr)) {
    out.push({
      line: null,
      title: "Program terlalu besar untuk Arduino Uno",
      detail:
        "Memori program Uno hanya 32 KB (sekitar 31,5 KB yang bisa dipakai sketch).",
      tip: "Kurangi array atau teks yang besar, atau hapus library yang tidak dipakai.",
    });
  }
  if (/data section exceeds available space|Not enough memory/.test(stderr)) {
    out.push({
      line: null,
      title: "RAM Arduino Uno tidak cukup",
      detail: "Uno hanya punya 2 KB RAM untuk semua variabel.",
      tip: 'Kecilkan array, dan bungkus teks dengan F() supaya tidak memakai RAM, misalnya Serial.println(F("Halo"));',
    });
  }
  return out;
}

// --- Fungsi utama ---
// stderr: pesan error dari server compile; code: kode yang di-compile.
// Hasil kosong berarti tidak ada error dari compiler (misalnya server mati).
export function explainErrors(stderr: string, code: string): Explanation[] {
  const sketch = new SketchCode(code);
  const diags = parseDiagnostics(stderr);
  const ctx: Context = {
    code: sketch,
    first: true,
    strayLines: new Set(
      diags
        .filter((d) => /^stray /.test(d.message) && d.line !== null)
        .map((d) => d.line!),
    ),
    errorLines: new Set(
      diags.filter((d) => d.line !== null).map((d) => d.line!),
    ),
    failedTypes: new Set(
      diags
        .map((d) => d.message.match(/^'(\w+)' does not name a type/)?.[1])
        .filter((t): t is string => !!t),
    ),
  };

  const found: Omit<Explanation, "source">[] = [];
  for (const d of diags) {
    for (const [pattern, rule] of RULES) {
      if (!pattern.test(d.message)) continue;
      const result = rule(d, ctx);
      if (result) {
        found.push(result);
        break;
      }
    }
    ctx.first = false;
  }
  found.push(...explainBuildErrors(stderr, sketch));

  // Satu penjelasan per (judul, baris): 6 error "stray" di satu baris = 1 penjelasan
  const seen = new Set<string>();
  const list = found.filter((e) => {
    const key = `${e.title}@${e.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Ada error dari compiler, tetapi belum ada penjelasan yang cocok
  if (list.length === 0 && diags.length > 0) {
    const line = diags.find((d) => d.line !== null)?.line ?? null;
    list.push({
      line,
      title: "Compiler menemukan kesalahan",
      detail: "Penjelasan untuk pesan ini belum tersedia.",
      tip:
        (line ? `Periksa baris ${line} dan baris di atasnya: ` : "") +
        "compiler sering baru sadar ada yang salah di baris berikutnya.",
    });
  }

  return list.map((e) => ({
    ...e,
    source: sketch.text(e.line)?.trim() ?? null,
  }));
}
