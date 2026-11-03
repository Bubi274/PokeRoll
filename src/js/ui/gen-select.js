// Lưới chọn gen (trang Case và trang Custom).
"use strict";

// ----- Chọn gen -----

// Vẽ các ô chọn gen vào grid. selected là Set gen đang chọn (sửa trực tiếp trên Set này),
// onChange chạy mỗi khi bấm chọn/bỏ một ô. Mặc định: bảng chọn gen của trang Case.
function buildGenGrid({ grid = $("gen-grid"), selected = state.selectedGens, onChange = onSelectionChanged } = {}) {
  grid.innerHTML = "";
  const count = (gen) => state.pokemon.filter((p) => p.gen === gen).length;
  const options = [
    ...GENS.map(({ gen, region }) => ({ gen, name: `Gen ${gen}`, region, note: `${count(gen)} Pokémon` })),
    // Ô Special: "Kazeran · 8 Pokémon", dòng dưới ghi tên addon và tác giả
    ...SPECIAL_GROUP_LIST.map((g) => ({ gen: g.key, name: "Special", region: `${g.name} · ${count(g.key)} Pokémon`,
      note: `${g.title} by ${g.author}`, special: true })),
  ];
  for (const { gen, name, region, note, special } of options) {
    const label = document.createElement("label");
    label.className = `gen-option${special ? " is-special" : ""}`;
    label.innerHTML = `
      <input type="checkbox" value="${gen}">
      <span class="gen-card">
        <span class="gen-name">${name}</span>
        <span class="gen-region">${region}</span>
        <span class="gen-count">${note}</span>
      </span>`;
    const input = label.querySelector("input");
    input.checked = selected.has(gen);
    input.addEventListener("change", () => {
      if (input.checked) selected.add(gen);
      else selected.delete(gen);
      onChange();
    });
    grid.appendChild(label);
  }
}

function syncCheckboxes(grid = $("gen-grid"), selected = state.selectedGens) {
  for (const input of grid.querySelectorAll("input")) {
    input.checked = selected.has(parseId(input.value));
  }
}
