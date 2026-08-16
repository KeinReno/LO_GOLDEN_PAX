# Stability mechanic: Grill / Discovery Notes

Date: 2026-08-14 · Goal: design a real "stability" game concept from scratch — surfaced by the court-governance grill (`notes/2026-08-14-court-governance-grill.md` Q6): council seats/postings/traits produce `stability_add` effects, but nothing in Golden_PAX (or, it turns out, in GMap either) ever consumes them.

## Context established before Q1

- Checked GMap source directly: `stability`/`stability_add`/`revolt_risk` appear ONLY in `modifierStack.mjs` (the channel categorizer) and `ledger.mjs` (pure display-label formatting: "стабильность +1"). **GMap never built a real stability mechanic either** — this isn't a porting gap, it's genuinely new design, same as boarding.
- `revolt_risk` exists as its own separate `channelKey` entry (also uncomsumed in GMap) — a plausible natural pairing (low stability → high revolt risk) but not an existing GMap link, would be new.
- CORRECTION (re-checked more carefully): `loyalty_add` is NOT actually consumed anywhere either — `cultureFaith.mjs` only produces a plain effect list, nothing persists/accumulates a loyalty value, `schema.sql` has zero `loyalty` columns anywhere, and `domain/combat/README.md` explicitly says "no loyalty-driven garrison defection (needs system/planet loyalty)". Loyalty is the same kind of unfinished channel as stability, just with more scaffolding around it. Decision: do NOT try to resurrect a full system/planet-level loyalty account as part of this — that's its own separate, bigger rabbit hole (touches planet state/migration). Stability gets built as its OWN simple faction-wide accumulator, independent of loyalty.
- Internal blocs' `threat` score was just decided (Q5, court grill) to stay GMap-parity **display-only, no mechanical effect** — so stability should NOT be defined as "consumes bloc threat," that would contradict Q5 unless revisited.

## Summary / key decisions

Stability is a brand-new mechanic, not a port — GMap itself never finished it (only categorized/labeled, never consumed). Built as its own simple faction-wide accumulator, independent of loyalty (which turned out to be equally unfinished — corrected mid-grill, don't resurrect it here).

1. **Feeds `revolt_risk`**, a real 3-stage escalating crisis (user's own design, not from offered options):
   - **Stage 1**: production debuff (via the modifier stack, same channel plumbing as everything else this session).
   - **Stage 2**: hostile forces spawn from the affected planet's population — same crew-derivation pattern as boarding (`unit.militia` stats, count from population, population isn't spent irreversibly). Engagement is contingent, not automatic: rebels get `stance: "retreat"`, reusing `resolveExchange`'s existing <80%-power disengage rule — no new formula needed.
   - **Stage 3**: if unresolved, real secession — reuses the existing (currently GM-only) `addFaction`/`seedFactionAccounts` building blocks server-side to spin up a genuine new faction from the breakaway planet/system, opening the door to later diplomacy/reconquest with it.
2. Internal-bloc `threat` stays GMap-parity display-only (court grill Q5) — explicitly NOT merged into stability, kept as two separate concerns.
3. Open, first-pass numerics (propose-and-confirm at build time, same discipline as the rest of this session): population→rebel-count formula, stability accumulation/decay rate, revolt-trigger threshold(s) for each stage, new faction's auto-generated id/name/starting composition.

## Q&A log

### Q1 — what stability should gate
- Asked: what should low stability actually do — feed `revolt_risk` (a real negative event), act as a plain multiplier on economy/loyalty, or merge with internal-bloc threat?
- Captured: **Риск восстания (revolt_risk)**. Stability is its own new faction-wide accumulator (not routed through loyalty, not merged with bloc threat — keeps Q5 of the court grill, blocs stay display-only, intact).
- Flags: what a "revolt" actually does mechanically is still undefined — next question.

### Q2 — what a revolt actually does (escalation shape)
- Asked: concretely, what happens when stability drops enough to trigger a revolt?
- Captured: **user's own 3-stage escalation, not one of the offered options**:
  1. **Production debuff** first — an economy-side penalty (matches option 3's mechanism, but as an early *stage*, not the whole mechanic).
  2. **Hostile forces spawn from the local population** and may fight — combat is NOT automatic/guaranteed even against a weaker garrison ("могут и не дать бой, если будет перевес в пользу игрока, но не всегда" — engagement is contingent, not a hard trigger, some uncertainty even when the player is stronger).
  3. **If unresolved, the rebels secede** — form their own state, declare independence. Planet/system leaves the original faction.
- Flags: Stage 3's exact shape (does secession spin up a REAL new faction entity via the existing `addFaction`/`seedFactionAccounts` building blocks already used by the GM-only `/campaign/:id/factions` route, or something lighter like "planet becomes unowned/neutral, no new faction created"?) — next question. Stage 2's rebel force composition source (reuse the boarding-crew pattern — derive from local population via `unit.militia`'s stats — or something else?) — next question. Stage 2's "contingent, not guaranteed" engagement trigger needs a concrete rule, not just vibes.

### Q3 — secession shape (stage 3)
- Asked: does the seceding planet/system become a real new faction (reusing `addFaction`/`seedFactionAccounts`), or just lose its owner (unowned/neutral)?
- Captured: **Настоящая новая фракция**. Reuses existing GM-only faction-creation building blocks, called server-side (not exposed as a player/GM HTTP action directly — triggered by the revolt resolution itself). Opens the door to later GM interaction with the breakaway faction (diplomacy, reconquest) — explicitly noted as a nice side-effect, not scoped further right now.
- Flags: auto-generated id/name for the new faction, what race/starting composition it gets (presumably inherited from the seceding planet's population), whether it needs a real player or stays NPC/GM-only — not yet asked, likely small/derivable rather than a full question.

### Q4 — rebel force composition (stage 2)
- Asked: where do rebel force stats/composition come from?
- Captured: **same pattern as boarding's crew** — `unit.militia` stats, count derived from the planet's population (lower stability + more population = more rebels). Population isn't spent irreversibly — it IS the rebel/breakaway faction's starting population if secession happens (stage 3).
- Flags: exact population→rebel-count formula — first-pass numeric default, same discipline as crewPerTier etc.

### Q5 — rebel engagement trigger
- Asked: "may not fight if the player has the advantage, but not always" — how to make this a concrete rule?
- Captured: **Reuse `resolveExchange`'s existing retreat rule** — rebels get `stance: "retreat"` by default; the function already disengages a side whose power is <80% of the opponent's, otherwise fights normally. No new formula, direct reuse of an existing, already-tested rule.
- Flags: none — fully resolved with existing code.

## Open flags (pending input)
