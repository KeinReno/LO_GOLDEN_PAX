# Population, Race Composition & Forces: Grill / Discovery Notes
Date: 2026-08-12 · Goal: extract the user's real design intent for (1) race composition on colonization, (2) how population should actually drive economy/buildings, and (3) where legions/fleets come from — before building domain/forces and revisiting domain/planets' colonization.

**Scope note (after Q11):** the original three-part goal above is fully answered — see Summary. User asked to keep digging in this same session into two more branches: (a) army/fleet composition itself (actual unit types/roles within legions and fleets, not just where they come from), and (b) planetary/orbital/system-level buildings more broadly. Continuing in this file rather than splitting, since it's the same live session — headers below mark the new branches clearly.

## Summary / key decisions
(reconciled TL;DR — session closed out after 3 branches: population/race/colonization, army/fleet, buildings)

**1. Colonization (Q1-Q4)** gets two modes. **Manual**: player picks races from their empire-wide pool (with counts shown), a slider for total settlers sent, ratio across races, plus an optional "choose source planet(s)" toggle (shows population-by-race per planet) for players who want precise control. **Auto**: quantity stays the flat per-colony-type number from `colonies.json`; only race mix is randomized via a purity-roll (1d6: pure/light-mix/heavy-mix, secondary races weighted from what the empire already has elsewhere). Population sent is a **real transfer** — it leaves the source (global pool in Auto, chosen planet(s) in Manual+source) — and is **additive** to the existing currency cost, not a replacement. No artificial minimum floor in Manual mode (can found with 1 settler) — the real floor is economic consequence via job-slots, not a blocked action.

**2. Population unit scale (Q5-Q6):** population is an **abstracted unit**, same small order of magnitude the game already uses (tens, not thousands) — not literal headcount. This lets building job-slot costs (e.g. "a mine needs 3 workers") compare directly to a planet's population with no conversion layer.

**3. Population -> building yield (Q5):** job-slot model — each building needs N population-units to reach full yield; understaffed buildings scale output proportionally. Auto-distribution fills buildings in placement order (oldest first); not user-confirmed, low-stakes default.

**4. Recruits/military (Q7-Q11):** recruits are **not** an accumulating stockpile — they're a derived mobilization percentage of a planet's *current* population (~20-30% baseline, up to 100% with unspecified penalties). Recruits are themselves the weakest baseline unit, raisable with zero military infrastructure (emergency defense). Military buildings (barracks/shipyard) **convert** recruits into real `ship.*`/`unit.*` types from content, reusing GMap's existing building-gate system (`systemHasShipyard`/`systemHasBarracks`) unchanged — recruits+population is a cost added on top of GMap's existing currency+AP cost, not a replacement. Upkeep of standing forces stays currency-only (GMap's `forceUpkeepRates`), thematically split into an equipment-maintenance channel and a soldier-wages/tax channel. **Critically: mobilized recruits and building job-slots draw from the same population pool** — military and economy genuinely compete for the same people on a planet, which is the mechanism that finally makes population "not come from thin air" the way the user originally flagged, and gives the econos-vs-bellum playtest split a real economic cost instead of a free lunch.

**5. Buildings (Q13-Q15):** planet schema needs 2 more zone-slot pools (`subsurfaceSlots`/`deepSlots`, mirroring existing `surfaceSlots`/`orbitalSlots`) since content already has 4 zones but the schema only tracks 2 — a real gap found mid-session. Building construction itself stays currency-only (population only matters for later operation via job-slots). System-level stations (GMap's mining/military/science, not yet ported) stay outside the population economy entirely — automated, currency-only.

**Implementation status (updated 2026-08-13 — all 4 agreed stages complete):**

- Point 1 (colonization manual/auto + real population transfer): **done**. `domain/planets/raceComposition.mjs` (new) + `colonization.mjs`'s extended `colonizePlanet`, wired through `campaign.mjs`'s colonize route and `ColonizeRequestSchema`, tests passing, verified end-to-end via `scripts/playtestCampaign.mjs` (Econos Prime I's population visibly dropped from 5→3 when Econos Prime II was colonized on turn 5, confirming the real transfer).
- Points 3/5 (population → building yield via job-slots, auto-distributed): **done**. `content/core/buildings.json` gained a `laborSlots` field (`= tier`, first-pass balance default, one-off script) on all 58 buildings; new `domain/planets/laborAllocation.mjs`'s `allocateLabor` + `buildingYields.mjs` wiring. Verified live: econos's `materia.mint` (built after `building.mine` already claimed the planet's whole 3-population) yielded 0 in the playtest — the labor competition is real, not theoretical.
- Point 6's "subsurface/deep slots" sub-item: **corrected to a false alarm** (see Q13), not implemented — GMap already shares one `surfaceSlots` pool across those zones.
- Point 4 (recruits/mobilization/domain/forces): **done**. New `server/domain/forces/` (buildingGate, forceCost, recruits, recruitment, upkeep — see its own README for the full design-vs-port breakdown), `server/campaign/forcesStore.mjs`, `server/api/routes/forces.mjs`, `forces` DB table, upkeep wired into `turn.mjs`. `content/core/units.json`'s `unit.militia` flagged `raisableWithoutBuilding: true` (the Q10 baseline levy), `economy_balance.json` gained `forces.mobilizationRate: 0.3`. Verified end-to-end via live API: raised 1 militia legion with zero infrastructure (planet population 5→4, real metal+supply cost), a subsequent turn drained real upkeep currency, disbanding returned the population (4→5).
- Buildings/stations remaining items (construction-cost-unchanged, station-labor-exempt) needed no code changes — they're "don't do X" decisions already satisfied by doing nothing.
- All 4 stages the user asked for (order: 4→1→2→3, i.e. zone-slots check → colonization → job-slots → forces) are complete. 203 tests passing project-wide. Not done: resource extraction/deposits (explicitly deferred to its own session), combat integration for raised forces (a raised force's composition is combat-shaped but nothing auto-feeds it into `resolveExchange` — still a manual step), the mobilization-ceiling-override-with-penalty escape valve.

## Q&A log

### Q1 — Race composition on colonization: default behavior
- Asked: default should be 100% founding faction's primary race, with optional manual split — or something else?
- Captured: user wants to go further — "может ебанемся и закрутим вообще своего рода механику кубиков?" (what if we go all-in and build a whole dice mechanic for this?). Rejects a flat deterministic default in favor of a randomized/rollable outcome.
- Flags: superseded by Q1b/Q1c — see below.

### Q1b — what exactly does the dice roll determine?
- Asked (my proposal): 2-step roll — 1d6 "purity" roll (1-3 pure / 4-5 light mix / 6 heavy mix), then mixed-in race(s) drawn weighted from races the faction *already has* elsewhere in its empire (not fully random from all game races). First colony with no other planets always rolls pure (nothing to mix in).
- Captured: user raised a bigger, better idea instead of committing to the dice-only design (see Q1c) — dice becomes one mode ("Auto"), not the only mechanic.
- Flags: none — superseded by Q1c.

### Q1c — full colonization UX: Manual vs Auto mode
- Asked: open-ended ("или может поступить иначе?")
- Captured (user's own design, verbatim intent): colonization gets two modes.
  - **Manual mode**: player sees a list of races they currently have empire-wide with counts ("список, число сколько есть"), a slider for how many total settlers to send, and a ratio/allocation across the chosen races. An additional optional toggle lets the player pick the *specific source planet(s)* to pull from — when enabled, shows a list of the player's planets with their population broken down by race, so the player picks exactly which planet(s) lose population to fund the new colony.
  - **Auto mode**: this is where the Q1b dice/purity-roll mechanic lives — random (or "some presets") composition instead of manual allocation.
  - User's framing strongly implies settlers sent are a *real transfer* — population should actually leave the source (global pool or the explicitly chosen planet), not just be labeled without being deducted anywhere. This is the same "population shouldn't come from thin air" critique from earlier in the conversation, now resolved by giving engaged players a real source-planet mechanic while keeping a simple abstracted default for everyone else.
- Flags:
  - Does sending settlers actually deduct population from the source (auto-distributed across empire-wide planets with that race, or the explicitly chosen planet when source mode is on)? User's intent strongly implies yes; not explicitly confirmed in words yet.
  - Does this population transfer *replace* the existing currency cost (metal+supply from colonies.json) or does colonization now cost currency AND population together?
  - What's the floor — can a faction send as few as 1 settler, or is there still a minimum colony population regardless of mode?
  - In Auto mode, is the *quantity* sent still the flat colonizePopulation-by-type number (2/5/10/etc. from content), with only the *race mix* randomized via the Q1b dice? Or does Auto also randomize/derive the quantity?

### Q2 — does population transfer deduct from source, and is it additive to or replacing the currency cost?

- Asked: (my recommendation) yes it deducts (auto-distributed empire-wide in Auto mode, from the chosen planet(s) in Manual+source mode), and it's ADDITIVE to the existing currency cost (metal/supply stay as-is; population is a second, separate cost representing the colonists themselves vs. the currency representing expedition/logistics).
- Captured: user confirmed the recommendation as-is — "Да, списывает; ДОПОЛНИТЕЛЬНО к валюте".
- Decided: colonization now costs BOTH currency (unchanged, from `colonies.json`) AND population (new), and population is a real transfer — it leaves the source (global empire pool in Auto mode, or the specific chosen planet(s) in Manual mode with the source toggle on).
- Flags: still need to define, for Auto mode without a source toggle, exactly *which* planet(s) the empire-wide pool draws from mechanically (evenly across all planets with that race? proportionally? largest-population-first?) — this is an implementation detail, not yet asked as its own question.

### Q3 — Auto mode: does the dice decide quantity too, or only race mix?

- Asked: (my recommendation) only race mix — quantity stays the fixed per-colony-type number from `colonies.json` (outpost:2, colony:5, core:10, etc.), dice only picks composition.
- Captured: user confirmed the recommendation as-is.
- Decided: Auto mode quantity = unchanged flat content value by colony type. Only the race composition is randomized (Q1b's purity-roll mechanic).

### Q4 — Manual mode: is there a minimum population floor to colonize, or can you send as few as 1?

- Asked: (my recommendation) keep a per-colony-type minimum floor (same numbers as the Auto flat values), so the 5 colony types in content keep meaning instead of becoming purely cosmetic.
- Captured: user rejected the floor — "хоть 1, но важно помнить о том, что мы будем делать систему так, что население реально влияет на экономику через сооружения и все такое" (even just 1 is fine, but important to remember we're building the system so population genuinely drives the economy through buildings and so on).
- Decided: **no artificial minimum-population rule in Manual mode** — a faction can found a colony with as little as 1 settler. The floor the user wants is a *natural/economic* one, not a game-rule one: once population actually drives building yields/workers (still to be designed), a 1-pop colony will just be nearly useless in practice (can't staff buildings, produces ~nothing) — the balance comes from consequence, not from a blocked action. This directly motivates the next branch: how population connects to building output.
- Flags: colony-type minimums in `colonies.json` may become purely Auto-mode defaults / narrative flavor rather than hard floors — worth reconciling when domain/planets' colonization.mjs is revisited.

### Q5 — how should population connect to building yield?

- Asked: (my recommendation) job-slot model — each building requires N workers to reach full yield; output scales down proportionally if the planet doesn't have enough free population to staff everything. Alternatives offered: hard pass/fail threshold, or a flat population/cap ratio multiplier applied to all yield regardless of specific buildings.
- Captured: user picked the job-slot model ("1"), but immediately raised a real scaling problem with it, verbatim: "у меня мысль возникла, о том, как именно распределять население и как его считать. Вот есть к примеру какая-нибудь шахта, а какая у нее вместимость? вместимость чего? условно 3 слота для распределения, а как население будет в него вставать, если население сейчас у нас считается до единицы? Не может же быть так, что мы загрузим 50000 населения в три слота, это че за шахта такая епта? На пол планеты что ли? (утрирую, ору). Тоесть как то надо тоже продумать эту тему, чтобы не ебать себе мозг с подсчетами и распределением по рабочим местам".
- Decided: job-slot model confirmed in principle, but the unit scale of "population" itself must be resolved first — small integer job-slot counts (e.g. a mine needing 3 workers) don't make sense against population numbers that could grow into the thousands/tens-of-thousands. Also explicitly wants **auto-distribution** of population into slots (not manual per-building worker assignment by the player) — the player shouldn't have to hand-place workers.
- Flags: needs a resolving principle for what one "population" unit represents (raw headcount vs. an abstracted large-scale unit) — asked as Q6.

### Q6 — what does "1 population" represent: literal headcount or an abstracted pool?

- Asked: (my recommendation) abstracted unit at the same order of magnitude the game already uses (colonies start at 2-10, cap grows by +15 per building, etc.) — not literal headcount, same abstraction level as currency stocks. Job slots (e.g. a mine's 3 slots) compare directly against this number with no separate conversion layer.
- Captured: user confirmed the recommendation as-is.
- Decided: population stays a small abstracted unit, same order of magnitude as the current colonization/populationCap numbers already in the game (never grows into thousands/tens-of-thousands by design). Job-slot costs on buildings are defined directly in this same unit — no headcount<->slot conversion math needed anywhere. This resolves the Q5 scaling worry: a mine needing "3 workers" is 3 population-units, comparable in scale to a colony's total population (tens, not tens of thousands).

### (resolved by assistant, not deep-interviewed) — auto-distribution algorithm across job-slots

- Proposed (not put to the user as a formal question, stated as a default): fill buildings in placement order (oldest-built first gets staffed first); the last building that can't be fully staffed gets its yield scaled proportionally to the fraction of its slots filled.
- Status: stated as the working default, flagged low-stakes, revisit only if it matters in play. Not confirmed/rejected by the user yet — surface again if this becomes visibly wrong in a playtest.

### Q7 — where do legions/fleets come from? What converts into military force?

- Asked: three options — (a) population+buildings (recruitment costs population-units, same pool as job-slots, gated by a military building on the planet), (b) currency+buildings only (recruitment costs currency like construction does, building defines what/how much, no population cost), (c) a separate accumulating "recruits" resource that grows from population over time, and units are recruited by spending recruits (a GMap-style multi-step conversion chain, matching how `flow_convert` buildings already work for economy).
- Captured: user picked (c) — a separate "recruits" resource.
- Decided: legions/fleets will NOT be recruited directly from the population pool or from currency alone. There will be a dedicated **recruits** resource/stockpile that accumulates over time (presumably population- and/or building-driven, rate TBD) and is then spent to raise military units — mirroring the existing `flow_convert` building-chain pattern already documented (but not yet implemented) in `domain/planets/buildingYields.mjs`'s README as a deferred feature.
- Flags:
  - What generates recruits, and at what rate — population size? a dedicated building (e.g. a barracks/recruitment center)? both?
  - Does spending recruits also cost currency/other resources on top (a full flow_convert-style chain: population -> recruits -> units, each step consuming something), or is the recruits stockpile alone sufficient to raise units?
  - Upkeep: does an existing legion/fleet drain recruits/population/currency continuously (GMap's `forceEconomy.mjs`/`fleetUpkeep` had upkeep — need to confirm whether that model still applies)?
  - This whole branch (domain/forces) hasn't been started as code yet — still pure design at this point.

### GMap baseline check (assistant research, not a question) — does "recruits" already exist anywhere in GMap?

- Checked: grepped `GMap/server` for "recruit" (case-insensitive) — zero matches. Read `forcesActions.mjs`/`forceEconomy.mjs` in full: GMap recruits units by spending currency only (`produceForceCost`: metal+supply scaled by tier/kind, `produceForceAp` for an AP cost) and charges continuous per-turn upkeep also in currency (`forceUpkeepRates`: metal/D/E channels split by ship vs. legion). No population or recruit-pool involvement anywhere.
- Conclusion: the "recruits" resource is **new design, not a port** — first genuinely new mechanic introduced in this whole rebuild rather than behavior carried over from GMap. Worth remembering when eventually building `domain/forces` — there's no reference behavior to preserve here, this is greenfield.

### Q8 — does recruiting a unit cost recruits only, or recruits + currency (like GMap's produceForceCost)?

- Asked: (my recommendation) both — recruits gates "do you have willing/available people," currency (metal+supply, same formula shape as GMap's `produceForceCost`) gates "can you equip them." Additive, not a replacement.
- Captured: user confirmed the recommendation as-is.
- Decided: unit production costs recruits AND currency together.

### Q9 — does per-turn upkeep of existing legions/fleets also drain recruits/population, or stay currency-only like GMap?

- Asked: (my recommendation) currency-only, unchanged from GMap's `forceUpkeepRates` (metal/D/E per-turn drain) — recruits/population are a one-time cost at recruitment, not an ongoing drain.
- Captured: user confirmed option 1, with an added thematic framing (verbatim): "Я бы предложил, чтобы они тратили деньги с налогов типа. Типа ресурсы уходят на содержание техники, кораблей, обмундирование типа, а деньги на самих солдат" (upkeep should draw from tax money; resources go toward maintaining equipment/ships/gear, while money specifically pays the soldiers themselves).
- Decided: upkeep stays currency-only (no recurring recruits/population drain), mechanically same shape as GMap's existing per-channel `forceUpkeepRates` (metal channel ~ equipment/gear upkeep, a currency/tax channel ~ soldier pay) — this is a flavor/labeling refinement of the existing multi-channel upkeep, not a new mechanic. When `domain/forces` gets built, the upkeep channels should be named/described in a way that reflects this split (e.g. distinguish an "equipment maintenance" channel from a "wages/tax" channel) rather than a generic single "metal cost."

### Q10 — what generates recruits, and at what rate?

- Asked: population-driven, building-driven, or both (I recommended both — base trickle from population size, boosted by a military building).
- Captured (user proposed a different, more specific design instead of picking an option — verbatim, this is the load-bearing answer of the whole forces branch): "рекруты генерируются в процентном соотношении типа от текущего числа населения - типа условно 30% населения или 20% - это рекруты, или мобилизационный запас. При желании можно хоть все население (естественно со штрафами) превратить в рекрутов. Это самая базовая боевая единица, самая слабая. независимо, есть ли казарма или что то еще из военного, их можно призвать (например в условиях, когда надо оборонять планету). А вот уже наличие военных зданий позволяет из рекрутов делать уже других юнитов."
- Decided (supersedes the framing of Q7-Q9 as an accumulating stockpile):
  - Recruits are **not a slowly-accruing separate stockpile** — they're a derived percentage of the planet's *current* population (a "mobilization reserve," e.g. ~20-30% baseline available at will, no building required).
  - A player can push mobilization higher, up to converting the whole population, but "naturally with penalties" — implies pulling more population into recruits competes with/damages the planet's economy (very likely the same population pool that fills building job-slots from Q5 — mobilizing recruits should reduce workers available to staff buildings, which is what makes it a real tradeoff instead of a free lunch). Exact penalty shape not yet specified.
  - Raw recruits ARE themselves the weakest baseline unit (militia/levy) and can be raised with zero military infrastructure — this covers emergency defense of an undefended planet.
  - Military buildings (barracks/shipyard/etc.) don't generate recruits — they **convert** recruits into other, stronger/specialized unit types (ships, proper legions, etc.), i.e. recruits are the raw input to a `flow_convert`-style building chain, echoing the same conversion pattern already documented (deferred) for economy buildings.
  - User explicitly invited a counter-proposal ("можешь предложить иное") — assistant's read: this design is stronger than the accumulating-stockpile framing from Q7-Q9 because it reuses the population number already being tracked instead of introducing a second resource with its own accrual/decay rules, and it naturally creates the population-vs-military-vs-economy tradeoff the user has been circling since the start of this whole grill session. No counter-proposal offered — recommended accepting as-is, pending one clarification (Q11).
- Flags: does mobilizing recruits actually subtract from the same population number that fills building job-slots (making military and economy compete for the same pool on one planet), or is the "penalty" for over-mobilizing something else (e.g. unrest/loyalty hit, growth penalty) separate from job-slot competition? -> asked as Q11.

### Q11 — does recruit mobilization subtract from the same population pool used for building job-slots?

- Asked: (my recommendation) yes — mobilized recruits count as unavailable for job-slots while under arms (or until demobilized/disbanded); this is what makes the "penalty" from Q10 real rather than a separate bolt-on formula, and it directly explains the population-vs-military-vs-economy tradeoff the user has been circling since the very start of this grill session.
- Captured: user confirmed the recommendation as-is.
- Decided: **one shared population pool per planet, contested by three consumers**: building job-slots (Q5), colonization exports (Q1c/Q2), and military mobilization (Q10/Q11). Mobilizing recruits genuinely pulls workers off buildings — an economy-focused faction and a militarist faction now make a real, visible tradeoff over the same number, which is exactly the "econos vs bellum" split already rehearsed in `scripts/playtestCampaign.mjs`'s narrative playtest (bellum's fleet was hand-typed there; this design is what would make that fleet actually cost bellum something economically instead of being free).
- Flags: none — this closes the loop the user opened all the way back at "Легион и флот откуда берется? Пока тоже из воздуха".

## Open flags (pending input)
- Auto-mode (no source toggle) population draw distribution across empire planets -> implementation detail, low priority
- Exact currency channels for upkeep (which existing currencies map to "equipment" vs "wages/tax") -> implementation detail for whenever domain/forces content is authored, not urgent
- Exact demobilization mechanic (does disbanding a unit return its recruits to the job-slot-eligible pool immediately, or is there a cooldown/loss?) -> not yet asked, minor

## Branch: army/fleet composition (started after Q11, same session)

### GMap baseline check (assistant research) — how are real ship.*/unit.* defs currently gated?

- Checked `GMap/content/core/ships.json`: real ship defs already exist (`ship.scout` etc.) with `tier`, `roles`, `stats` (damage/armor/shields/hp/accuracy), a `slots` array (hull/weapon/reactor/crew, each with `require.properties`+`tier`+`count`) for equipping resource modules, `upkeep_slots` (per-turn fuel etc.), and `raceVariants` (per-race stat multipliers). `units.json`/`ground_units.json` presumably mirror this for ground forces (not re-read in full this session, same shape expected).
- Checked `GMap/server/systemActions.mjs`: `systemHasShipyard` (shipyard/spaceport surface or orbital building, or a "military" station) gates ship production; `systemHasBarracks` (a `kind:"barracks"` surface building) gates ground unit production. `produceCost`/`produceAp` (from `forceEconomy.mjs`) compute the currency+AP price. This is a real, already-working building-gate system — not a stub.
- Checked `server/domain/combat/propertyMatchup.mjs` (already ported to Golden_PAX_v0_5): a full weapon/shield/hull module-equip system already exists and is wired into combat's damage math (`filledSlots`/`compSlots` -> resource properties -> damage multipliers), no-op if a unit has no fills. So equipment depth already exists in the ported combat domain, independent of recruitment.

### Q12 — does raising a real ship.*/unit.* from recruits reuse GMap's existing shipyard/barracks building gate?

- Asked: (my recommendation) yes — keep GMap's exact gating (shipyard/spaceport/military-station for ships, barracks for ground units), just add recruits+population as a cost alongside the existing currency+AP cost from `produceForceCost`/`produceForceAp`. No military building at all -> can only raise the baseline "recruit" levy unit (Q10) for emergency defense.
- Captured: user confirmed the recommendation as-is.
- Decided: **domain/forces reuses GMap's existing building-gate pattern wholesale** — nothing new to design there, only the cost formula changes (adds recruits+population on top of currency+AP). The raw "recruit" levy unit from Q10 is the one unit type raisable with zero military infrastructure; every named `ship.*`/`unit.*`/`ground_unit.*` from content still needs its matching building, same as GMap today.
- Flags: none — this was a grounding/confirmation question, not a new design fork.

## Branch: planetary/orbital/system-level buildings (started same session, after army/fleet branch)

Note on process: first attempt at opening this branch bundled 4 different sub-topics into one question's options (zone-slots gap, race/tech gating, buildings-vs-population-labor tie-in, system stations) — user correctly pushed back ("Вот ты задал 4 разных вопроса... Давай ты эти вопросы выведешь отдельно. Начни с чего то конкретного"), wanting them asked one at a time as separate questions, most concrete first. Corrected course below.

### GMap baseline check (assistant research) — building zone/tier structure already in content

- `content/core/buildings.json`: ~57 defs across 4 zones — `surface`, `orbital`, `subsurface`, `deep`.
- Golden_PAX_v0_5's planet schema (`server/api/contract/campaign.mjs`'s `CreatePlanetRequestSchema`, and the `planets` DB table) currently only tracks `surfaceSlots`/`orbitalSlots` — no subsurface/deep slot fields. `subsurface`/`deep` buildings from content have no valid placement target right now — a real structural gap, found while scoping this branch, not something the user raised first.

### Q13 — subsurface/deep zone buildings have nowhere to build. Fix now or defer?

- Asked: (my recommendation) add `subsurfaceSlots`/`deepSlots` as two more independent slot pools on the planet, mirroring how `surfaceSlots`/`orbitalSlots` already work.
- Captured: user confirmed the recommendation as-is.
- **CORRECTED (2026-08-12, during implementation start):** this premise was wrong — false alarm, not a real gap. Re-read `GMap/server/planetActions.mjs:418-425` more carefully: `// orbital → orbital list; surface/subsurface/deep → surface list (zone preserved on instance)`. GMap deliberately shares ONE `surfaceSlots` pool across surface/subsurface/deep — zone is preserved only as a label on the building instance, never its own capacity. `Golden_PAX_v0_5/server/domain/planets/construction.mjs`'s `canPlaceBuilding`/`placeBuilding` already replicate this exactly (`listKey = def.zone === "orbital" ? "orbitalBuildings" : "surfaceBuildings"`) — there was never a bug. Adding separate `subsurfaceSlots`/`deepSlots` would have been a deviation from GMap's actual rule, not a fix, and violates CLAUDE.md rule "port behavior, not code shape."
- Decided: **reverted** — no schema change, no code change. Planet keeps exactly `surfaceSlots`/`orbitalSlots`, subsurface/deep buildings continue sharing `surfaceSlots` as they already correctly do.

### Q14 — should building CONSTRUCTION itself (not just later operation) require population, given job-slots now exist?

- Asked: (my recommendation) no — construction stays currency-only, matching GMap's balance exactly. Population only enters the picture afterward, through job-slots (Q5/Q11) — an unstaffed building can be built but produces nothing until staffed.
- Captured: user confirmed the recommendation as-is.
- Decided: `placeBuilding`'s cost model is unchanged (currency only, per `content/core/buildings.json`'s `cost`). Population/job-slots stay strictly an operating-time concern, not a construction-time gate.

### Q15 — when system-level stations (GMap's mining/military/science) get ported, do they need job-slot population too?

- Asked: (my recommendation) no — stations aren't tied to one specific planet's population in GMap (they belong to the system), so treat them as automated/low-crew infrastructure: currency-only to build and maintain, same as GMap today. Avoids inventing a new "which planet in the system staffs this" mechanic.
- Captured: user confirmed the recommendation as-is.
- Decided: system-level stations stay outside the population/job-slot economy entirely — currency-only, same as GMap's current `STATION_DEFS`/`stationCost` model. Job-slots (Q5) apply only to planet-attached surface/orbital/subsurface/deep buildings.
- Flags: none.

**Buildings branch closed** — all three sub-questions the user asked to be split out (zone-slots gap, construction cost vs. population, station labor) are resolved.
