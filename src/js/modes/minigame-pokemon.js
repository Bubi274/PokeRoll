// Hòm Minigame "Pokémon Case": mọi Pokémon (1025 + Special), mỗi con 1/N, không Shiny, không vào bộ sưu tập.
"use strict";

registerMinigameCase({
  key: "pokemon",
  name: "Pokémon Case",
  desc: "Every Pokémon, each with the same chance. Not added to your collection",
  noun: { one: "Pokémon", many: "Pokémon" },
  get rules() {
    return [
      `Pokémon Case holds every Pokémon (${state.dex.length} + Special), whatever generations you pick. The Select generations panel is locked here; your choice is kept for the other modes.`,
      "Pokémon from the Pokémon Case are not added to your collection and don't change any stats (Pokédex, Cases opened, Shiny drops, Gold collected).",
    ];
  },
  items: () => state.pokemon, // không lọc theo gen
  idOf: (p) => p.id,
  byId: (id) => state.byId.get(id),
  title: (p) => p.name,
  short: (p) => dexLabel(p),
  meta: (p) => (isSpecial(p) ? sourceLabel(p) : `#${pad4(p.id)} · Gen ${p.gen} · BST ${p.bst}`),
  search: (p) => `${foldText(p.name)} ${p.baseId || p.id}`,
  searchHint: "Search by name or Pokédex number…",
  attrs: (p) => `data-pokemon="${p.id}"`, // bấm vào → chi tiết Pokémon như mọi nơi khác
  thumb: (p) => `<img class="mini-img" src="${thumbUrl(p)}" alt="" loading="lazy">`,
  card: (p) => `
    <span class="card-top">
      <span class="card-id">${dexLabel(p)}</span>
      <span class="card-type" style="--t:${TYPE_COLORS[p.types[0]] || "#777"}">${p.types.join("/")}</span>
    </span>
    <img class="card-img" alt="" draggable="false">
    <span class="card-name">${p.name}</span>
    <span class="card-meta">BST ${p.bst}</span>`,
  art: (p, cls) => `<img class="${cls}" alt="${p.name}">`,
  chips: (p) => `<div class="type-chips">${typeChips(p.types)}</div>`,
  facts: (p) => `
    <dl class="facts">
      ${originFacts(p)}
      <div><dt>Base stat total</dt><dd>${p.bst}</dd></div>
    </dl>
    ${findSection(p)}`,
  images: (p) => [imageUrl(p, false)],
  setImages(el, p) {
    for (const img of el.querySelectorAll(".card-img, .reveal-img")) setPokemonImage(img, p, false);
  },
  collect: false,
});
