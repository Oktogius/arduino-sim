import "./style.css";
import {
  CPU,
  avrInstruction,
  AVRTimer,
  timer0Config,
  AVRIOPort,
  portBConfig,
  PinState,
} from "avr8js";
import { loadHex } from "./intelhex";

const DEFAULT_CODE = `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
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
  </div>
  <pre id="output"></pre>
`;

const codeEl = document.querySelector<HTMLTextAreaElement>("#code")!;
const runBtn = document.querySelector<HTMLButtonElement>("#run")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stop")!;
const statusEl = document.querySelector<HTMLSpanElement>("#status")!;
const ledEl = document.querySelector<HTMLDivElement>("#led")!;
const outputEl = document.querySelector<HTMLPreElement>("#output")!;

codeEl.value = DEFAULT_CODE;

let running = false;

// Kirim kode ke server Python, terima file .hex
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

// Jalankan file .hex di emulator ATmega328P
function run(hex: string) {
  // Flash ATmega328P = 32 KB, disimpan sebagai word 16-bit
  const program = new Uint16Array(0x8000 / 2);
  loadHex(hex, new Uint8Array(program.buffer));

  const cpu = new CPU(program);
  new AVRTimer(cpu, timer0Config); // dibutuhkan oleh delay() dan millis()
  const portB = new AVRIOPort(cpu, portBConfig);

  // Pin 13 di Arduino Uno = bit ke-5 dari PORTB (PB5)
  portB.addListener(() => {
    const on = portB.pinState(5) === PinState.High;
    ledEl.classList.toggle("on", on);
  });

  // Arduino Uno berjalan 16 MHz; browser menggambar ~60 kali per detik
  const CYCLES_PER_FRAME = 16_000_000 / 60;

  running = true;
  function frame() {
    if (!running) return;
    const target = cpu.cycles + CYCLES_PER_FRAME;
    while (cpu.cycles < target) {
      avrInstruction(cpu); // jalankan satu instruksi
      cpu.tick(); // perbarui timer & interrupt
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function stop() {
  running = false;
  ledEl.classList.remove("on");
  stopBtn.disabled = true;
  statusEl.textContent = "Berhenti";
}

runBtn.addEventListener("click", async () => {
  stop();
  outputEl.textContent = "";
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
