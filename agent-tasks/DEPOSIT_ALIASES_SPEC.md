# Deposit Aliases — Content Fix Spec

> **Handoff micro-spec for an implementing agent (content authoring, not code).**
> **Source Discovery:** live sweep of `data/published.json` against `content/core/id-aliases.json` + `content/core/map_resources.json`, 2026-08-17 (see `agent-tasks/STATUS.md`'s "Economy/Market audit" entry for the original finding).
> **Scope: pure content, one file.** No server code, no client code, no schema changes.

---

## The problem

Every planet's `resources` array lists deposit names as plain strings (often Russian flavor names, e.g. `"провиант"`, `"тяжёлая броня"`). `content/core/id-aliases.json`'s `resources` map is supposed to translate every one of those names into a real `map.*` id from `content/core/map_resources.json` (86 real ids exist — see the list below). `server/flowEngine.mjs`'s `lookupMapResource()` is the consumer: if a name has no alias entry and doesn't already match a real id/name directly, the deposit silently resolves to nothing — any extraction building placed on it yields **zero**, with no error, no warning, nothing telling the player or GM why.

**Confirmed, exact, live (`data/published.json`, re-verified 2026-08-17):**
- 1734 total deposit instances across the galaxy. **366 unresolved** (21%).
- **228 planets** carry at least one unresolved deposit. 179 of those are on planets already owned by a faction (future income risk the moment someone builds there); 49 are in unclaimed systems (lower priority).
- **40 distinct unresolved names**, full list with counts below.

## What to do

Add all 40 missing entries to `content/core/id-aliases.json`'s `resources` map, each mapping the Russian name to the correct real `map.*` id. Follow the exact format of the ~10 existing entries already in that file (e.g. `"железо": "map.iron"`, `"кристаллы": "map.crystals"`).

**How to pick the right target id for each name**: don't guess from the name alone — for each unresolved name, look at a few real planets that carry it (their `type`/`climate`/system/owning faction, and what other resources/buildings are already there) to judge intent, then match to the closest real resource in the list below by theme (raw material vs. manufactured good vs. biological vs. exotic/strategic). Where a name is ambiguous between two plausible targets, prefer the interpretation that keeps deposits within the same planet thematically consistent with its type/climate. A few are self-evident from the name alone (e.g. `"пыль"` → likely `map.exotic_gases` or a raw-material id, `"хитин"` → biological). Where you're genuinely unsure, leave a one-line comment in your PR/handoff notes for owner review rather than guessing silently — this is content the owner may want a final look at, not a fully mechanical task.

**Names to resolve, with counts** (Russian name: how many deposit instances):
```
провиант: 31          тяжёлая броня: 31       электроника: 20
данные-узлы: 20        пыль: 20                руда: 19
пси-кристаллы: 17      обломки: 16             зелёный сплав: 15
клинок-руда: 15        пси-глушители: 14       тишина-руда: 14
пепел: 14              Т11-обломки: 11         чёрный сплав: 11
караванные товары: 11  топливо: 10             лом: 9
хитин: 7               контрабанда: 6          порох-сплав: 5
трофеи: 5              биосмола: 5             медикаменты: 4
стекло-ткань: 3        оболочка-сырьё: 3       хитин-ткань: 3
тихая руда: 3          храмовое топливо: 3     благовония: 3
карты-маршруты: 3      редкозём: 3             костяной сплав: 2
реликвии: 2            синхро-руда: 2          ОР-хвост: 2
споры: 1               яйца-мат: 1             мёртвый хитин: 1
рабы-чёрный рынок: 1
```
(One name may be missing from this list if the live count shifted since — re-run the query in "How to verify" below to get the current authoritative list before starting, don't rely on this snapshot alone if it's been more than a day or two.)

**Real resource ids available to map onto** (`content/core/map_resources.json`, 86 total — a sample; read the full file for exact `name`/`category`/`yield` per id before deciding, don't guess from the id string alone):
```
map.iron, map.titan, map.crystals, map.gas, map.water, map.rare_earth, map.antimatter,
map.relics, map.silver, map.gold, map.glasssteel, map.alloys, map.cinnabar, map.biofuel,
map.blumatid, map.solari, map.krin, map.buildplex, map.biomass, map.food, map.minerals,
map.energy, map.trade_value, map.lazualin, map.hyperium, map.eradian, map.talitin,
map.exotic_gases, map.focusing_crystals, map.volatile_motes, map.elyrium, map.titanium,
map.adamantian, map.skaashiz, map.klax, map.hydromel, map.orchid, map.dark_horn,
map.red_sang, map.song_silk, ... (46 more, read the file)
```
It's fine to reuse an existing target id for multiple Russian names if they're genuinely the same resource under different flavor names in different regions (this already happens — check `id-aliases.json` for existing many-to-one mappings before assuming every name needs a unique target).

## Explicitly out of scope

- Don't add new entries to `map_resources.json` unless truly nothing existing fits (checked all 86) — prefer reusing what's there.
- Don't touch `server/flowEngine.mjs` or any code — this is a pure data fix, the lookup logic already works correctly once the alias exists.
- Don't touch the 179 planets' buildings/deposits themselves — you're only fixing the name→id translation, not re-authoring the galaxy.

## How to verify

1. Re-run this check (or ask the reviewing agent to) after your changes — it should report **0 unresolved**:
   ```js
   // from GMap/, node -e '...' with content/core/id-aliases.json and map_resources.json
   // loaded, walking every planet.resources entry in data/published.json,
   // same logic as "The problem" section above.
   ```
2. `npm run validate:recipes` and `npm run validate:tech` should stay clean (they don't currently check this, but confirm nothing regressed).
3. Spot-check 2-3 of the now-resolved deposits by loading a real owned planet that has one and confirming `server/flowEngine.mjs`'s `addPlanetExtraction` now credits something nonzero for it (live HTTP check via `/api/economy/preview-build` on a matching extractor, same pattern used elsewhere this session, or a small throwaway script — don't guess, verify).

## How this gets checked

Reviewing agent (or owner) will re-run the unresolved-count check and expect exactly 0, spot-check a handful of the semantic mappings for plausibility (not just "it resolves to *something*"), and confirm no code files were touched — this should be a single-file content diff to `content/core/id-aliases.json`.
