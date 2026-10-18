import "./style.css";
import "@wokwi/elements"; // mendaftarkan semua tag <wokwi-...>
import {
  CPU,
  avrInstruction,
  AVRTimer,
  timer0Config,
  timer1Config,
  timer2Config,
  AVRIOPort,
  portBConfig,
  portCConfig,
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
  readSharedFromUrl,
} from "./share";
import { startBounce, type Bounce } from "./bounce";
import { PINS, type PortName } from "./pins";
import {
  type Part,
  defaultCircuit,
  loadSavedCircuit,
  saveCircuit,
  encodeCircuit,
  decodeCircuit,
} from "./circuit";
import { createBoard } from "./board";
import {
  type PulseMeter,
  createPulseMeter,
  measurePulse,
  pulseToAngle,
} from "./servo";

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
  <div class="board-toolbar">
    <button class="secondary small" data-add="led">+ LED</button>
    <button class="secondary small" data-add="button">+ Tombol</button>
    <button class="secondary small" data-add="pot">+ Potensiometer</button>
    <button class="secondary small" data-add="servo">+ Servo</button>
    <label class="toggle" title="Tiru getaran kontak tombol asli (1-5 ms)">
      <input id="bounce-toggle" type="checkbox" /> Bouncing
    </label>
  </div>
  <div id="board" class="board"></div>
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

const boardEl = document.querySelector<HTMLDivElement>("#board")!;
const addBtns = document.querySelectorAll<HTMLButtonElement>("[data-add]");
const bounceToggle =
  document.querySelector<HTMLInputElement>("#bounce-toggle")!;

// Urutan kode awal: simpanan lokal, kalau tidak ada pakai contoh bawaan.
// Kode dari link berbagi dibaca sesudahnya (prosesnya async).
const editor = createEditor(editorEl, loadSavedCode() ?? DEFAULT_CODE);

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
let activeCpu: CPU | null = null; // dibutuhkan untuk menjadwalkan getaran tombol
const ports: Record<PortName, AVRIOPort | null> = { B: null, C: null, D: null };
let adc: AVRADC | null = null;
let usartRx: AVRUSART | null = null;
let rxQueue: number[] = [];

// --- Output: LED dan servo ---
// Pengukur pulsa per servo (kunci = id komponen), dibuat ulang setiap Run
const servoMeters = new Map<number, PulseMeter>();

// Dipanggil setiap kali salah satu port berubah. Komponen biasanya hanya
// beberapa, jadi cukup periksa semuanya tanpa perlu dipilah per port.
function onPortChange() {
  for (const part of board.parts()) {
    if (part.type !== "led" && part.type !== "servo") continue;
    const { port, bit } = PINS[part.pin];
    const high = ports[port]?.pinState(bit) === PinState.High;

    if (part.type === "led") {
      board.setLed(part.id, high);
    } else if (activeCpu) {
      // Servo: ukur lebar pulsa dalam siklus CPU, lalu ubah jadi sudut
      let meter = servoMeters.get(part.id);
      if (!meter) servoMeters.set(part.id, (meter = createPulseMeter()));
      const us = measurePulse(meter, high, activeCpu.cycles);
      if (us !== null) board.setServo(part.id, pulseToAngle(us), us);
    }
  }
}

// --- Tombol ---
// Rangkaian virtual: tombol ke GND, dipakai dengan INPUT_PULLUP.
// Dilepas = HIGH, ditekan = LOW (active low).
function setButtonPin(part: Part, level: boolean) {
  const { port, bit } = PINS[part.pin];
  ports[port]?.setPin(bit, level);
}

// Getaran yang sedang berlangsung, per tombol (kunci = id komponen)
const bounces = new Map<number, Bounce>();

// Dipanggil setiap kali salah satu tombol ditekan atau dilepas.
function onButton(part: Part, pressed: boolean) {
  // Tekan/lepas cepat saat getaran sebelumnya belum selesai:
  // batalkan sisa getaran lama supaya tidak menimpa kondisi baru.
  bounces.get(part.id)?.cancel();
  bounces.delete(part.id);

  if (!activeCpu || !bounceToggle.checked) {
    setButtonPin(part, !pressed);
    return;
  }
  const bounce = startBounce(activeCpu, !pressed, (level) =>
    setButtonPin(part, level),
  );
  bounces.set(part.id, bounce);
  const ms = (bounce.durationUs / 1000).toFixed(1);
  board.setReadout(part.id, `${bounce.glitches}× getar · ${ms} ms`);
}

// --- Potensiometer ---
// Kaki potensiometer ke 5V dan GND, kaki tengah ke pin analog (A0..A5).
// Slider 0..1023 diubah menjadi tegangan 0..5 V.
// ADC chip lalu mengubah tegangan itu kembali menjadi angka 0..1023.
function onPot(part: Part, raw: number) {
  const channel = PINS[part.pin].adc!;
  if (adc) adc.channelValues[channel] = (raw / 1023) * 5;
}

// Samakan semua pin input dengan kondisi komponen sekarang, tanpa getaran.
// Dipanggil saat emulator mulai, supaya sketch tidak mengira tombol
// sedang ditekan begitu program berjalan.
function syncInputs() {
  for (const part of board.parts()) {
    if (part.type === "button") setButtonPin(part, !board.isPressed(part.id));
    if (part.type === "pot") onPot(part, board.potRaw(part.id));
  }
}

// --- Papan komponen ---
// Urutan rangkaian awal: simpanan lokal, kalau tidak ada pakai rangkaian bawaan.
const board = createBoard(boardEl, loadSavedCircuit() ?? defaultCircuit(), {
  onButton,
  onPot,
  onEdit: saveCircuit,
});

// Kode dan rangkaian dari link berbagi (prosesnya async, jadi dibaca sesudahnya)
readSharedFromUrl().then((shared) => {
  if (shared === null) return;
  editor.setValue(shared.code);
  const parts = shared.circuit === null ? null : decodeCircuit(shared.circuit);
  if (parts) {
    board.setParts(parts);
    saveCircuit(parts);
  }
  statusEl.textContent = parts
    ? "Kode & rangkaian dari link dimuat"
    : "Kode dari link dimuat";
});

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
  activeCpu = cpu;
  new AVRTimer(cpu, timer0Config); // dibutuhkan delay() dan millis()
  new AVRTimer(cpu, timer1Config); // dibutuhkan library Servo.h
  new AVRTimer(cpu, timer2Config); // analogWrite() di pin 3 dan 11, tone()
  servoMeters.clear();

  // Ketiga port dibuat semua, karena LED dan tombol bisa di pin mana saja.
  // Setiap kali port berubah, tampilan LED dan servo diperbarui.
  ports.B = new AVRIOPort(cpu, portBConfig);
  ports.C = new AVRIOPort(cpu, portCConfig);
  ports.D = new AVRIOPort(cpu, portDConfig);
  for (const port of Object.values(ports)) port!.addListener(onPortChange);

  // ADC untuk analogRead(). Tegangan referensi default 5 V (AVCC).
  adc = new AVRADC(cpu, adcConfig);

  // Nilai awal tombol dan potensiometer
  syncInputs();

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
  activeCpu = null;
  bounces.clear(); // jadwal getaran ikut hilang bersama CPU lama
  ports.B = ports.C = ports.D = null;
  adc = null;
  usartRx = null;
  rxQueue = [];
  board.ledsOff();
  setEditable(true);
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
    setEditable(false);
    statusEl.textContent = "Berjalan";
    stopBtn.disabled = false;
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    statusEl.textContent = "Gagal"; // sebelumnya tetap tertulis "Compiling..."
    outputEl.textContent = message;
    showCompileErrors(editor, message); // garis merah di baris yang error
  } finally {
    runBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", stop);

// Bagikan: buat link berisi kode, lalu salin ke clipboard
shareBtn.addEventListener("click", async () => {
  const url = await makeShareUrl(
    editor.getValue(),
    encodeCircuit(board.parts()),
  );
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

// --- Listener papan: dipasang SEKALI di sini, bukan di dalam run() ---
// (Listener tombol dan slider tiap komponen dipasang di board.ts saat
// komponennya dibuat.)

// Rangkaian hanya bisa diubah saat emulator berhenti
function setEditable(on: boolean) {
  board.setEditable(on);
  addBtns.forEach((btn) => (btn.disabled = !on));
}

addBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.add as Part["type"];
    if (!board.add(type)) statusEl.textContent = "Tidak ada pin kosong lagi";
  });
});

// Kosongkan pembacaan getaran saat mode bouncing dimatikan
bounceToggle.addEventListener("change", () => {
  if (bounceToggle.checked) return;
  for (const part of board.parts()) {
    if (part.type === "button") board.setReadout(part.id, "");
  }
});

// Form serial: Enter atau klik Kirim
serialForm.addEventListener("submit", (e) => {
  e.preventDefault(); // cegah halaman reload
  sendSerial(serialInEl.value);
  serialInEl.value = "";
});
