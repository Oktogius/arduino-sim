// LDR (fotoresistor) dalam modul sensor cahaya, ditiru seperti di Wokwi.
//
// Hambatan LDR turun saat cahaya makin terang:
//   R = RL10 × (10 / lux)^GAMMA      (RL10 = hambatan pada 10 lux)
// Modul memakai pembagi tegangan dengan resistor 10 kΩ, keluaran di pin AO:
//   V = 5 × R / (R + 10000)
// Jadi: gelap -> tegangan tinggi (analogRead besar), terang -> tegangan rendah.
// Rumus ini cocok dengan contoh di dokumentasi Wokwi, sehingga kode dari
// Wokwi (GAMMA = 0.7, RL10 = 50) menghasilkan lux yang sama. Di kode itu
// tertulis hambatan = 2000 * V / (1 - V / 5), yang sama dengan 10000 * V / (5 - V).

export const GAMMA = 0.7;
export const RL10 = 50; // kΩ

export function ldrVoltage(lux: number): number {
  const r = RL10 * 1000 * Math.pow(10 / lux, GAMMA);
  return (5 * r) / (r + 10000);
}

// Slider 0..120 memakai skala log: 0,1 lux (malam gelap) .. 100.000 lux (terik)
export const SLIDER_MAX = 120;
export const luxFromSlider = (v: number) => Math.pow(10, v / 20 - 1);
export const sliderFromLux = (lux: number) =>
  Math.round(20 * (Math.log10(lux) + 1));

export function formatLux(lux: number): string {
  return lux < 10 ? lux.toFixed(1) : String(Math.round(lux));
}
