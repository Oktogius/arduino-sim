// Simulasi bouncing tombol.
//
// Tombol asli tidak langsung tersambung bersih. Saat ditekan (dan dilepas),
// logam kontaknya memantul beberapa kali selama sekitar 1-5 ms, sehingga pin
// sempat bolak-balik HIGH/LOW sebelum stabil. Tombol virtual tanpa simulasi
// ini selalu bersih sempurna, jadi kode tanpa debounce terlihat "benar"
// padahal di board asli akan menghitung satu tekanan sebagai beberapa.
//
// Getarannya berlangsung dalam hitungan mikrodetik, jauh lebih cepat dari
// satu frame browser (~16 ms). Karena itu tidak bisa memakai setTimeout.
// Perubahan pin dijadwalkan dalam SIKLUS CPU dengan cpu.addClockEvent(),
// sehingga terjadi tepat di tengah program yang sedang berjalan.

import type { CPU } from "avr8js";

// Arduino Uno 16 MHz = 16 siklus per mikrodetik
const CYCLES_PER_US = 16;

export interface Bounce {
  glitches: number; // berapa kali kontak sempat terlepas sebelum stabil
  durationUs: number; // lama getaran sampai stabil, dalam mikrodetik
  cancel(): void; // batalkan sisa getaran yang belum terjadi
}

// Membuat jadwal getaran: daftar waktu (µs sejak sentuhan pertama) saat pin
// berganti nilai. Jumlahnya selalu genap: tiap getaran = kontak lepas, lalu
// tersambung lagi. Jadi nilai terakhir selalu sama dengan nilai tujuan.
export function planBounce(rand: () => number = Math.random): number[] {
  const glitches = 2 + Math.floor(rand() * 5); // 2..6 getaran
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < glitches; i++) {
    t += 100 + rand() * 700; // tersambung 0,1..0,8 ms
    times.push(Math.round(t));
    t += 50 + rand() * 250; // terlepas 50..300 µs
    times.push(Math.round(t));
  }
  return times;
}

// Mengubah pin ke finalLevel dengan getaran.
// setPin dipanggil langsung untuk sentuhan pertama, lalu dijadwalkan ulang
// untuk setiap perubahan berikutnya.
export function startBounce(
  cpu: CPU,
  finalLevel: boolean,
  setPin: (level: boolean) => void,
  rand: () => number = Math.random,
): Bounce {
  const times = planBounce(rand);
  setPin(finalLevel); // sentuhan pertama

  // Urutan setelahnya: lepas (nilai lama), sambung (nilai baru), lepas, ...
  // Tiap callback dibuat sebagai fungsi baru supaya bisa dibatalkan satu per satu.
  const events = times.map((us, i) => {
    const level = i % 2 === 0 ? !finalLevel : finalLevel;
    return cpu.addClockEvent(() => setPin(level), us * CYCLES_PER_US);
  });

  return {
    glitches: times.length / 2,
    durationUs: times[times.length - 1],
    cancel: () => events.forEach((cb) => cpu.clearClockEvent(cb)),
  };
}
