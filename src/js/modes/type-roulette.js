// Đăng ký chế độ Type Roulette với trang Custom.
"use strict";

registerCustomMode({
  key: "type-roulette",
  name: "Type Roulette",
  desc: "Spin the wheel for a type, then open cases of only that type",
  icon: ICON_WHEEL,
  rules: [
    "Spin wheel picks a type. The wheel holds every type with Pokémon in your selected generations, each with the same chance.",
    "A type only goes on the wheel if it has at least one Blue, Purple or Pink Pokémon in your generations. Types with only Red or Gold Pokémon are left off, since every case would be a rare drop.",
    "Open case opens a case of only that type, with the same tier odds as the Case page. Open it as many times as you like.",
    "Your type stays until you spin the wheel again, even after reloading the page. If a generation change leaves it with no Pokémon, spin again.",
    "Dual-type Pokémon count for both types: Gyarados can drop from Water or Flying.",
    customPoolRule("type"),
    `Shiny is rolled separately: 1 in ${oneIn(SHINY_CHANCE)}.`,
  ],
  // Nhãn trong lịch sử: "Type Roulette · Fire", gọn: "Type · Fire"
  label(detail, short) {
    const name = TYPE_ORDER.includes(detail) ? typeName(detail) : "?";
    return short ? `Type · ${name}` : `Type Roulette · ${name}`;
  },
  tagColor: (detail) => TYPE_COLORS[detail] || "",

  ...wheelModeParts(TYPE_WHEEL),
});

// Gọi thẳng từ test / console: vẽ lại Type Roulette theo các gen đang chọn.
const refreshRoulette = () => refreshWheelMode(TYPE_WHEEL);

