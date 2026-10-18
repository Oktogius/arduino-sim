// Simpan otomatis (localStorage) dan berbagi kode lewat link.
// Kode dikompres lalu dimasukkan ke bagian "#" URL, jadi tidak butuh
// database: seluruh isi kode ada di dalam link itu sendiri.

const STORAGE_KEY = "arduino-sim:code";

// --- Simpan otomatis di browser ---
// localStorage bisa gagal (mode privat, penyimpanan diblokir),
// jadi selalu dibungkus try/catch agar aplikasi tetap jalan.
export function loadSavedCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveCode(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // abaikan: simpan otomatis hanya fitur kenyamanan
  }
}

// --- Kompresi ---
// CompressionStream bawaan browser (tanpa library tambahan).
// Sketch 1 KB biasanya menjadi sekitar 400-600 karakter di URL.
async function compress(text: string): Promise<string> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return toBase64Url(bytes);
}

async function decompress(encoded: string): Promise<string> {
  const bytes = fromBase64Url(encoded);
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

// Base64 versi aman-URL: + jadi -, / jadi _, tanpa = di akhir
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  let b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// --- Link berbagi ---
// Bentuk link: ...#code=<kode terkompres>&circuit=<rangkaian>
// Rangkaian sudah berupa teks pendek yang aman di URL (lihat circuit.ts),
// jadi tidak perlu dikompres.
export async function makeShareUrl(
  code: string,
  circuit: string,
): Promise<string> {
  const params = new URLSearchParams({ code: await compress(code), circuit });
  return `${location.origin}${location.pathname}#${params}`;
}

export interface SharedProject {
  code: string;
  circuit: string | null; // null untuk link lama (sebelum v1.2) yang hanya berisi kode
}

// Membaca kode dan rangkaian dari link (kalau halaman dibuka dari link berbagi).
// Setelah dibaca, bagian "#..." dihapus dari address bar supaya refresh
// berikutnya memakai simpanan lokal, bukan menimpa hasil edit pengguna.
export async function readSharedFromUrl(): Promise<SharedProject | null> {
  const params = new URLSearchParams(location.hash.slice(1));
  const encoded = params.get("code");
  if (!encoded) return null;
  try {
    const code = await decompress(encoded);
    history.replaceState(null, "", location.pathname + location.search);
    return { code, circuit: params.get("circuit") };
  } catch {
    return null; // link rusak atau terpotong
  }
}
