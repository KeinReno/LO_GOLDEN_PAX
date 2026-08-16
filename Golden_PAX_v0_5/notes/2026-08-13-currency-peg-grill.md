# Currency Pegs / Treasury Standard: Grill / Discovery Notes

Date: 2026-08-13 · Goal: extract the user's design intent for a "currency peg" system — a faction picks one scarce strategic resource as its currency standard, giving metal/supply real economic meaning and creating emergent currency-zone friction between factions with different pegs.

## Summary / key decisions

(reconciled TL;DR after Q1-Q5 — core mechanic settled, implementation details + diplomacy hook-in still open)

- Context going in: while researching Stage 2 of the flow engine, found GMap already has a `treasuryPeg` concept (`economyTick.mjs`'s `resolveTreasuryPeg`) — a faction can be bound to one of the 18 "strategic" map resources (`economy_schema.json`'s `resource_ranks.strategic`: solari, titan, adamantian, dark_matter, etc.) as its treasury. BUT it's a non-functional stub in GMap: no exchange rate, no conversion mechanic, tax's "treasury" mode doesn't actually feed it (comment says "treasury records; sink subtracts" — taxed amounts aren't redirected anywhere in treasury mode, only removed in sink mode). The user independently proposed extending this into a real gold-standard-style mechanic before being told this stub existed — confirms real design instinct alignment, not me talking them into something arbitrary.

**The settled mechanic**: a faction may pick one strategic map resource as its currency peg. No new currency type — the peg gives a real conversion path into the EXISTING `currency.metal`/`currency.supply`. Two income paths for metal/supply coexist with deliberate asymmetry: (1) the legacy bridge (uncategorized deposits + population soft-add, already weak in GMap) stays as a **low, capped survival floor** available to every faction, peg or not; (2) peg-conversion is **uncapped and scales non-linearly** with how much of the pegged resource the faction extracts, with a self-reinforcing "hard currency" effect the rarer/more-dominant that peg is globally (formula-driven baseline, exact curve TBD). This is what makes committing to a peg a real strategic payoff rather than a flavorless parallel option — resolved after the user directly challenged the first (purely additive, no asymmetry) proposal as pointless. Non-monetary perks stack on top: frictionless trade between same-peg factions; GM-exclusive "monetary policy" event bonuses for pegged factions.

**Exchange rate**: computed by formula (baseline: inverse of relative global extraction/dominance of that peg resource) with a GM-controlled bounded multiplier layered on top (e.g. 0.8x-1.5x) for narrative events — not a free-form manual override, and not purely automatic either.

**Peg-to-peg exchange** (when two factions use different pegs): all three mechanisms coexist — (a) direct barter of raw strategic resources, no conversion needed; (b) a formal diplomatic deal fixing an exchange rate between two specific factions' pegs; (c) full absorption — one faction adopts another's peg, effectively merging currency zones. (c) may map naturally onto the diplomacy domain's existing subject/overlord (vassal) relation, which already models asymmetric bilateral relationships — not yet confirmed with the user.

## Q&A log

### Q1 — is "money" a new third currency, or a reinterpretation of existing metal/supply?

- Asked: (my recommendation) reinterpret metal/supply — don't add a new currency type, since metal/supply already function as the universal spend-currency for buildings/units/forces across the whole project.
- Captured: user confirmed the recommendation as-is — "Переосмысление metal/supply".
- Decided: no new currency ID. The peg mechanic gives strategic-resource extraction a real conversion path into `currency.metal`/`currency.supply`, the currencies that already exist and are already spent everywhere.
- Flags: exact mechanism of "reinterpretation" still open — does peg conversion REPLACE how metal/supply are currently earned (GMap's "legacy bridge": uncategorized deposits + fleet upkeep debit), or ADD a new, optional income path on top of what already exists? Leaning toward additive (don't break what's already built/tested), not yet confirmed with user.

### Q2 — is the exchange rate formula-driven or GM-set?

- Asked: (my recommendation) formula-driven baseline (inverse of relative extraction volume across factions), since "зависит от объёма добычи" was the user's own framing.
- Captured: user wants BOTH — "Формулой, но у ГМа должны быть инструменты влиять на этот курс" (by formula, but the GM needs tools to influence this rate).
- Decided: hybrid — an automatic formula computes a baseline rate from real data (extraction volume per peg), but the GM has explicit override/influence tools on top (not just theoretical — needs an actual mechanism/lever, not "GM edits a database row by hand" as the only option).
- Flags: what exactly are the GM's tools? A direct numeric override? An event/shock system (e.g. GM declares a "peg crisis" that shifts rates)? A bounded adjustment range around the formula's baseline? Not yet asked.

### Q3 — how does peg-to-peg exchange actually happen mechanically (barter / formal deal / full absorption)?

- Asked: open-ended, offered three options as things I'd seen in the user's own framing.
- Captured: user wants all three to coexist — "Я думаю, что все варианты хороши" (I think all the options are good).
- Decided: three coexisting exchange paths — (a) direct barter of raw strategic resources (no currency conversion, always available regardless of peg), (b) a formal diplomatic exchange-rate deal between two specific factions' pegs, (c) full peg replacement/adoption (one faction's currency zone absorbing another's).
- Flags: mechanically, (b) and (c) both need to hook into the diplomacy/treaty system (`domain/diplomacy/treaties.mjs`) — not yet designed how. (c) "absorption" implies real, potentially harsh consequences (does the absorbed faction's existing metal/supply stock get revalued? Is this reversible?) — not yet asked.

### Q4 — replace vs. add: resolved via asymmetry, not a binary choice

- Asked: (my first recommendation) additive, don't replace the legacy bridge — lower risk, doesn't require every faction to have a peg.
- Captured: user pushed back hard, verbatim: "если не заменять, то тогда какой смысл от ключевой валюты? если ты предлагаешь сделать допом, что это даст? Какие то плюшки то должны быть, лол" (if it's not a replacement, what's the point of a key currency? if it's just additive, what does that actually give you? there need to be real perks). Correctly identified that a flavorless parallel income stream defeats the whole purpose.
- Resolved (my revised proposal, confirmed by user): **not** a full replacement, **not** a flavorless addition — a designed **asymmetry**. The legacy bridge (uncategorized deposits + population soft-add — already a weak trickle in GMap) stays as a **low, capped baseline** so a peg-less faction survives but is capped/limited. Peg-conversion has **no cap** and scales **non-linearly** with how much of the pegged resource the faction actually extracts — the rarer/more-dominant your peg globally, the stronger the multiplier (a self-reinforcing reserve-currency effect, like real-world hard-currency economics). Additional non-monetary perks layered on top: frictionless trade with same-peg factions; GM-grantable "monetary policy" events/bonuses exclusive to pegged factions (since the GM already has rate-influencing tools per Q2).
- Decided: **legacy bridge = weak survival floor, peg = uncapped non-linear growth engine + trade/diplomacy perks.** This is the resolved answer to "what's the point" — commitment to a peg is a real strategic choice with a real payoff, not required to survive but clearly the path to a stronger economy.
- Flags: exact non-linear growth formula (how "rare/dominant globally" translates into a rate multiplier) not yet specified — implementation detail for whenever this gets built, likely paired with Q2's exchange-rate formula design.

### Q5 — what exact tool does the GM get to influence the exchange rate?

- Asked: (my recommendation) a direct multiplier layered on top of the formula's computed baseline (e.g. 0.8x-1.5x), bounded so a GM can't single-handedly break the economy with one number; framed as a lever for narrative events ("crisis of confidence in currency X"), not a full manual override.
- Captured: user confirmed the recommendation as-is.
- Decided: GM's rate-influence tool = a bounded multiplier on top of the auto-computed baseline rate, per peg (or per faction?). Exact bound range and whether it's per-peg-globally vs per-faction not yet specified — implementation detail.

### GMap baseline check (assistant research) — what diplomacy machinery already exists to hook into?

- Checked `content/core/diplomacy_stances.json`: 10 existing relation types (neutral, trade, alliance, war, vassal, truce, nap, research_pact, migration_treaty, embargo). `trade` already exists as a relation with a `production_mult` effect; `vassal` is already `asymmetric: true` with separate subject/overlord effect lists — the asymmetric-party machinery `stanceEffectsForParty` (treaties.mjs) already exists and works.
- Checked `treaties.mjs`'s `syncTreatiesFromEdge`: currently **one relation replaces any existing relation between the same two factions** (`d.treaties = treaties.filter(t => t.withFactionId !== other.id)` before adding the new one) — relations are mutually exclusive per faction pair right now, not stackable.

### Q6 — should (b) exchange deals / (c) full absorption reuse existing relations (trade/vassal), or be new, dedicated economic statuses?

- Asked: reuse existing trade/vassal (with absorption as an explicit opt-in clause inside a vassal treaty, not automatic), or add new economic-specific relation types.
- Captured: user wants dedicated new economic statuses — "Я бы предложил сделать доп статусы экономического толка" (I'd suggest making additional statuses of an economic nature).
- Decided: (b) and (c) get their own new relation types (e.g. a currency-exchange-rate status and a currency-union/absorption status), separate from the existing political relations (trade/alliance/vassal/war/etc.), not reusing them.
- Flags: **this collides with the "one relation replaces the other" behavior found above.** If economic statuses are a genuinely separate axis from political ones, a faction should presumably be able to be simultaneously e.g. "allied" (political) AND in a "currency union" (economic) with the same other faction — but the current data model only allows ONE active relation per faction pair, and setting a new one wipes out the old one. This needs resolving: either (i) treaties.mjs's model changes to support two independent tracks (political + economic) per faction pair, or (ii) economic statuses stay mutually exclusive with political ones too (simpler, but means you can't be allied AND in a currency union at once, which seems like a real loss). Not yet asked — important, blocks implementation.

### Q7 — should political and economic relations be two independent tracks per faction pair (breaking the current "one relation replaces the other" model)?

- Asked: yes (two tracks, requires a treaties.mjs data-model change) or no (economic statuses stay mutually exclusive with political ones too, simpler but can't be allied + currency-unioned simultaneously).
- Captured: user confirmed the recommendation as-is — two independent tracks.
- Decided: `treaties.mjs`'s data model needs to change to support a political relation AND an economic relation simultaneously per faction pair (currently `syncTreatiesFromEdge` treats any new relation as replacing the old one for that pair — this behavior needs to become track-aware, likely by tagging each stance in `diplomacy_stances.json` with which track it belongs to, and only replacing same-track relations).

### Q8 — can a faction change its peg later, and what happens when it does?

- Asked: (my recommendation) yes, but with a penalty/transition period — the new peg starts with reduced conversion effectiveness (hasn't accumulated "weight"/confidence yet), mirroring real currency-reform devaluation risk. Alternative offered: locked in forever once chosen.
- Captured: user confirmed the recommendation as-is.
- Decided: peg changes are allowed but costly — switching resets/reduces conversion effectiveness for a transition period rather than being instant and free. Exact penalty shape/duration not yet specified — implementation detail.

## Grill closed — summary of what's settled vs. still open

**Settled (ready to design formulas/schemas for when this gets built):**
- No new currency type; peg gives real conversion into existing `currency.metal`/`currency.supply`.
- Legacy bridge = low capped floor (peg-less survival); peg-conversion = uncapped, non-linear growth tied to relative global extraction dominance of that peg resource.
- Exchange rate = formula baseline + GM bounded multiplier override.
- Peg-to-peg exchange = barter (always available) + formal exchange-rate deals + full currency-union absorption, all three coexisting.
- Economic relations (exchange deals, currency unions) are NEW, dedicated relation types, on an INDEPENDENT track from political relations (alliance/war/vassal/etc.) — requires a `treaties.mjs` data-model change to support two simultaneous relations per faction pair instead of one replacing the other.
- Peg can change later, but with a real cost — a transition-period effectiveness penalty, not instant/free.

**Still open (implementation-level, not yet specified):**
- Exact non-linear peg-strength formula (global dominance -> rate multiplier curve).
- Exact bound range for the GM's rate multiplier, and whether it's per-peg-resource or per-faction.
- Exact names/shape for the two new economic relation types.
- Exact peg-change penalty shape/duration.
- How `treaties.mjs` concretely represents "two tracks" (e.g. a `track: "political"|"economic"` field on each stance in `diplomacy_stances.json`, filtering replacement by track instead of just by `withFactionId`).

**Status: pure design, nothing implemented in code yet.** This whole mechanic (peg system) is additional scope discovered while researching Stage 2 of the flow engine — it extends a real but non-functional GMap stub (`treasuryPeg`) into something that actually works. Natural build order once resumed: Stage 2 flow engine first (peg conversion needs real category income to convert from), then this.
