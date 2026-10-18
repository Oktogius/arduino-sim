// Model rangkaian: daftar komponen beserta pin dan warnanya.
// File ini hanya berisi data dan aturan, tanpa tampilan (tampilan di board.ts).

import { DIGITAL_PINS, ANALOG_PINS } from "./pins";

export type PartType = "led" | "button" | "pot" | "servo" | "lcd";

export interface Part {
  id: number; // nomor unik selama halaman terbuka (tidak ikut disimpan)
  type: PartType;
  pins: string[]; // kunci di PINS, urut sesuai PIN_ROLES (komponen biasa: 1 pin)
  color: string; // '' untuk komponen tanpa pilihan warna
}

export const PART_NAMES: Record<PartType, string> = {
  led: "LED",
  button: "Tombol",
  pot: "Potensiometer",
  servo: "Servo",
  lcd: "LCD 16x2",
};

// Nama tiap pin komponen. Komponen satu pin cukup [''] (tanpa label).
// Urutan pin LCD sama dengan urutan di kode: LiquidCrystal lcd(RS, E, D4, D5, D6, D7)
export const PIN_ROLES: Record<PartType, string[]> = {
  led: [""],
  button: [""],
  pot: [""],
  servo: [""],
  lcd: ["RS", "E", "D4", "D5", "D6", "D7"],
};

// Warna yang tersedia. Komponen baru mengambil warna berikutnya secara bergiliran.
const COLORS: Record<PartType, string[]> = {
  led: ["red", "green", "yellow", "blue", "white"],
  button: ["green", "red", "blue", "yellow", "black"],
  pot: [""],
  servo: [""],
  lcd: [""],
};

// Pin dipindah ke depan daftar, sisanya mengikuti urutan biasa
const preferring = (first: string[]) => [
  ...first,
  ...DIGITAL_PINS.filter((p) => !first.includes(p)),
];

// Urutan pin yang dicoba saat menambah komponen baru, mengikuti kebiasaan
// contoh Arduino: LED dari 13 turun, tombol dari 2 naik, servo di 9 (Sweep/Knob),
// LCD di 12, 11, 5, 4, 3, 2 (HelloWorld LiquidCrystal).
const PIN_PREFERENCE: Record<PartType, string[]> = {
  led: [
    ...DIGITAL_PINS.filter((p) => !p.startsWith("A")).reverse(),
    ...ANALOG_PINS,
  ],
  button: DIGITAL_PINS,
  pot: ANALOG_PINS,
  servo: preferring(["9", "10"]),
  lcd: preferring(["12", "11", "5", "4", "3", "2"]),
};

let nextId = 1;

export function allowedPins(type: PartType): string[] {
  return type === "pot" ? ANALOG_PINS : DIGITAL_PINS;
}

// Semua pin yang sedang dipakai, kecuali satu pin milik komponen exceptId
// di urutan exceptIndex (pin yang sedang dipilih di dropdown itu sendiri).
export function usedPins(
  parts: readonly Part[],
  exceptId?: number,
  exceptIndex?: number,
): Set<string> {
  const used = new Set<string>();
  for (const p of parts) {
    p.pins.forEach((pin, i) => {
      if (!(p.id === exceptId && i === exceptIndex)) used.add(pin);
    });
  }
  return used;
}

// Membuat komponen baru di pin-pin kosong pertama. null kalau pin tidak cukup.
export function createPart(
  parts: readonly Part[],
  type: PartType,
): Part | null {
  const used = usedPins(parts);
  const pins: string[] = [];
  for (let i = 0; i < PIN_ROLES[type].length; i++) {
    const pin = PIN_PREFERENCE[type].find((p) => !used.has(p));
    if (!pin) return null;
    pins.push(pin);
    used.add(pin);
  }
  const sameType = parts.filter((p) => p.type === type).length;
  const palette = COLORS[type];
  return {
    id: nextId++,
    type,
    pins,
    color: palette[sameType % palette.length],
  };
}

export function defaultCircuit(): Part[] {
  // Sama dengan rangkaian awal, supaya contoh kode bawaan tetap jalan
  return decodeCircuit("led-13-red.button-2-green.pot-A0")!;
}

// --- Bentuk teks untuk disimpan dan untuk link berbagi ---
// Format tiap komponen: jenis-pin[-pin...][-warna], dipisah titik.
// Contoh: "led-13-red.button-2-green.pot-A0.lcd-12-11-5-4-3-2"
// Hanya huruf, angka, "-" dan ".", jadi aman di URL tanpa diubah apa pun.

export function encodeCircuit(parts: readonly Part[]): string {
  return parts
    .map((p) => [p.type, ...p.pins, p.color].filter(Boolean).join("-"))
    .join(".");
}

// Teks dari link bisa dibuat siapa saja, jadi semua isinya diperiksa:
// jenis komponen, jumlah pin, pin, dan warna harus ada di daftar yang diizinkan.
// Kalau ada yang tidak cocok, seluruh rangkaian ditolak (null).
export function decodeCircuit(text: string): Part[] | null {
  if (text === "") return []; // semua komponen sengaja dihapus
  if (text.length > 500) return null;
  const parts: Part[] = [];
  const used = new Set<string>();
  for (const item of text.split(".")) {
    const [type, ...rest] = item.split("-");
    // Object.hasOwn, bukan "in": "toString" in PIN_ROLES juga bernilai true
    if (!Object.hasOwn(PIN_ROLES, type)) return null;
    const partType = type as PartType;
    const count = PIN_ROLES[partType].length;
    const pins = rest.slice(0, count);
    const color = rest[count] ?? "";
    if (pins.length !== count || rest.length > count + 1) return null;
    if (!COLORS[partType].includes(color)) return null;
    for (const pin of pins) {
      if (!allowedPins(partType).includes(pin) || used.has(pin)) return null; // pin asing / ganda
      used.add(pin);
    }
    parts.push({ id: nextId++, type: partType, pins, color });
  }
  return parts;
}

// --- Simpan otomatis di browser (pola yang sama dengan share.ts) ---
const STORAGE_KEY = "arduino-sim:circuit";

export function loadSavedCircuit(): Part[] | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text === null ? null : decodeCircuit(text);
  } catch {
    return null;
  }
}

export function saveCircuit(parts: readonly Part[]) {
  try {
    localStorage.setItem(STORAGE_KEY, encodeCircuit(parts));
  } catch {
    // abaikan: simpan otomatis hanya fitur kenyamanan
  }
}
