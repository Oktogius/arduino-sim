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
  goToLine,
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
import { HD44780 } from "./lcd";
import { DutyMeter } from "./pwm";
import { EXAMPLES, DEFAULT_EXAMPLE, type Example } from "./examples";
import { createGallery } from "./gallery";
import { explainErrors } from "./explain";
import { createExplainPanel } from "./explainPanel";
import { SerialPlotter } from "./plotter";
import { ldrVoltage } from "./ldr";
import { Ultrasonic } from "./ultrasonic";
import { Dht22 } from "./dht22";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <h1>Arduino Sim</h1>
  <div id="editor"></div>
  <div class="controls">
    <button id="run">Compile &amp; Run</button>
    <button id="stop" disabled>Stop</button>
    <button id="share" class="secondary">Bagikan</button>
    <button id="example" class="secondary">Contoh ▾</button>
    <span id="status">Siap</span>
  </div>
  <p id="example-note" class="example-note"></p>
  <div class="board-toolbar">
    <button class="secondary small" data-add="led">+ LED</button>
    <button class="secondary small" data-add="button">+ Tombol</button>
    <button class="secondary small" data-add="pot">+ Potensiometer</button>
    <button class="secondary small" data-add="servo">+ Servo</button>
    <button class="secondary small" data-add="lcd">+ LCD</button>
    <button class="secondary small" data-add="ldr">+ LDR</button>
    <button class="secondary small" data-add="ultrasonic">+ HC-SR04</button>
    <button class="secondary small" data-add="dht22">+ DHT22</button>
    <label class="toggle" title="Tiru getaran kontak tombol asli (1-5 ms)">
      <input id="bounce-toggle" type="checkbox" /> Bouncing
    </label>
  </div>
  <div id="board" class="board"></div>
  <div id="explain"></div>
  <pre id="output"></pre>
  <div class="serial-header">
    <div class="serial-tabs" role="tablist">
      <button id="tab-monitor" class="tab" role="tab">Serial Monitor</button>
      <button id="tab-plotter" class="tab" role="tab">Serial Plotter</button>
    </div>
    <button id="clear">Clear</button>
  </div>
  <pre id="serial" role="tabpanel"></pre>
  <div id="plotter" class="plotter" role="tabpanel" hidden>
    <div id="plot-legend" class="plot-legend"></div>
    <p id="plot-empty" class="plot-empty">
      Belum ada angka. Kirim dengan Serial.println(nilai); atau beberapa
      sekaligus: Serial.print("suhu:"); Serial.print(t); Serial.print(",lembab:"); Serial.println(h);
    </p>
    <canvas id="plot-canvas"></canvas>
  </div>
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
const exampleNoteEl =
  document.querySelector<HTMLParagraphElement>("#example-note")!;
const outputEl = document.querySelector<HTMLPreElement>("#output")!;
const explainEl = document.querySelector<HTMLDivElement>("#explain")!;
const serialEl = document.querySelector<HTMLPreElement>("#serial")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clear")!;
const tabMonitor = document.querySelector<HTMLButtonElement>("#tab-monitor")!;
const tabPlotter = document.querySelector<HTMLButtonElement>("#tab-plotter")!;
const plotterEl = document.querySelector<HTMLDivElement>("#plotter")!;
const serialForm = document.querySelector<HTMLFormElement>("#serial-form")!;
const serialInEl = document.querySelector<HTMLInputElement>("#serial-in")!;

const boardEl = document.querySelector<HTMLDivElement>("#board")!;
const addBtns = document.querySelectorAll<HTMLButtonElement>("[data-add]");
const bounceToggle =
  document.querySelector<HTMLInputElement>("#bounce-toggle")!;

// Urutan kode awal: simpanan lokal, kalau tidak ada pakai contoh bawaan.
// Kode dari link berbagi dibaca sesudahnya (prosesnya async).
const editor = createEditor(editorEl, loadSavedCode() ?? DEFAULT_EXAMPLE.code);

// Simpan otomatis setengah detik setelah berhenti mengetik (debounce),
// supaya tidak menulis ke localStorage di setiap ketukan tombol.
let saveTimer: number | undefined;
editor.onDidChangeModelContent(() => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveCode(editor.getValue()), 500);
});
// Penjelasan error dalam Bahasa Indonesia, di atas pesan asli compiler.
// Klik "Baris N" di kartu penjelasan untuk melompat ke baris itu.
const explainPanel = createExplainPanel(explainEl, (line) =>
  goToLine(editor, line),
);

// Ctrl+Enter = Compile & Run (kecuali sedang compile)
addRunShortcut(editor, () => {
  if (!runBtn.disabled) runBtn.click();
});

let running = false;

// Serial Plotter: membaca angka dari teks serial yang sama dengan Serial Monitor.
// Data tetap dikumpulkan walaupun tab Plotter sedang tidak dibuka.
const plotter = new SerialPlotter(
  document.querySelector<HTMLCanvasElement>("#plot-canvas")!,
  document.querySelector<HTMLDivElement>("#plot-legend")!,
  document.querySelector<HTMLParagraphElement>("#plot-empty")!,
);

// Pindah tab Serial Monitor / Serial Plotter
function showSerialView(view: "monitor" | "plotter") {
  const plot = view === "plotter";
  serialEl.hidden = plot;
  plotterEl.hidden = !plot;
  tabMonitor.classList.toggle("active", !plot);
  tabPlotter.classList.toggle("active", plot);
  tabMonitor.setAttribute("aria-selected", String(!plot));
  tabPlotter.setAttribute("aria-selected", String(plot));
  plotter.setVisible(plot);
  if (!plot) serialEl.scrollTop = serialEl.scrollHeight;
}
showSerialView("monitor");
const MAX_SERIAL_LENGTH = 10000;

// --- Referensi ke periferal emulator yang sedang berjalan ---
// Disimpan di level modul supaya listener komponen (dipasang sekali saja)
// selalu menjangkau emulator yang aktif. null = emulator tidak berjalan.
let activeCpu: CPU | null = null; // dibutuhkan untuk menjadwalkan getaran tombol
const ports: Record<PortName, AVRIOPort | null> = { B: null, C: null, D: null };
let adc: AVRADC | null = null;
let usartRx: AVRUSART | null = null;
let rxQueue: number[] = [];

// --- Output: LED, servo, dan LCD ---
// Pengukur kecerahan per LED (kunci = id komponen), dibuat ulang setiap Run
const ledMeters = new Map<number, DutyMeter>();

// Pengukur pulsa per servo (kunci = id komponen), dibuat ulang setiap Run
const servoMeters = new Map<number, PulseMeter>();

// Chip LCD per komponen, beserta kondisi pin E sebelumnya (untuk mendeteksi E turun)
const lcds = new Map<number, { chip: HD44780; lastE: boolean }>();

// Sensor yang menjawab sinyal dari Arduino (dibuat ulang setiap Run)
const ultrasonics = new Map<number, Ultrasonic>();
const dhts = new Map<number, Dht22>();

// Apakah pin sedang HIGH (dikeluarkan Arduino sebagai output HIGH)
function isHigh(pin: string): boolean {
  const { port, bit } = PINS[pin];
  return ports[port]?.pinState(bit) === PinState.High;
}

// Pin E LCD baru saja turun: baca RS dan D4..D7, kirim ke chip
function updateLcd(part: Part) {
  let lcd = lcds.get(part.id);
  if (!lcd) lcds.set(part.id, (lcd = { chip: new HD44780(), lastE: false }));
  const [rs, e, d4, d5, d6, d7] = part.pins;
  const eHigh = isHigh(e);
  if (lcd.lastE && !eHigh) {
    const nibble =
      (isHigh(d7) ? 8 : 0) |
      (isHigh(d6) ? 4 : 0) |
      (isHigh(d5) ? 2 : 0) |
      (isHigh(d4) ? 1 : 0);
    lcd.chip.pulse(isHigh(rs), nibble);
  }
  lcd.lastE = eHigh;
}

// Gambar LED dan LCD sekali per frame (batching, Bab 6.2).
// - LED: kecerahan = bagian waktu pin HIGH selama frame (PWM, lihat pwm.ts)
// - LCD: hanya kalau isinya berubah; satu lcd.print("Halo") saja sudah 8 pulsa E
function renderOutputs(now: number) {
  for (const [id, meter] of ledMeters) {
    const { duty, pwm } = meter.endFrame(now);
    board.setLed(id, duty);
    board.setReadout(id, pwm ? `PWM ${Math.round(duty * 100)}%` : "");
  }
  for (const [id, { chip }] of lcds) {
    if (chip.dirty) board.setLcd(id, chip.view());
  }
}

// Dipanggil setiap kali salah satu port berubah. Komponen biasanya hanya
// beberapa, jadi cukup periksa semuanya tanpa perlu dipilah per port.
function onPortChange() {
  for (const part of board.parts()) {
    if (part.type === "lcd") {
      updateLcd(part);
      continue;
    }
    if (part.type === "ultrasonic" || part.type === "dht22") {
      if (activeCpu) updateSensor(part, activeCpu);
      continue;
    }
    if (part.type !== "led" && part.type !== "servo") continue;
    const high = isHigh(part.pins[0]);

    if (!activeCpu) continue;
    if (part.type === "led") {
      ledMeters.get(part.id)?.update(high, activeCpu.cycles);
    } else {
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
  setInputPin(part.pins[0], level);
}

// Level yang "dikirim" komponen ke pin input Arduino
function setInputPin(pin: string, level: boolean) {
  const { port, bit } = PINS[pin];
  ports[port]?.setPin(bit, level);
}

// --- Sensor HC-SR04 dan DHT22 ---
// Keduanya menunggu sinyal dari Arduino (pulsa TRIG / sinyal start), lalu
// menjawab dengan pulsa yang dijadwalkan dalam siklus CPU.
function updateSensor(part: Part, cpu: CPU) {
  if (part.type === "ultrasonic") {
    let sensor = ultrasonics.get(part.id);
    if (!sensor) ultrasonics.set(part.id, (sensor = new Ultrasonic()));
    const [trig, echo] = part.pins;
    sensor.update(
      isHigh(trig),
      cpu,
      () => board.distance(part.id),
      (level) => setInputPin(echo, level),
    );
  } else {
    let sensor = dhts.get(part.id);
    if (!sensor) dhts.set(part.id, (sensor = new Dht22()));
    const pin = part.pins[0];
    const { port, bit } = PINS[pin];
    // Sinyal start: Arduino menjadikan pin OUTPUT dan menariknya LOW
    const pulledLow = ports[port]?.pinState(bit) === PinState.Low;
    sensor.update(
      pulledLow,
      cpu,
      () => board.climate(part.id),
      (level) => setInputPin(pin, level),
    );
  }
}

// --- LDR ---
// Modul LDR: tegangan di pin AO turun saat cahaya makin terang (lihat ldr.ts)
function onLdr(part: Part, lux: number) {
  const channel = PINS[part.pins[0]].adc!;
  if (adc) adc.channelValues[channel] = ldrVoltage(lux);
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
  const channel = PINS[part.pins[0]].adc!;
  if (adc) adc.channelValues[channel] = (raw / 1023) * 5;
}

// Samakan semua pin input dengan kondisi komponen sekarang, tanpa getaran.
// Dipanggil saat emulator mulai, supaya sketch tidak mengira tombol
// sedang ditekan begitu program berjalan.
function syncInputs() {
  for (const part of board.parts()) {
    if (part.type === "button") setButtonPin(part, !board.isPressed(part.id));
    if (part.type === "pot") onPot(part, board.potRaw(part.id));
    if (part.type === "ldr") onLdr(part, board.lux(part.id));
    if (part.type === "ultrasonic") setInputPin(part.pins[1], false); // ECHO diam = LOW
    if (part.type === "dht22") setInputPin(part.pins[0], true); // jalur data ditarik pull-up
  }
}

// --- Papan komponen ---
// Urutan rangkaian awal: simpanan lokal, kalau tidak ada pakai rangkaian bawaan.
const board = createBoard(boardEl, loadSavedCircuit() ?? defaultCircuit(), {
  onButton,
  onPot,
  onLdr,
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
  ledMeters.clear();
  for (const part of board.parts()) {
    if (part.type === "led") ledMeters.set(part.id, new DutyMeter(cpu.cycles));
  }
  lcds.clear(); // LCD baru setiap Run: seperti listrik baru dinyalakan
  ultrasonics.clear();
  dhts.clear();

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
    renderOutputs(cpu.cycles);

    // Batching: tampilkan teks serial sekali per frame
    if (serialBuffer) {
      plotter.feed(serialBuffer);
      serialEl.textContent = (serialEl.textContent + serialBuffer).slice(
        -MAX_SERIAL_LENGTH,
      );
      serialBuffer = "";
      serialEl.scrollTop = serialEl.scrollHeight;
    }
    plotter.render(); // hanya menggambar kalau ada angka baru dan tab terlihat
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
  board.outputsOff();
  setEditable(true);
  stopBtn.disabled = true;
  statusEl.textContent = "Berhenti";
}

runBtn.addEventListener("click", async () => {
  stop();
  outputEl.textContent = "";
  explainPanel.clear();
  serialEl.textContent = "";
  plotter.clear(true); // program baru: serial mulai dari awal baris
  statusEl.textContent = "Compiling...";
  runBtn.disabled = true;
  // Selama compile, contoh tidak bisa dimuat: kalau rangkaian diganti di
  // tengah compile, kode lama akan berjalan di rangkaian baru.
  exampleBtn.disabled = true;
  clearCompileErrors(editor);
  // Kode yang dikirim disimpan, supaya penjelasan error membaca baris yang
  // sama dengan yang di-compile
  const code = editor.getValue();
  try {
    const hex = await compile(code);
    run(hex);
    setEditable(false);
    statusEl.textContent = "Berjalan";
    stopBtn.disabled = false;
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    statusEl.textContent = "Gagal"; // sebelumnya tetap tertulis "Compiling..."
    outputEl.textContent = message;
    // Penjelasan Bahasa Indonesia (kosong kalau bukan error dari compiler,
    // misalnya server tidak bisa dihubungi)
    const explanations = explainErrors(message, code);
    explainPanel.show(explanations);
    // Garis merah di baris yang error, biru di baris yang perlu diperiksa
    showCompileErrors(editor, message, explanations);
  } finally {
    runBtn.disabled = false;
    exampleBtn.disabled = false;
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

// --- Galeri contoh: kode DAN rangkaian dimuat bersamaan ---
function loadExample(example: Example) {
  const model = editor.getModel();
  // Rangkaian contoh tetap diperiksa seperti data dari link (circuit.ts)
  const parts = decodeCircuit(example.circuit);
  if (!model || !parts) {
    statusEl.textContent = `Contoh "${example.title}" rusak, tidak dimuat`;
    return;
  }

  // Rangkaian hanya boleh diganti saat emulator berhenti
  const wasRunning = running;
  if (wasRunning) stop();

  board.setParts(parts);
  saveCircuit(parts);
  if (example.bounce) bounceToggle.checked = true;
  if (example.plotter) showSerialView("plotter");

  // executeEdits (bukan setValue) supaya bisa dibatalkan dengan Ctrl+Z.
  // pushUndoStop di depan dan belakang: penggantian kode menjadi satu langkah
  // undo sendiri, tidak tergabung dengan ketikan sebelum/sesudahnya.
  editor.pushUndoStop();
  editor.executeEdits("contoh", [
    { range: model.getFullModelRange(), text: example.code },
  ]);
  editor.pushUndoStop();
  editor.setPosition({ lineNumber: 1, column: 1 });
  editor.revealLine(1);
  editor.focus();

  // Pesan error dan tanda merah milik kode lama tidak berlaku lagi
  clearCompileErrors(editor);
  outputEl.textContent = "";
  explainPanel.clear();

  const libs = example.libraries.map((lib) => `<${lib}.h>`).join(", ");
  exampleNoteEl.textContent =
    `${example.title}: ${example.howTo}` +
    (libs ? ` Memakai library ${libs}.` : "");
  statusEl.textContent =
    (wasRunning ? "Emulator dihentikan. " : "") +
    "Contoh dimuat (Ctrl+Z di editor mengembalikan kode lama)";
}

createGallery(exampleBtn, EXAMPLES, loadExample);

clearBtn.addEventListener("click", () => {
  serialEl.textContent = "";
  plotter.clear();
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

tabMonitor.addEventListener("click", () => showSerialView("monitor"));
tabPlotter.addEventListener("click", () => showSerialView("plotter"));

// Form serial: Enter atau klik Kirim
serialForm.addEventListener("submit", (e) => {
  e.preventDefault(); // cegah halaman reload
  sendSerial(serialInEl.value);
  serialInEl.value = "";
});
