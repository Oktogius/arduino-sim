// Pemetaan pin Arduino Uno ke port dan bit di chip ATmega328P (Bab 5.3).
//
//   Pin 2..7   -> PORTD bit 2..7
//   Pin 8..13  -> PORTB bit 0..5
//   A0..A5     -> PORTC bit 0..5, sekaligus kanal ADC 0..5
//
// Pin 0 dan 1 sengaja tidak disediakan: dipakai Serial (RX/TX), sama seperti
// di board asli. A0..A5 juga bisa dipakai sebagai pin digital biasa.

export type PortName = "B" | "C" | "D";

export interface PinInfo {
  port: PortName;
  bit: number;
  adc?: number; // kanal ADC, hanya untuk A0..A5
}

export const PINS: Record<string, PinInfo> = {
  "2": { port: "D", bit: 2 },
  "3": { port: "D", bit: 3 },
  "4": { port: "D", bit: 4 },
  "5": { port: "D", bit: 5 },
  "6": { port: "D", bit: 6 },
  "7": { port: "D", bit: 7 },
  "8": { port: "B", bit: 0 },
  "9": { port: "B", bit: 1 },
  "10": { port: "B", bit: 2 },
  "11": { port: "B", bit: 3 },
  "12": { port: "B", bit: 4 },
  "13": { port: "B", bit: 5 },
  A0: { port: "C", bit: 0, adc: 0 },
  A1: { port: "C", bit: 1, adc: 1 },
  A2: { port: "C", bit: 2, adc: 2 },
  A3: { port: "C", bit: 3, adc: 3 },
  A4: { port: "C", bit: 4, adc: 4 },
  A5: { port: "C", bit: 5, adc: 5 },
};

// Semua pin yang bisa dipakai LED/tombol, urut 2..13 lalu A0..A5
export const DIGITAL_PINS = Object.keys(PINS);

// Pin yang punya ADC, untuk potensiometer
export const ANALOG_PINS = DIGITAL_PINS.filter(
  (pin) => PINS[pin].adc !== undefined,
);

// Teks pin untuk tampilan: "Pin 13" atau "A0"
export function pinLabel(pin: string): string {
  return pin.startsWith("A") ? pin : `Pin ${pin}`;
}
