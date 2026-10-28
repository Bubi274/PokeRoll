# PokéRoll

A CS2-style case opening simulator that rolls Pokémon from Gen 1–9. Plain HTML + CSS + JavaScript, no backend required.

## Features

- Pick a generation (Gen 1–9), view the case contents and the actual drop rate of each Pokémon
- 5 rarity tiers using CS2 odds: Blue 79.92% · Purple 15.98% · Pink 3.2% · Red 0.64% · Gold 0.26%, Shiny 1/100
- 6-second spinning card strip with tick sounds, a result sound, and a Quick open button
- Result popup, collection (filter by gen/rarity, duplicate counter, per-gen progress), and roll history
- Spawn locations for each Pokémon in the Cobbleverse modpack
- **Special** group: the 8 Kazeran forms from the Cobblemon addon [Kazeran Eeveelutions](https://modrinth.com/datapack/kazeran-eeveelutions), with their evolution methods. Ranked by the same BST rules, tracked separately in the collection (X/8)

## Running

**In the browser:** double-click `index.html`.

**Desktop app (Electron)** — requires the LTS version of [Node.js](https://nodejs.org):

```
npm install
npm start              # run in development
npm run dist           # build for Windows → dist/
npm run dist:linux     # build for Linux (AppImage) → dist/
```

## Testing

Requires `npm install` (the UI tests run the app in a hidden Electron window).

```
npm test                  # run every test suite
npm test -- roulette      # only suites whose name contains "roulette"
npm test -- -v            # print every check, not just failures
```

`tests/logic/` checks the rolling logic and odds in Node; `tests/ui/` drives the app in Electron. Test data and screenshots go to a temporary folder (`pokeroll-tests` in the system temp directory), never to your own save data.

## Updating data

```
node scripts/build-data.js     # data.js — Pokémon info from PokeAPI
node scripts/build-spawns.js   # spawns.js — spawn locations from the Cobbleverse Wiki
node scripts/build-images.js   # images/ — Pokémon images bundled with the app (works offline)
node scripts/build-special.js  # special.js + images/special/ — Special group, read from the mod file in special-src/
```

`build-special.js` needs the mod file (e.g. `Kazeran_Eeveelutions_v1.6.1.zip`, downloaded from Modrinth) in `special-src/`. That folder is not committed.

## Data sources

- [PokeAPI](https://pokeapi.co) — Pokémon info and images
- [Cobbleverse Wiki](https://thenolan1234.github.io/cobbleverse-wiki/) — spawn locations in Cobbleverse
- [Kazeran Eeveelutions](https://modrinth.com/datapack/kazeran-eeveelutions) — types, base stats, evolution methods and images of the Special group

## Credits

Kazeran Eeveelutions by Kazerio (https://modrinth.com/datapack/kazeran-eeveelutions), licensed CC-BY-NC-4.0.

The Kazeran forms (designs, names and images) belong to their original author, Kazerio. They are included here for non-commercial use only, under the terms of the [CC-BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/) license.

## Disclaimer

PokéRoll is a non-commercial fan project and is not affiliated with Nintendo, Game Freak or The Pokémon Company.
Pokémon and Pokémon character names are trademarks of © Nintendo / Creatures Inc. / GAME FREAK inc.

Data: [PokeAPI](https://pokeapi.co) · [Cobbleverse Wiki](https://thenolan1234.github.io/cobbleverse-wiki/) — Created by Bubi
