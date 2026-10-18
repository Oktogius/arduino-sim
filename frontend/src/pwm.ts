// Mengukur "duty cycle": berapa persen waktu sebuah pin bernilai HIGH.
//
// analogWrite(pin, 127) tidak mengeluarkan tegangan 2,5 V. Arduino Uno tidak
// punya DAC. Yang terjadi: timer menyalakan dan mematikan pin dengan sangat
// cepat (~490 kali per detik di pin 3, 9, 10, 11; ~980 kali di pin 5 dan 6).
// LED ikut berkedip secepat itu, dan mata kita melihatnya sebagai redup.
// Inilah PWM (Pulse Width Modulation).
//
//   analogWrite(127):  ▔▔▁▁▔▔▁▁▔▔▁▁   HIGH ~50% waktu  -> LED setengah terang
//   analogWrite(32):   ▔▁▁▁▁▁▁▔▁▁▁▁   HIGH ~13% waktu  -> LED redup
//
// Waktu diukur dalam siklus CPU (cpu.cycles), sama seperti servo.

export interface DutyResult {
  duty: number; // 0..1, bagian waktu pin HIGH
  pwm: boolean; // true kalau terdeteksi sinyal PWM (berulang, lebih cepat dari 1 frame)
}

export class DutyMeter {
  private high = false;
  private since: number; // cpu.cycles saat kondisi pin terakhir berubah
  private highCycles = 0; // total waktu HIGH sejak frame ini mulai
  private frameStart: number;

  // Untuk mendeteksi PWM: satu periode penuh = naik -> turun -> naik lagi
  private lastRise: number | null = null;
  private lastFall: number | null = null;
  private periodDuty = 0; // duty dari periode penuh terakhir
  private periodLength = 0; // panjang periode itu (siklus)
  private periodEnd = -1; // kapan periode itu selesai

  constructor(startCycles: number) {
    this.since = this.frameStart = startCycles;
  }

  // Dipanggil setiap kali port berubah (boleh berulang dengan nilai yang sama)
  update(high: boolean, now: number) {
    if (high === this.high) return;
    if (this.high) this.highCycles += now - this.since;
    if (high) {
      if (
        this.lastRise !== null &&
        this.lastFall !== null &&
        this.lastFall > this.lastRise
      ) {
        this.periodLength = now - this.lastRise;
        this.periodDuty = (this.lastFall - this.lastRise) / this.periodLength;
        this.periodEnd = now;
      }
      this.lastRise = now;
    } else {
      this.lastFall = now;
    }
    this.high = high;
    this.since = now;
  }

  // Dipanggil sekali per frame, lalu penghitungan dimulai lagi dari nol.
  endFrame(now: number): DutyResult {
    if (this.high) this.highCycles += now - this.since;
    this.since = now;
    const span = now - this.frameStart;
    const average = span > 0 ? this.highCycles / span : this.high ? 1 : 0;
    this.highCycles = 0;
    this.frameStart = now;

    // PWM kalau ada periode penuh yang selesai di frame ini DAN periodenya
    // lebih pendek dari satu frame. Blink biasa (periode 1 detik) tidak
    // termasuk, supaya LED-nya tidak tampak setengah terang sesaat.
    const pwm = this.periodEnd >= now - span && this.periodLength <= span;
    // PWM: pakai satu periode penuh, angkanya stabil (127 -> 50%, bukan
    // naik-turun karena awal/akhir frame jatuh di tengah periode).
    // Bukan PWM: rata-rata selama frame.
    return { duty: pwm ? this.periodDuty : average, pwm };
  }
}
