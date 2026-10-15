import "./style.css";
import {
  CPU,
  avrInstruction,
  AVRTimer,
  timer0Config,
  AVRIOPort,
  portBConfig,
  PinState,
  AVRUSART, // BARU
  usart0Config, // BARU
} from "avr8js";
import { loadHex } from "./intelhex";

const DEFAULT_CODE = `int counter = 0;

void setup() {
  Serial.begin(9600);
  Serial.println("Halo dari Arduino Sim!");
  pinMode(13, OUTPUT);
}

void loop() {
  counter++;
  Serial.print("Hitungan: ");
  Serial.println(counter);
  digitalWrite(13, counter % 2);
  delay(1000);
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
const serialEl = document.querySelector<HTMLPreElement>("#serial")!; // BARU
const clearBtn = document.querySelector<HTMLButtonElement>("#clear")!; // BARU

codeEl.value = DEFAULT_CODE;

let running = false;

// BARU: batas panjang teks serial supaya browser tidak berat
const MAX_SERIAL_LENGTH = 10000;

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
  const program = new Uint16Array(0x8000 / 2);
  loadHex(hex, new Uint8Array(program.buffer));

  const cpu = new CPU(program);
  new AVRTimer(cpu, timer0Config);
  const portB = new AVRIOPort(cpu, portBConfig);

  portB.addListener(() => {
    const on = portB.pinState(5) === PinState.High;
    ledEl.classList.toggle("on", on);
  });

  // BARU: tiruan USART, frekuensi CPU 16 MHz
  const usart = new AVRUSART(cpu, usart0Config, 16_000_000);
  let serialBuffer = "";
  usart.onByteTransmit = (value: number) => {
    serialBuffer += String.fromCharCode(value);
  };

  const CYCLES_PER_FRAME = 16_000_000 / 60;

  running = true;
  function frame() {
    if (!running) return;
    const target = cpu.cycles + CYCLES_PER_FRAME;
    while (cpu.cycles < target) {
      avrInstruction(cpu);
      cpu.tick();
    }

    // BARU: tampilkan teks serial sekali per frame (lebih ringan
    // daripada memperbarui tampilan setiap kali ada satu huruf)
    if (serialBuffer) {
      serialEl.textContent = (serialEl.textContent + serialBuffer).slice(
        -MAX_SERIAL_LENGTH,
      );
      serialBuffer = "";
      serialEl.scrollTop = serialEl.scrollHeight; // auto-scroll ke bawah
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
  serialEl.textContent = ""; // BARU: kosongkan serial setiap kali run ulang
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

// BARU
clearBtn.addEventListener("click", () => {
  serialEl.textContent = "";
});
