// Sensor suhu dan kelembapan DHT22 (AM2302), satu kabel data.
//
// Protokol (datasheet AM2302):
//   1. Arduino menarik pin data LOW minimal 1 ms (sinyal start), lalu
//      melepasnya (INPUT_PULLUP).
//   2. Sensor menunggu 20-40 µs, lalu menjawab: LOW 80 µs, HIGH 80 µs.
//   3. Sensor mengirim 40 bit. Setiap bit: LOW 50 µs, lalu HIGH
//      26-28 µs (bit 0) atau 70 µs (bit 1).
//   4. Data: kelembapan × 10 (16 bit), suhu × 10 (16 bit, bit tertinggi = minus),
//      checksum = jumlah 4 byte sebelumnya (8 bit terbawah).
// Semua perubahan pin dijadwalkan dalam siklus CPU (cpu.addClockEvent),
// sama seperti bouncing tombol (Bab 12) dan HC-SR04.

import type { CPU } from "avr8js";

export const TEMP_MIN = -40;
export const TEMP_MAX = 80;

const CYCLES_PER_US = 16;
const MIN_START_US = 500; // LOW lebih pendek dari ini bukan sinyal start

// 5 byte data DHT22 dari suhu (°C) dan kelembapan (%)
export function encodeDht22(temp: number, hum: number): number[] {
  const h = Math.round(Math.min(Math.max(hum, 0), 100) * 10);
  const t = Math.round(Math.min(Math.max(temp, TEMP_MIN), TEMP_MAX) * 10);
  const tRaw = t < 0 ? 0x8000 | -t : t;
  const bytes = [h >> 8, h & 0xff, tRaw >> 8, tRaw & 0xff];
  bytes.push((bytes[0] + bytes[1] + bytes[2] + bytes[3]) & 0xff);
  return bytes;
}

// Perubahan level yang dikirim sensor: [waktu µs sejak pin dilepas, level]
export function responseEdges(bytes: number[]): [number, boolean][] {
  const edges: [number, boolean][] = [];
  let t = 30; // sensor menunggu 20-40 µs (jalur tetap HIGH karena pull-up)
  const push = (level: boolean, lengthUs: number) => {
    edges.push([t, level]);
    t += lengthUs;
  };
  push(false, 80); // jawaban: LOW 80 µs
  push(true, 80); //          HIGH 80 µs
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit--) {
      push(false, 50);
      push(true, (byte >> bit) & 1 ? 70 : 27); // lama HIGH menentukan 0 atau 1
    }
  }
  push(false, 50); // penutup
  push(true, 0); // jalur dilepas, kembali HIGH
  return edges;
}

export class Dht22 {
  private lowSince: number | null = null;
  private busy = false;

  // Dipanggil setiap kali port berubah.
  // pulledLow: Arduino sedang mengeluarkan LOW di pin data (OUTPUT + LOW).
  update(
    pulledLow: boolean,
    cpu: CPU,
    read: () => { temp: number; hum: number },
    setLine: (level: boolean) => void,
  ) {
    if (pulledLow) {
      if (this.lowSince === null) this.lowSince = cpu.cycles;
      return;
    }
    if (this.lowSince === null) return;
    const lowUs = (cpu.cycles - this.lowSince) / CYCLES_PER_US;
    this.lowSince = null;
    if (lowUs < MIN_START_US || this.busy) return;

    // Sinyal start diterima: jadwalkan seluruh jawaban (84 perubahan level) sekaligus
    this.busy = true;
    const { temp, hum } = read();
    const edges = responseEdges(encodeDht22(temp, hum));
    edges.forEach(([us, level], i) => {
      const last = i === edges.length - 1;
      cpu.addClockEvent(
        () => {
          setLine(level);
          if (last) this.busy = false;
        },
        Math.round(us * CYCLES_PER_US),
      );
    });
  }
}
