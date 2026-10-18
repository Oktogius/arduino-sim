// Tampilan penjelasan error: kartu-kartu di atas pesan asli compiler.
// Logikanya ada di explain.ts; file ini hanya membuat elemen.

import type { Explanation } from "./explain";

const MAX_CARDS = 5; // lebih dari ini biasanya hanya efek domino error pertama

export function createExplainPanel(
  container: HTMLElement,
  onGoto: (line: number) => void, // klik "Baris N": lompat ke baris itu di editor
) {
  container.classList.add("explain");

  function clear() {
    container.replaceChildren();
  }

  function show(list: readonly Explanation[]) {
    clear();
    if (list.length === 0) return;

    const heading = document.createElement("div");
    heading.className = "explain-heading";
    heading.textContent = "Penjelasan error";
    container.append(heading);

    if (list.length > 1) {
      const hint = document.createElement("p");
      hint.className = "explain-hint";
      hint.textContent =
        "Perbaiki dari yang paling atas dulu, lalu Compile lagi. " +
        "Error berikutnya sering hanya akibat error pertama.";
      container.append(hint);
    }

    // createElement + textContent (bukan innerHTML): pesan berisi potongan
    // kode pengguna, yang bisa saja mengandung < atau >
    for (const e of list.slice(0, MAX_CARDS)) {
      const card = document.createElement("div");
      card.className = "explain-card";

      const head = document.createElement("div");
      head.className = "explain-head";
      if (e.line !== null) {
        const line = e.line;
        const goto = document.createElement("button");
        goto.type = "button";
        goto.className = "explain-line";
        goto.textContent = `Baris ${line}`;
        goto.title = "Lompat ke baris ini di editor";
        goto.addEventListener("click", () => onGoto(line));
        head.append(goto);
      }
      const title = document.createElement("span");
      title.className = "explain-title";
      title.textContent = e.title;
      head.append(title);
      card.append(head);

      if (e.line !== null && e.source) {
        const source = document.createElement("code");
        source.className = "explain-source";
        source.textContent = `${e.line} | ${e.source}`;
        card.append(source);
      }

      const detail = document.createElement("p");
      detail.textContent = e.detail;
      const tip = document.createElement("p");
      tip.className = "explain-tip";
      const label = document.createElement("strong");
      label.textContent = "Saran: ";
      tip.append(label, e.tip);
      card.append(detail, tip);

      container.append(card);
    }

    if (list.length > MAX_CARDS) {
      const more = document.createElement("p");
      more.className = "explain-hint";
      more.textContent = `${list.length - MAX_CARDS} penjelasan lain disembunyikan. Perbaiki yang di atas dulu.`;
      container.append(more);
    }

    const original = document.createElement("div");
    original.className = "explain-original";
    original.textContent = "Pesan asli dari compiler:";
    container.append(original);
  }

  return { show, clear };
}
