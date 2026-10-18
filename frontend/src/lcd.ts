// Tiruan chip HD44780, otak di balik hampir semua LCD karakter 16x2.
//
// Komponen <wokwi-lcd1602> hanya bisa MENAMPILKAN karakter. Yang menerima
// perintah dari Arduino adalah chip HD44780 di balik layar, dan chip itulah
// yang ditiru di sini (datasheet Hitachi HD44780U).
//
// Cara Arduino mengirim data (library LiquidCrystal, mode 4-bit):
//   1. Pasang RS: LOW = perintah (clear, pindah kursor, ...), HIGH = karakter
//   2. Pasang 4 bit di D4..D7
//   3. Beri pulsa di pin E (HIGH lalu LOW). Chip membaca data saat E TURUN.
//   Satu byte = dua pulsa: 4 bit atas dulu, lalu 4 bit bawah.
//
// Memori di dalam chip:
//   DDRAM : karakter yang ditampilkan. Baris 1 di alamat 0x00..0x27,
//           baris 2 di 0x40..0x67 (masing-masing 40 karakter, yang terlihat 16)
//   CGRAM : 8 karakter buatan sendiri (lcd.createChar), 8 baris x 5 titik

import { fontA00 } from "@wokwi/elements";

// Isi layar yang akan digambar <wokwi-lcd1602> (lewat board.ts)
export interface LcdView {
  characters: Uint8Array; // 32 kode karakter, baris 1 lalu baris 2
  font: Uint8Array<ArrayBuffer>; // bentuk karakter, termasuk karakter buatan (CGRAM)
  cursor: boolean;
  blink: boolean;
  cursorX: number;
  cursorY: number;
}

const COLS = 16;
const LINE_LENGTH = 40; // panjang satu baris di DDRAM

export class HD44780 {
  private ddram = new Uint8Array(0x80).fill(0x20); // 0x20 = spasi
  private cgram = new Uint8Array(64);
  private address = 0; // address counter (AC)
  private toCgram = false; // data berikutnya ditulis ke CGRAM atau DDRAM
  private increment = true; // AC naik (true) atau turun setelah tiap karakter
  private shiftOnWrite = false; // geser seluruh layar setiap menulis karakter
  private displayOn = false;
  private cursorOn = false;
  private blinkOn = false;
  private shift = 0; // seberapa jauh layar digeser ke kiri (0..39)
  private eightBit = true; // saat listrik nyala, chip dalam mode 8-bit
  private twoLines = false;
  private highNibble: number | null = null; // 4 bit atas yang menunggu pasangannya
  private font = new Uint8Array(fontA00);
  private fontDirty = false;

  dirty = true; // ada perubahan yang belum digambar

  // Dipanggil saat pin E turun. nibble = nilai D7..D4 (0..15).
  pulse(rs: boolean, nibble: number) {
    if (this.eightBit) {
      // Mode 8-bit: D0..D3 tidak tersambung (dianggap 0). Ini hanya terjadi
      // saat awal begin(), sebelum library mengalihkan chip ke mode 4-bit.
      this.write(rs, nibble << 4);
    } else if (this.highNibble === null) {
      this.highNibble = nibble;
    } else {
      this.write(rs, (this.highNibble << 4) | nibble);
      this.highNibble = null;
    }
  }

  private write(rs: boolean, value: number) {
    if (rs) this.writeData(value);
    else this.command(value);
    this.dirty = true;
  }

  private writeData(value: number) {
    if (this.toCgram) {
      this.cgram[this.address & 0x3f] = value;
      this.address = (this.address + (this.increment ? 1 : -1)) & 0x3f;
      this.fontDirty = true;
      return;
    }
    this.ddram[this.address & 0x7f] = value;
    this.address = this.nextAddress(this.address, this.increment);
    if (this.shiftOnWrite) this.shiftDisplay(this.increment ? 1 : -1);
  }

  // Bit tertinggi yang menyala menentukan jenis perintah
  private command(cmd: number) {
    if (cmd & 0x80) {
      // Set DDRAM address (lcd.setCursor)
      this.address = cmd & 0x7f;
      this.toCgram = false;
    } else if (cmd & 0x40) {
      // Set CGRAM address (awal lcd.createChar)
      this.address = cmd & 0x3f;
      this.toCgram = true;
    } else if (cmd & 0x20) {
      // Function set: DL = 8-bit/4-bit, N = jumlah baris
      this.eightBit = (cmd & 0x10) !== 0;
      this.twoLines = (cmd & 0x08) !== 0;
      this.highNibble = null;
    } else if (cmd & 0x10) {
      // Geser kursor atau seluruh layar (lcd.scrollDisplayLeft/Right)
      const right = (cmd & 0x04) !== 0;
      if (cmd & 0x08) this.shiftDisplay(right ? -1 : 1);
      else this.address = this.nextAddress(this.address, right);
    } else if (cmd & 0x08) {
      // Display control: layar, kursor garis bawah, kursor berkedip
      this.displayOn = (cmd & 0x04) !== 0;
      this.cursorOn = (cmd & 0x02) !== 0;
      this.blinkOn = (cmd & 0x01) !== 0;
    } else if (cmd & 0x04) {
      // Entry mode: arah tulisan dan autoscroll
      this.increment = (cmd & 0x02) !== 0;
      this.shiftOnWrite = (cmd & 0x01) !== 0;
    } else if (cmd & 0x02) {
      // Return home
      this.address = 0;
      this.shift = 0;
      this.toCgram = false;
    } else if (cmd & 0x01) {
      // Clear display
      this.ddram.fill(0x20);
      this.address = 0;
      this.shift = 0;
      this.increment = true;
      this.toCgram = false;
    }
  }

  private shiftDisplay(step: number) {
    this.shift = (this.shift + step + LINE_LENGTH) % LINE_LENGTH;
  }

  // Alamat DDRAM berikutnya. Mode 2 baris: setelah akhir baris 1 (0x27)
  // lanjut ke awal baris 2 (0x40), dan setelah akhir baris 2 kembali ke 0x00.
  private nextAddress(addr: number, forward: boolean): number {
    if (this.twoLines) {
      if (forward)
        return addr === 0x27 ? 0x40 : addr === 0x67 ? 0x00 : (addr + 1) & 0x7f;
      return addr === 0x00 ? 0x67 : addr === 0x40 ? 0x27 : (addr - 1) & 0x7f;
    }
    return forward ? (addr + 1) % 80 : (addr + 79) % 80;
  }

  // Isi layar untuk digambar <wokwi-lcd1602>
  view(): LcdView {
    const characters = new Uint8Array(COLS * 2).fill(0x20);
    if (this.displayOn) {
      const rows = this.twoLines ? 2 : 1; // mode 1 baris: baris 2 kosong
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < COLS; col++) {
          const addr = row * 0x40 + ((col + this.shift) % LINE_LENGTH);
          const code = this.ddram[addr];
          // Kode 0..15 = karakter buatan (8..15 adalah cermin 0..7)
          characters[row * COLS + col] = code < 16 ? code & 7 : code;
        }
      }
    }

    if (this.fontDirty) {
      this.font = new Uint8Array(fontA00);
      for (let i = 0; i < 64; i++) this.font[i] = reverse5(this.cgram[i]);
      this.fontDirty = false;
    }

    // Posisi kursor di layar (bisa di luar 16 kolom yang terlihat)
    const cursorY = this.address >= 0x40 ? 1 : 0;
    const cursorX =
      ((this.address & 0x3f) - this.shift + LINE_LENGTH) % LINE_LENGTH;
    const showCursor = this.displayOn && !this.toCgram;

    this.dirty = false;
    return {
      characters,
      font: this.font,
      cursor: showCursor && this.cursorOn,
      blink: showCursor && this.blinkOn,
      cursorX,
      cursorY,
    };
  }
}

// Di CGRAM bit 4 = titik paling kiri; di font wokwi bit 0 = titik paling kiri.
// Jadi urutan 5 bitnya dibalik.
function reverse5(row: number): number {
  let out = 0;
  for (let i = 0; i < 5; i++) if (row & (1 << i)) out |= 1 << (4 - i);
  return out;
}
