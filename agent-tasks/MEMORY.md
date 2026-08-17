# MEMORY — устойчивые факты (не чат)

- **Продукт:** **GMap** (playable table). Lore-vault в корне — канон, не движок. Не Unity/Godot/Unreal.
- **Стек:** Vite + React + TS + PixiJS + Zustand; server Node ESM (`GMap/server/serve.mjs` → `api.mjs`). Клиент `src/main.tsx`; карта `renderers/MapCanvas.tsx`; игрок `viewer/`; GM `editors/`.
- **Данные:** `GMap/content/core/*.json` (канон баланса); runtime `GMap/data/` (sqlite/journals) — не исходники.
- **CBM:** `C-Users-Reno-Desktop-LO_GOLDEN_PAX`. Git: feature-ветки; коммит/push только по просьбе.
- **HTTP routes:** `GMap/server/api.mjs` — thin middleware (auth helpers + dispatch). Domain handlers in `GMap/server/routes/*.mjs` via `tryHandle*Routes(req,res,url,ctx)`.
- **Секреты:** `.env`, tokens, certs — никогда в чат/MEMORY/STATUS.

## GMap — shipped this session (не называть unbuilt)

Peg, boarding, stability, labor, offers, 3-stage revolt, economic track **are built in GMap**. Do not report them as missing.

- **Raise:** `POST /api/forces/raise` (pop + currency); `disband-raised` returns pop, not refund. Produce hire uses the same path. Docs: `FORCE_RAISE_FROM_PLANET.md`.
- **Peg + GM dial:** `currencyPeg.mjs`; `POST /api/gm/peg-multiplier` clamp [0.8, 1.5]. Docs: `GM_PEG_MULTIPLIER.md`.
- **Economic track:** treaties keyed `(pair, track)`. Barter / frozen quote / currency union in `economicTrack.mjs`. Union bonus additive metal/supply (fx EC × peg). Independent of political treaties.
- **Boarding:** `POST /api/forces/board` (`boarding.mjs`); client `src/state/boardForce.ts`. Docs: `BOARDING_FROM_TABLE.md`.
- **Deposit gate:** named extraction needs a matching building (`depositExtract.mjs`); bare deposit tiles yield 0.
- **Labor slots:** planet pop staffs buildings (`laborSlots` or tier); yield/convert × staffed fraction. Housing not workers. Belt/station ungated. Docs: `LABOR_SLOTS.md`.
- **Census ≠ labor (2026-08-17):** `planet.population` is lore census. Job-slots / ambient / raise use `laborPopulation()` in `populationScale.mjs`: `floor(census / 1000)` when `censusLocked` or `census ≥ 10_000`; below that already labor units (tests pop=12). Target per major polity **400k–600k** heads (~400–600 labor). Mine still `extractsCategory:"A"` only — does not unlock B/D peg ores. Occupations from building `kind` (`laborAllocation.OCCUPATION_BY_KIND`).
- **Stability / revolt:** `stability_add` → planet loyalty 1:1 (loyalty kept). Occupation writes `planet.stability`; that field is the **3-stage revolt** meter (`stabilityRevolt.mjs`): tick `clamp(stability −1 + Σstability_add + (loyalty<20 ? −2 : 0))`; ≥40 calm; 25–40 prod 0.85; <25 lost-pop militia; secession after 3 turns. `loyalty<20` does not spawn. Docs: `STABILITY_ADD_LOYALTY.md`, `STABILITY_REVOLT_STAGES.md`.
- **Colonize:** settlers transfer from an owned source; fail closed if none. No pop from thin air. `POST /api/planet/action`.
- **Planet grade:** surface slots 8→48 and orbital 4→12 over 5 earned grades (`planetGrade.mjs`). Starting grade = smallest grade that fits current buildings (capitals included). Buy more via `POST /api/planet/action` `upgrade_grade`. Old static 118/24 is not kept.
- **Tech offers:** `techOffers.mjs` — 3 frontier / A–F, 1 reroll, ×1.5 cognitio outside offer; `POST /api/economy/tech-offers/reroll`.
- **Tech grades + sockets:** 1→5 on content `gradeable`/`gradeTable` (default mag `[1, 1.15, 1.3, 1.5, 1.75]`); nested `.efficiency`/`.austerity` not consumed. Sockets instant fill/swap, empire-wide `swapUpkeepCurrency` via `addUpkeepDemand`. `POST /api/economy/tech/upgrade-grade` and `.../fill-socket`. UI: ResearchPanel `TechProgressControls`. No hardcoded tech ids.
- **8 RoleScores:** `structural` `energy` `offensive` `defensive` `mobility` `cognitive` `biological` `exotic`. Tick: `Σ extracted × max(1,tier)`, never spent. Threshold 5000 first-pass (`docs/ROLE_SCORE_THRESHOLDS.md`). Breakthrough = score ≥ threshold + paid cognitio (`techPaths.checkPathGate`). HUD: PathsStrip + HQ + Overview. No raceLock. Not a full tech catalog.
- **Player token:** after PIN login, `x-player-token` (hashed session). Bare `x-faction-id` is not identity. GM stays `x-master-token`. Docs: `PLAYER_AUTH_TOKEN.md`.
- **Ambient D/E:** pop-scaled `D[1]+=max(1,ceil(pop*0.6))`, `E[1]+=max(1,ceil(pop*0.5))`; primary convert before secondary reconcile (`ambientFlow.mjs`). Labor/deposit gates unchanged. Peg still after all factions extract.

## Owner OVERRIDE — in flight (не shipped)

6 directions (landed) · court extend (consumers live, incl. loyalty + `move_cost_mult` in `forceMp`) · sockets/grades (landed) · **catalog slice** (осталось).

## Product gaps (code-verified 2026-08-17, corrects a stale 2026-08-16 claim — this section was reverted once already by a concurrent write, reapplied, check timestamps before trusting an older cached copy)

- **CORRECTION:** "biological filled 2026-08-16" is **false against current files** — re-verified live: only `offensive`/`defensive` have a resolving `breakthroughTechId` + real `researchPath`-gated 4-tech cluster. `structural`/`energy` have non-empty `cluster` arrays but those techs are pre-existing legacy entries, not `researchPath`-gated path content, and BOTH paths' `breakthroughTechId` is still missing. `mobility`/`cognitive`/`biological`/`exotic` clusters are empty and their breakthroughs are missing too. **6 of 8 RoleScore paths are broken**: a player grinding RoleScore to 5000 sees a free-looking "Прорыв" button (missing cost defaults to 0 in `ResearchPathsPanel.tsx`/`buildPathStripRows.ts`) that always fails server-side with "Неизвестная технология". Root cause: authored twice in 2026-08-16 sessions, both landed "in working tree, no commit," both lost before commit. `npm run validate:tech` now cross-checks `tech_paths.json` against `technologies.json` (added 2026-08-17, WARN-level) — re-run it after any path-content pass to confirm it landed before moving on.
- `canRaiseUnit` (`forceRecruit.mjs`): **narrower than previously stated** — not "building gate only." 17/20 units/ships already gate indirectly via `requireProperties` → real `tech.military.*` unlock techs. Remaining gap: no *tiered* `weapon.tier`/`hull.tier` check at raise time (only at combat-resolve time) — v0.5 Tech Tree 2 §5a/5b not fully ported, but smaller than "no tech gate at all."
- Alchemy: `alchemyActions.mjs` + `AlchemyLab.tsx` live, fully playable end-to-end (verified, not a stub). `tech_recipes.json` 42/81 `catalogPending` confirmed exact; only 3 (`recipe.geo_materials`, `recipe.greenhouse_power`, `recipe.anomaly_prospect`) are truly dead (ingredient tech id doesn't exist), each has a working `recipe.live_*` duplicate — no real gameplay loss.
- **Tech catalog totals** (2026-08-17): 608 techs, 387 `catalogPending` (63.7%), concentrated by category not era — A/B/D/E ~92% placeholder each, C/F ~55-65% real. Consistently hidden from players (3 independent guards) — inert scaffolding, not a reachability bug.
- v0.5 leftover that is **not** gameplay: domain-split, sqlite-only, placeholder UI, galaxy migrate into v0.5.
- **Content delegation:** `GMap/docs/agents-content/PATH_SIGNATURE_CATALOG/` + skill `tech-path-catalog`. One `PATH_ID` per chat. **Commit each path's content immediately after `validate:tech` passes clean** — "landed, uncommitted" across a session boundary is exactly how biological/structural/energy/mobility/cognitive/exotic got lost.

## Do NOT take

- v0.5 UI
- galaxy migrate **into** v0.5
- pop from thin air
