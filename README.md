# PokéRoll

A CS2-style case opening simulator that rolls Pokémon from Gen 1–9. Plain HTML + CSS + JavaScript, no backend required.

## Features

- Pick any mix of generations (Gen 1–9) and the Special group, view the case contents and the drop rate of each Pokémon
- 5 rarity tiers using CS2 odds: Blue 79.92% · Purple 15.98% · Pink 3.2% · Red 0.64% · Gold 0.26%, Shiny 1/100. A tier with no Pokémon in your selection drops to the next lower tier, and the odds table shows the real odds after that (e.g. "base 3.20% + 0.64% from Red")
- 6-second spinning card strip with tick sounds, a result sound, and a Quick open button
- **Pity**: the 5th open in a row without Purple or better is guaranteed Purple or better (Purple, Pink, Red or Gold by their base odds), and the 10th open in a row without Gold is guaranteed Gold. The Case page and each Roulette keep their own count, shown as two bars under the Open button (Minigame cases have no pity). If a case has no Pokémon of that tier, pity gives the highest tier it has, and its odds table says so. On a pity open the reel only shows the tier it can give, and "Next open: guaranteed …" shows under the bars before you open. On Roulettes, when the next open is a pity open, the wheel only stops on groups that have the guaranteed tier (if any do); the Custom page warns when the group you have lacks it. Pity drops are marked in the popup, Recent drops and Roll history
- Result popup with the exact odds of the drop (1 in N), and roll history
- **Collection** tab: search by name, Pokédex number or type; filter by generation, rarity or owned/missing/duplicates/shiny; sort by Pokédex number, rarity or copies; progress per generation and per rarity
- **Custom** tab, with its own generation selection:
  - **Type Roulette**: spin a wheel for a type, then open cases of only that type
  - **Biome Roulette**: spin a wheel for a Cobbleverse biome group, then open cases of Pokémon that spawn there
  - **Letter Roulette**: spin a wheel for a letter from A to Z, then open cases of Pokémon whose name starts with it. Always uses every generation, Special forms included (under their original name)
  - View case contents for the picked type or biome, or preview any other one, with each Pokémon's real odds and whether you own it
  - Custom pool: in View case contents, pick which Pokémon of your type or biome case can drop (at least 6, with at least one Blue, Purple or Pink). Saved per type / biome and applied whenever the wheel lands on it again
  - **Minigame Case**: just-for-fun cases with no rarity tiers and no Shiny, where every item has the same chance (1 in N). Pick a case, open it with the same reel, Quick open and Space key:
    - **Pokémon Case**: every Pokémon (1025 + Special), always all generations. Drops are not added to your collection and don't change any stats
    - **Mega Stone Case**: 156 Mega Stones from the Cobblemon mods Mega Showdown, ZA Mega and Mushiromega, with each stone's item image from its mod (shown pixel-sharp), the Mega form's type, stats, ability and crafting recipe. Stones go into their own **Mega Stones** collection on the Collection tab (filter by mod, search by stone or Pokémon name, duplicates counted)
    - Minigame opens show in Recent drops and Roll history with a "Minigame" tag. They are saved in their own history (last 200), so they never push out your Case and Roulette opens
- **Challenge** tab, for the Minecraft mod **Trainer's Workshop**:
  - Roll a team of 6 Pokémon. Pick a source for each roll: Case, Type Roulette, Biome Roulette or Letter Roulette. The tab has its own generation selection (all by default)
  - Roulettes take two steps, like the Custom page (custom pools are not used): **Spin type wheel** (or biome / letter) picks a group, then **Open Fire case** opens it. Once the wheel has stopped, its result is locked until that case is opened, even after a reload: no respin, no source or generation change, no Start over / Import / reroll code. Space does the next step and Quick works for both. Slots and the popup name the group, e.g. "Type Roulette · Fire". Older codes with a Minigame Pokémon Case slot still work, and rerolling that slot rolls it from Case
  - Each roll fills the first empty slot. Any Pokémon can be **removed** from its slot (it asks first, warns about Shiny, and pity counters are not given back); the slot is rolled again later
  - Case and Roulette rolls use the same odds and pity counters as their modes. Legendary and Mythical Pokémon ask first: keep it, or reroll that slot from the same source (with where it spawns in Cobbleverse; a Roulette reroll starts again from a new wheel spin)
  - Every roll is added to your collection and roll history, marked Challenge
  - When all 6 slots are full, **Create TW1 code** gives the code to paste into Trainer's Workshop; after that, slots can't be removed (use **Start over**). After a loss, the game gives a **TWR1 reroll code**: paste it, pick the slots to reroll (as many as the code allows) and they are rolled again from their own sources, giving a new TW1 code. A reroll code only works for the team you have, and only once. **Import TW1 code** restores a team
  - The code format is in [docs/challenge-code.md](docs/challenge-code.md), with test vectors both projects test against in [docs/challenge-vectors.json](docs/challenge-vectors.json)
- Spawn locations for each Pokémon in the Cobbleverse modpack
- **Special** group: the 8 Kazeran forms from the Cobblemon addon [Kazeran Eeveelutions](https://modrinth.com/datapack/kazeran-eeveelutions), with their evolution methods. Ranked by the same BST rules, tracked separately in the collection (X/8)
- Animated odds table, page and popup transitions. Turned off when your system asks for reduced motion, or by opening `index.html?nomotion`

## Project structure

```text
index.html       the page; lists every stylesheet and script in load order
src/js/core/     configuration and timings, rolling and odds logic, pity, Challenge codes, Pokémon catalog,
                 storage, shared state
src/js/ui/       parts used across pages: gen grid, odds table, reel, transition fallback timer,
                 popups, recent drops, sound, images, motion
src/js/pages/    the Case, Collection, Custom and Challenge pages, and switching between them
src/js/modes/    Custom modes: shared wheel code and custom pool editor, then one file per mode
                 (type-roulette.js, biome-roulette.js, letter-roulette.js, minigame.js), then one file
                 per Minigame case (minigame-pokemon.js, minigame-megastones.js)
src/js/boot/     desktop footer and app start-up
src/css/         fonts.css, plus base/, layout/, components/, popups/, pages/ and modes/ styles;
                 each file also holds its own phone, tablet and reduced-motion rules
data/            generated data files (Pokémon, spawns, Special group, Mega Stones)
assets/          bundled images and fonts
electron/        desktop app: main process and preload
scripts/         data generators and the release script; scripts/data/ holds the Mega Stone CSV
tests/           logic tests (Node) and UI tests (Electron)
build/           icons used when packaging the desktop app
docs/            the Challenge code format shared with Trainer's Workshop, and its test vectors
```

The site has no build step and uses plain `<script>` tags so it also runs from `file://`. Scripts load folder by folder: core → ui → pages → modes → boot. **When you add a JS or CSS file, add its tag to `index.html` in the right position:** a script must come after any file its top-level code depends on (code inside functions runs later and can use any file), stylesheets apply in the order they are listed, and `src/js/boot/init.js` stays last. The tests read the file list from `index.html`, so a file without a tag is not tested either.

## Installing

Download the latest version from the [Releases page](https://github.com/Bubi274/PokeRoll/releases/latest):

- **Windows:** `PokeRoll-Setup-x.y.z.exe`. The installer lets you choose the install folder and adds Desktop and Start Menu shortcuts; uninstall from *Settings → Apps*.
- **Linux:** `PokeRoll-x.y.z-linux-x86_64.AppImage`. Make it executable (`chmod +x`) and run it.

The app isn't code-signed, so Windows SmartScreen may warn the first time: click **More info → Run anyway**.

After that the app updates itself. A few seconds after it starts, it checks for a new version and asks before downloading and before restarting to install. You can also click **Check for updates** at the bottom of the page. Your collection and roll history are kept across updates (and even if you uninstall).

## Running

**In the browser:** double-click `index.html`.

**Desktop app (Electron)** — requires the LTS version of [Node.js](https://nodejs.org):

```bash
npm install
npm start              # run in development (no update checks)
npm run dist           # build the Windows installer → dist/
npm run dist:linux     # build the Linux AppImage → dist/
```

## Releasing

Every push to `main` and every pull request runs the tests on GitHub Actions (**CI** workflow), split into 4 shards that run in parallel. CI is green only when every shard passes. Nothing is built or published.

To publish a new version:

1. Push your changes to `main` and wait for CI to pass on that commit ([CI runs](https://github.com/Bubi274/PokeRoll/actions/workflows/ci.yml)).
2. Run one of:

```bash
npm run release -- patch    # 1.1.0 → 1.1.1  (fixes)
npm run release -- minor    # 1.1.0 → 1.2.0  (new features)
npm run release -- major    # 1.1.0 → 2.0.0
```

The script only goes ahead when everything is committed, `main` matches GitHub, **CI has passed on that exact commit**, and the new version is higher than every existing tag (a version is never reused). If CI is still running or has failed, it stops without creating a tag, so a red build never costs a version number. Checking CI uses GitHub's public API and needs no login.

It then bumps the version in `package.json` (and `APP_VERSION` in `src/js/core/config.js`, which Challenge codes record), commits, tags `vX.Y.Z` and pushes. The tag starts the **Release** workflow: it waits for CI on that exact commit to pass (it doesn't run the tests again, and stops without building if CI fails or never ran), builds the Windows installer and the Linux AppImage, and publishes them as a GitHub Release together with `latest.yml` and `latest-linux.yml`, which the installed apps read to find updates. If anything fails, nothing is published. Progress: [Actions tab](https://github.com/Bubi274/PokeRoll/actions).

## Testing

Requires `npm install` (the UI tests run the app in a hidden Electron window).

```bash
npm test                  # run every test suite
npm test -- roulette      # only suites whose name contains "roulette"
npm test -- -v            # print every check, not just failures
npm test -- --shard 2/4   # only shard 2 of 4 (what each CI job runs); add --list to just print its suites
```

`tests/logic/` checks the rolling logic and odds in Node; `tests/ui/` drives the app in Electron. Test data and screenshots go to a temporary folder (`pokeroll-tests` in the system temp directory), never to your own save data.

New suites go in the list in `tests/suites.js`. CI splits that list into 4 shards of about the same run time, using the times recorded there; a suite with no recorded time still runs (it is counted at the average time). The Release workflow doesn't run the tests again: it waits for CI on the release commit (see [Releasing](#releasing)).

## Updating data

```bash
node scripts/build-data.js     # data/data.js — Pokémon info from PokeAPI
node scripts/build-spawns.js   # data/spawns.js — spawn locations from the Cobbleverse Wiki
node scripts/build-images.js   # assets/images/ — Pokémon images bundled with the app (works offline)
node scripts/build-special.js  # data/special.js + assets/images/special/ — Special group, read from the mod file in special-src/
node scripts/build-megastones.js # data/megastones.js — Mega Stones, read from scripts/data/mega-stones.csv (gaps filled from PokeAPI)
node scripts/build-megastone-images.js # assets/images/megastones/ — Mega Stone item images, read from the mod files in megastone-src/
```

`build-megastone-images.js` needs the three mod files (`mega_showdown-*.jar`, `zamega-*.jar`, `mushiromega-*.jar`) in `megastone-src/`. That folder is not committed. The script finds each stone's image from the mod's own data, not by guessing the image name: the Mega definition whose `showdown_id` is the stone id (its file name is the item id), then that item's model, then the texture the model points to, copies the original 16×16 PNG unchanged, and stops without writing anything if any stone has no image.

`build-megastones.js` keeps every value the CSV lists. Only empty type, stats and ability cells (mostly the classic Megas, whose data is in Cobblemon itself rather than in these mods) are filled from the official Mega form on PokeAPI, and each stone records where each field came from (`typesSource`, `statsSource`, `abilitySource`: `"mod"` or `"pokeapi"`). Fan-made Megas (Mushiromega) and forms PokeAPI doesn't have stay empty. PokeAPI answers are cached in `scripts/data/pokeapi-cache.json` (committed), so the script runs offline and always gives the same result; it only downloads what the cache lacks. Abilities are shown by name (`abilityName`, next to the original id in `ability`): first from the stone's own mod's `en_us` language file (saved in `scripts/data/megastone-ability-names.json`, read from `megastone-src/` only when that file lacks a mod), then the English name on PokeAPI, otherwise the id.

`build-special.js` needs the mod file (e.g. `Kazeran_Eeveelutions_v1.6.1.zip`, downloaded from Modrinth) in `special-src/`. That folder is not committed.

## Data sources

- [PokeAPI](https://pokeapi.co) — Pokémon info and images; type, stats and ability of official Mega forms that the mods leave empty
- [Cobbleverse Wiki](https://thenolan1234.github.io/cobbleverse-wiki/) — spawn locations in Cobbleverse
- [Kazeran Eeveelutions](https://modrinth.com/datapack/kazeran-eeveelutions) — types, base stats, evolution methods and images of the Special group
- Mega Showdown, ZA Mega and Mushiromega (Cobblemon mods) — names, types, stats, abilities, recipes and item images of the Mega Stones

## Credits

Kazeran Eeveelutions by Kazerio (<https://modrinth.com/datapack/kazeran-eeveelutions>), licensed CC-BY-NC-4.0.

The Kazeran forms (designs, names and images) belong to their original author, Kazerio. They are included here for non-commercial use only, under the terms of the [CC-BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/) license.

Mega Stone data and images from the Cobblemon mods **Mega Showdown** and **ZA Mega** (YajatKaul, Navas) and **Mushiromega**. The stone images (`assets/images/megastones/`) are the mods' original item textures, copied unchanged. They belong to the mods' authors and are included here for non-commercial use only.

## Disclaimer

PokéRoll is a non-commercial fan project and is not affiliated with Nintendo, Game Freak or The Pokémon Company.
Pokémon and Pokémon character names are trademarks of © Nintendo / Creatures Inc. / GAME FREAK inc.

Data: [PokeAPI](https://pokeapi.co) · [Cobbleverse Wiki](https://thenolan1234.github.io/cobbleverse-wiki/) · Mega Stone data and images: Mega Showdown and ZA Mega (YajatKaul, Navas), Mushiromega, non-commercial use only — Created by Bubi
