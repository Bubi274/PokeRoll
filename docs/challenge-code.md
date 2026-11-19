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

## Encoding and decoding rules

These rules were decided on 2026-11-19. They fill in what the format above leaves open.

**Bytes and checksum**

- The JSON is encoded as UTF-8 before base64url. Names are not always ASCII: `Nidoran♀`, `Flabébé`, `Farfetch’d` (with the curly `’`).
- CRC32 is the standard IEEE CRC-32, the same as `java.util.zip.CRC32` and zlib. It is computed over the ASCII characters of the base64url part, without any `=`.

**Encoding** (PokéRoll, and the game when it makes a reroll code)

- No `=` padding.
- The CRC is written in lowercase hex, zero-padded to 8 characters.

**Decoding** (both sides)

- Spaces and line breaks around the whole code are ignored.
- `=` padding after the base64url part is accepted.
- An uppercase CRC is accepted.
- Unknown JSON fields are ignored, at the top level and inside team slots, so later versions can add fields.
- The rejections listed under Checks still apply.

**Identifying a Pokémon**

- A slot is identified by `dex` + `special`, never by `name`. `name` is only for people to read.
- A Special (Kazeran) form has `dex` = the Pokédex number of its base form, `special` = its id in `data/special.js`, and `name` = the form's name. Example: `"dex":134, "name":"Kazeran Vaporeon", "special":"kazeran-vaporeon"`.

**Slots from each PokéRoll mode**

| Rolled from | `mode` | `rule` | `tier` | `shiny` |
|---|---|---|---|---|
| Case page | `case` | `evo` | the rolled tier | as rolled |
| Type Roulette | `type` | `evo` | the rolled tier | as rolled |
| Biome Roulette | `biome` | `evo` | the rolled tier | as rolled |
| Letter Roulette | `letter` | `evo` | the rolled tier | as rolled |
| Minigame Pokémon Case | `minigame` | `exact` | `minigame` | always `false` |

PokéRoll only writes `rule`. The mod checks the evolution line.

**Other fields**

- `app` is `"pokeroll "` followed by the app version, for example `"pokeroll 1.4.0"`.
- In a rerolled code, `ts` is the time the reroll finished.

**Rerolls**

- The player picks which slots to reroll, up to `allow`.
- A rerolled slot is rolled again from the same `mode` as before.
- PokéRoll only accepts a reroll code whose TW1 code is the team it currently has active. A reroll code that was already used no longer matches, so it is rejected.

## Test vectors

`docs/challenge-vectors.json` holds fixed test vectors:

- valid Challenge codes, with the JSON each one decodes to;
- a reroll code;
- codes that must be **accepted**: padding, uppercase CRC, spaces around the code, unknown fields;
- codes that must be **rejected**, each with its reason: `prefix`, `base64`, `crc`, `version` or `team`.

PokéRoll's `tests/logic/challenge-code.js` tests against that file. Trainer's Workshop should test against a copy of it. Existing entries never change; new cases are only added.

The first vector, a new team with no parent:

```json
{
  "v": 1,
  "id": "AB12CD34",
  "ts": 1763539200,
  "app": "pokeroll 1.4.0",
  "team": [
    {
      "dex": 29,
      "name": "Nidoran♀",
      "special": null,
      "rule": "evo",
      "shiny": false,
      "tier": "blue",
      "mode": "case"
    },
    {
      "dex": 134,
      "name": "Kazeran Vaporeon",
      "special": "kazeran-vaporeon",
      "rule": "evo",
      "shiny": false,
      "tier": "pink",
      "mode": "type"
    },
    {
      "dex": 669,
      "name": "Flabébé",
      "special": null,
      "rule": "evo",
      "shiny": true,
      "tier": "blue",
      "mode": "biome"
    },
    {
      "dex": 83,
      "name": "Farfetch’d",
      "special": null,
      "rule": "evo",
      "shiny": false,
      "tier": "blue",
      "mode": "letter"
    },
    {
      "dex": 150,
      "name": "Mewtwo",
      "special": null,
      "rule": "evo",
      "shiny": false,
      "tier": "gold",
      "mode": "case"
    },
    {
      "dex": 25,
      "name": "Pikachu",
      "special": null,
      "rule": "exact",
      "shiny": false,
      "tier": "minigame",
      "mode": "minigame"
    }
  ],
  "parent": null,
  "rerolled": []
}
```

```text
TW1.eyJ2IjoxLCJpZCI6IkFCMTJDRDM0IiwidHMiOjE3NjM1MzkyMDAsImFwcCI6InBva2Vyb2xsIDEuNC4wIiwidGVhbSI6W3siZGV4IjoyOSwibmFtZSI6Ik5pZG9yYW7imYAiLCJzcGVjaWFsIjpudWxsLCJydWxlIjoiZXZvIiwic2hpbnkiOmZhbHNlLCJ0aWVyIjoiYmx1ZSIsIm1vZGUiOiJjYXNlIn0seyJkZXgiOjEzNCwibmFtZSI6IkthemVyYW4gVmFwb3Jlb24iLCJzcGVjaWFsIjoia2F6ZXJhbi12YXBvcmVvbiIsInJ1bGUiOiJldm8iLCJzaGlueSI6ZmFsc2UsInRpZXIiOiJwaW5rIiwibW9kZSI6InR5cGUifSx7ImRleCI6NjY5LCJuYW1lIjoiRmxhYsOpYsOpIiwic3BlY2lhbCI6bnVsbCwicnVsZSI6ImV2byIsInNoaW55Ijp0cnVlLCJ0aWVyIjoiYmx1ZSIsIm1vZGUiOiJiaW9tZSJ9LHsiZGV4Ijo4MywibmFtZSI6IkZhcmZldGNo4oCZZCIsInNwZWNpYWwiOm51bGwsInJ1bGUiOiJldm8iLCJzaGlueSI6ZmFsc2UsInRpZXIiOiJibHVlIiwibW9kZSI6ImxldHRlciJ9LHsiZGV4IjoxNTAsIm5hbWUiOiJNZXd0d28iLCJzcGVjaWFsIjpudWxsLCJydWxlIjoiZXZvIiwic2hpbnkiOmZhbHNlLCJ0aWVyIjoiZ29sZCIsIm1vZGUiOiJjYXNlIn0seyJkZXgiOjI1LCJuYW1lIjoiUGlrYWNodSIsInNwZWNpYWwiOm51bGwsInJ1bGUiOiJleGFjdCIsInNoaW55IjpmYWxzZSwidGllciI6Im1pbmlnYW1lIiwibW9kZSI6Im1pbmlnYW1lIn1dLCJwYXJlbnQiOm51bGwsInJlcm9sbGVkIjpbXX0.dd7e9bd4
```

Its reroll code, allowing 1 reroll:

```text
TWR1.eyJ2IjoxLCJjb2RlIjoiVFcxLmV5SjJJam94TENKcFpDSTZJa0ZDTVRKRFJETTBJaXdpZEhNaU9qRTNOak0xTXpreU1EQXNJbUZ3Y0NJNkluQnZhMlZ5YjJ4c0lERXVOQzR3SWl3aWRHVmhiU0k2VzNzaVpHVjRJam95T1N3aWJtRnRaU0k2SWs1cFpHOXlZVzdpbVlBaUxDSnpjR1ZqYVdGc0lqcHVkV3hzTENKeWRXeGxJam9pWlhadklpd2ljMmhwYm5raU9tWmhiSE5sTENKMGFXVnlJam9pWW14MVpTSXNJbTF2WkdVaU9pSmpZWE5sSW4wc2V5SmtaWGdpT2pFek5Dd2libUZ0WlNJNklrdGhlbVZ5WVc0Z1ZtRndiM0psYjI0aUxDSnpjR1ZqYVdGc0lqb2lhMkY2WlhKaGJpMTJZWEJ2Y21WdmJpSXNJbkoxYkdVaU9pSmxkbThpTENKemFHbHVlU0k2Wm1Gc2MyVXNJblJwWlhJaU9pSndhVzVySWl3aWJXOWtaU0k2SW5SNWNHVWlmU3g3SW1SbGVDSTZOalk1TENKdVlXMWxJam9pUm14aFlzT3BZc09wSWl3aWMzQmxZMmxoYkNJNmJuVnNiQ3dpY25Wc1pTSTZJbVYyYnlJc0luTm9hVzU1SWpwMGNuVmxMQ0owYVdWeUlqb2lZbXgxWlNJc0ltMXZaR1VpT2lKaWFXOXRaU0o5TEhzaVpHVjRJam80TXl3aWJtRnRaU0k2SWtaaGNtWmxkR05vNG9DWlpDSXNJbk53WldOcFlXd2lPbTUxYkd3c0luSjFiR1VpT2lKbGRtOGlMQ0p6YUdsdWVTSTZabUZzYzJVc0luUnBaWElpT2lKaWJIVmxJaXdpYlc5a1pTSTZJbXhsZEhSbGNpSjlMSHNpWkdWNElqb3hOVEFzSW01aGJXVWlPaUpOWlhkMGQyOGlMQ0p6Y0dWamFXRnNJanB1ZFd4c0xDSnlkV3hsSWpvaVpYWnZJaXdpYzJocGJua2lPbVpoYkhObExDSjBhV1Z5SWpvaVoyOXNaQ0lzSW0xdlpHVWlPaUpqWVhObEluMHNleUprWlhnaU9qSTFMQ0p1WVcxbElqb2lVR2xyWVdOb2RTSXNJbk53WldOcFlXd2lPbTUxYkd3c0luSjFiR1VpT2lKbGVHRmpkQ0lzSW5Ob2FXNTVJanBtWVd4elpTd2lkR2xsY2lJNkltMXBibWxuWVcxbElpd2liVzlrWlNJNkltMXBibWxuWVcxbEluMWRMQ0p3WVhKbGJuUWlPbTUxYkd3c0luSmxjbTlzYkdWa0lqcGJYWDAuZGQ3ZTliZDQiLCJhbGxvdyI6MX0.3bdc3479
```
