# Currency Peg (Gold-Standard Mechanic) — Implementation Spec

Handoff spec for an implementing agent. Written 2026-08-14, resuming a design session from 2026-08-13 (`notes/2026-08-13-currency-peg-grill.md`) that was intentionally paused pending a dependency — that dependency is now satisfied (resource-extraction Stages 1-4 shipped and verified same week), so this is ready to build.

**Before touching anything**: read `Golden_PAX_v0_5/CLAUDE.md` in full, then `notes/2026-08-13-currency-peg-grill.md` in full — it has the complete reasoning trail, including the user's rejection of a first "purely additive" proposal (the resolved tension that shaped the final design).

**Dependency now satisfied**: this needs real per-category flow income to convert from (`domain/planets/flowIncome.mjs`'s `computeFactionFlowIncome`) — that's real and live now (resource-extraction Stages 1-4, see `golden_pax_resource_extraction_design` memory). No other pending spec blocks this one.

---

## Why this exists

GMap has a real but non-functional stub: `treasuryPeg` (`economyTick.mjs`'s `resolveTreasuryPeg`) — a faction can be bound to one of 18 "strategic" map resources as its treasury, but there's no exchange rate, no conversion, and tax's "treasury" mode doesn't actually feed it (GMap's own comment: "treasury records; sink subtracts" — taxed amounts go nowhere in treasury mode). This spec is **new design on top of a dead stub**, not a straight port — say so in file headers.

---

## Settled design

1. **No new currency.** The peg gives a real conversion path into the EXISTING `currency.metal`/`currency.supply`.
2. **Deliberate asymmetry** (the key resolved tension — a first "purely additive" proposal was rejected as pointless): the legacy metal/supply bridge (uncategorized deposits + population soft-add, already weak in GMap) stays as a low, capped **survival floor** available with no peg — don't remove or touch this existing path. Peg-conversion is **uncapped** and scales **non-linearly** with how much of the pegged resource the faction extracts, self-reinforcing the rarer/more-dominant that peg is globally — a real reserve-currency effect. This non-linear scaling is what gives committing to a peg an actual payoff; a flat/linear conversion rate would defeat the design.
3. **Exchange rate** = a formula baseline (inverse of the faction's relative *global* extraction dominance for the pegged resource — i.e. the rarer/more you control relative to the whole galaxy's output, the stronger your peg) **plus** a GM-controlled bounded multiplier on top (e.g. 0.8x-1.5x, first-pass range, propose and document) for narrative events — this is a bounded dial, NOT free-form manual override.
4. **Peg-to-peg exchange between factions on different pegs** — three coexisting mechanisms, all in scope:
   - Direct barter of raw strategic resources (always available, no new relation needed — reuse whatever generic resource-transfer path already exists, or build the minimal one if it doesn't).
   - A formal bilateral exchange-rate deal (new, see point 5).
   - Full currency-union/absorption — one faction adopts another's peg (new, see point 5).
5. **New, dedicated economic relation types** for the exchange-deal and currency-union — explicitly NOT a reuse of existing political relations (trade/alliance/vassal/war). These live on an **independent track** from political relations. `domain/diplomacy/treaties.mjs` currently allows only ONE relation per faction pair (a new one replaces the old) — this needs to change to support a political relation AND an economic relation simultaneously (e.g. allied politically + in a currency union economically). Add a `track` field (e.g. `"political"` vs `"economic"`) to relation records, and update `treaties.mjs`'s single-relation-per-pair logic to key on `(factionA, factionB, track)` instead of just `(factionA, factionB)`. Read `treaties.mjs` fully before changing this — it's real, tested, shared infrastructure; go slowly, add tests before changing behavior.
6. **Changing a peg later is allowed but not free** — a transition-period effectiveness penalty applies (a real, but not-yet-shaped, devaluation-style penalty — propose a concrete shape: e.g. peg strength ramps from 0 back to full over N turns after a change, first-pass, document).

---

## What to build

- `server/domain/economy/currencyPeg.mjs` (new): `pegExchangeRate(faction, resourceId, globalExtractionTotals, content)` (the non-linear dominance-based formula — propose and document the concrete non-linear shape, e.g. something like `rate = baseRate / (factionShare)^k` for a tunable `k`, first-pass), `convertPeggedResource(faction, amount, content)` (uncapped conversion into metal/supply using the exchange rate), `gmPegMultiplier` (bounded dial, e.g. clamp to `[0.8, 1.5]`).
- `server/domain/diplomacy/economicRelations.mjs` (new, or extend `treaties.mjs` directly if that reads more naturally — your call): the exchange-deal and currency-union relation types, and the `track` field change to `treaties.mjs` described in point 5.
- Schema: wherever peg assignment/state is tracked (likely a new column on the faction's economy account — which pegged resource, since-when), plus whatever schema change `treaties.mjs`'s track split needs.
- Wire `convertPeggedResource` into `flowIncome.mjs`'s existing income pipeline as an additional pass (after the real category income is computed, same "post-processing on final category totals" shape the modifier stack already uses) — read `flowIncome.mjs`'s existing pass structure before inserting this, this file has a documented history of live-only-verifiable ordering bugs, go slowly.

---

## Open, first-pass numerics — propose concrete values, don't leave any unspecified

The exact non-linear peg-strength formula's shape and tunable constant(s), the GM multiplier's exact bound range and scope (per-peg-resource vs. per-faction), names for the two new relation types, exact peg-change transition-penalty duration/shape, how `treaties.mjs`'s two-track model gets represented concretely in schema.

---

## Tests

New-design tests for `currencyPeg.mjs`'s exchange-rate formula (confirm it's genuinely non-linear and self-reinforcing — a faction with 90% global share of a resource should get a meaningfully better rate than one with 10%, not a proportionally-scaled linear difference), the GM multiplier's bounds are enforced, `treaties.mjs`'s two-track change doesn't break any existing single-track relation test (run the full existing diplomacy suite, not just new tests). Live-verify: two factions with different pegs, confirm barter/exchange-deal/currency-union all produce distinct, correct outcomes.

---

## How this gets checked

The user will hand this document to an implementing agent, then have the agent that wrote this spec review the result. Checks: the legacy survival-floor bridge is genuinely untouched (still works exactly as before for unpegged factions), the peg conversion is genuinely uncapped and non-linear (not accidentally capped or linearized for simplicity), `treaties.mjs`'s track split doesn't silently break existing political-relation behavior (this is the highest-risk change in this spec — verify the full existing diplomacy test suite still passes, not just new tests), full test suite passes, live HTTP verification with real numbers.
