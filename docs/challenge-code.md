# Challenge code format

PokéRoll makes Challenge codes, and the Minecraft mod **Trainer's Workshop 3.0** reads them. This file is the contract between the two. Both sides must match it exactly.

## Challenge code (TW1)

```text
"TW1." + base64url(JSON, no padding) + "." + CRC32 of the base64url part as 8 lowercase hex chars
```

JSON:

```text
{"v":1, "id":"<8 chars A-Z0-9, random>", "ts":<unix seconds when the team was completed>, "app":"pokeroll <version>",
 "team":[ 6 × {"dex":<int>, "name":"<English name>", "special":<Special/Kazeran id from data/special.js or null>,
               "rule":"evo"|"exact", "shiny":<bool>,
               "tier":"blue"|"purple"|"pink"|"red"|"gold"|"minigame",
               "mode":"case"|"type"|"biome"|"letter"|"minigame"} ],
 "parent":<id of the code this was rerolled from, or null>, "rerolled":[<slot indexes 0-5>] }
```

`rule`:

- `"evo"`: rolled from Case, Type, Biome or Letter. That Pokémon and all its later evolutions are allowed.
- `"exact"`: rolled from the Minigame Pokémon Case. Only that exact species/form is allowed.

## Reroll code (TWR1)

The game makes a reroll code after a loss:

```text
"TWR1." + base64url({"v":1,"code":"<full active TW1 code>","allow":1}) + "." + CRC32 hex
```

A reroll result is a new TW1 code:

- a new `id`
- `parent` = the old `id`
- `rerolled` = the slots that changed
- every other slot is copied unchanged

## Checks

- The CRC32 only catches typos.
- A decoder rejects each of these with a clear error:
  - wrong prefix
  - bad base64
  - bad CRC
  - `v` != 1
  - team length != 6
