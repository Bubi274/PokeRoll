# PokéRoll

A CS2-style case opening simulator that rolls Pokémon from Gen 1–9. Plain HTML + CSS + JavaScript, no backend required.

## Features

- Pick a generation (Gen 1–9), view the case contents and the actual drop rate of each Pokémon
- 5 rarity tiers using CS2 odds: Blue 79.92% · Purple 15.98% · Pink 3.2% · Red 0.64% · Gold 0.26%, Shiny 1/100
- 6-second spinning card strip with tick sounds, a result sound, and a Quick open button
- Result popup, collection (filter by gen/rarity, duplicate counter, per-gen progress), and roll history
- Spawn locations for each Pokémon in the Cobbleverse modpack

## Running

**In the browser:** double-click `index.html`.

**Desktop app (Electron)** — requires the LTS version of [Node.js](https://nodejs.org):

```
npm install
npm start              # run in development
npm run dist           # build for Windows → dist/
npm run dist:linux     # build for Linux (AppImage) → dist/
```

## Updating data

```
node scripts/build-data.js     # data.js — Pokémon info from PokeAPI
node scripts/build-spawns.js   # spawns.js — spawn locations from the Cobbleverse Wiki
node scripts/build-images.js   # images/ — Pokémon images bundled with the app (works offline)
```

## Data sources

- [PokeAPI](https://pokeapi.co) — Pokémon info and images
- [Cobbleverse Wiki](https://thenolan1234.github.io/cobbleverse-wiki/) — spawn locations in Cobbleverse

## Disclaimer

PokéRoll is a non-commercial fan project and is not affiliated with Nintendo, Game Freak or The Pokémon Company.
Pokémon and Pokémon character names are trademarks of © Nintendo / Creatures Inc. / GAME FREAK inc.

Data: [PokeAPI](https://pokeapi.co) · [Cobbleverse Wiki](https://thenolan1234.github.io/cobbleverse-wiki/) — Created by Bubi
