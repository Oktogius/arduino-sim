// Sensor jarak ultrasonik HC-SR04.
//
// Cara kerja sensor asli:
//   1. Arduino memberi pulsa HIGH minimal 10 µs di pin TRIG.
//   2. Sensor memancarkan gelombang ultrasonik, lalu pin ECHO menjadi HIGH
//      selama gelombang itu pergi ke benda dan memantul kembali.
//   3. Arduino mengukur lama ECHO HIGH dengan pulseIn(). Suara menempuh
//      sekitar 0,0343 cm/µs, pergi-pulang, jadi 1 cm = sekitar 58 µs.
// Seperti bouncing (Bab 12), waktu ECHO dijadwalkan dalam siklus CPU dengan
// cpu.addClockEvent supaya tepat sampai mikrodetik.

import type { CPU } from "avr8js";

export const MIN_CM = 2;
export const MAX_CM = 400;
export const US_PER_CM = 58;

const CYCLES_PER_US = 16; // 16 MHz
const MIN_TRIG_US = 8; // pulsa TRIG lebih pendek dari ini diabaikan
const ECHO_DELAY_US = 250; // jeda sensor memancarkan gelombang sebelum ECHO naik

export class Ultrasonic {
  private trigHigh = false;
  private riseAt = 0;
  private busy = false; // sedang mengukur: TRIG berikutnya diabaikan

  // Dipanggil setiap kali port berubah, dengan kondisi pin TRIG sekarang
  update(
    trig: boolean,
    cpu: CPU,
    distanceCm: () => number,
    setEcho: (level: boolean) => void,
  ) {
    if (trig && !this.trigHigh) this.riseAt = cpu.cycles;
    // TRIG baru saja turun setelah HIGH cukup lama: mulai pengukuran
    if (!trig && this.trigHigh && !this.busy) {
      const widthUs = (cpu.cycles - this.riseAt) / CYCLES_PER_US;
      if (widthUs >= MIN_TRIG_US) {
        this.busy = true;
        const echoUs = distanceCm() * US_PER_CM;
        cpu.addClockEvent(() => setEcho(true), ECHO_DELAY_US * CYCLES_PER_US);
        cpu.addClockEvent(
          () => {
            setEcho(false);
            this.busy = false;
          },
          Math.round((ECHO_DELAY_US + echoUs) * CYCLES_PER_US),
        );
      }
    }
    this.trigHigh = trig;
  }
}
