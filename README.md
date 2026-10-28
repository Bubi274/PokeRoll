# PokéRoll

A CS2-style case opening simulator that rolls Pokémon from Gen 1–9. Plain HTML + CSS + JavaScript, no backend required.

## Features

- Pick any mix of generations (Gen 1–9) and the Special group, view the case contents and the drop rate of each Pokémon
- 5 rarity tiers using CS2 odds: Blue 79.92% · Purple 15.98% · Pink 3.2% · Red 0.64% · Gold 0.26%, Shiny 1/100. A tier with no Pokémon in your selection drops to the next lower tier, and the odds table shows the real odds after that (e.g. "base 3.20% + 0.64% from Red")
- 6-second spinning card strip with tick sounds, a result sound, and a Quick open button
- Result popup with the exact odds of the drop (1 in N), and roll history
- **Collection** tab: search by name, Pokédex number or type; filter by generation, rarity or owned/missing/duplicates/shiny; sort by Pokédex number, rarity or copies; progress per generation and per rarity
- **Custom** tab, with its own generation selection:
  - **Type Roulette**: spin a wheel for a type, then open cases of only that type
  - **Biome Roulette**: spin a wheel for a Cobbleverse biome group, then open cases of Pokémon that spawn there
  - View case contents for the picked type or biome, or preview any other one, with each Pokémon's real odds and whether you own it
- Spawn locations for each Pokémon in the Cobbleverse modpack
- **Special** group: the 8 Kazeran forms from the Cobblemon addon [Kazeran Eeveelutions](https://modrinth.com/datapack/kazeran-eeveelutions), with their evolution methods. Ranked by the same BST rules, tracked separately in the collection (X/8)
- Animated odds table, page and popup transitions. Turned off when your system asks for reduced motion, or by opening `index.html?nomotion`

## Installing

Download the latest version from the [Releases page](https://github.com/Bubi274/PokeRoll/releases/latest):

- **Windows:** `PokeRoll-Setup-x.y.z.exe`. The installer lets you choose the install folder and adds Desktop and Start Menu shortcuts; uninstall from *Settings → Apps*.
- **Linux:** `PokeRoll-x.y.z-linux-x86_64.AppImage`. Make it executable (`chmod +x`) and run it.

The app isn't code-signed, so Windows SmartScreen may warn the first time: click **More info → Run anyway**.

After that the app updates itself. A few seconds after it starts, it checks for a new version and asks before downloading and before restarting to install. You can also click **Check for updates** at the bottom of the page. Your collection and roll history are kept across updates (and even if you uninstall).

## Running

**In the browser:** double-click `index.html`.

**Desktop app (Electron)** — requires the LTS version of [Node.js](https://nodejs.org):

```
npm install
npm start              # run in development (no update checks)
npm run dist           # build the Windows installer → dist/
npm run dist:linux     # build the Linux AppImage → dist/
```

## Releasing

Every push to `main` and every pull request runs the tests on GitHub Actions (**CI** workflow). Nothing is built or published.

To publish a new version:

1. Push your changes to `main` and wait for CI to pass on that commit ([CI runs](https://github.com/Bubi274/PokeRoll/actions/workflows/ci.yml)).
2. Run one of:

```
npm run release -- patch    # 1.1.0 → 1.1.1  (fixes)
npm run release -- minor    # 1.1.0 → 1.2.0  (new features)
npm run release -- major    # 1.1.0 → 2.0.0
```

The script only goes ahead when everything is committed, `main` matches GitHub, **CI has passed on that exact commit**, and the new version is higher than every existing tag (a version is never reused). If CI is still running or has failed, it stops without creating a tag, so a red build never costs a version number. Checking CI uses GitHub's public API and needs no login.

It then bumps the version in `package.json`, commits, tags `vX.Y.Z` and pushes. The tag starts the **Release** workflow: it runs the same tests again, builds the Windows installer and the Linux AppImage, and publishes them as a GitHub Release together with `latest.yml` and `latest-linux.yml`, which the installed apps read to find updates. If anything fails, nothing is published. Progress: [Actions tab](https://github.com/Bubi274/PokeRoll/actions).

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
