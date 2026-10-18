// Tampilan papan komponen: membuat elemen wokwi untuk setiap komponen,
// dropdown pin, tombol hapus, dan meneruskan aksi pengguna ke main.ts.
// File ini tidak tahu apa-apa tentang emulator.

import type {
  LEDElement,
  PushbuttonElement,
  PotentiometerElement,
} from "@wokwi/elements";
import {
  type Part,
  type PartType,
  PART_NAMES,
  allowedPins,
  usedPins,
  createPart,
} from "./circuit";

export interface BoardHandlers {
  onButton(part: Part, pressed: boolean): void; // tombol ditekan / dilepas
  onPot(part: Part, raw: number): void; // slider potensiometer digeser (0..1023)
  onEdit(parts: readonly Part[]): void; // rangkaian berubah (tambah/hapus/ganti pin)
}

// Elemen-elemen milik satu komponen
interface Entry {
  part: Part;
  root: HTMLDivElement;
  select: HTMLSelectElement;
  removeBtn: HTMLButtonElement;
  readout: HTMLSpanElement;
  led?: LEDElement;
  button?: PushbuttonElement;
  slider?: HTMLInputElement;
  knob?: PotentiometerElement;
}

export function createBoard(
  container: HTMLElement,
  initial: Part[],
  handlers: BoardHandlers,
) {
  let entries: Entry[] = [];
  let editable = true;

  const parts = () => entries.map((e) => e.part);
  const find = (id: number) => entries.find((e) => e.part.id === id);

  // Membuat satu kartu komponen. Listener dipasang di sini, sekali per elemen,
  // dan ikut hilang saat elemennya dihapus (tidak menumpuk).
  function build(part: Part): Entry {
    const root = document.createElement("div");
    root.className = "component";
    const entry = { part, root } as Entry;

    // createElement + setAttribute (bukan innerHTML), karena warna dan pin
    // bisa berasal dari link berbagi.
    if (part.type === "led") {
      const led = document.createElement("wokwi-led") as LEDElement;
      led.setAttribute("color", part.color);
      root.append(led);
      entry.led = led;
    } else if (part.type === "button") {
      const button = document.createElement(
        "wokwi-pushbutton",
      ) as PushbuttonElement;
      button.setAttribute("color", part.color);
      // wokwi-pushbutton sudah menangani mouse, sentuhan, Spasi, dan pointer keluar
      button.addEventListener("button-press", () =>
        handlers.onButton(part, true),
      );
      button.addEventListener("button-release", () =>
        handlers.onButton(part, false),
      );
      root.append(button);
      entry.button = button;
    } else {
      // Knob wokwi hanya tampilan; slider HTML yang jadi pengendali (Bab 10.3)
      const knob = document.createElement(
        "wokwi-potentiometer",
      ) as PotentiometerElement;
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "1023";
      slider.value = "0";
      slider.className = "pot-slider";
      slider.setAttribute("aria-label", "Potensiometer");
      slider.addEventListener("input", () => {
        updatePotDisplay(entry);
        handlers.onPot(part, Number(slider.value));
      });
      root.append(knob, slider);
      Object.assign(entry, { slider, knob });
    }

    // Baris nama + dropdown pin + tombol hapus
    const row = document.createElement("div");
    row.className = "part-pin";
    const name = document.createElement("span");
    name.textContent = PART_NAMES[part.type];
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Pin ${PART_NAMES[part.type]}`);
    select.addEventListener("change", () => {
      part.pin = select.value;
      refreshPinOptions();
      handlers.onEdit(parts());
    });
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Hapus komponen";
    removeBtn.addEventListener("click", () => {
      entries = entries.filter((e) => e !== entry);
      root.remove();
      refreshPinOptions();
      handlers.onEdit(parts());
    });
    row.append(name, select, removeBtn);

    const readout = document.createElement("span");
    readout.className = "readout";
    root.append(row, readout);

    Object.assign(entry, { select, removeBtn, readout });
    if (entry.slider) updatePotDisplay(entry); // tampilkan nilai awal
    return entry;
  }

  function updatePotDisplay(entry: Entry) {
    const raw = Number(entry.slider!.value);
    entry.knob!.value = raw; // putar knob sesuai slider
    entry.readout.textContent = `${raw} · ${((raw / 1023) * 5).toFixed(2)} V`;
  }

  // Isi ulang pilihan pin di semua dropdown.
  // Pin yang sudah dipakai komponen lain ditampilkan tapi tidak bisa dipilih.
  function refreshPinOptions() {
    const all = parts();
    for (const { part, select, removeBtn } of entries) {
      const used = usedPins(all, part.id);
      select.replaceChildren(
        ...allowedPins(part.type).map((pin) => {
          const option = new Option(pin, pin, false, pin === part.pin);
          option.disabled = used.has(pin);
          return option;
        }),
      );
      select.disabled = !editable;
      removeBtn.disabled = !editable;
    }
  }

  function setParts(list: Part[]) {
    entries = list.map(build);
    container.replaceChildren(...entries.map((e) => e.root));
    refreshPinOptions();
  }

  setParts(initial);

  return {
    parts,
    setParts,

    // Tambah komponen di pin kosong pertama. false kalau pin sudah habis.
    add(type: PartType): boolean {
      const part = createPart(parts(), type);
      if (!part) return false;
      const entry = build(part);
      entries.push(entry);
      container.append(entry.root);
      refreshPinOptions();
      handlers.onEdit(parts());
      return true;
    },

    // Saat emulator berjalan, rangkaian dikunci: pin tidak bisa diganti dan
    // komponen tidak bisa dihapus. Tombol dan slider tetap bisa dipakai.
    setEditable(on: boolean) {
      editable = on;
      refreshPinOptions();
    },

    setLed(id: number, on: boolean) {
      const led = find(id)?.led;
      if (led && led.value !== on) led.value = on;
    },

    ledsOff() {
      for (const e of entries) if (e.led) e.led.value = false;
    },

    isPressed: (id: number) => find(id)?.button?.pressed ?? false,
    potRaw: (id: number) => Number(find(id)?.slider?.value ?? 0),

    setReadout(id: number, text: string) {
      const entry = find(id);
      if (entry) entry.readout.textContent = text;
    },
  };
}

export type Board = ReturnType<typeof createBoard>;
