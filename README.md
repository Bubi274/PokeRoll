# PokéRoll

Mô phỏng mở hòm kiểu CS2 nhưng quay ra Pokémon Gen 1–9. HTML + CSS + JavaScript thuần, không cần backend.

## Tính năng

- Chọn thế hệ (Gen 1–9), xem nội dung hòm và tỉ lệ thực tế của từng Pokémon
- 5 độ hiếm theo tỉ lệ CS2: Blue 79.92% · Purple 15.98% · Pink 3.2% · Red 0.64% · Gold 0.26%, Shiny 1/100
- Dải thẻ quay 6 giây, tiếng tick, âm báo kết quả, nút Quick open
- Popup kết quả, bộ sưu tập (lọc theo gen/độ hiếm, đếm trùng, tiến độ từng gen), lịch sử quay
- Nơi xuất hiện của từng Pokémon trong modpack Cobbleverse

## Chạy

**Trên trình duyệt:** double-click `index.html`.

**App desktop (Electron)** — cần [Node.js](https://nodejs.org) bản LTS:

```
npm install
npm start              # chạy thử
npm run dist           # build cho Windows → dist/
npm run dist:linux     # build cho Linux (AppImage) → dist/
```

## Cập nhật dữ liệu

```
node scripts/build-data.js     # data.js — thông tin Pokémon từ PokeAPI
node scripts/build-spawns.js   # spawns.js — nơi xuất hiện từ Cobbleverse Wiki
node scripts/build-images.js   # images/ — ảnh Pokémon có sẵn trong app (không cần mạng)
```

## Nguồn dữ liệu

- [PokeAPI](https://pokeapi.co) — thông tin và ảnh Pokémon
- [Cobbleverse Wiki](https://thenolan1234.github.io/cobbleverse-wiki/) — nơi xuất hiện trong Cobbleverse

Created by Bubi
