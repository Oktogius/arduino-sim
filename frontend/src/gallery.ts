// Menu galeri contoh: tombol "Contoh ▾" yang membuka daftar contoh.
// File ini hanya tampilan; memuat kode dan rangkaian dilakukan main.ts
// lewat onPick.
//
// Sengaja tidak memakai <select>: di Chrome (Windows), menekan panah atas/bawah
// pada <select> yang tertutup langsung memicu "change", jadi contoh bisa
// termuat tanpa sengaja. Menu sendiri juga punya ruang untuk keterangan.

import type { Example } from "./examples";

export function createGallery(
  button: HTMLButtonElement,
  examples: readonly Example[],
  onPick: (example: Example) => void,
) {
  // Bungkus tombol supaya menu bisa diposisikan tepat di bawahnya
  const wrap = document.createElement("span");
  wrap.className = "example-wrap";
  button.replaceWith(wrap);

  const menu = document.createElement("div");
  menu.className = "example-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  wrap.append(button, menu);

  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");

  // Isi menu dibuat sekali. createElement + textContent (bukan innerHTML).
  const items: HTMLButtonElement[] = [];
  let lastGroup = "";
  for (const example of examples) {
    if (example.group !== lastGroup) {
      lastGroup = example.group;
      const heading = document.createElement("div");
      heading.className = "example-group";
      heading.textContent = example.group;
      menu.append(heading);
    }

    const item = document.createElement("button");
    item.type = "button";
    item.className = "example-item";
    item.setAttribute("role", "menuitem");
    item.dataset.example = example.id;

    const title = document.createElement("span");
    title.className = "example-title";
    title.textContent = example.title;
    for (const lib of example.libraries) {
      const badge = document.createElement("span");
      badge.className = "lib-badge";
      badge.textContent = `${lib}.h`;
      badge.title = `Butuh library ${lib}`;
      title.append(badge);
    }

    const summary = document.createElement("span");
    summary.className = "example-summary";
    summary.textContent = example.summary;

    item.append(title, summary);
    item.addEventListener("click", () => {
      close();
      onPick(example);
    });
    items.push(item);
    menu.append(item);
  }

  function open() {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    items[0]?.focus();
  }

  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  // --- Listener: semuanya dipasang sekali di sini ---
  button.addEventListener("click", () => (menu.hidden ? open() : close()));

  // Klik di luar menu menutupnya
  document.addEventListener("pointerdown", (e) => {
    if (!wrap.contains(e.target as Node)) close();
  });

  // Fokus pindah keluar menu (misalnya dengan Tab) juga menutupnya
  wrap.addEventListener("focusout", (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && !wrap.contains(next)) close();
  });

  // Keyboard: panah atas/bawah pindah pilihan, Escape menutup
  menu.addEventListener("keydown", (e) => {
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next =
        index < 0
          ? step > 0
            ? 0
            : items.length - 1 // belum ada yang terpilih
          : (index + step + items.length) % items.length; // berputar di ujung
      items[next].focus();
    } else if (e.key === "Escape") {
      close();
      button.focus();
    }
  });
}
