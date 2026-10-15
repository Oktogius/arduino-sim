// Mengubah teks Intel HEX menjadi byte-byte program di memori flash.
// Format tiap baris: :LLAAAATT[DATA]CC
//   LL   = jumlah byte data
//   AAAA = alamat di memori
//   TT   = tipe record (00 = data)
export function loadHex(source: string, target: Uint8Array) {
  for (const line of source.split("\n")) {
    if (line[0] === ":" && line.substring(7, 9) === "00") {
      const byteCount = parseInt(line.substring(1, 3), 16);
      const address = parseInt(line.substring(3, 7), 16);
      for (let i = 0; i < byteCount; i++) {
        target[address + i] = parseInt(
          line.substring(9 + i * 2, 11 + i * 2),
          16,
        );
      }
    }
  }
}
