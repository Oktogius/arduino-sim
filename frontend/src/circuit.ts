// Model rangkaian: daftar komponen beserta pin dan warnanya.
// File ini hanya berisi data dan aturan, tanpa tampilan (tampilan di board.ts).

import { DIGITAL_PINS, ANALOG_PINS } from "./pins";

export type PartType = "led" | "button" | "pot";

export interface Part {
  id: number; // nomor unik selama halaman terbuka (tidak ikut disimpan)
  type: PartType;
  pin: string; // kunci di PINS, misalnya '13' atau 'A0'
  color: string; // '' untuk potensiometer
}

export const PART_NAMES: Record<PartType, string> = {
  led: "LED",
  button: "Tombol",
  pot: "Potensiometer",
};

// Warna yang tersedia. Komponen baru mengambil warna berikutnya secara bergiliran.
const COLORS: Record<PartType, string[]> = {
  led: ["red", "green", "yellow", "blue", "white"],
  button: ["green", "red", "blue", "yellow", "black"],
  pot: [""],
};

// Urutan pin yang dicoba saat menambah komponen baru.
// LED mulai dari 13 turun, tombol mulai dari 2 naik: mengikuti kebiasaan
// contoh Arduino, dan keduanya jarang bertabrakan.
const PIN_PREFERENCE: Record<PartType, string[]> = {
  led: [
    ...DIGITAL_PINS.filter((p) => !p.startsWith("A")).reverse(),
    ...ANALOG_PINS,
  ],
  button: DIGITAL_PINS,
  pot: ANALOG_PINS,
};

const MAX_PARTS = DIGITAL_PINS.length; // satu pin satu komponen

let nextId = 1;

export function allowedPins(type: PartType): string[] {
  return type === "pot" ? ANALOG_PINS : DIGITAL_PINS;
}

// Pin yang sedang dipakai komponen lain (kecuali komponen exceptId)
export function usedPins(
  parts: readonly Part[],
  exceptId?: number,
): Set<string> {
  return new Set(parts.filter((p) => p.id !== exceptId).map((p) => p.pin));
}

// Membuat komponen baru di pin kosong pertama. null kalau tidak ada pin kosong.
export function createPart(
  parts: readonly Part[],
  type: PartType,
): Part | null {
  if (parts.length >= MAX_PARTS) return null;
  const used = usedPins(parts);
  const pin = PIN_PREFERENCE[type].find((p) => !used.has(p));
  if (!pin) return null;
  const sameType = parts.filter((p) => p.type === type).length;
  const palette = COLORS[type];
  return { id: nextId++, type, pin, color: palette[sameType % palette.length] };
}

export function defaultCircuit(): Part[] {
  // Sama dengan rangkaian sebelum v1.2, supaya contoh kode bawaan tetap jalan
  return decodeCircuit("led-13-red.button-2-green.pot-A0")!;
}

// --- Bentuk teks untuk disimpan dan untuk link berbagi ---
// Contoh: "led-13-red.button-2-green.pot-A0"
// Hanya huruf, angka, "-" dan ".", jadi aman di URL tanpa diubah apa pun.

export function encodeCircuit(parts: readonly Part[]): string {
  return parts
    .map((p) => [p.type, p.pin, p.color].filter(Boolean).join("-"))
    .join(".");
}

// Teks dari link bisa dibuat siapa saja, jadi semua isinya diperiksa:
// jenis komponen, pin, dan warna harus ada di daftar yang diizinkan.
// Kalau ada yang tidak cocok, seluruh rangkaian ditolak (null).
export function decodeCircuit(text: string): Part[] | null {
  if (text === "") return []; // semua komponen sengaja dihapus
  if (text.length > 500) return null;
  const parts: Part[] = [];
  for (const item of text.split(".")) {
    const [type, pin, color = ""] = item.split("-");
    // Object.hasOwn, bukan "in": "toString" in COLORS juga bernilai true
    if (!Object.hasOwn(COLORS, type)) return null;
    const partType = type as PartType;
    if (!allowedPins(partType).includes(pin)) return null;
    if (!COLORS[partType].includes(color)) return null;
    if (parts.some((p) => p.pin === pin)) return null; // pin ganda
    parts.push({ id: nextId++, type: partType, pin, color });
  }
  return parts.length <= MAX_PARTS ? parts : null;
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
