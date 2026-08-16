# Galaxy Migration (GMap → Golden_PAX_v0_5): Grill / Discovery Notes

Date: 2026-08-13 · Goal: extract the user's real intent for migrating the existing GMap galaxy (`GMap/data/published.json`) into the new project's schema/rules, before building the migration tooling. Content/balance improvements to the galaxy itself are explicitly a separate, later pass — this grill is scoped to the migration mechanics only.

## Summary / key decisions

**What's being migrated**: `GMap/data/published.json` — 978 systems, 2774 planets, a real corridor graph (`links`), and named political sectors with lore, all hand-built and real (not the "накидали от руки" complaint — that complaint is about the *economic numbers* on top of a genuinely good spatial/lore layer). This project has zero procedural galaxy generation today, so this dataset is the only galaxy that exists.

**Scope**: full transfer (positions/names/lore/links/sectors preserved), economic numbers fully recalculated under this project's real rules — never algebraically rescaled from old numbers. Content/balance redesign of the galaxy (better layout, more interesting placement) is explicitly a **separate, later pass**, not part of this work.

**Population** (Q1): derived 100% from migrated building capacity via `planetCapFromBuildings` — the same mechanism every other planet in the game uses. The old population number is never a formula input; its only remaining job is a not-yet-designed signal for how many old buildings to bother migrating onto a given planet (low priority, propose+confirm at implementation time).

**Migration field scope** (Q2): only the spatial/economic backbone — system position/name/kind/stars, links, sectors, single-owner `ownerFactionId`, and per-planet type/climate/habitable/colonyType/raceComposition/resources/buildings (resolved via the already-existing `defForKindZone` building fallback) + population per Q1. Everything else in the old data (fog-of-war, blockade/revolt, logistics, quests-per-system, `coOwnerFactionIds`, stations, etc.) is deferred until its owning game system exists — confirmed as the right call for all of those.

**New mechanic #1 — planet grade / slot progression** (Q3/3a/3b/3c): migrating the old data surfaced a design gap (old capitals had absurd 118/24 slot counts with no real mechanic behind them) that turned into a genuinely new system: `surfaceSlots` grows 8 → 48 over 5 grades via a real purchasable upgrade action (currency + turn cost, player-initiated); `orbitalSlots` grows on a separate smaller scale. This isn't migration-only — it also gives freshly-colonized planets in new campaigns real growth room past today's flat default. Migrated planets' starting grade is derived from their migrated building count (one rule, not two independent heuristics).

**New mechanic #2 — space objects with real stakes** (Q4/4a/4b/4c): GMap's `spaceObjects` field turned out to be a real content-driven economic modifier system (`space_objects.json`, 19 types, capacity/rate/demand effects), not flavor data — but it's static, owner-automatic, and never depletes. This project's version adds real stakes: control follows system ownership (no new "presence" mechanic — taking the system via `resolveExchange` IS contesting its objects), effects extend into combat (not just economy — loyalty/diplomacy reserved for later, no system-location hook yet), and resource-type objects (asteroid/comet/debris) deplete from real use like planet deposits while astronomical/anomaly types are permanent unless destroyed in combat or by GM action.

Both new mechanics are sized like real implementation work (similar to the forces/flow-engine builds earlier this session), not migration-script details — the migration script's own job is data transfer; the mechanics are what that data gets migrated *onto*.

## Q&A log

### GMap baseline check (assistant research) — what's actually in the existing galaxy data?

- `GMap/data/published.json` (188k lines): top-level keys `meta, systems, links, sectors, factions, races, fleets, legions, diplomacy, orders, turnHistory, caravans, quests, courtEvents, loyaltyMatrix`.
- One system: `{ id, name, x, y, kind, stars: [{class, luminosity}], planets: [...] }` — real 2D coordinates, not abstract.
- One planet (sampled — a capital world): `population: 222823`, `raceComposition` (already the exact `[{raceId, percent}]` shape this project already uses — no conversion needed there), `resources: ["map.iron", "map.solari", ...]` (already the exact shape `domain/planets`'s `planet.resources` uses — no conversion needed there either), `colonyType: "capital"`, `surfaceSlots: 118`, `orbitalSlots: 24` (much larger than this project's current defaults of 8/4), a long list of named `surfaceBuildings` (`{id, name, kind, zone}` — no `buildingId` matching `content/core/buildings.json`'s real ids, just a `kind`/`zone` pair, e.g. `kind: "farm", zone: "surface"`).
- `links`: `{ id, fromId, toId, type: "corridor", fromPlanetId, toPlanetId }` — a real system-to-system travel graph.
- `sectors`: `{ id, name, polygon: [x,y,x,y,...], color, notes }` — real drawn political/geographic boundaries with lore text.
- Population distribution across all 647 sampled populated planets: min 7, median 1,210,023, max 398,541,252.
- 35 factions already exist in this dataset.

### Q0 (context-setting, not a formal numbered question) — what happens to the existing galaxy overall?

- Asked: full migration (positions/names/lore/links preserved, economy recalculated) vs. reference-only (new campaigns start from a blank slate generated by new tools).
- Captured: user chose full migration — "мы её переносим, но будем её дорабатывать, делать интереснее, лучше, но улучшать будем в отдельном вообще проходе" (we're transferring it, and we'll improve/refine it later, but that improvement happens in a completely separate pass).
- Decided: this grill scopes to migration mechanics only (position/lore/links preserved, economic numbers regenerated under new rules). Content/balance redesign of the galaxy is out of scope here, deferred to a later, separate initiative.

### Q1 — how does the old (ungrounded) population number become the new one?

- Asked: (my recommendation) don't derive it from the old number at all (not even a logarithmic rescale) — migrate buildings first (map each old `{kind, zone}` building to the nearest real `buildingId` in `content/core/buildings.json` with matching kind+zone), then compute `population = planetCapFromBuildings(migratedPlanet, content)` — the exact same mechanism population is grounded through everywhere else in this project. The old number's only remaining use: as a signal for *how many* buildings to bother migrating (a population-7 world shouldn't receive 20 buildings) — not as an input to any population formula.
- Captured: user confirmed the recommendation as-is.
- Decided: **new population is 100% derived from migrated building capacity, never algebraically transformed from the old number.** This fully satisfies the "nothing from thin air" principle — migrated worlds get their population through the identical mechanism a freshly-colonized-and-built world would.
- Flags: still need the old-population → "how many buildings to migrate" signal formula (a scaling/prioritization heuristic, not a population formula) — not yet asked, likely low-stakes (propose a percentile-rank-based building count cap, confirm later).

### GMap baseline check (assistant research) — building kind/zone mapping turns out to already be solved

- Checked `server/domain/planets/buildingDefs.mjs`'s existing `buildingDefFromInstance`: it already falls back to `defForKindZone(content, kind, zone)` (`Object.values(content.buildings).find(d => d.kind === kind && d.zone === zone)`) when a building instance has no real `buildingId` — this is EXISTING, already-shipped logic (used for GM-hand-typed building instances too), not something migration needs to build. Checked the old galaxy's building diversity: only **21 distinct `{kind, zone}` combinations** across all 2774 planets (mine/factory/farm/residential/defense/spaceport/capitol/depot/lab/barracks/shipyard/relay × surface/orbital/subsurface/deep) — all of which already exist as real `content/core/buildings.json` kinds. Migration can persist old buildings with their original `kind`/`zone` (no invented `buildingId` needed) and the existing fallback resolves them correctly, OR resolve+store the real id explicitly at migration time for robustness — implementation detail, not a design fork.

### GMap baseline check (assistant research) — full scope of what the old data actually contains

- System-level fields beyond position/name/sector: `ownerFactionId` (439 of 978 systems are owned — the rest neutral/unclaimed, a real frontier), `coOwnerFactionIds`, `resources` (system/belt-level deposits, separate from planet-level — matches the "needs a mining station" concept flagged as deferred during the resource-extraction grill), `stations`, `locked`, `isCapital`, `poiType`, `visibleToFactionIds` (fog-of-war — not built anywhere in this project), `activity`, `tradeWithSystemId`, `notes`, `scannerDeadZone`, `blockaded`, `anomalyMotion`, `questId`, `trafficHub`, `spaceObjects`, `contested`, `logistics`, `revoltContested`/`revoltUntilTurn`.
- Planet-level fields beyond what's already covered: `ownerFactionId`, `coOwnerFactionIds`, `contested`, `loyalty`, `notes`, `censusLocked`, `surveyed`, `orbitIndex`, `size`.
- Most of these map to game systems this project hasn't built at all (fog-of-war, blockade/revolt mechanics, logistics range, quests-per-system) — migrating them now would be scope creep into systems with no home to receive them yet.

### Q2 — migration scope: which old fields actually get migrated now?

- Asked: (my recommendation) migrate only the "core spatial/economic backbone" — positions, names, links (corridor graph), sectors, faction ownership, and per-planet population/resources/raceComposition/colonyType/buildings (all derived per Q1's rule) — versus a broader pull that also carries fog-of-war visibility, blockade/revolt state, logistics, quests-per-system, stations, trafficHub, etc. despite none of those systems existing in this project yet.
- Captured: user confirmed the minimal/backbone option as-is — "Да, только костяк (Recommended)".
- Decided: **this migration pass carries only**: system `id/name/x/y/kind/stars`, `links` (corridor graph), `sectors` (id/name/polygon/color/notes), system `ownerFactionId` (single owner only — `coOwnerFactionIds` deferred with the rest), and per-planet `id/name/type/climate/habitable/colonyType/raceComposition/resources/surfaceBuildings/orbitalBuildings` (buildings resolved via the existing `defForKindZone` fallback per the earlier baseline check) plus population derived per Q1. Population is NOT copied from `resources`' old numeric field — see Q1.
- Explicitly NOT migrated now (all deferred until the owning system exists): `coOwnerFactionIds`, `locked`, `isCapital` (revisit — might actually be cheap/harmless, flagged below), `poiType`, `visibleToFactionIds` (fog-of-war), `activity`, `tradeWithSystemId`, `notes` (both levels — lore text, revisit below), `scannerDeadZone`, `blockaded`, `anomalyMotion`, `questId`, `trafficHub`, `spaceObjects`, `contested` (both levels), `logistics`, `revoltContested`/`revoltUntilTurn`, planet `loyalty`, `censusLocked`, `surveyed`, `orbitIndex`, `size`, `stations`.
- Flags: `notes`/lore text and `isCapital` are cheap flat fields with no dependent system (unlike fog-of-war or revolt) — worth a quick follow-up check on whether they should ride along with the backbone despite not being asked about explicitly. Not blocking, revisit before writing the migration script.

### Q3 — surfaceSlots/orbitalSlots for migrated planets: keep old numbers, rescale, or something else?

- Asked: old capitals had `surfaceSlots: 118`/`orbitalSlots: 24`; current defaults for new planets are 8/4. Keep the old numbers, flatten to the new default, or scale proportionally?
- User's own concern (verbatim, before any recommendation was accepted): "в старом билде была заложена возможность увеличивать слоты и модифицировать здания. Стоит учесть это. Огромное число слотов - это безумие, факт, но если мы сохраним даже примерно 35 слотов, то у этих игроков просто наебнется экономика. Как тогда сделаем?"
- Assistant research: confirmed **no real slot-expansion mechanic exists anywhere in GMap** — grepped `capacity_add` effects (target flow category/tier capacity, never `surfaceSlots`/`orbitalSlots`), `technologies.json` (no slot-related tech), and `planetActions.mjs` (only a flat `?? 8`/`?? 4` fallback, no formula). The 118/24 numbers are static hand-placed data, not something earned through play — confirms this is exactly the "накидали от руки" problem, not a mechanic to preserve as-is.
- My interim proposal (superseded below): flatten to a small colonyType-tiered range (outpost 4/2, colony 8/4, capital ~12/6), no progression mechanic.
- Captured (final, user's actual decision): user rejected the flat-tier idea and wants a **real graded slot-progression mechanic** — "48 слотов это максимум (типа 5 степеней грейдов)" — i.e. a genuine ~5-grade planet development ladder, topping out at 48 slots at max grade. This is new design, not present anywhere in GMap.
- Decided: build a real "planet grade" progression (5 steps, cap 48) as part of this work — migrated planets get placed on this ladder rather than keeping their raw old slot numbers.
- Flags: what grade migrated planets start at (derived from old colonyType/size as a signal, high enough to fit their migrated building count per Q1's chicken-and-egg constraint) -> next to ask

### Q3a — what drives a grade increase?

- Asked: purchasable upgrade action (costs currency/turns, an explicit player action) vs. passive population/building threshold vs. a tech-gated unlock.
- Captured: user confirmed the recommendation — **purchasable upgrade action**.
- Decided: advancing a planet's grade is a real player-initiated action costing currency (and presumably turns, to be detailed at implementation time — likely modeled similarly to `construction.mjs`'s building-placement cost pattern), not a passive threshold and not a faction-wide tech unlock. Fits "nothing from thin air": slots only grow when the faction actually spends something to grow them.

### Q3b — does the 48-slot cap cover surface+orbital combined, or surface only?

- Asked: one shared pool per planet (player allocates between surface/orbital under one cap) vs. surface-only cap (orbital grows on its own separate scale).
- Captured: user confirmed the recommendation — **surface only; orbital grows separately**.
- Decided: `surfaceSlots` is the thing that grows 8 → 48 over 5 grades via the purchasable upgrade. `orbitalSlots` grows on its own separate, smaller scale (same 5-grade shape, e.g. 4 → 12) tied to the same grade or a parallel one — exact orbital numbers/whether it's the same grade counter or a second counter is an implementation detail, not yet pinned down but not blocking (surface and orbital buildings are already different categories, consistent with existing zone separation).

### Q3c — starting grade for migrated planets: derive from building count, or a separate old-size/colonyType signal?

- Asked: whether the still-open "how many old buildings to migrate" heuristic and the new "starting grade" question should collapse into one rule (grade = whatever's needed to fit the migrated buildings), or stay two independent heuristics (grade from old colonyType/size directly, building count from population separately — with a real risk of the two disagreeing, e.g. grade lower than the building count it's supposed to hold).
- Captured: user confirmed the recommendation — **one rule**: decide migrated building count first (from the old-population signal, still to be designed), then `grade = min(5, smallest grade whose surfaceSlots >= migrated building count)`.
- Decided: this retires the "starting grade" open flag as a separate question — it's now downstream of the building-migration-count heuristic. That heuristic (previously flagged low-priority) is now slightly higher-stakes since it also drives economic slot capacity, but is still fine to design at implementation time rather than block the grill on it.

## Slot-grade mechanic — settled shape (Q3/3a/3b/3c synthesis)

- `surfaceSlots` becomes a real progression: base 8 (current default) up to a hard cap of **48**, over **5 grades**, advanced one step at a time via a **purchasable upgrade action** (real currency + turn cost, player-initiated — not passive, not tech-gated).
- `orbitalSlots` grows on its own **separate**, smaller scale (not part of the 48 cap) — exact numbers/whether it shares the same grade counter or has its own is an implementation detail, not blocking.
- This is a genuinely new mechanic not present anywhere in GMap — it doesn't just serve migration, it also gives freshly-colonized planets in new campaigns a real way to grow past today's flat 8/4 default. Migration is simply the first consumer of it.
- Migrated planets' starting grade = derived FROM their migrated building count (not from old raw slot numbers, not from a separate size/colonyType guess) — one rule, not two independent heuristics.

### GMap baseline check (assistant research) — `spaceObjects` turns out to be a real mechanic, not flavor data

- Re-opened by the user: "Мы не обсудили с тобой перенос космических объектов. Тут тоже надо поговорить более серьезно" — flagging that Q2's blanket defer of `spaceObjects` (lumped in with fog-of-war/blockade/quests as "no home system yet") was made on an incomplete read of what that field actually does.
- Corrected understanding: `content/core/space_objects.json` defines **19 real object types** (anomaly, asteroid, nebula, debris, pirate, hub, ruin, dead_zone, wormhole, black_hole, pulsar, storm, comet, relay, minefield, forge, science_arch, grav_field, leviathan), each with real `effects` (`capacity_add`/`rate_mod`/`demand_mod` on specific flow category+tier, plus rare `unlock_property` chance rolls) — same shape as building effects, applied via `flowEngine.mjs`'s `applySpaceObjectEffects` inside `economyTick.mjs`'s per-system loop.
- Actual tag counts across the 978 systems (many tags in the live data have NO content definition — currently inert): `refugees` 356(!), `minefield` 48, `pirate` 49, `outpost` 40, `relay` 39, `star`/`beacon` 36 each, `asteroid` 33, `nebula` 28, `depot`/`hub` 27, `dead_zone` 22, `ruin` 19, `anomaly` 18, `storm`/`fortress` 12, `pulsar` 11, `comet`/`frontline` 9, `wormhole` 8, `black_hole` 6, `shipyard` 5, `abandoned_station`/`mining_platform` 3 each, `science_arch`/`forge`/`agronomy`/`biocupola`/`grav_field`/`hydro_lab`/`security_post`/`sanctuary` 1-14 each.
- Beyond the economic layer, tags are consumed by 4 more systems: `logistics.mjs` (`depot`/`quarantine` tags gate real supply-chain state — `connectedToCapital`/`hopsToCapital`/`supplyLevel`/`bottlenecked`, already visible in the migrated data's `logistics` field); `loyalty.mjs` (certain tags count as "propaganda", +5 loyalty); `narrative.mjs` (tags are a **live, mutable** layer — GM can add/remove any tag as an action, `system_presets.json`'s 5 presets bundle tag add/remove, and `refugees` specifically is dynamically added/removed by an actual refugee-migration-between-systems mechanic — explaining why it's by far the most common tag); `engagements.mjs`/`cardBattle.mjs` auto-add `debris` after any battle in that system.
- Checked this project: no loyalty/propaganda tracking exists yet (`domain/court/civicTick.mjs` has some loyalty-adjacent civic scoring but nothing system-level), no refugee mechanic exists at all. The **economic modifier piece has a real home already** (this project's flow engine, `domain/planets/flowContribution.mjs`/`flowIncome.mjs`, is architecturally the same shape GMap's `economyTick.mjs` loop uses) — unlike fog-of-war/blockade/quests, which genuinely have nothing to plug into yet. So Q2's "no home system" reasoning was right for those, but not fully right for `spaceObjects`'s economic half specifically.

### Q4 — the essence of space objects: is GMap's static owner-automatic economic buff/debuff enough, or does this become a bigger new mechanic?

- Asked: presented GMap's actual behavior (each object type = real capacity/rate/demand modifier, automatically applied to whoever owns the system) and asked what's missing from that picture — wider-than-economy effects, contestability, and/or depletion, or is the current shape sufficient.
- Captured: user selected **all three expansions** — objects should be contestable/capturable (not just auto-granted to the system owner), effects should reach beyond economy (combat/diplomacy/loyalty, not just flow categories), and objects should be able to be destroyed/depleted (not static forever).
- Decided: this is now explicitly **new design, bigger than GMap's version** — not a straight port. GMap's `space_objects.json`/`applySpaceObjectEffects` is the starting content/effect-shape reference (still reusable for the economic-effect part), but the ownership/contest model, the multi-domain effect surface, and depletion are all new mechanics this project doesn't have and GMap never built either.
- Flags: this branch needs its own sub-grill before it's buildable.

### Q4a — control model: tied to system ownership, or independent fleet-presence claim?

- Asked: does the faction that owns the system automatically control (and get the effects of) every space object in it — meaning combat over the system IS the contest, no new mechanic needed — or is control independent of system ownership (a fleet stationed at the object claims it, even in a neutral/unclaimed system)?
- Captured: user confirmed the recommendation — **tied to system ownership**.
- Decided: no new "presence"/claim concept needed. Whoever holds `system.ownerFactionId` controls (and receives the effects of) every space object in that system. Combat over the system (already `domain/combat/resolveExchange`) is what contesting an object means — this collapses "contestable/capturable" into something that falls out of existing system-ownership + combat, not a new subsystem. Objects in the 439/978 currently-neutral systems belong to no one and grant no effect until someone takes the system.

### Q4b — which non-economy domains get real space-object effects now vs. later?

- Asked: (multiSelect) economy/combat/loyalty/diplomacy — which get wired now?
- Captured: user selected **economy** (already decided, the baseline capacity/rate/demand port) + **combat** (new: a modifier applied when `resolveExchange` runs a battle in that system — e.g. black_hole/wormhole/pulsar give a combat bonus/penalty to whoever's fighting there, minefield/pirate hurt the attacker, etc.). Loyalty and diplomacy explicitly NOT selected — deferred, since neither has a system-location-aware mechanic to hook into yet (loyalty is civic-score-only in `domain/court`, diplomacy's opinions are faction-pair only, no system attachment at all).
- Decided: this migration/design pass builds space-object effects for **economy + combat only**. Loyalty/diplomacy effect types stay documented as future extensions (the content schema's own `effect_types` list is already designed to be extensible) but get no real implementation until those domains grow a system-location concept of their own.

### Q4c — what triggers depletion/destruction?

- Asked: usage-based (resource-type objects — asteroid/comet/debris — deplete from real extraction over time, like planet deposits) vs. combat-only (destroyed only as a side effect of a battle there) vs. GM-manual-only (no automation, GM uses the existing add/remove tool).
- Captured: user confirmed the recommendation — **usage-based**.
- Decided: resource-flavored object types (asteroid, comet, debris — the ones whose effect is a `rate_mod`/economic yield, i.e. things being actively drawn from) deplete from real extraction over time, mirroring how planet deposits already work in this project. Astronomical/anomaly types (black_hole, wormhole, nebula, pulsar, storm, grav_field, etc. — ambient environmental effects, not a resource being drawn down) do NOT deplete from use; they may still be destroyed as a combat side effect (Q4b) or removed by GM action (already-existing GMap tooling), but usage alone doesn't exhaust them.

### Q4d — correction: planet deposits don't actually deplete today, so this is genuinely new, not reused

- Found while writing the Grok handoff spec: `domain/planets/flowContribution.mjs`'s `addExtraction` adds `extractionYieldUnits(def) * fraction` to the flow grid every turn but never reduces `planet.resources` or tracks a remaining amount — planet deposits are currently an **infinite** income source, already shipped and tested that way. Q4c's "mirrors how planet deposits already work" was based on an incorrect assumption that deposits deplete; they don't.
- Asked: given this, should depletion also be retrofitted onto planet deposits in the same pass (one shared mechanism), or should this stay scoped to space objects only, leaving planet deposits infinite as-is?
- Captured: user confirmed the recommendation — **space objects only**.
- Decided: planet deposits stay infinite, unchanged, untouched. Space-object depletion is designed and built from scratch, with no existing precedent to mirror — Grok's spec should say so plainly rather than claim it's "the same as deposits."

## Space objects — settled shape (Q4/4a/4b/4c/4d synthesis)

- Not a straight port — GMap's version (`content/core/space_objects.json` + `applySpaceObjectEffects`) is a static, owner-automatic, economy-only, non-depleting effect layer. This project's version adds real stakes: **contestable via combat** (Q4a), **effects reach into combat, not just economy** (Q4b), and **resource-type objects deplete from real use** (Q4c).
- **Control**: no new "presence" concept — control follows `system.ownerFactionId` 1:1. Taking the system (via existing `domain/combat/resolveExchange`) is what contesting an object means.
- **Effect domains, this pass**: economy (port `space_objects.json`'s capacity/rate/demand effects into the flow engine, same pattern as buildings/deposits) + combat (a new effect type applied when `resolveExchange` runs a battle in that system). Loyalty/diplomacy effect types are reserved in the content schema but not implemented — those domains have no system-location concept to hook into yet.
- **Depletion**: resource-type objects (asteroid/comet/debris) deplete from real extraction. **Correction (Q4d)**: this is NOT "the same as planet deposits" — planet deposits (`planet.resources`) currently never deplete at all (confirmed: `flowContribution.mjs`'s `addExtraction` adds to the flow grid every turn with no remaining-amount tracking, an infinite source, already shipped). Space-object depletion is designed from scratch, with planet deposits staying infinite and untouched — not a shared mechanism. Astronomical/anomaly types (black_hole/wormhole/nebula/pulsar/storm/grav_field/etc.) are permanent unless destroyed via combat or GM action.
- Migration's own job stays scoped: bring the 19 defined types + all system tags (including currently-inert ones like `refugees`/`depot`/`outpost`) over as data. The mechanic itself (flow-engine port + combat effect + depletion) is real new implementation work, sized similarly to the slot-grade mechanic (Q3) — not a migration-script detail.

## Open flags (pending input)
- **Schema gaps**: this project's `systems`/`planets` tables have no `x`/`y` position, no `links`, no `sectors`, no `stars` fields at all yet, and now also no `grade` field -> not a design question, just needs real columns added per CLAUDE.md rule 5 when the migration script is built
- Old-population → building-migration-count signal (now also determines starting grade, per Q3c) -> propose+confirm at implementation time
- Whether cheap flat fields with no dependent system yet (`notes`/lore text, `isCapital`) should ride along with the backbone despite Q2's scope cut -> low priority, revisit before writing the script
