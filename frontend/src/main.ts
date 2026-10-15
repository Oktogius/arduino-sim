import "./style.css";
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
} from "avr8js";
import { loadHex } from "./intelhex";

const DEFAULT_CODE = `void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

int last = -1;
void loop() {
  int s = digitalRead(2);
  digitalWrite(13, s == LOW);   // LED menyala saat tombol ditekan
  if (s != last) {
    Serial.println(s == LOW ? "Ditekan" : "Dilepas");
    last = s;
  }
}
`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <h1>Arduino Sim</h1>
  <textarea id="code" spellcheck="false"></textarea>
  <div class="controls">
    <button id="run">Compile &amp; Run</button>
    <button id="stop" disabled>Stop</button>
    <span id="status">Siap</span>
  </div>
  <div class="board">
    <div id="led" class="led"></div>
    <span>LED Pin 13</span>
    <button id="btn2" class="push-button" aria-label="Tombol pin 2"></button>
    <span>Tombol Pin 2</span>
  </div>
  <pre id="output"></pre>
  <div class="serial-header">
    <span>Serial Monitor</span>
    <button id="clear">Clear</button>
  </div>
  <pre id="serial"></pre>
`;

const codeEl = document.querySelector<HTMLTextAreaElement>("#code")!;
const runBtn = document.querySelector<HTMLButtonElement>("#run")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stop")!;
const statusEl = document.querySelector<HTMLSpanElement>("#status")!;
const ledEl = document.querySelector<HTMLDivElement>("#led")!;
const outputEl = document.querySelector<HTMLPreElement>("#output")!;
const serialEl = document.querySelector<HTMLPreElement>("#serial")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clear")!;
const button2El = document.querySelector<HTMLButtonElement>("#btn2")!;

codeEl.value = DEFAULT_CODE;

let running = false;
const MAX_SERIAL_LENGTH = 10000;

// Port D milik emulator yang sedang berjalan (null kalau tidak ada).
// Disimpan di level modul supaya listener tombol (dipasang sekali saja)
// selalu menjangkau emulator yang aktif.
let portD: AVRIOPort | null = null;

// Pin 2 di Arduino Uno = PD2 (bit ke-2 dari PORTD)
const BUTTON_PIN = 2;

// Rangkaian virtual: tombol ke GND, dipakai dengan INPUT_PULLUP.
// Dilepas = HIGH, ditekan = LOW (active low).
function setButtonPressed(pressed: boolean) {
  button2El.classList.toggle("pressed", pressed);
  portD?.setPin(BUTTON_PIN, !pressed);
}

async function compile(code: string): Promise<string> {
  const res = await fetch("http://localhost:8000/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
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
    const on = portB.pinState(5) === PinState.High;
    ledEl.classList.toggle("on", on);
  });

  // Port D untuk input tombol. Mulai dalam keadaan "dilepas" (HIGH),
  // supaya sketch tidak mengira tombol ditekan saat program baru mulai.
  portD = new AVRIOPort(cpu, portDConfig);
  portD.setPin(BUTTON_PIN, !button2El.classList.contains("pressed"));

  // Tiruan USART, frekuensi CPU 16 MHz
  const usart = new AVRUSART(cpu, usart0Config, 16_000_000);
  let serialBuffer = "";
  usart.onByteTransmit = (value: number) => {
    serialBuffer += String.fromCharCode(value);
  };

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
  portD = null; // klik tombol saat berhenti tidak lagi menyentuh emulator
  ledEl.classList.remove("on");
  stopBtn.disabled = true;
  statusEl.textContent = "Berhenti";
}

runBtn.addEventListener("click", async () => {
  stop();
  outputEl.textContent = "";
  serialEl.textContent = "";
  statusEl.textContent = "Compiling...";
  runBtn.disabled = true;
  try {
    const hex = await compile(codeEl.value);
    run(hex);
    statusEl.textContent = "Berjalan";
    stopBtn.disabled = false;
  } catch (err) {
    statusEl.textContent = "Gagal compile";
    outputEl.textContent = String(err instanceof Error ? err.message : err);
  } finally {
    runBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", stop);

clearBtn.addEventListener("click", () => {
  serialEl.textContent = "";
});

// Listener tombol dipasang SEKALI di sini, bukan di dalam run().
// Pointer Events menangani mouse dan layar sentuh sekaligus.
// setPointerCapture membuat pointerup tetap sampai ke tombol walaupun
// pointer sudah digeser keluar, jadi tombol tidak "nyangkut".
button2El.addEventListener("pointerdown", (e) => {
  button2El.setPointerCapture(e.pointerId);
  setButtonPressed(true);
});
button2El.addEventListener("pointerup", () => setButtonPressed(false));
button2El.addEventListener("pointercancel", () => setButtonPressed(false));
