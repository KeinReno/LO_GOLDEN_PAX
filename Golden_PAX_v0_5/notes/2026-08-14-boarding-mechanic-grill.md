# Абордаж (legion↔fleet engage guard + boarding resolve): Grill / Discovery Notes

Date: 2026-08-14 · Goal: спроектировать реальную механику абордажа как исключение из нового kind-guard в `engage()` — найдено по пути через грилл внутреннего двора (постинг commander/admiral целится в forceId, что вскрыло отсутствие legion↔fleet guard в `server/api/routes/forces.mjs`'s engage route). Не порт — в GMap этой механики нет вообще.

## Summary / key decisions

Boarding is a new, self-contained mechanic (not a port) that becomes the ONE exception to a new `engage()` guard blocking legion↔fleet combat through the normal `resolveExchange` path (which would otherwise be degenerate — ground units lack accuracy/armor/shields).

1. **Trigger**: `engage()` in `server/api/routes/forces.mjs` gets a `forceA.kind !== forceB.kind` guard. Same-kind engage works exactly as today. Cross-kind (legion vs fleet) is rejected by the normal path and only resolvable via a new boarding action.
2. **Crew, not ship stats**: every ship carries a militia-shaped defending crew. Crew is real recruitment at raise time — `crewCount = tier × 5` (first-pass), the ship's raise pays that much population cost (new `economy_balance.forces.crewPerTier` content field), same population-transfer pattern as `recruits.mjs`'s existing militia cost. Crew combat stats = `unit.militia`'s stats reused verbatim (no new content). `crewCount` persists on the force's composition group, not derived on the fly.
3. **Resolve**: boarding = `resolveExchange` (existing math, unmodified) between the attacking legion's real composition and a synthetic defending group built from `{defId: "unit.militia", count: crewCount, ...militiaStats}`. Both sides now share the same stat axes — no degenerate zeros.
4. **Legion win → capture**: the fleet's `factionId` transfers to the attacker (new mechanic — `forcesStore.mjs` needs a faction-transfer function, doesn't exist today). Surviving crew (after symmetric casualties) transfers with the fleet as-is, no re-crew cost.
5. **Legion loses → normal casualties.mjs losses** (proportional to the 58%/42% share outcome), not a guaranteed wipeout — survivors return to the force like any other engage.
6. **Explicitly deferred, not rejected**: race-dependent crewlessness (an all-drone/android faction having 0-crew, uncapturable-by-boarding ships) — ties into the session's earlier "5 player archetypes" discussion and the still-unwired race-effects gap. Revisit once race effects get wired anywhere in the project.

id/name collision concern raised after Q1 was investigated and dropped — `createForce` always mints a `randomUUID()`, collision risk is negligible.

## Context established before Q1

- `forces` table already has a real `kind: 'fleet'|'legion'` column (`schema.sql`), set correctly at `createForce` time. Every force is homogeneous by construction — the raise route always creates a fresh one-group force, never appends to an existing one. No mixed-kind force is possible today.
- The actual gap: `engage()` (`server/api/routes/forces.mjs:134-204`) never checks `forceA.kind !== forceB.kind` before calling `resolveExchange`.
- `resolveExchange` (`domain/combat/resolveExchange.mjs`) is fully generic over composition shape — it works via `rolePower`/`combat_matchups.json`'s role-power system, not hardcoded ship-vs-ship. But ground units (`units.json`) only carry `defense`/`speed`, missing `accuracy`/`armor`/`shields` entirely (pre-existing, already-flagged gap in `domain/forces/README.md`) — routing a legion through the *same* resolveExchange call as a real fleet would silently zero those axes and produce a fake blowout, not a modeled boarding result.
- Decision already made: build boarding as its **own** resolve formula, not a reuse of resolveExchange's ship-stat axes, and not a fix to the general ground-unit stat gap (that stays its own future item).

## Q&A log

### Q1 — outcome for the fleet on a legion win
- Asked: what happens to the fleet when the boarding legion wins?
- Captured: **Захват (смена фракции)** — the fleet's `factionId` transfers to the attacker on a legion win. New mechanic (`forcesStore.mjs` has no faction-transfer function today — `saveForce` only updates name/homePlanetId/composition). Needs handling for: id/name collision if the attacker already has a force with the same id, journal/notification of the capture, whether the captured fleet keeps its composition losses from the fight or arrives at full strength.
- Flags: id/name collision on capture — needs its own answer (Q-later).

### Q2 — crew stat basis and source
- Asked: what should boarding be resolved on, given ground units (damage/defense/hp/speed) and ships (damage/armor/shields/accuracy/hp) don't share axes?
- Captured: **user's own reframe, not one of the offered options** — ships carry a crew (a militia-shaped infantry defender embedded in the ship), and boarding resolves as attacking legion infantry vs. defending crew infantry — both sides now share the SAME stat axes (damage/defense/hp/speed), so the existing `resolveExchange`/`casualties.mjs` math applies unmodified, no degenerate zeros. User then asked "what are the options" for what determines crew size/existence.
- Follow-up asked: tier/hp-derived (no economy link) vs. **real recruitment at raise time (recommended, chosen)** vs. race-dependent (some factions crewless) vs. combination.
- Captured: **Настоящий набор при подъёме** — raising a ship pays a real population cost for its crew (mirrors `recruits.mjs`'s existing militia-cost mechanic), `crewCount` persisted on the force's composition group (not derived on the fly each boarding call), crew combat stats = `unit.militia`'s stats reused as-is (no new content).
- Flags: exact population-cost-per-crew formula and tier scaling — first-pass numeric default, propose-and-confirm like other constants this session (`OVER_CEILING_POPULATION_MULT`, `AMBIENT_ENERGIA_PER_POP`). Race-dependent crewlessness (drone/android factions) explicitly NOT built now — left open for later, noted so a future "some ships have 0 crew" doesn't get treated as a bug.

### Q3 — legion's outcome on a repelled boarding
- Asked: what happens to the attacking legion when the ship's crew repels it?
- Captured: **Потери по формуле casualties.mjs** — same shape as normal engage: proportional losses via the 58%/42% share thresholds, survivors return to the force (no guaranteed wipeout, unlike a plain block which was the earlier-rejected fallback option).
- Flags: none.

## Corrections made during this grill
- Capture id/name collision (flagged after Q1) was a non-issue — `createForce` always generates `randomUUID()` when raising; collision risk is negligible. Dropped.

## Open flags (pending input)
- Exact crew population-cost formula + tier scaling -> first-pass default to propose at implementation time.
- Race-dependent crewlessness (e.g. all-drone factions have 0 crew) -> explicitly deferred, not rejected.
- Captured fleet's surviving crew (after casualties applied symmetrically) -> proposed default: crew transfers with the fleet as-is (whatever survived the fight), no re-crew cost to attacker. Not yet confirmed with user.
