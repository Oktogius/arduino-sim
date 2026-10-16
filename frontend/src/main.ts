import "./style.css";
import "@wokwi/elements"; // mendaftarkan semua tag <wokwi-...>
import type {
  LEDElement,
  PushbuttonElement,
  PotentiometerElement,
} from "@wokwi/elements";
import {
  CPU,
  avrInstruction,
  AVRTimer,
  timer0Config,
  AVRIOPort,
  portBConfig,
  portDConfig,
  PinState,
  AVRUSART,
  usart0Config,
  AVRADC,
  adcConfig,
} from "avr8js";
import { loadHex } from "./intelhex";
import {
  createEditor,
  addRunShortcut,
  showCompileErrors,
  clearCompileErrors,
} from "./editor";
import {
  loadSavedCode,
  saveCode,
  makeShareUrl,
  readCodeFromUrl,
} from "./share";

const DEFAULT_CODE = `// Putar potensiometer untuk mengatur kecepatan kedip LED.
// Tahan tombol untuk membuat LED menyala terus.
void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

void loop() {
  int pot = analogRead(A0);              // 0..1023
  bool ditekan = digitalRead(2) == LOW;

  Serial.print("A0 = ");
  Serial.print(pot);
  Serial.println(ditekan ? "  [tombol ditekan]" : "");

  if (ditekan) {
    digitalWrite(13, HIGH);
    delay(100);
  } else {
    int jeda = pot / 4 + 50;             // 50..305 ms
    digitalWrite(13, HIGH);
    delay(jeda);
    digitalWrite(13, LOW);
    delay(jeda);
  }
}
`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <h1>Arduino Sim</h1>
  <div id="editor"></div>
  <div class="controls">
    <button id="run">Compile &amp; Run</button>
    <button id="stop" disabled>Stop</button>
    <button id="share" class="secondary">Bagikan</button>
    <button id="example" class="secondary">Contoh</button>
    <span id="status">Siap</span>
  </div>
  <div class="board">
    <div class="component">
      <wokwi-led color="red"></wokwi-led>
      <span>LED Pin 13</span>
    </div>
    <div class="component">
      <wokwi-pushbutton color="green"></wokwi-pushbutton>
      <span>Tombol Pin 2</span>
    </div>
    <div class="component">
      <wokwi-potentiometer></wokwi-potentiometer>
      <input id="pot-slider" type="range" min="0" max="1023" value="0" aria-label="Potensiometer A0" />
      <span>Potensiometer A0</span>
      <span id="pot-readout" class="readout"></span>
    </div>
  </div>
  <pre id="output"></pre>
  <div class="serial-header">
    <span>Serial Monitor</span>
    <button id="clear">Clear</button>
  </div>
  <pre id="serial"></pre>
  <form id="serial-form" class="serial-input">
    <input id="serial-in" type="text" autocomplete="off" placeholder="Ketik pesan lalu Enter..." />
    <button type="submit">Kirim</button>
  </form>
`;

const editorEl = document.querySelector<HTMLDivElement>("#editor")!;
const runBtn = document.querySelector<HTMLButtonElement>("#run")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stop")!;
const statusEl = document.querySelector<HTMLSpanElement>("#status")!;
const shareBtn = document.querySelector<HTMLButtonElement>("#share")!;
const exampleBtn = document.querySelector<HTMLButtonElement>("#example")!;
const outputEl = document.querySelector<HTMLPreElement>("#output")!;
const serialEl = document.querySelector<HTMLPreElement>("#serial")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clear")!;
const serialForm = document.querySelector<HTMLFormElement>("#serial-form")!;
const serialInEl = document.querySelector<HTMLInputElement>("#serial-in")!;

// Komponen wokwi-elements. Tipe ditulis eksplisit di <...> supaya
// TypeScript tahu properti khususnya (value, pressed, dll.).
const ledEl = document.querySelector<LEDElement>("wokwi-led")!;
const buttonEl = document.querySelector<PushbuttonElement>("wokwi-pushbutton")!;
const potEl = document.querySelector<PotentiometerElement>(
  "wokwi-potentiometer",
)!;
const potSlider = document.querySelector<HTMLInputElement>("#pot-slider")!;
const potReadout = document.querySelector<HTMLSpanElement>("#pot-readout")!;

// Urutan kode awal: simpanan lokal, kalau tidak ada pakai contoh bawaan.
// Kode dari link berbagi dibaca sesudahnya (prosesnya async).
const editor = createEditor(editorEl, loadSavedCode() ?? DEFAULT_CODE);

readCodeFromUrl().then((sharedCode) => {
  if (sharedCode !== null) {
    editor.setValue(sharedCode);
    statusEl.textContent = "Kode dari link dimuat";
  }
});

// Simpan otomatis setengah detik setelah berhenti mengetik (debounce),
// supaya tidak menulis ke localStorage di setiap ketukan tombol.
let saveTimer: number | undefined;
editor.onDidChangeModelContent(() => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveCode(editor.getValue()), 500);
});
// Ctrl+Enter = Compile & Run (kecuali sedang compile)
addRunShortcut(editor, () => {
  if (!runBtn.disabled) runBtn.click();
});

let running = false;
const MAX_SERIAL_LENGTH = 10000;

// --- Referensi ke periferal emulator yang sedang berjalan ---
// Disimpan di level modul supaya listener komponen (dipasang sekali saja)
// selalu menjangkau emulator yang aktif. null = emulator tidak berjalan.
let portD: AVRIOPort | null = null;
let adc: AVRADC | null = null;
let usartRx: AVRUSART | null = null;
let rxQueue: number[] = [];

// Pin 2 di Arduino Uno = PD2 (bit ke-2 dari PORTD)
const BUTTON_PIN = 2;
// A0 = kanal ADC 0 (PC0)
const POT_CHANNEL = 0;

// --- Tombol ---
// Rangkaian virtual: tombol ke GND, dipakai dengan INPUT_PULLUP.
// Dilepas = HIGH, ditekan = LOW (active low).
function updateButtonPin() {
  portD?.setPin(BUTTON_PIN, !buttonEl.pressed);
}

// --- Potensiometer ---
// Kaki potensiometer ke 5V dan GND, kaki tengah ke A0.
// Slider 0..1023 diubah menjadi tegangan 0..5 V.
// ADC chip lalu mengubah tegangan itu kembali menjadi angka 0..1023.
// Slider jadi pengendali; knob wokwi hanya tampilan yang ikut berputar.
function updatePotVoltage() {
  const raw = Number(potSlider.value);
  const volts = (raw / 1023) * 5;
  potEl.value = raw; // putar knob sesuai slider
  potReadout.textContent = `${raw} · ${volts.toFixed(2)} V`;
  if (adc) adc.channelValues[POT_CHANNEL] = volts;
}
updatePotVoltage(); // tampilkan nilai awal

// --- Serial input (browser -> Arduino) ---
// USART asli hanya bisa menerima satu byte dalam satu waktu, dan tiap byte
// butuh waktu sesuai baud rate. Jadi teks dari browser diantrikan dulu,
// lalu dikirim byte demi byte.
function pumpRx() {
  // writeByte mengembalikan false kalau penerima masih sibuk
  // atau Serial.begin() belum dipanggil di sketch
  if (usartRx && rxQueue.length > 0 && usartRx.writeByte(rxQueue[0])) {
    rxQueue.shift();
  }
}

function sendSerial(text: string) {
  if (!usartRx) return;
  // TextEncoder -> byte UTF-8, aman untuk karakter non-ASCII
  const bytes = new TextEncoder().encode(text + "\n");
  rxQueue.push(...bytes);
  pumpRx();
}

// Alamat server compile. Di komputer sendiri otomatis localhost:8000.
// Saat deploy, diisi lewat environment variable VITE_API_URL.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function compile(code: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new Error("Server compile tidak bisa dihubungi. Coba lagi sebentar.");
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.hex;
}

function run(hex: string) {
  // Flash ATmega328P = 32 KB, disimpan sebagai word 16-bit
  const program = new Uint16Array(0x8000 / 2);
  loadHex(hex, new Uint8Array(program.buffer));

  const cpu = new CPU(program);
  new AVRTimer(cpu, timer0Config); // dibutuhkan delay() dan millis()

  const portB = new AVRIOPort(cpu, portBConfig);
  // Pin 13 di Arduino Uno = bit ke-5 dari PORTB (PB5)
  portB.addListener(() => {
    ledEl.value = portB.pinState(5) === PinState.High;
  });

  // Port D untuk tombol. Set nilai awal sesuai kondisi tombol sekarang,
  // supaya sketch tidak mengira tombol ditekan saat program baru mulai.
  portD = new AVRIOPort(cpu, portDConfig);
  updateButtonPin();

  // ADC untuk analogRead(). Tegangan referensi default 5 V (AVCC).
  adc = new AVRADC(cpu, adcConfig);
  updatePotVoltage();

  // Tiruan USART, frekuensi CPU 16 MHz
  const usart = new AVRUSART(cpu, usart0Config, 16_000_000);
  let serialBuffer = "";
  usart.onByteTransmit = (value: number) => {
    serialBuffer += String.fromCharCode(value);
  };
  // Begitu satu byte selesai diterima chip, langsung kirim byte berikutnya
  usart.onRxComplete = pumpRx;
  usartRx = usart;
  rxQueue = [];

  // 16 MHz dibagi ~60 frame per detik
  const CYCLES_PER_FRAME = 16_000_000 / 60;
  running = true;

  function frame() {
    if (!running) return;
    const target = cpu.cycles + CYCLES_PER_FRAME;
    while (cpu.cycles < target) {
      avrInstruction(cpu); // jalankan satu instruksi
      cpu.tick(); // perbarui timer & interrupt
    }
    // Cadangan: coba kirim antrean serial sekali per frame
    pumpRx();
    // Batching: tampilkan teks serial sekali per frame
    if (serialBuffer) {
      serialEl.textContent = (serialEl.textContent + serialBuffer).slice(
        -MAX_SERIAL_LENGTH,
      );
      serialBuffer = "";
      serialEl.scrollTop = serialEl.scrollHeight;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function stop() {
  running = false;
  portD = null;
  adc = null;
  usartRx = null;
  rxQueue = [];
  ledEl.value = false;
  stopBtn.disabled = true;
  statusEl.textContent = "Berhenti";
}

runBtn.addEventListener("click", async () => {
  stop();
  outputEl.textContent = "";
  serialEl.textContent = "";
  statusEl.textContent = "Compiling...";
  runBtn.disabled = true;
  clearCompileErrors(editor);
  try {
    const hex = await compile(editor.getValue());
    run(hex);
    statusEl.textContent = "Berjalan";
    stopBtn.disabled = false;
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    outputEl.textContent = message;
    showCompileErrors(editor, message); // garis merah di baris yang error
  } finally {
    runBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", stop);

// Bagikan: buat link berisi kode, lalu salin ke clipboard
shareBtn.addEventListener("click", async () => {
  const url = await makeShareUrl(editor.getValue());
  try {
    await navigator.clipboard.writeText(url);
    statusEl.textContent = "Link disalin ke clipboard!";
  } catch {
    // Clipboard bisa ditolak browser; tampilkan link agar bisa disalin manual
    outputEl.textContent = `Salin link ini:\n${url}`;
  }
});

// Contoh: kembalikan kode bawaan. Memakai executeEdits (bukan setValue)
// supaya bisa dibatalkan dengan Ctrl+Z.
exampleBtn.addEventListener("click", () => {
  const model = editor.getModel();
  if (!model) return;
  editor.executeEdits("contoh", [
    { range: model.getFullModelRange(), text: DEFAULT_CODE },
  ]);
  editor.focus();
});

clearBtn.addEventListener("click", () => {
  serialEl.textContent = "";
});

// --- Listener komponen: dipasang SEKALI di sini, bukan di dalam run() ---
// wokwi-pushbutton sudah menangani mouse, sentuhan, keyboard (Spasi),
// dan pointer yang keluar dari tombol. Kita cukup mendengarkan event-nya.
buttonEl.addEventListener("button-press", updateButtonPin);
buttonEl.addEventListener("button-release", updateButtonPin);

// Event 'input' muncul setiap kali slider digeser
potSlider.addEventListener("input", updatePotVoltage);

// Form serial: Enter atau klik Kirim
serialForm.addEventListener("submit", (e) => {
  e.preventDefault(); // cegah halaman reload
  sendSerial(serialInEl.value);
  serialInEl.value = "";
});
