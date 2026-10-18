// Membaca sinyal servo dari pin.
//
// Servo hobi (SG90, MG996R, dll.) dikendalikan dengan pulsa HIGH setiap
// ~20 ms. LEBAR pulsanya yang menentukan sudut:
//
//   544 µs  -> 0°      1472 µs -> 90°      2400 µs -> 180°
//
// Angka 544 dan 2400 adalah batas bawaan library Servo.h Arduino
// (MIN_PULSE_WIDTH dan MAX_PULSE_WIDTH), jadi servo.write(90) menghasilkan
// tepat 1472 µs dan terbaca 90° di sini.
//
// Caranya: catat cpu.cycles saat pin naik (HIGH), lalu saat pin turun (LOW)
// hitung selisihnya. 16 siklus = 1 µs pada 16 MHz.

const CYCLES_PER_US = 16;
export const SERVO_MIN_US = 544;
export const SERVO_MAX_US = 2400;

// Pulsa di luar rentang ini bukan sinyal servo (misalnya pin dipakai
// digitalWrite biasa atau PWM analogWrite), jadi diabaikan.
const VALID_MIN_US = 400;
const VALID_MAX_US = 2700;

export interface PulseMeter {
  risingAt: number | null; // cpu.cycles saat pin terakhir naik
}

export function createPulseMeter(): PulseMeter {
  return { risingAt: null };
}

// Dipanggil setiap kali port berubah. Mengembalikan lebar pulsa (µs) saat
// sebuah pulsa yang sah selesai, atau null kalau belum ada pulsa baru.
export function measurePulse(
  meter: PulseMeter,
  high: boolean,
  cycles: number,
): number | null {
  if (high) {
    // Port bisa berubah karena pin LAIN; hanya catat saat benar-benar naik
    if (meter.risingAt === null) meter.risingAt = cycles;
    return null;
  }
  if (meter.risingAt === null) return null; // sudah LOW sebelumnya
  const us = (cycles - meter.risingAt) / CYCLES_PER_US;
  meter.risingAt = null;
  return us >= VALID_MIN_US && us <= VALID_MAX_US ? us : null;
}

// Lebar pulsa -> sudut 0..180°, sama seperti hitungan library Servo
export function pulseToAngle(us: number): number {
  const angle = ((us - SERVO_MIN_US) / (SERVO_MAX_US - SERVO_MIN_US)) * 180;
  return Math.min(180, Math.max(0, angle));
}
